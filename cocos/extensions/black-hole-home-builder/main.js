'use strict';

module.exports = {
  methods: {
    async buildHome() {
      try {
        const result = await Editor.Message.request('scene', 'execute-scene-script', {
          name: 'black-hole-home-builder',
          method: 'buildHome',
          args: [],
        });
        return result;
      } catch (error) {
        // Extension hosts do not expose the legacy Editor.error helper in 3.8.
        // Rethrow the original diagnostic so Creator's console reports the real
        // scene-script failure rather than masking it with a second error.
        const details = error && error.stack ? error.stack : String(error);
        throw new Error(`[black-hole-home-builder] ${details}`);
      }
    },
  },
};
