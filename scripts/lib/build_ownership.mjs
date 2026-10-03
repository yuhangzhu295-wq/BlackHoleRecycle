/**
 * BUILD_OWNERSHIP_PROTOCOL
 *
 * Enforces mutual exclusion on the Cocos Creator build slot so that at any instant:
 * 1. Exactly one Creator build process is running.
 * 2. Once an acceptance run freezes a bundle, no concurrent process can rebuild
 *    or modify the bundle until that acceptance run finishes.
 * 3. Lock acquisition fails fast with actionable diagnostics when held by an active process.
 * 4. Stale locks left by dead processes (crashes, ungraceful kills) are detected
 *    and loudly reclaimed.
 * 5. Re-entrancy within the same process is supported (outer runner holds the lock
 *    across an entire acceptance run, while inner build calls increment lock depth).
 * 6. Release on exit (normal exit, exceptions, try/finally, process exit hooks).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..', '..');

export const DEFAULT_LOCK_PATH = path.resolve(
  process.env.BHR_BUILD_LOCK_PATH || path.join(repoRoot, 'artifacts', 'locks', 'cocos-build.lock'),
);

/** Checks whether a process with the given PID is currently alive on this system. */
export function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false; // No such process
    }
    if (error.code === 'EPERM') {
      return true; // Process exists but caller lacks permission to signal it
    }
    return false;
  }
}

/** In-memory tracking of active locks held by the current process. Key: resolved lockPath */
const inMemoryLocks = new Map();

/**
 * Handle representing an acquired build lock.
 */
export class BuildLockHandle {
  constructor({ lockPath, purpose, depth = 1 }) {
    this.lockPath = lockPath;
    this.purpose = purpose;
    this.depth = depth;
    this.released = false;
    this.state = 'ACQUIRED';
    this.bundleIdentity = null;
    this._exitHook = null;
    this._sigintHook = null;
    this._sigtermHook = null;
  }

