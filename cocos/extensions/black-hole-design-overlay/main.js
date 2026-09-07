'use strict';

const packageInfo = require('./package.json');

module.exports = {
  load() {},
  unload() {},
  methods: {
    openPanel() {
      Editor.Panel.open(packageInfo.name);
    },
  },
};
