import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(path.join(root, 'cocos/docs/design-contracts/home.json'), 'utf8'));
const source = readFileSync(path.join(root, 'cocos/assets/scripts/ui/HomePageVisual.ts'), 'utf8');
const entries = new Map();
for (const match of source.matchAll(/^  (\w+): \[(-?\d+), (-?\d+), (-?\d+), (-?\d+)\],$/gm)) {
  entries.set(match[1], match.slice(2).map(Number));
}

assert.deepEqual(contract.designSpace, { width: 720, height: 1280, origin: 'top-left' });
for (const element of contract.elements) {
  const actual = entries.get(element.nodeName);
  assert(actual, 'Missing HOME_LAYOUT entry for ' + element.nodeName);
  const { x, y, width, height } = element.referenceBounds;
  const expected = [width, height, x + width / 2 - 360, 640 - (y + height / 2)];
  assert.deepEqual(actual, expected, 'HOME_LAYOUT drift for ' + element.id);
}
assert.equal(entries.size >= contract.elements.length, true, 'HOME_LAYOUT must retain supporting runtime entries');
console.log('[PASS] ' + contract.elements.length + ' Home layout contract assertions (NON_RUNTIME; runtime acceptance remains required).');