  _writeDiskLock() {
    const data = {
      pid: process.pid,
      purpose: this.purpose,
      createdAt: this.createdAt || new Date().toISOString(),
      timestamp: this.timestamp || Date.now(),
      hostname: os.hostname(),
      argv: process.argv,
      state: this.state,
      bundleIdentity: this.bundleIdentity,
    };
    mkdirSync(path.dirname(this.lockPath), { recursive: true });
    writeFileSync(this.lockPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  /**
   * Freezes the bundle after a build completes, recording its identity.
   * While frozen, acceptance tests run against the bundle.
   */
  freezeBundle(bundleIdentity) {
    if (this.released) {
      throw new Error('Cannot freeze bundle on an already released build lock.');
    }
    this.state = 'FROZEN';
    this.bundleIdentity = {
      censusDigest: bundleIdentity?.censusDigest ?? null,
      fileCount: bundleIdentity?.fileCount ?? null,
      frozenAt: new Date().toISOString(),
      timestamp: Date.now(),
    };
    this._writeDiskLock();
    console.log(
      `[build-lock] Bundle frozen by PID ${process.pid} (digest: ${this.bundleIdentity.censusDigest}, `
      + `files: ${this.bundleIdentity.fileCount}) for "${this.purpose}".`,
    );
  }

  /**
   * Verifies that the current bundle census matches the frozen identity.
   */
  verifyBundle(currentIdentity) {
    if (!this.bundleIdentity) {
      return {
        verified: false,
        status: 'BUNDLE_UNVERIFIED',
        reason: 'No frozen bundle identity recorded on lock handle.',
      };
    }
    const startDigest = this.bundleIdentity.censusDigest;
    const currentDigest = currentIdentity?.censusDigest ?? null;
    const matches = startDigest !== null && currentDigest !== null && startDigest === currentDigest;
    return {
      verified: matches,
      status: matches ? 'BUNDLE_STABLE' : 'BUNDLE_CLOBBERED',
      startDigest,
      currentDigest,
    };
  }

  /**
   * Releases the build lock. If depth > 1, decrements depth without releasing disk lock.
   * When depth reaches 0, unlinks the lock file from disk.
   */
  release() {
    if (this.released) return;

    this.depth -= 1;
    if (this.depth > 0) {
      return;
    }

    this.released = true;
    this.state = 'RELEASED';
    inMemoryLocks.delete(this.lockPath);
    this._removeExitHooks();

    try {
      if (existsSync(this.lockPath)) {
        const raw = readFileSync(this.lockPath, 'utf8');
        try {
          const parsed = JSON.parse(raw);
          if (parsed.pid === process.pid) {
            unlinkSync(this.lockPath);
            console.log(`[build-lock] Released build lock for PID ${process.pid} ("${this.purpose}").`);
          }
        } catch {
          // If unparseable but we owned it, clean it up
          unlinkSync(this.lockPath);
        }
      }
    } catch (error) {
      console.warn(`[build-lock] Warning: failed to remove lock file at ${this.lockPath}:`, error.message);
    }
  }

  _registerExitHooks() {
    this._exitHook = () => {
      try {
        if (!this.released && existsSync(this.lockPath)) {
          const parsed = JSON.parse(readFileSync(this.lockPath, 'utf8'));
          if (parsed.pid === process.pid) {
            unlinkSync(this.lockPath);
          }
        }
      } catch {}
    };
    process.once('exit', this._exitHook);

    this._sigintHook = () => {
      this.release();
      process.exit(130);
    };
    this._sigtermHook = () => {
      this.release();
      process.exit(143);
    };
    process.once('SIGINT', this._sigintHook);
    process.once('SIGTERM', this._sigtermHook);
  }

  _removeExitHooks() {
    if (this._exitHook) {
      process.removeListener('exit', this._exitHook);
      this._exitHook = null;
    }
    if (this._sigintHook) {
      process.removeListener('SIGINT', this._sigintHook);
      this._sigintHook = null;
    }
    if (this._sigtermHook) {
      process.removeListener('SIGTERM', this._sigtermHook);
      this._sigtermHook = null;
    }
  }
}

/**
 * Reads and inspects the current lock file without mutating it.
 */
export function inspectBuildLock(targetLockPath = DEFAULT_LOCK_PATH) {
  const lockPath = path.resolve(targetLockPath);
  if (!existsSync(lockPath)) {
    return { locked: false, lockPath, holder: null };
  }
  try {
    const raw = readFileSync(lockPath, 'utf8');
    const holder = JSON.parse(raw);
    const alive = typeof holder.pid === 'number' && isPidAlive(holder.pid);
    const ageSeconds = holder.timestamp ? ((Date.now() - holder.timestamp) / 1000).toFixed(1) : 'unknown';
    return {
      locked: true,
      lockPath,
      holder,
      isAlive: alive,
      isStale: !alive,
      ageSeconds,
    };
  } catch (error) {
    return {
      locked: true,
      lockPath,
      holder: null,
      isAlive: false,
      isStale: true,
      corrupt: true,
      error: error.message,
    };
  }
}

/**
 * Acquires ownership of the Cocos build slot.
 *
 * @param {object} options
 * @param {string} options.purpose Human-readable label for what is running (e.g. "acceptance:v2 --scope=full")
 * @param {string} [options.lockPath] Custom lock file path; defaults to artifacts/locks/cocos-build.lock
 * @param {boolean} [options.force] Force reclaim even if held by alive PID; defaults to BHR_FORCE_BUILD_LOCK=1
 * @returns {BuildLockHandle}
 */
export function acquireBuildLock(options = {}) {
  const purpose = options.purpose || 'unspecified-build-task';
  const lockPath = path.resolve(options.lockPath || DEFAULT_LOCK_PATH);
  const force = Boolean(options.force || process.env.BHR_FORCE_BUILD_LOCK === '1');

  // 1. Check in-memory re-entrancy for the current process
  const existingInMemory = inMemoryLocks.get(lockPath);
  if (existingInMemory && !existingInMemory.released) {
    existingInMemory.depth += 1;
    console.log(
      `[build-lock] Re-entrant lock acquired by PID ${process.pid} (depth: ${existingInMemory.depth}, `
      + `purpose: "${purpose}").`,
    );
    return existingInMemory;
  }

  // 2. Ensure lock directory exists
  mkdirSync(path.dirname(lockPath), { recursive: true });

  // 3. Inspect existing lock file on disk if present
  if (existsSync(lockPath)) {
    let existingData = null;
    let isCorrupt = false;
    try {
      const raw = readFileSync(lockPath, 'utf8');
      existingData = JSON.parse(raw);
    } catch {
      isCorrupt = true;
    }

    if (isCorrupt || !existingData || typeof existingData.pid !== 'number') {
      console.warn(
        `[build-lock] RECLAIMING CORRUPT LOCK: Lock file at "${lockPath}" is corrupt or invalid. `
        + `Reclaiming lock loudly for PID ${process.pid} ("${purpose}").`,
      );
    } else if (existingData.pid === process.pid) {
      // Exists on disk from this process (e.g. prior unmanaged handle or re-exec)
      console.log(`[build-lock] Adopting existing disk lock owned by PID ${process.pid} ("${purpose}").`);
    } else {
      const alive = isPidAlive(existingData.pid);
      const ageSeconds = existingData.timestamp
        ? ((Date.now() - existingData.timestamp) / 1000).toFixed(1)
        : 'unknown';

      if (!alive) {
        // STALE LOCK DETECTION: Holder process is dead!
        console.warn(
          `[build-lock] RECLAIMING STALE LOCK: Previous holder PID ${existingData.pid} `
          + `(purpose: "${existingData.purpose || 'unknown'}", state: "${existingData.state || 'unknown'}", `
          + `acquired: ${ageSeconds}s ago at ${existingData.createdAt || 'unknown'}) `
          + `is no longer alive (process terminated abnormally). `
          + `Loudly reclaiming lock for PID ${process.pid} ("${purpose}").`,
        );
      } else if (force) {
        // Explicit force-reclaim requested
        console.warn(
          `[build-lock] FORCE RECLAIMING LOCK: Holder PID ${existingData.pid} is active `
          + `(purpose: "${existingData.purpose}", age: ${ageSeconds}s), but BHR_FORCE_BUILD_LOCK=1 was specified. `
          + `Force-reclaiming lock for PID ${process.pid} ("${purpose}").`,
        );
      } else {
        // CONTENTION: Another active process holds the slot! Fail fast with actionable error.
        const stateStr = existingData.state ? ` [state: ${existingData.state}]` : '';
        const errorMessage =
          `FAIL_BUILD_SLOT_LOCKED: Cocos Creator build slot is currently held by active process PID ${existingData.pid}${stateStr} `
          + `(purpose: "${existingData.purpose || 'unknown'}", age: ${ageSeconds}s, acquired at: ${existingData.createdAt || 'unknown'}). `
          + `A concurrent build or acceptance run is already in progress.\n`
          + `To resolve:\n`
          + `  1. Wait for PID ${existingData.pid} to finish.\n`
          + `  2. If PID ${existingData.pid} is stalled or orphaned, terminate it or remove:\n`
          + `     "${lockPath}"\n`
          + `  3. Alternatively, set BHR_FORCE_BUILD_LOCK=1 to force-reclaim the slot.`;
        throw new Error(errorMessage);
      }
    }
  }

  // 4. Create and record the fresh lock handle
  const handle = new BuildLockHandle({ lockPath, purpose, depth: 1 });
  handle.createdAt = new Date().toISOString();
  handle.timestamp = Date.now();
  handle.state = 'ACQUIRED';
  handle._writeDiskLock();
  handle._registerExitHooks();

  inMemoryLocks.set(lockPath, handle);
  console.log(`[build-lock] Acquired build lock for PID ${process.pid} ("${purpose}").`);
  return handle;
}

/**
 * Executes an async operation with build ownership lock guaranteed by try/finally.
 */
export async function withBuildLock(options, callback) {
  const lock = acquireBuildLock(options);
  try {
    return await callback(lock);
  } finally {
    lock.release();
  }
}
