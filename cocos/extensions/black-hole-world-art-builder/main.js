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
  },
};
