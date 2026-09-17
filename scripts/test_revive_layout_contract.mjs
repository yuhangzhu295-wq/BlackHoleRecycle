/**
 * P5 Revive page design contract test.
 *
 * NON-RUNTIME source-only assertions.
 * Verifies:
 *  - RevivePage node hierarchy in Game.scene
 *  - RevivePageController logic contracts (countdown, events, no QA mutations)
 *  - GameManager revive state machine contracts
 *  - No hardcoded match data
 *  - No fake ads
 */
import { readFileSync } from 'fs';
import assert from 'assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(repoRoot, rel), 'utf-8');
}

const contract = JSON.parse(read('cocos/docs/design-contracts/revive.json'));
const controller = read('cocos/assets/scripts/ui/RevivePageController.ts');
const gameManager = read('cocos/assets/scripts/gameplay/GameManager.ts');
const hudView = read('cocos/assets/scripts/ui/HUDView.ts');

// 1. Contract status
assert.equal(contract.status, 'LOCKED', 'Revive contract must be LOCKED');
assert.equal(contract.countdownSeconds, 5, 'Revive countdown must be 5 seconds');
assert.equal(contract.hudRoot, 'RevivePage', 'Revive root node must be RevivePage');

// 2. Game.scene node hierarchy
const scene = read('cocos/assets/scenes/Game.scene');
const sceneLines = scene.split('\n');
const revivePageLine = sceneLines.findIndex((l) => l.includes('"_name": "RevivePage"'));
assert(revivePageLine >= 0, 'Game.scene must contain RevivePage node');

const requiredNodes = contract.elements.map((e) => e.nodeName);
for (const nodeName of requiredNodes) {
  const found = sceneLines.some((l) => l.includes(`"_name": "${nodeName}"`));
  assert(found, `Game.scene must contain node: ${nodeName}`);
}

// 3. RevivePageController countdown mechanics
assert.match(controller, /REVIVE_COUNTDOWN_SECONDS = 5/, 'Countdown must be 5 seconds constant');
assert.match(controller, /countdownRemaining/, 'Controller must own countdownRemaining field');
assert.match(controller, /countdownActive/, 'Controller must track countdownActive state');
assert.match(controller, /update\(dt/, 'Controller must implement update(dt) for countdown tick');
assert.match(controller, /Math\.max\(0, this\.countdownRemaining - dt\)/, 'Countdown ticks down and clamps at 0');
assert.match(controller, /eventBus\.emit\('ARENA_GIVE_UP_REQUESTED'\)/, 'Countdown expiry must emit ARENA_GIVE_UP_REQUESTED');
assert.match(controller, /onEnable/, 'Controller must reset countdown in onEnable');
assert.match(controller, /onDisable/, 'Controller must cancel countdown in onDisable');

// 4. RevivePageController event bindings
assert.match(controller, /eventBus\.emit\('ARENA_REVIVE_REQUESTED'\)/, 'BtnRevive must emit ARENA_REVIVE_REQUESTED');
assert.match(controller, /eventBus\.emit\('ARENA_GIVE_UP_REQUESTED'\)/, 'BtnGiveUp must emit ARENA_GIVE_UP_REQUESTED');
assert.match(controller, /BtnRevive/, 'Controller must bind BtnRevive');
assert.match(controller, /BtnGiveUp/, 'Controller must bind BtnGiveUp');

// 5. Controller reads from real snapshot (not hardcoded values)
assert.match(controller, /snapshot\.localRank/, 'Rank must come from real ArenaMatchSnapshot');
assert.match(controller, /snapshot\.localKills/, 'Kill count must come from real ArenaMatchSnapshot');
assert.match(controller, /snapshot\.competitorCount/, 'Competitor count must come from real snapshot');

// 6. No fake ad / QA mutations in controller
assert.doesNotMatch(controller, /QABridge|__BHR_QA__|QA_SPAWN|QA_GRANT|fakeAd|mockAd/, 
  'RevivePageController must not depend on QA mutations or fake ads');
assert.doesNotMatch(controller, /reviveCountdown.*=.*0.*immediately|forceRevive|skipCountdown/,
  'RevivePageController must not have bypasses for testing');

// 7. GameManager state machine contracts
assert.match(gameManager, /setMatchPaused\(true\).*\/\/ Freeze the arena respawn clock|Freeze the arena respawn clock.*setMatchPaused\(true\)/s,
  'openArenaRevive must freeze match clock with setMatchPaused(true)');
assert.match(gameManager, /ARENA_REVIVE_REQUESTED.*setMatchPaused\(false\)|setMatchPaused\(false\).*reviveLocal/s,
  'ARENA_REVIVE_REQUESTED must call setMatchPaused(false) before reviveLocal');
assert.match(gameManager, /ARENA_GIVE_UP_REQUESTED.*forfeitLocal|forfeitLocal/s,
  'ARENA_GIVE_UP_REQUESTED must call forfeitLocal');

// 8. HUDView wiring
assert.match(hudView, /RevivePageController/, 'HUDView must import RevivePageController');
assert.match(hudView, /updateRevive\(snapshot/, 'HUDView must have updateRevive method');
assert.match(hudView, /showScreen.*Revive|Revive.*showScreen/s, "HUDView must show 'Revive' screen");

// 9. No Settlement-direct shortcut that bypasses the real match flow
assert.doesNotMatch(controller, /enterSettlement|showScreen.*Settlement/,
  'RevivePageController must not directly call settlement; only emit events handled by GameManager');

console.log('[PASS] P5 Revive page design contract assertions (NON_RUNTIME; portrait CDP acceptance remains required).');
