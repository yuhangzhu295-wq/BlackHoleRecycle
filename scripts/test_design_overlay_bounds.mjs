import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { canvasBounds, compareBounds, matchElement } = require('../cocos/extensions/black-hole-design-overlay/bounds.cjs');
const space = { width: 720, height: 1280 };
const rect = (l, b, r, t) => [{ x: l, y: b }, { x: r, y: b }, { x: r, y: t }, { x: l, y: t }];
assert.deepEqual(canvasBounds(rect(-360, -640, 360, 640), space, { x: .5, y: .5 }, space),
  { x: 0, y: 0, width: 720, height: 1280 });
assert.deepEqual(canvasBounds(rect(0, 0, 360, 640), { width: 360, height: 640 }, { x: 0, y: 0 }, space),
  { x: 0, y: 0, width: 720, height: 1280 });
// Corners supplied after a parent translation/scale; never use local child position.
assert.deepEqual(canvasBounds(rect(-180, 160, 0, 320), { width: 360, height: 640 }, { x: .5, y: .5 }, space),
  { x: 0, y: 0, width: 360, height: 320 });
assert.equal(canvasBounds(rect(0, 0, 1, 1), { width: 0, height: 0 }, { x: .5, y: .5 }, space), null);
const reference = { x: 0, y: 0, width: 4, height: 4 };
assert.equal(compareBounds(reference, null).pass, false);
assert.equal(compareBounds(reference, null).actualBounds, null);
assert.equal(compareBounds(reference, reference).pass, true);
assert.equal(compareBounds(reference, { ...reference, x: 1 }, { x: 0 }).pass, false);
const nodes = [{ name: 'BtnBack', path: 'Game/Canvas/Home/BtnBack' }, { name: 'BtnBack', path: 'Game/Canvas/Mode/BtnBack' }];
assert.equal(matchElement(nodes, { nodeName: 'BtnBack' }).status, 'AMBIGUOUS_ELEMENT');
assert.equal(matchElement(nodes, { nodeName: 'missing' }).status, 'MISSING_ELEMENT');
assert.equal(matchElement(nodes, { nodeName: 'BtnBack' }, 'Game/Canvas/Mode').node, nodes[1]);
assert.equal(matchElement(nodes, { nodePath: nodes[0].path }).node, nodes[0]);
console.log('[PASS] 12 design-overlay numeric/matching assertions (NON_RUNTIME; native corner transforms require Creator verification).');
