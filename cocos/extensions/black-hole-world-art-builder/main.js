'use strict';

const fs = require('fs');
const path = require('path');

const AUTHORING_EXTENSION_VERSION = '1.0.0';

let authoringPoller = null;
let authoringBusy = false;
// Monotonic counter for open-scene requests; late-settling Promises compare
// their captured genId against this value and only log diagnostics if superseded.
let _openSceneGeneration = 0;

function getProjectPath() {
  try {
    if (typeof Editor !== 'undefined' && Editor && Editor.Project && typeof Editor.Project.path === 'string') {
      return Editor.Project.path;
    }
  } catch {}
  return null;
}

function authoringPaths() {
  const projectPath = getProjectPath();
  if (!projectPath) return null;
  const root = path.resolve(projectPath, '..', 'artifacts', 'authoring');
  return {
    root,
    pending: path.join(root, 'pending-job.json'),
    processing: path.join(root, 'processing-job.json'),
    progress: path.join(root, 'progress.json'),
    result: path.join(root, 'result.json'),
  };
}

function normalizeProjectPath(value) {
  return path.normalize(path.resolve(String(value))).replace(/[\/]+$/, '').toLowerCase();
}

function authoringTargetDiagnostic(job, currentPid, currentProjectPath) {
  const reasons = [];
  if (!job || typeof job !== 'object') reasons.push('invalid-job');
  if (job?.mode === 'LEGACY_MANUAL' && !Object.prototype.hasOwnProperty.call(job, 'targetCreatorPid')) {
    return { canClaim: true, reasons: [], legacy: true };
  }

  const targetPid = Number(job?.targetCreatorPid);
  const pollerPid = Number(currentPid);
  if (!Number.isInteger(targetPid) || targetPid <= 0) reasons.push('missing-or-invalid-targetCreatorPid');
  if (!Number.isInteger(pollerPid) || pollerPid <= 0 || targetPid !== pollerPid) reasons.push('creator-pid-mismatch');
  if (job?.targetProjectPath == null || job.targetProjectPath === '') {
    reasons.push('missing-targetProjectPath');
  } else if (!currentProjectPath || normalizeProjectPath(job.targetProjectPath) !== normalizeProjectPath(currentProjectPath)) {
    reasons.push('project-path-mismatch');
  }
  return { canClaim: reasons.length === 0, reasons, legacy: false };
}

function shouldClaimAuthoringJob(job, currentPid, currentProjectPath = getProjectPath()) {
  return authoringTargetDiagnostic(job, currentPid, currentProjectPath).canClaim;
}

function claimPendingAuthoringJob(paths, currentPid, currentProjectPath) {
  if (!paths?.pending || !paths?.processing) return { status: 'NO_PATHS' };
  try {
    if (!fs.existsSync(paths.pending)) return { status: 'NO_PENDING' };
  } catch {
    return { status: 'NO_PENDING' };
  }

  let pendingJob;
  try {
    pendingJob = JSON.parse(fs.readFileSync(paths.pending, 'utf8'));
  } catch {
    return { status: 'INVALID_PENDING' };
  }
  const diagnostic = authoringTargetDiagnostic(pendingJob, currentPid, currentProjectPath);
  if (!diagnostic.canClaim) {
    console.warn('[authoring] ignoring pending job ' + (pendingJob.jobId || pendingJob.job || 'UNKNOWN') + ': ' + diagnostic.reasons.join(','));
    return { status: 'IGNORED', diagnostic, job: pendingJob };
  }

  // Snapshot jobId before rename to detect TOCTOU replacement of pending.
  const preRenameJobId = pendingJob.jobId || null;

  try {
    fs.mkdirSync(paths.root, { recursive: true });
    fs.renameSync(paths.pending, paths.processing);
  } catch {
    return { status: 'RACE_LOST' };
  }

  let claimedJob;
  try {
    claimedJob = JSON.parse(fs.readFileSync(paths.processing, 'utf8'));
  } catch {
    // Cannot read what we renamed - clean up the orphaned processing file.
    try { fs.unlinkSync(paths.processing); } catch (_e) {}
    return { status: 'CLAIMED_INVALID' };
  }

  // If jobId changed between our pre-rename snapshot and what we now hold in
  // processing, a concurrent writer replaced the file.  Restore pending.
  if (preRenameJobId !== null && claimedJob.jobId !== preRenameJobId) {
    console.warn('[authoring] TOCTOU: jobId mismatch after rename - restoring pending');
    try {
      fs.renameSync(paths.processing, paths.pending);
    } catch (_restoreErr) {
      // pending may have been recreated; delete wrong processing so no orphan remains
      console.warn('[authoring] TOCTOU restore failed, deleting wrong processing: ' + String(_restoreErr));
      try { fs.unlinkSync(paths.processing); } catch (_e2) {}
    }
    return { status: 'RACE_LOST' };
  }

  const postClaimDiagnostic = authoringTargetDiagnostic(claimedJob, currentPid, currentProjectPath);
  if (!postClaimDiagnostic.canClaim) {
    console.warn('[authoring] claimed job failed post-claim target check: ' + postClaimDiagnostic.reasons.join(','));
    // Attempt to restore pending so the correct process can still claim.
    // If rename back fails, delete the orphaned processing file.
    try {
      fs.renameSync(paths.processing, paths.pending);
    } catch (_e) {
      try { fs.unlinkSync(paths.processing); } catch (_e2) {}
    }
    return { status: 'CLAIMED_INVALID', diagnostic: postClaimDiagnostic, job: claimedJob };
  }
  return { status: 'CLAIMED', job: claimedJob };
}

