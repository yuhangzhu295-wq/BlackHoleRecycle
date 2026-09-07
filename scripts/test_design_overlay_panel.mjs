// Isolated Chromium DOM regression for the Editor panel, NOT Cocos runtime evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'cocos/extensions/black-hole-design-overlay/panels/default/index.js');
const context = { require: createRequire(entry), __dirname: path.dirname(entry), module: { exports: {} },
  Editor: { Panel: { define: (definition) => definition } } };
vm.runInNewContext(fs.readFileSync(entry, 'utf8'), context, { filename: entry });
const panel = context.module.exports;
const methods = Object.fromEntries(Object.entries(panel.methods).map(([name, fn]) => [name, fn.toString()]));
const refs = { home: 'v2-01-home.png', 'mode-select': 'v2-02-mode-select.png',
  arena_hud: 'v2-03-arena-hud.png', revive: 'v2-04-revive.png', settlement: 'v2-05-settlement.png' };
const images = Object.fromEntries(Object.values(refs).map((file) => [file,
  fs.readFileSync(path.join(root, 'cocos/docs/design-reference', file)).toString('base64')]));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<style>${panel.style}</style>${panel.template}`);
  await page.evaluate(({ selectors, methods, refs, images }) => {
    // Only the panel host/fs bridge is isolated. There is no cc stub or gameplay.
    const REFERENCES = refs;
    const __dirname = '/panel';
    const path = { resolve: (...parts) => parts.at(-1) };
    const fs = { readFileSync: (file) => ({ toString: () => {
      if (!images[file]) throw new Error('unknown reference');
      return images[file];
    } }) };
    const Editor = { Message: { request: async () => { throw new Error('NO_CREATOR_HOST_IN_DOM_TEST'); } } };
    const instance = { $: Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)])) };
    for (const [name, source] of Object.entries(methods)) {
      instance[name] = eval(`({${source}})`)[name].bind(instance);
    }
    window.panelTest = instance;
    instance.loadReference();
  }, { selectors: panel.$, methods, refs, images });
  await page.waitForFunction(() => document.querySelector('#reference').naturalWidth > 0);
  assert.equal(await page.locator('#reference').evaluate((el) => el.hidden), false);
  assert.equal(await page.locator('#reference').evaluate((el) => el.style.opacity), '0.5');
  await page.evaluate(() => { window.panelTest.$.opacity.value = '75'; window.panelTest.updateOpacity(); });
  assert.equal(await page.locator('#reference').evaluate((el) => el.style.opacity), '0.75');
  await page.evaluate(() => { window.panelTest.$.toggle.checked = false; window.panelTest.updateOpacity(); });
  assert.equal(await page.locator('#reference').evaluate((el) => el.hidden), true);
  await page.evaluate(() => {
    const p = window.panelTest;
    p.$.actual.src = p.$.reference.src;
    p.$.actual.hidden = false;
    p.$.page.value = 'home';
    p.$.toggle.checked = true;
    p.loadReference();
  });
  assert.equal(await page.locator('#actual').evaluate((el) => el.hidden && !el.getAttribute('src')), true);
  assert.equal(await page.locator('#reference').getAttribute('src'), `data:image/png;base64,${images[refs.home]}`);
  await page.evaluate(async () => { window.panelTest._lastReport = { stale: true }; await window.panelTest.inspect(); });
  assert.equal(await page.evaluate(() => window.panelTest._lastReport), null);
  assert.match(await page.locator('#result').textContent(), /NO_CREATOR_HOST_IN_DOM_TEST/);
  console.log('[PASS] 8 panel DOM assertions: reference decode, opacity, toggle, page isolation, stale-report rejection (NOT_CREATOR_RUNTIME).');
} finally {
  await browser.close();
}
