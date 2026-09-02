'use strict';

module.exports = {
  methods: {
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