function writeJson(targetPath, data) {
  try {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, path.basename(targetPath) + '.' + Date.now() + '.' + Math.random().toString(36).slice(2) + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    try {
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    } catch {}
  }
}

function writeProgress(paths, job, pid, stage, startedAt, detail = null) {
  if (!paths || !paths.progress) return;
  const data = {
    job: job && job.job ? job.job : (job || 'UNKNOWN'),
    pid: pid || null,
    stage: stage || 'UNKNOWN',
    startedAt: startedAt || null,
    updatedAt: new Date().toISOString(),
    detail: detail || null,
  };
  writeJson(paths.progress, data);
}

function updateProcessing(paths, job, pid, phase, startedAt) {
  if (!paths || !paths.processing) return;
  const base = job && typeof job === 'object' ? { ...job } : { job };
  const data = {
    ...base,
    pid: pid || null,
    phase: phase || 'UNKNOWN',
    startedAt: startedAt || null,
    updatedAt: new Date().toISOString(),
  };
  writeJson(paths.processing, data);
}

function writeAuthoringResult(paths, result) {
  writeJson(paths.result, result);
}

function withTimeout(promise, ms, stage) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('AUTHORING_STAGE_TIMEOUT:' + stage);
      err.code = 'AUTHORING_STAGE_TIMEOUT:' + stage;
      err.stage = stage;
      reject(err);
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeoutPromise,
  ]);
}

