'use strict';

/**
 * Builder hooks run before Creator has opened the active scene.  They must
 * therefore remain read-only: a scene-script call here returns null and can
 * make a superficially successful export contain a real extension error.
 *
 * Explicit authoring is performed by main.js after the editor has loaded
 * Game.scene, where scene.js changes nodes and invokes Creator's save-scene.
 */
exports.onBeforeBuild = async function onBeforeBuild() {
  const requested = process.env.BHR_MACHINE_VISUAL_AUTOBUILD === '1';
  const arenaRequested = process.env.BHR_ARENA_AUTOBUILD === '1';
  const runtimePagesRequested = process.env.BHR_RUNTIME_PAGES_AUTOBUILD === '1';
  if (requested || arenaRequested || runtimePagesRequested) {
    console.info('[black-hole-home-builder] Scene authoring request deferred to the loaded-editor route; builder hook is read-only.');
  }
};
