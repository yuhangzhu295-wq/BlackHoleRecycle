'use strict';

module.exports = {
  methods: {
    async buildWorldArtLibrary() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildWorldArtLibrary',
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
    async buildGoldenCityCell() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildGoldenCityCell',
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
    async buildCollectibleBase() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'buildCollectibleBase',
        args: [],
      });
    },
    async verifyCollectibleBase() {
      return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-world-art-builder',
        method: 'verifyCollectibleBase',
        args: [],
      });
    },
  },
};
