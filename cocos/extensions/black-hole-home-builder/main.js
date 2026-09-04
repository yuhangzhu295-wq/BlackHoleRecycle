'use strict';

async function installArenaFromExplicitEnvironment() {
  if (process.env.BHR_ARENA_AUTOBUILD !== '1') return;
  // This branch is intentionally opt-in. A normal Creator launch remains
  // read-only; the repair command below asks Creator itself to save the three
  // scoped arena changes after its scene and script registry are ready.
  const run = (method) => Editor.Message.request('scene', 'execute-scene-script', {
    name: 'black-hole-home-builder', method, args: [],
  });
  let ready = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ready = await run('isArenaSceneReady');
    if (ready?.ready) break;
  }
  if (!ready?.ready) {
    throw new Error(`[black-hole-home-builder] Game.scene was not ready for arena save: ${JSON.stringify(ready)}`);
  }
  const mode = await run('buildModeSelect');
  const pages = await run('buildRuntimePages');
  const arena = await run('installArenaMatch');
  if (!mode?.rootUuid || !pages?.savedPages?.includes('ArenaHUD') || !arena?.saved) {
    throw new Error(`[black-hole-home-builder] Explicit arena scene save failed: ${JSON.stringify({ mode, pages, arena })}`);
  }
  console.info(`[black-hole-home-builder] Explicit arena scene save completed: ${JSON.stringify(arena)}`);
}

async function installObjectArtFromExplicitEnvironment() {
  if (process.env.BHR_OBJECT_ART_AUTOBUILD !== '1') return;
  const run = (method) => Editor.Message.request('scene', 'execute-scene-script', {
    name: 'black-hole-home-builder', method, args: [],
  });
  let ready = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ready = await run('isArenaSceneReady');
    if (ready?.ready) break;
  }
  if (!ready?.ready) throw new Error(`[black-hole-home-builder] Object-art scene was not ready: ${JSON.stringify(ready)}`);
  const install = await run('installObjectArtRegistry');
  const verification = await run('verifyObjectArtRegistry');
  if (!install?.saved || !verification?.ok) {
    throw new Error(`[black-hole-home-builder] Object-art install failed: ${JSON.stringify({ install, verification })}`);
  }
  console.info(`[black-hole-home-builder] Explicit object-art install completed: ${JSON.stringify(verification)}`);
}

module.exports = {
  // Scene-changing operations remain explicit extension menu actions.
  // Opening Creator must never mutate Game.scene.
  load() {
    installArenaFromExplicitEnvironment().catch((error) => {
      console.error('[black-hole-home-builder] Explicit arena scene save failed:', error);
    });
    installObjectArtFromExplicitEnvironment().catch((error) => {
      console.error('[black-hole-home-builder] Explicit object-art install failed:', error);
    });
  },
  methods: {
    async buildMachineVisuals() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'buildMachineVisuals',
        args: [],
      });
    },
    async verifyMachineVisuals() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyMachineVisuals',
        args: [],
      });
    },
    async cleanupMachineVisualResidue() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'cleanupMachineVisualResidue',
        args: [],
      });
    },
    async installMachineChassisTemplate() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'installMachineChassisTemplate',
        args: [],
      });
    },
    async verifyMachineChassisTemplate() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyMachineChassisTemplate',
        args: [],
      });
    },
    async installObjectArtRegistry() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'installObjectArtRegistry',
        args: [],
      });
    },
    async verifyObjectArtRegistry() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyObjectArtRegistry',
        args: [],
      });
    },
    async normalizeWorldArtUnits() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'normalizeWorldArtUnits',
        args: [],
      });
    },
    async installInfiniteWorld() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'installInfiniteWorld',
        args: [],
      });
    },
    async verifyInfiniteWorld() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyInfiniteWorld',
        args: [],
      });
    },
    async addJoystickOverlay() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'addJoystickOverlay',
        args: [],
      });
    },
    async prepareHomeSprites() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'prepareHomeSprites',
        args: [],
      });
    },
    async buildHome() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'buildHome',
        args: [],
      });
    },
    async verifyHome() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyHome',
        args: [],
      });
    },
    async prepareModeSprites() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'prepareModeSprites',
        args: [],
      });
    },
    async buildModeSelect() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'buildModeSelect',
        args: [],
      });
    },
    async verifyModeSelect() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyModeSelect',
        args: [],
      });
    },
    async installArenaMatch() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'installArenaMatch',
        args: [],
      });
    },
    async verifyArenaMatch() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyArenaMatch',
        args: [],
      });
    },
    async buildRuntimePages() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'buildRuntimePages',
        args: [],
      });
    },
    async verifyRuntimePages() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'verifyRuntimePages',
        args: [],
      });
    },
  },
};
