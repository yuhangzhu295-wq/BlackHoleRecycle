import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import extension from '../cocos/extensions/black-hole-world-art-builder/main.js';

const { authoringTargetDiagnostic, claimPendingAuthoringJob, shouldClaimAuthoringJob } = extension;
const projectPath = String.raw`C:\Users\zyu33\Documents\Codex\2026-08-28\ji\cocos`;
const createJob = (overrides = {}) => ({
  jobId: 'test-job',
  job: 'BUILD_GOLDEN_CITY',
  targetCreatorPid: 41152,
  targetProjectPath: projectPath,
  ...overrides,
});

assert.equal(typeof authoringTargetDiagnostic, 'function');
assert.equal(typeof claimPendingAuthoringJob, 'function');
assert.equal(typeof shouldClaimAuthoringJob, 'function');

// TEST 1: the selected GUI Creator PID can claim.
assert.equal(shouldClaimAuthoringJob(createJob(), 41152, projectPath), true);

// TEST 2: the legacy CLI PID cannot claim and the pending job remains untouched.
assert.equal(shouldClaimAuthoringJob(createJob(), 60148, projectPath), false);
assert.equal(shouldClaimAuthoringJob(createJob({ targetCreatorPid: undefined }), 41152, projectPath), false);
assert.equal(shouldClaimAuthoringJob(createJob({ targetCreatorPid: 'not-a-pid' }), 41152, projectPath), false);

// TEST 4: a different project cannot claim even with the right PID.
assert.equal(shouldClaimAuthoringJob(createJob({ targetProjectPath: String.raw`C:\other\cocos` }), 41152, projectPath), false);

// Explicitly marked manual jobs retain a narrow compatibility path.
assert.equal(shouldClaimAuthoringJob({ job: 'BUILD_GOLDEN_CITY', mode: 'LEGACY_MANUAL' }, 60148, projectPath), true);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'authoring-routing-'));
const paths = {
  root,
  pending: path.join(root, 'pending-job.json'),
  processing: path.join(root, 'processing-job.json'),
};
fs.writeFileSync(paths.pending, JSON.stringify(createJob()) + '\n', 'utf8');

const wrongPid = claimPendingAuthoringJob(paths, 60148, projectPath);
assert.equal(wrongPid.status, 'IGNORED');
assert.equal(fs.existsSync(paths.pending), true);
assert.equal(fs.existsSync(paths.processing), false);

// TEST 3: after the wrong PID polls, the selected PID can still claim.
const rightPid = claimPendingAuthoringJob(paths, 41152, projectPath);
assert.equal(rightPid.status, 'CLAIMED');
assert.equal(fs.existsSync(paths.pending), false);
assert.equal(fs.existsSync(paths.processing), true);

// TEST 5: one atomic claim yields one processing job.
assert.equal(JSON.parse(fs.readFileSync(paths.processing, 'utf8')).jobId, 'test-job');
assert.equal(fs.readdirSync(root).filter((name) => name === 'processing-job.json').length, 1);
assert.equal(claimPendingAuthoringJob(paths, 41152, projectPath).status, 'NO_PENDING');

const mismatch = authoringTargetDiagnostic(createJob({ targetCreatorPid: 60148 }), 41152, projectPath);
assert.equal(mismatch.canClaim, false);
assert.ok(mismatch.reasons.includes('creator-pid-mismatch'));


// TEST 6: TOCTOU - jobId mismatch after rename returns RACE_LOST and cleans up processing.
{
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'authoring-toctou-'));
  const paths2 = {
    root: root2,
    pending: path.join(root2, 'pending-job.json'),
    processing: path.join(root2, 'processing-job.json'),
  };
  const jobA = createJob({ jobId: 'job-A' });
  const jobB = createJob({ jobId: 'job-B' });
  fs.writeFileSync(paths2.pending, JSON.stringify(jobA) + '\n', 'utf8');
  const origRename = fs.renameSync;
  fs.renameSync = (src, dst) => {
    origRename(src, dst);
    fs.writeFileSync(dst, JSON.stringify(jobB) + '\n', 'utf8');
  };
  const toctouResult = claimPendingAuthoringJob(paths2, 41152, projectPath);
  fs.renameSync = origRename;
  assert.equal(toctouResult.status, 'RACE_LOST', 'TOCTOU jobId mismatch must yield RACE_LOST');
  assert.equal(fs.existsSync(paths2.processing), false, 'processing must not remain after RACE_LOST');
}

// TEST 7: post-claim identity failure cleans up processing and does not write result.json.
{
  const root3 = fs.mkdtempSync(path.join(os.tmpdir(), 'authoring-postclaim-'));
  const paths3 = {
    root: root3,
    pending: path.join(root3, 'pending-job.json'),
    processing: path.join(root3, 'processing-job.json'),
    result: path.join(root3, 'result.json'),
  };
  const jobGood = createJob({ jobId: 'job-good', targetCreatorPid: 41152 });
  const jobBadPid = createJob({ jobId: 'job-good', targetCreatorPid: 99999 });
  fs.writeFileSync(paths3.pending, JSON.stringify(jobGood) + '\n', 'utf8');
  const origRename3 = fs.renameSync;
  fs.renameSync = (src, dst) => {
    origRename3(src, dst);
    fs.writeFileSync(dst, JSON.stringify(jobBadPid) + '\n', 'utf8');
  };
  const postClaimResult = claimPendingAuthoringJob(paths3, 41152, projectPath);
  fs.renameSync = origRename3;
  assert.equal(postClaimResult.status, 'CLAIMED_INVALID', 'post-claim PID failure must yield CLAIMED_INVALID');
  assert.equal(fs.existsSync(paths3.processing), false, 'processing must not remain after post-claim identity failure');
  assert.equal(fs.existsSync(paths3.result), false, 'result must not be written after post-claim identity failure');
}

// TEST 8: TOCTOU restore when pending already exists - processing must be deleted, not left behind.
// This covers Windows where renameSync(processing->pending) throws EEXIST.
{
  const root4 = fs.mkdtempSync(path.join(os.tmpdir(), 'authoring-toctou-eexist-'));
  const paths4 = {
    root: root4,
    pending: path.join(root4, 'pending-job.json'),
    processing: path.join(root4, 'processing-job.json'),
  };
  const jobC = createJob({ jobId: 'job-C' });
  const jobD = createJob({ jobId: 'job-D' });
  fs.writeFileSync(paths4.pending, JSON.stringify(jobC) + '\n', 'utf8');
  const origRename4 = fs.renameSync;
  let renameCallCount = 0;
  fs.renameSync = (src, dst) => {
    renameCallCount++;
    if (renameCallCount === 1) {
      // First rename (pending->processing): execute normally, then mutate processing
      origRename4(src, dst);
      fs.writeFileSync(dst, JSON.stringify(jobD) + '\n', 'utf8');
    } else {
      // Second rename (processing->pending restore attempt): simulate EEXIST by recreating pending first
      fs.writeFileSync(paths4.pending, JSON.stringify(jobC) + '\n', 'utf8');
      origRename4(src, dst); // This will throw on Windows because dst exists
    }
  };
  let toctouResult4;
  try {
    toctouResult4 = claimPendingAuthoringJob(paths4, 41152, projectPath);
  } finally {
    fs.renameSync = origRename4;
  }
  assert.equal(toctouResult4.status, 'RACE_LOST', 'TEST8: TOCTOU with EEXIST must yield RACE_LOST');
  assert.equal(fs.existsSync(paths4.processing), false, 'TEST8: processing must not remain when restore destination already exists');
}
console.log('authoring job routing: PASS');
