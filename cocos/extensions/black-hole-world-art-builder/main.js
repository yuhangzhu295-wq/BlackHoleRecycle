'use strict';

const fs = require('fs');
const path = require('path');

let authoringPoller = null;
let authoringBusy = false;

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
    result: path.join(root, 'result.json'),
  };
}

function writeAuthoringResult(paths, result) {
  try {
    fs.mkdirSync(paths.root, { recursive: true });
    const tmp = path.join(paths.root, 'result.' + Date.now() + '.' + Math.random().toString(36).slice(2) + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, paths.result);
  } catch (err) {
    try {
      fs.writeFileSync(paths.result, JSON.stringify(result, null, 2) + '\n', 'utf8');
    } catch {}
  }
}

async function runAuthoringJob(job, paths) {
  const projectPath = getProjectPath();
  const startedAt = new Date().toISOString();
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
    phase: 'STARTING',
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
    result.phase = 'OPEN_SCENE_RESOLVE';
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        result.openSceneResolvePollCount = attempt + 1;
        const info = await Editor.Message.request('asset-db', 'query-asset-info', result.openSceneUrl);
        if (info && info.uuid) {
          result.openSceneUuid = info.uuid;
          result.openSceneResolveResult = { uuid: info.uuid, url: info.url || result.openSceneUrl };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (resolveErr) {
      result.openSceneUuid = null;
      result.openSceneResolveResult = false;
      result.error = resolveErr && (resolveErr.stack || String(resolveErr));
    }

    if (!result.openSceneUuid) {
      result.phase = 'OPEN_SCENE_RESOLVE_FAILED';
      throw new Error('Failed to resolve UUID for Game.scene via asset-db: ' + result.openSceneUrl);
    }

    // Request official scene switch using scene UUID.
    result.openSceneResult = await Editor.Message.request('scene', 'open-scene', result.openSceneUuid);
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
      result.phase = 'BUILD_GOLDEN_CITY';
      result.buildSceneScriptCalled = true;
      result.buildSceneScriptResult = await module.exports.methods.buildGoldenCityCell();
      // A successful Builder call includes the official create-prefab step.
      // Keep this diagnostic truthful even though execute-scene-script does
      // not expose the nested IPC call separately.
      result.createPrefabRequested = Boolean(result.buildSceneScriptResult?.status === 'PASS');
    }

    if (job.job === 'BIND_GOLDEN_CITY') {
      result.phase = 'BIND_GOLDEN_CITY';
      result.bindSceneScriptCalled = true;
      result.bindSceneScriptResult = await module.exports.methods.bindGoldenCityCell();
    }

    result.phase = 'VERIFY_GOLDEN_CITY';
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
    if (!result.success) {
      result.error = 'Creator scene script returned but authored prefab/meta verification is incomplete';
    }
  } catch (error) {
    result.phase = 'FAILED';
    result.error = error && (error.stack || String(error));
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

  // Atomic claim
  try {
    fs.mkdirSync(paths.root, { recursive: true });
    fs.renameSync(paths.pending, paths.processing);
  } catch (error) {
    return;
  }

  let job;
  try {
    const raw = fs.readFileSync(paths.processing, 'utf8');
    job = JSON.parse(raw);
  } catch (error) {
    writeAuthoringResult(paths, {
      job: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      success: false,
      prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
      prefabExists: false,
      metaExists: false,
      verifyResult: null,
      phase: 'CLAIM_FAILED',
      error: error && (error.stack || String(error)),
    });
    try { fs.rmSync(paths.processing, { force: true }); } catch {}
    return;
  }

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
    async buildWorldArtLibrary() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildWorldArtLibrary',
        args: [],
      });
    },
    async buildGoldenCityCell() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildGoldenCityCell',
        args: [],
      });
    },
    async bindGoldenCityCell() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'bindGoldenCityCell',
        args: [],
      });
    },
    async verifyGoldenCityCell() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'verifyGoldenCityCell',
        args: [],
      });
    },
    async isGameSceneReady() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'isGameSceneReady',
        args: [],
      });
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
