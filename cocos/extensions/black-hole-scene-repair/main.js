'use strict';

exports.methods = {
  async attachGameManager() {
    try {
      const result = await Editor.Message.request('scene', 'execute-scene-script', {
        name: 'black-hole-scene-repair',
        method: 'attachGameManager',
        args: [],
      });
      console.log(`[black-hole-scene-repair] ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error(`[black-hole-scene-repair] ${error instanceof Error ? error.stack : String(error)}`);
      throw error;
    }
  },
};
