'use strict';

/**
 * Explicit CLI route for Creator to save the five machine visual prefabs.
 * Ordinary builds never alter a scene: the hook is enabled only by the
 * `BHR_MACHINE_VISUAL_AUTOBUILD=1` environment variable used by this repair.
 */
exports.onBeforeBuild = async function onBeforeBuild() {
  const requested = process.env.BHR_MACHINE_VISUAL_AUTOBUILD === '1';
  const arenaRequested = process.env.BHR_ARENA_AUTOBUILD === '1';
  console.info(`[black-hole-home-builder] machine visual install requested=${requested}`);
  console.info(`[black-hole-home-builder] arena install requested=${arenaRequested}`);
  if (!requested && !arenaRequested) return;

  if (requested) {
    const result = await Editor.Message.request('scene', 'execute-scene-script', {
      name: 'black-hole-home-builder',
      method: 'buildMachineVisuals',
      args: [],
    });
    if (!result || result.status !== 'PASS') {
      throw new Error(`[black-hole-home-builder] Creator machine visual save failed: ${JSON.stringify(result)}`);
    }
    console.info(`[black-hole-home-builder] Creator saved machine visuals: ${JSON.stringify(result.prefabUrls)}`);
  }
  if (arenaRequested) {
    const mode = await Editor.Message.request('scene', 'execute-scene-script', {
      name: 'black-hole-home-builder', method: 'buildModeSelect', args: [],
    });
    const pages = await Editor.Message.request('scene', 'execute-scene-script', {
      name: 'black-hole-home-builder', method: 'buildRuntimePages', args: [],
    });
    const arena = await Editor.Message.request('scene', 'execute-scene-script', {
      name: 'black-hole-home-builder', method: 'installArenaMatch', args: [],
    });
    if (!mode?.rootUuid || !pages?.savedPages?.includes('ArenaHUD') || !arena?.saved) {
      throw new Error(`[black-hole-home-builder] Creator arena save failed: ${JSON.stringify({ mode, pages, arena })}`);
    }
    console.info(`[black-hole-home-builder] Creator saved arena UI and match manager: ${JSON.stringify(arena)}`);
  }
};