async function requestGameSceneAndWait(sceneUuid, timeoutMs = 90000, jobId = null) {
  // Each call gets a unique generation token.  Late-settling open-scene
  // Promises detect that a newer call has superseded them and only log
  // diagnostics rather than mutating the current request's state.
  const genId = ++_openSceneGeneration;
  const genTag = 'genId=' + genId + (jobId ? ' jobId=' + jobId : '');
  let requestSettled = false;
  let requestResult = null;
  let requestError = null;

  // Creator 3.8.3 can complete the scene switch without resolving the IPC
  // request promptly. Treat the loaded scene as the source of truth.
  try {
    Promise.resolve(Editor.Message.request('scene', 'open-scene', sceneUuid))
      .then((value) => {
        if (_openSceneGeneration !== genId) {
          console.warn('[authoring] open-scene late resolve for superseded ' + genTag + ' (current=' + _openSceneGeneration + '), ignoring state mutation');
          return;
        }
        requestSettled = true;
        requestResult = value;
      })
      .catch((error) => {
        if (_openSceneGeneration !== genId) {
          console.warn('[authoring] open-scene late reject for superseded ' + genTag + ' (current=' + _openSceneGeneration + '), ignoring state mutation');
          return;
        }
        requestSettled = true;
        requestError = error && (error.stack || String(error));
      });
  } catch (error) {
    requestSettled = true;
    requestError = error && (error.stack || String(error));
  }

  const deadline = Date.now() + timeoutMs;
  let lastReadiness = null;
  // Give Creator a brief IPC settle window before first poll
  await new Promise((resolve) => setTimeout(resolve, 2000));
  let innerPollCount = 0;
  while (Date.now() < deadline) {
    innerPollCount++;
    try {
      lastReadiness = await module.exports.methods.isGameSceneReady(3000);
      if (lastReadiness?.ready && lastReadiness.sceneName === 'Game' && _openSceneGeneration === genId) {
        return {
          requestSettled,
          requestResult,
          requestError,
          sceneReady: lastReadiness,
          innerPollCount,
          genId,
        };
      }
    } catch (error) {
      lastReadiness = { error: error && (error.stack || String(error)) };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const error = new Error('Game.scene did not become ready after open-scene request');
  error.code = 'OPEN_SCENE_NOT_READY';
  error.details = {
    sceneUuid,
    genId,
    requestSettled,
    requestResult,
    requestError,
    lastReadiness,
    innerPollCount,
  };
  throw error;
}


async function runAuthoringJob(job, paths) {
  const pid = process.pid;
  const projectPath = getProjectPath();
  const startedAt = new Date().toISOString();
  let currentStage = 'CLAIMED';
  writeProgress(paths, job, pid, 'CLAIMED', startedAt);
  updateProcessing(paths, job, pid, 'CLAIMED', startedAt);
  const prefabRelative = 'cocos/assets/prefabs/world/GoldenCityCell.prefab';
  const result = {
    job: job && job.job ? job.job : 'UNKNOWN',
    startedAt,
    finishedAt: null,
    success: false,
    prefabPath: prefabRelative,
    prefabExists: false,
    metaExists: false,
    verifyResult: null,
    dependencyPreflight: { pass: true },
    openSceneUrl: 'db://assets/scenes/Game.scene',
    openSceneUuid: null,
    openSceneResolveResult: null,
    openSceneRequested: true,
    openSceneResult: null,
    sceneReadyPollCount: 0,
    sceneName: null,
    gameRootFound: false,
    buildSceneScriptCalled: false,
    buildSceneScriptResult: null,
    bindSceneScriptCalled: false,
    bindSceneScriptResult: null,
    createPrefabRequested: false,
    verifySceneScriptCalled: false,
    verifySceneScriptResult: null,
    assetDbResolvable: false,
    openSceneResolvePollCount: 0,
    phase: 'CLAIMED',
    lastStage: 'CLAIMED',
    progressPath: paths ? paths.progress : null,
    processing: paths ? { path: paths.processing, phase: 'CLAIMED', pid } : null,
    error: null,
  };

  try {
    if (!job || (job.job !== 'BUILD_GOLDEN_CITY' && job.job !== 'BIND_GOLDEN_CITY' && job.job !== 'VERIFY_GOLDEN_CITY')) {
      throw new Error('Unsupported authoring job: ' + (job ? job.job : 'null'));
    }

    // The dedicated authoring Creator may start on Bootstrap.scene or another
    // previously selected document.  The existing scene scripts intentionally
    // operate on Game.scene/GameRoot, so make that document explicit before
    // invoking the Builder.  This uses Creator's official scene IPC and keeps
    // all prefab serialization inside Creator.
    // Cocos Creator 3.8 scene/open-scene requires the asset UUID, not a db:// URL.
    // Query the UUID through asset-db first.
    currentStage = 'OPEN_SCENE_RESOLVE';
    result.phase = 'OPEN_SCENE_RESOLVE';
    result.lastStage = currentStage;
    writeProgress(paths, job, pid, currentStage, startedAt);
    updateProcessing(paths, job, pid, currentStage, startedAt);
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        result.openSceneResolvePollCount = attempt + 1;
        const info = await withTimeout(
          Editor.Message.request('asset-db', 'query-asset-info', result.openSceneUrl),
          10000,
          'OPEN_SCENE_RESOLVE'
        );
        if (info && info.uuid) {
          result.openSceneUuid = info.uuid;
          result.openSceneResolveResult = { uuid: info.uuid, url: info.url || result.openSceneUrl };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (resolveErr) {
      if (resolveErr && String(resolveErr.message || resolveErr).startsWith('AUTHORING_STAGE_TIMEOUT')) {
        throw resolveErr;
      }
      result.openSceneUuid = null;
      result.openSceneResolveResult = false;
      result.error = resolveErr && (resolveErr.stack || String(resolveErr));
    }

    if (!result.openSceneUuid) {
      result.phase = 'OPEN_SCENE_RESOLVE_FAILED';
      throw new Error('Failed to resolve UUID for Game.scene via asset-db: ' + result.openSceneUrl);
    }

    // Request official scene switch using scene UUID. The scene state is the
    // completion signal because this IPC may remain pending in Creator 3.8.3.
    currentStage = 'OPEN_SCENE';
    result.phase = 'OPEN_SCENE';
    result.lastStage = currentStage;
    writeProgress(paths, job, pid, currentStage, startedAt);
    updateProcessing(paths, job, pid, currentStage, startedAt);
    result.openSceneResult = await requestGameSceneAndWait(result.openSceneUuid, 90000, job.jobId || null);

    currentStage = 'IS_GAME_SCENE_READY';
    result.phase = 'IS_GAME_SCENE_READY';
    result.lastStage = currentStage;
    writeProgress(paths, job, pid, currentStage, startedAt);
    updateProcessing(paths, job, pid, currentStage, startedAt);
    let sceneReady = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      result.sceneReadyPollCount = attempt + 1;
      sceneReady = await module.exports.methods.isGameSceneReady();
      result.sceneName = sceneReady?.sceneName || null;
      result.gameRootFound = Boolean(sceneReady?.hasGameRoot);
      if (sceneReady?.ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!sceneReady?.ready) {
      throw new Error('Game.scene was not ready for authoring: ' + JSON.stringify(sceneReady));
    }

    if (job.job === 'BUILD_GOLDEN_CITY') {
      const buildStages = ['prepare', 'structure', 'park', 'content', 'persist'];
      result.buildSceneScriptCalled = true;
      result.buildSceneScriptResults = [];
      for (const buildStage of buildStages) {
        currentStage = 'BUILD_GOLDEN_CITY_' + buildStage.toUpperCase();
        result.phase = currentStage;
        result.lastStage = currentStage;
        writeProgress(paths, job, pid, currentStage, startedAt);
        updateProcessing(paths, job, pid, currentStage, startedAt);
        const stageResult = await module.exports.methods.buildGoldenCityCell(buildStage);
        result.buildSceneScriptResults.push(stageResult);
        if (!stageResult || stageResult.status !== 'PASS') {
          throw new Error('Golden City authoring stage failed: ' + buildStage + ' ' + JSON.stringify(stageResult));
        }
      }
      result.buildSceneScriptResult = result.buildSceneScriptResults[result.buildSceneScriptResults.length - 1];
      result.createPrefabRequested = true;

      currentStage = 'BIND_GOLDEN_CITY';
      result.phase = currentStage;
      result.lastStage = currentStage;
      writeProgress(paths, job, pid, currentStage, startedAt);
      updateProcessing(paths, job, pid, currentStage, startedAt);
      result.bindSceneScriptCalled = true;
      result.bindSceneScriptResult = await module.exports.methods.bindGoldenCityCell();
    }

    if (job.job === 'BIND_GOLDEN_CITY') {
      currentStage = 'BIND_GOLDEN_CITY';
      result.phase = 'BIND_GOLDEN_CITY';
      result.lastStage = currentStage;
      writeProgress(paths, job, pid, currentStage, startedAt);
      updateProcessing(paths, job, pid, currentStage, startedAt);
      result.bindSceneScriptCalled = true;
      result.bindSceneScriptResult = await module.exports.methods.bindGoldenCityCell();
    }

    currentStage = 'VERIFY_GOLDEN_CITY';
    result.phase = 'VERIFY_GOLDEN_CITY';
    result.lastStage = currentStage;
    writeProgress(paths, job, pid, currentStage, startedAt);
    updateProcessing(paths, job, pid, currentStage, startedAt);
    result.verifySceneScriptCalled = true;
    result.verifyResult = await module.exports.methods.verifyGoldenCityCell();
    result.verifySceneScriptResult = result.verifyResult;

    if (projectPath) {
      const prefabAbs = path.join(projectPath, 'assets', 'prefabs', 'world', 'GoldenCityCell.prefab');
      result.prefabExists = fs.existsSync(prefabAbs);
      result.metaExists = fs.existsSync(prefabAbs + '.meta');
    }
    result.assetDbResolvable = Boolean(result.verifyResult?.prefab || result.prefabExists);

    result.success = Boolean(
      result.prefabExists &&
      result.metaExists &&
      result.verifyResult &&
      result.verifyResult.status === 'PASS'
    );
    result.phase = result.success ? 'COMPLETE' : 'POST_VERIFY_CHECK';
    currentStage = result.phase;
    result.lastStage = currentStage;
    writeProgress(paths, job, pid, currentStage, startedAt);
    updateProcessing(paths, job, pid, currentStage, startedAt);
    if (!result.success) {
      result.lastStage = currentStage;
      result.progressPath = paths ? paths.progress : null;
      result.processing = {
        path: paths ? paths.processing : null,
        phase: result.phase,
        pid,
      };
      result.error = 'Creator scene script returned but authored prefab/meta verification is incomplete';
    }
  } catch (error) {
    result.phase = 'FAILED';
    result.lastStage = currentStage;
    result.progressPath = paths ? paths.progress : null;
    result.processing = {
      path: paths ? paths.processing : null,
      phase: currentStage,
      pid,
    };
    result.error = error && (error.stack || String(error));
    writeProgress(paths, job, pid, 'FAILED', startedAt, { error: result.error, lastStage: currentStage });
  } finally {
    result.finishedAt = new Date().toISOString();
    writeAuthoringResult(paths, result);
  }
}

async function pollAuthoringJob() {
  if (authoringBusy) return;
  const paths = authoringPaths();
  if (!paths) return;

  try {
    if (!fs.existsSync(paths.pending)) return;
  } catch {
    return;
  }

  const pollerPid = process.pid;
  const pollerClaimedAt = new Date().toISOString();
  const claim = claimPendingAuthoringJob(paths, pollerPid, getProjectPath());
  if (claim.status !== 'CLAIMED') return;
  const job = claim.job;

  if (!job || typeof job !== 'object') {
    const error = new Error('Claimed authoring job is invalid');
    writeProgress(paths, null, pollerPid, 'CLAIM_FAILED', pollerClaimedAt, { error: error && (error.stack || String(error)) });
    writeAuthoringResult(paths, {
      job: null,
      startedAt: pollerClaimedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
      prefabExists: false,
      metaExists: false,
      verifyResult: null,
      phase: 'CLAIM_FAILED',
      lastStage: 'CLAIM_FAILED',
      progressPath: paths.progress,
      processing: {
        path: paths.processing,
        phase: 'CLAIM_FAILED',
        pid: pollerPid,
      },
      error: error && (error.stack || String(error)),
    });
    try { fs.rmSync(paths.processing, { force: true }); } catch {}
    return;
  }

  updateProcessing(paths, job, pollerPid, 'CLAIMED', pollerClaimedAt);
  writeProgress(paths, job, pollerPid, 'CLAIMED', pollerClaimedAt);

  authoringBusy = true;
  try {
    await runAuthoringJob(job, paths);
  } finally {
    authoringBusy = false;
    try {
      fs.rmSync(paths.processing, { force: true });
    } catch {}
  }
}

module.exports = {
  authoringTargetDiagnostic,
  claimPendingAuthoringJob,
  shouldClaimAuthoringJob,
  load() {
    if (!authoringPoller) {
      authoringPoller = setInterval(() => { void pollAuthoringJob(); }, 500);
    }
  },
  unload() {
    if (authoringPoller) {
      clearInterval(authoringPoller);
      authoringPoller = null;
    }
  },
  methods: {
    getAuthoringExtensionVersion() {
      return AUTHORING_EXTENSION_VERSION;
    },
    getAuthoringStatus() {
      const paths = authoringPaths();
      let processing = null;
      let progress = null;
      try {
        if (paths && paths.processing && fs.existsSync(paths.processing)) {
          processing = JSON.parse(fs.readFileSync(paths.processing, 'utf8'));
        }
      } catch {}
      try {
        if (paths && paths.progress && fs.existsSync(paths.progress)) {
          progress = JSON.parse(fs.readFileSync(paths.progress, 'utf8'));
        }
      } catch {}
      return {
        version: AUTHORING_EXTENSION_VERSION,
        busy: authoringBusy,
        paths,
        processing,
        progress,
      };
    },
    async buildWorldArtLibrary() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildWorldArtLibrary',
        args: [],
      });
    },
    async buildGoldenCityCell(stage = 'full', timeoutMs = 120000) {
      return withTimeout(Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildGoldenCityCell',
        args: [stage],
      }), timeoutMs, 'BUILD_GOLDEN_CITY_' + stage.toUpperCase());
    },
    async bindGoldenCityCell(timeoutMs = 120000) {
      return withTimeout(Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'bindGoldenCityCell',
        args: [],
      }), timeoutMs, 'BIND_GOLDEN_CITY');
    },
    async verifyGoldenCityCell(timeoutMs = 60000) {
      return withTimeout(Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'verifyGoldenCityCell',
        args: [],
      }), timeoutMs, 'VERIFY_GOLDEN_CITY');
    },
    async isGameSceneReady(timeoutMs = 10000) {
      return withTimeout(Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'isGameSceneReady',
        args: [],
      }), timeoutMs, 'IS_GAME_SCENE_READY');
    },
    async verifyWorldArtLibrary() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'verifyWorldArtLibrary',
        args: [],
      });
    },
  },
};
