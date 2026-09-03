'use strict';

/**
 * Explicit CLI route for Creator to save the five machine visual prefabs.
 * Ordinary builds never alter a scene: the hook is enabled only by the
 * `BHR_MACHINE_VISUAL_AUTOBUILD=1` environment variable used by this repair.
 */
exports.onBeforeBuild = async function onBeforeBuild() {
  const requested = process.env.BHR_MACHINE_VISUAL_AUTOBUILD === '1';
  console.info(`[black-hole-home-builder] machine visual install requested=${requested}`);
  if (!requested) return;

  const result = await Editor.Message.request('scene', 'execute-scene-script', {
    name: 'black-hole-home-builder',
    method: 'buildMachineVisuals',
    args: [],
  });
  if (!result || result.status !== 'PASS') {
    throw new Error(`[black-hole-home-builder] Creator machine visual save failed: ${JSON.stringify(result)}`);
  }
  console.info(`[black-hole-home-builder] Creator saved machine visuals: ${JSON.stringify(result.prefabUrls)}`);
};
