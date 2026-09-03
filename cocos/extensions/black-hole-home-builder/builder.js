'use strict';

/**
 * Cocos Creator loads a builder contribution as a platform configuration
 * module. The lifecycle callbacks themselves must live in the `hooks` module;
 * exporting callbacks directly here makes Creator silently skip them.
 */
exports.configs = {
  '*': {
    hooks: './builder-hooks.js',
  },
};
