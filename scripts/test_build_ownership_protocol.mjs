/**
 * Contract tests for BUILD_OWNERSHIP_PROTOCOL.
 * Validates normal acquisition/release, re-entrancy, contention fast-fail,
 * stale lock loud reclaim, corrupt lock reclaim, bundle freezing, and exception safety.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LOCK_PATH,
  acquireBuildLock,
  inspectBuildLock,
  isPidAlive,
  withBuildLock,
} from './lib/build_ownership.mjs';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const testDir = path.join(repoRoot, 'artifacts', 'locks', 'test');
mkdirSync(testDir, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
}

function cleanFile(filePath) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {}
}

let passCount = 0;
function record(testName, passed, detail = '') {
  if (!passed) {
    console.error(`[FAIL] ${testName}: ${detail}`);
    process.exitCode = 1;
    throw new Error(`Test failed: ${testName}`);
  }
  passCount += 1;
  console.log(`[PASS] ${testName}${detail ? ': ' + detail : ''}`);
}

console.log('====================================================');
console.log('Build Ownership Protocol Contract Verification');
console.log('====================================================');

// 1. isPidAlive test
record('PID_LIVENESS_ACCURACY',
  isPidAlive(process.pid) === true && isPidAlive(999999) === false,
  'Current PID is alive; nonexistent PID 999999 is dead',
);

// 2. Normal acquisition and release lifecycle
const lockPath1 = path.join(testDir, 'test-normal.lock');
cleanFile(lockPath1);

const lock1 = acquireBuildLock({ purpose: 'test-normal-lifecycle', lockPath: lockPath1 });
record('LOCK_FILE_CREATED_ON_DISK', existsSync(lockPath1), 'lock file was created');

const diskData1 = JSON.parse(readFileSync(lockPath1, 'utf8'));
record('LOCK_PAYLOAD_VALIDITY',
  diskData1.pid === process.pid
  && diskData1.purpose === 'test-normal-lifecycle'
  && diskData1.state === 'ACQUIRED'
  && typeof diskData1.timestamp === 'number'
  && diskData1.bundleIdentity === null,
  'all expected fields present in lock file',
);

lock1.release();
record('LOCK_FILE_REMOVED_ON_RELEASE', !existsSync(lockPath1), 'lock file unlinked on release');

// 3. Re-entrancy within the same process
const lockPath2 = path.join(testDir, 'test-reentrant.lock');
cleanFile(lockPath2);

const outerLock = acquireBuildLock({ purpose: 'test-outer', lockPath: lockPath2 });
assert(outerLock.depth === 1, 'outer lock depth should be 1');

const innerLock = acquireBuildLock({ purpose: 'test-inner', lockPath: lockPath2 });
record('REENTRANT_LOCK_SHARING', outerLock === innerLock && innerLock.depth === 2, 'same instance and depth 2');

innerLock.release();
record('INNER_RELEASE_KEEPS_DISK_LOCK', existsSync(lockPath2) && outerLock.depth === 1, 'depth decremented to 1 and file stays');

outerLock.release();
record('OUTER_RELEASE_UNLINKS_DISK_LOCK', !existsSync(lockPath2), 'depth 0 cleans up lock file');

// 4. Bundle freezing and provenance verification
const lockPath3 = path.join(testDir, 'test-freeze.lock');
cleanFile(lockPath3);

const freezeLock = acquireBuildLock({ purpose: 'test-freeze', lockPath: lockPath3 });
freezeLock.freezeBundle({ censusDigest: 'abcd1234', fileCount: 150 });

record('BUNDLE_FREEZE_UPDATES_STATE', freezeLock.state === 'FROZEN', 'state is FROZEN');
const freezeDiskData = JSON.parse(readFileSync(lockPath3, 'utf8'));
record('BUNDLE_FREEZE_WRITTEN_TO_DISK',
  freezeDiskData.state === 'FROZEN'
  && freezeDiskData.bundleIdentity.censusDigest === 'abcd1234'
  && freezeDiskData.bundleIdentity.fileCount === 150,
  'frozen state and identity written to disk',
);

const stableCheck = freezeLock.verifyBundle({ censusDigest: 'abcd1234', fileCount: 150 });
record('BUNDLE_VERIFY_STABLE', stableCheck.status === 'BUNDLE_STABLE' && stableCheck.verified === true, 'matching digest returns BUNDLE_STABLE');

const clobberedCheck = freezeLock.verifyBundle({ censusDigest: '99999999', fileCount: 150 });
record('BUNDLE_VERIFY_CLOBBERED', clobberedCheck.status === 'BUNDLE_CLOBBERED' && clobberedCheck.verified === false, 'mismatched digest returns BUNDLE_CLOBBERED');

freezeLock.release();
cleanFile(lockPath3);

// 5. Stale lock detection and loud reclaim
const lockPathStale = path.join(testDir, 'test-stale.lock');
cleanFile(lockPathStale);

// Write a fake lock representing a dead process
const staleData = {
  pid: 999999, // guaranteed dead on Windows/Unix test
  purpose: 'abandoned-crash-run',
  createdAt: new Date(Date.now() - 60000).toISOString(),
  timestamp: Date.now() - 60000,
  hostname: os.hostname(),
  argv: ['node', 'fake-script.mjs'],
  state: 'FROZEN',
  bundleIdentity: { censusDigest: 'dead0000', fileCount: 10 },
};
writeFileSync(lockPathStale, JSON.stringify(staleData, null, 2), 'utf8');

const staleInspection = inspectBuildLock(lockPathStale);
record('INSPECT_STALE_LOCK', staleInspection.locked && staleInspection.isStale && !staleInspection.isAlive, 'inspectBuildLock detects dead holder');

const reclaimedLock = acquireBuildLock({ purpose: 'fresh-reclaiming-run', lockPath: lockPathStale });
record('STALE_LOCK_RECLAIMED', existsSync(lockPathStale), 'reclaimed lock successfully written');

const reclaimedDiskData = JSON.parse(readFileSync(lockPathStale, 'utf8'));
record('RECLAIMED_LOCK_HAS_CURRENT_PID',
  reclaimedDiskData.pid === process.pid && reclaimedDiskData.purpose === 'fresh-reclaiming-run',
  'disk lock now owned by current PID',
);
reclaimedLock.release();
record('RECLAIMED_LOCK_CLEANED_UP', !existsSync(lockPathStale), 'cleaned up after reclaim test');

// 6. Corrupt lock reclaim
const lockPathCorrupt = path.join(testDir, 'test-corrupt.lock');
writeFileSync(lockPathCorrupt, 'INVALID_JSON_CORRUPTED_FILE', 'utf8');

const corruptLock = acquireBuildLock({ purpose: 'reclaim-corrupt', lockPath: lockPathCorrupt });
record('CORRUPT_LOCK_RECLAIMED', existsSync(lockPathCorrupt), 'corrupt lock reclaimed and overwritten');
corruptLock.release();
cleanFile(lockPathCorrupt);

// 7. Contention detection: sub-process attempting to acquire active lock fails fast
const lockPathContention = path.join(testDir, 'test-contention.lock');
cleanFile(lockPathContention);

const activeLock = acquireBuildLock({ purpose: 'acceptance-active-holder', lockPath: lockPathContention });

// Spawn child process trying to acquire the same lock
const childResult = spawnSync(process.execPath, [
  '-e',
  `
    import('./scripts/lib/build_ownership.mjs').then(({ acquireBuildLock }) => {
      try {
        acquireBuildLock({ purpose: 'concurrent-builder', lockPath: ${JSON.stringify(lockPathContention)} });
        process.exit(0);
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    });
  `,
], { cwd: repoRoot, encoding: 'utf8' });

record('CONTENTION_FAILS_FAST', childResult.status === 1, 'child process exited with code 1');
record('CONTENTION_DIAGNOSTIC_MESSAGE',
  childResult.stderr.includes('FAIL_BUILD_SLOT_LOCKED')
  && childResult.stderr.includes(String(process.pid))
  && childResult.stderr.includes('acceptance-active-holder'),
  'child error message identifies active PID and purpose',
);

activeLock.release();
cleanFile(lockPathContention);

// 8. Exception safety with withBuildLock
const lockPathException = path.join(testDir, 'test-exception.lock');
cleanFile(lockPathException);

let exceptionCaught = false;
try {
  await withBuildLock({ purpose: 'test-throw', lockPath: lockPathException }, async (lock) => {
    assert(existsSync(lockPathException), 'lock must exist inside withBuildLock');
    throw new Error('Simulated runtime failure');
  });
} catch (err) {
  exceptionCaught = err.message === 'Simulated runtime failure';
}

record('EXCEPTION_THROWN_AND_CAUGHT', exceptionCaught, 'error was propagated');
record('EXCEPTION_SAFETY_RELEASES_LOCK', !existsSync(lockPathException), 'lock unlinked after exception in callback');

// 9. Force reclaim with BHR_FORCE_BUILD_LOCK
const lockPathForce = path.join(testDir, 'test-force.lock');
cleanFile(lockPathForce);

const liveLock = acquireBuildLock({ purpose: 'holder-to-be-forced', lockPath: lockPathForce });
const forceChild = spawnSync(process.execPath, [
  '-e',
  `
    import('./scripts/lib/build_ownership.mjs').then(({ acquireBuildLock }) => {
      process.env.BHR_FORCE_BUILD_LOCK = '1';
      acquireBuildLock({ purpose: 'force-overrider', lockPath: ${JSON.stringify(lockPathForce)} });
      console.log('FORCE_SUCCESS');
      process.exit(0);
    });
  `,
], { cwd: repoRoot, encoding: 'utf8' });

record('FORCE_RECLAIM_OVERWRITES', forceChild.stdout.includes('FORCE_SUCCESS'), 'force reclaim succeeded');
liveLock.release(); // safe to call even if overwritten
cleanFile(lockPathForce);

console.log('====================================================');
console.log(`PASS: All ${passCount} build ownership protocol contracts passed.`);
console.log('====================================================');
