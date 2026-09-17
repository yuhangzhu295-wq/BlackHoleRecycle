import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(path.join(root, 'cocos/docs/design-contracts/mode-select.json'), 'utf8'));
const controller = readFileSync(path.join(root, 'cocos/assets/scripts/ui/ModeSelectPageController.ts'), 'utf8');
const manager = readFileSync(path.join(root, 'cocos/assets/scripts/gameplay/GameManager.ts'), 'utf8');
const entries = new Map();
for (const match of controller.matchAll(/^\s*(\w+):\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\],$/gm)) {
  entries.set(match[1], match.slice(2).map(Number));
}

assert.deepEqual(contract.designSpace, { width: 720, height: 1280, origin: 'top-left' });
assert.equal(contract.status, 'IMPLEMENTED_PENDING_RUNTIME');
assert.equal(contract.reference, '../design-reference/ui-v3/mode-select-reference.png');
assert.deepEqual(contract.modeCards.map((card) => card.modeId), ['arena', 'endless']);
assert.deepEqual(contract.modeCards.map((card) => card.nodeName), ['BtnArena', 'BtnEndless']);
assert.deepEqual(contract.modeCards.map((card) => card.displayName), ['竞技乱斗', '无尽探索']);

for (const element of contract.elements) {
  const actual = entries.get(element.nodeName);
  assert(actual, 'Missing MODE_SELECT_LAYOUT entry for ' + element.nodeName);
  const { x, y, width, height } = element.referenceBounds;
  assert.deepEqual(actual, [width, height, x + width / 2 - 360, 640 - (y + height / 2)], 'MODE_SELECT_LAYOUT drift for ' + element.id);
}

assert.equal(entries.get('BtnArena')?.[1], 278, 'Arena card must retain its artwork aspect height.');
assert.equal(entries.get('BtnEndless')?.[1], 278, 'Endless card must retain its artwork aspect height.');
assert.match(controller, /eventBus\.emit\('MODE_ARENA_REQUESTED'\)/);
assert.match(controller, /eventBus\.emit\('MODE_ENDLESS_REQUESTED'\)/);
assert.match(controller, /eventBus\.emit\('MODE_BACK_REQUESTED'\)/);
assert.match(manager, /MODE_ARENA_REQUESTED'[\s\S]*?this\.startArenaGame\(\)/);
assert.match(manager, /MODE_ENDLESS_REQUESTED'[\s\S]*?this\.startEndlessGame\(\)/);

for (const forbidden of ['locked', 'coming soon', 'video unlock', 'VIP', 'fake room', '黑洞乱斗', '限时冲榜', 'black-hole-battle', 'time-limited-leaderboard']) {
  assert(contract.forbiddenElements.includes(forbidden), 'Missing forbidden product entry: ' + forbidden);
}
console.log('[PASS] Mode Select layout and real route contract assertions (NON_RUNTIME; runtime acceptance remains required).');
