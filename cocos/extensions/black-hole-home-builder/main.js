'use strict';

module.exports = {
  // Scene-changing operations remain explicit extension menu actions.
  // Opening Creator must never mutate Game.scene.
  load() {},
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
