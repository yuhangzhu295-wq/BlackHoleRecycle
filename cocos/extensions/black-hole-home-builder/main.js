'use strict';

module.exports = {
  methods: {
    async prepareHomeSprites() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-home-builder',
        method: 'prepareHomeSprites',
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
