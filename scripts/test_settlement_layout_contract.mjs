/**
 * P6 Settlement page design contract test.
 *
 * NON-RUNTIME source-only assertions.
 * Verifies:
 *  - Settlement contract status is LOCKED, v3, referencing UI V3 settlement-reference.png
 *  - SettlementPage node hierarchy in Game.scene (root, direct children, UITransform/Sprite/Label/Button)
 *  - SettlementPageController logic contracts (real snapshot/reward binding, endless vs arena modes, event emission)
 *  - Event bindings: BtnRestart -> GAME_RESTART_CURRENT, BtnHome -> GAME_RETURN_HOME
 *  - GameManager settlement wiring & state machine contracts
 *  - ArenaMatchManager / SaveService settlement reward idempotency contracts
 *  - QABridge read-only settlement model contracts
 *  - No hardcoded match data, no fake ad / QA mutations in production controller
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

const contract = JSON.parse(read('cocos/docs/design-contracts/settlement.json'));
const controller = read('cocos/assets/scripts/ui/SettlementPageController.ts');
const gameManager = read('cocos/assets/scripts/gameplay/GameManager.ts');
const hudView = read('cocos/assets/scripts/ui/HUDView.ts');
const arenaMatchManager = read('cocos/assets/scripts/gameplay/ArenaMatchManager.ts');
const saveService = read('cocos/assets/scripts/data/SaveService.ts');
const qaBridge = read('cocos/assets/scripts/dev/qa/QABridge.ts');
const scene = JSON.parse(read('cocos/assets/scenes/Game.scene'));

// 1. Contract metadata
assert.equal(contract.version, 3, 'Settlement contract version must be 3');
assert.equal(contract.status, 'LOCKED', 'Settlement contract must be LOCKED');
assert.equal(contract.reference, '../design-reference/ui-v3/settlement-reference.png', 'Settlement contract must reference ui-v3/settlement-reference.png');
assert.equal(contract.hudRoot, 'SettlementPage', 'Settlement hudRoot must be SettlementPage');
assert.equal(contract.sceneRoot, 'Canvas', 'Settlement sceneRoot must be Canvas');
assert.deepEqual(contract.designSpace, { width: 720, height: 1280, origin: 'top-left' }, 'Settlement designSpace must be 720x1280 top-left');

// 2. Game.scene node hierarchy
const refId = (value) => value && typeof value === 'object' && Number.isInteger(value.__id__) ? value.__id__ : null;
const nodeById = new Map(scene.map((entry, id) => [id, entry]).filter(([, entry]) => entry?.__type__ === 'cc.Node'));
const componentTypes = (node) => (node._components || []).map(refId).filter((id) => id !== null).map((id) => scene[id]?.__type__ || '');
const childNodes = (node) => (node._children || []).map(refId).filter((id) => id !== null).map((id) => nodeById.get(id)).filter(Boolean);
const uiTransform = (node) => {
  const id = (node._components || []).map(refId).find((candidate) => scene[candidate]?.__type__ === 'cc.UITransform');
  return id === undefined ? null : scene[id];
};

const settlementNodes = [...nodeById.values()].filter((node) => node._name === 'SettlementPage');
assert.equal(settlementNodes.length, 1, 'Game.scene must contain exactly one SettlementPage node');
const settlementNode = settlementNodes[0];
assert.equal(nodeById.get(refId(settlementNode._parent))?._name, 'Canvas', 'SettlementPage must be a direct child of Canvas');
assert.deepEqual(uiTransform(settlementNode)?._contentSize, { __type__: 'cc.Size', width: 720, height: 1280 }, 'SettlementPage must be 720x1280');

const settlementChildren = childNodes(settlementNode);
const settlementChildNames = new Set(settlementChildren.map((c) => c._name));

// Check critical children exist in Game.scene
const essentialNodes = [
  'DimOverlay',
  'SettlementCard',
  'SettlementRibbon',
  'Title',
  'Subtitle',
  'ArenaLeaderboardPanel',
  'ArenaResult',
  'ArenaPlayerRow',
  'ArenaPlayerBadge',
  'ArenaPlayerName',
  'ArenaPlayerScore',
  'ArenaStatMassPanel',
  'ArenaStatMassValue',
  'ArenaStatKillsPanel',
  'ArenaStatKillsValue',
  'ArenaStatTimePanel',
  'ArenaStatTimeValue',
  'ArenaRewardPanel',
  'ArenaRewardValue',
  'ArenaRewardBreakdown',
  'BtnRestart',
  'BtnHome',
];

for (const name of essentialNodes) {
  assert(settlementChildNames.has(name), 'SettlementPage in Game.scene must contain child node: ' + name);
}

// Check Button and Transform on action buttons
for (const btnName of ['BtnRestart', 'BtnHome']) {
  const btnNode = settlementChildren.find((c) => c._name === btnName);
  assert(btnNode, 'Action button ' + btnName + ' must exist');
  const comps = componentTypes(btnNode);
  assert(comps.includes('cc.UITransform'), btnName + ' must have cc.UITransform');
  assert(comps.includes('cc.Button'), btnName + ' must have cc.Button');
}

// 3. SettlementPageController event bindings
assert.match(controller, /this\.bind\('BtnRestart',\s*\(\)\s*=>\s*eventBus\.emit\('GAME_RESTART_CURRENT'\)\)/,
  'BtnRestart must emit GAME_RESTART_CURRENT');
assert.match(controller, /this\.bind\('BtnHome',\s*\(\)\s*=>\s*eventBus\.emit\('GAME_RETURN_HOME'\)\)/,
  'BtnHome must emit GAME_RETURN_HOME');
assert.match(controller, /onEnable\(\)/, 'Controller must bind handlers in onEnable');
assert.match(controller, /onDisable\(\)/, 'Controller must clean up handlers in onDisable');

// 4. SettlementPageController data binding contracts
assert.match(controller, /updateStats\(/, 'Controller must support Endless updateStats');
assert.match(controller, /updateArenaStats\(snapshot:\s*ArenaMatchSnapshot,\s*reward:\s*ArenaSettlementReward\)/,
  'Controller must bind real Arena snapshot and reward');

// Snapshot live metrics
assert.match(controller, /snapshot\.localRank/, 'Controller must read snapshot.localRank');
assert.match(controller, /snapshot\.localMass/, 'Controller must read snapshot.localMass');
assert.match(controller, /snapshot\.localKills/, 'Controller must read snapshot.localKills');
assert.match(controller, /snapshot\.elapsedSeconds/, 'Controller must read snapshot.elapsedSeconds');
assert.match(controller, /snapshot\.competitorCount/, 'Controller must read snapshot.competitorCount');
assert.match(controller, /snapshot\.leaderboard/, 'Controller must bind real leaderboard');

// Reward breakdown metrics
assert.match(controller, /reward\.coins/, 'Controller must display total reward coins');
assert.match(controller, /reward\.massCoins/, 'Controller must display reward.massCoins breakdown');
assert.match(controller, /reward\.collectedCoins/, 'Controller must display reward.collectedCoins breakdown');
assert.match(controller, /reward\.eliminationCoins/, 'Controller must display reward.eliminationCoins breakdown');
assert.match(controller, /reward\.survivalCoins/, 'Controller must display reward.survivalCoins breakdown');
assert.match(controller, /reward\.placementCoins/, 'Controller must display reward.placementCoins breakdown');

// Time duration formatting
assert.match(controller, /formatDuration\(seconds:\s*number\)/, 'Controller must implement duration formatting');

// Mode toggle: hides Endless rows during Arena and vice versa
assert.match(controller, /setArenaLeaderboardVisible\(visible:\s*boolean\)/,
  'Controller must toggle leaderboard and stat panels by mode');

// 5. No fake ad / QA mutations in production controller
assert.doesNotMatch(controller, /QABridge|__BHR_QA__|QA_SPAWN|QA_GRANT|fakeAd|mockAd/,
  'SettlementPageController must not depend on QA mutations or fake ads');
assert.doesNotMatch(controller, /Math\.random\(\)/,
  'SettlementPageController must not invent random stats or mock values');

// 6. GameManager state machine & routing contracts
assert.match(gameManager, /GAME_RESTART_CURRENT/, 'GameManager must listen for GAME_RESTART_CURRENT');
assert.match(gameManager, /GAME_RETURN_HOME/, 'GameManager must listen for GAME_RETURN_HOME');
assert.match(gameManager, /showArenaSettlement\(snapshot:\s*ArenaMatchSnapshot\)/,
  'GameManager must have showArenaSettlement method');
assert.match(gameManager, /showNetworkArenaSettlement\(snapshot:\s*ArenaMatchSnapshot\)/,
  'GameManager must have showNetworkArenaSettlement method');
assert.match(gameManager, /claimArenaSettlement/,
  'GameManager must persist settlement rewards via SaveService.claimArenaSettlement');
assert.match(gameManager, /hud\?\.updateArenaSettlement\(snapshot,\s*reward\)/,
  'GameManager must pass real snapshot and reward to HUDView');
assert.match(gameManager, /hud\?\.showScreen\('Settlement'\)/,
  'GameManager must route to HUDView showScreen Settlement');

// 7. HUDView formal screen & routing
assert.match(hudView, /updateArenaSettlement\(snapshot:\s*ArenaMatchSnapshot,\s*reward:\s*ArenaSettlementReward\)/,
  'HUDView must have updateArenaSettlement');
assert.match(hudView, /updateSettlement\(/, 'HUDView must have updateSettlement for endless mode');
assert.match(hudView, /settlement\.active\s*=\s*name\s*===\s*'Settlement'/, 'HUDView must activate SettlementPage for Settlement screen');

// 8. ArenaMatchManager single-claim idempotency contract
assert.match(arenaMatchManager, /claimSettlementReward\(\):\s*ArenaSettlementReward\s*\|\s*null/,
  'ArenaMatchManager must guard reward claim');
assert.match(arenaMatchManager, /settlementRewardClaimed/,
  'ArenaMatchManager must track settlementRewardClaimed state');
assert.match(arenaMatchManager, /getMatchId\(\):\s*string/,
  'ArenaMatchManager must provide stable matchId');

// 9. SaveService idempotency contract
assert.match(saveService, /claimArenaSettlement\(matchId:\s*string,\s*amount:\s*number\):\s*boolean/,
  'SaveService must enforce matchId-based idempotency');
assert.match(saveService, /claimedArenaSettlementIds/,
  'SaveService must store claimed matchIds');

// 10. QABridge read-only settlement model contracts
assert.match(qaBridge, /settlement:\s*this\.getSettlementSnapshot\(\)/,
  'QABridge must expose read-only settlement snapshot');
assert.match(qaBridge, /settlementData:\s*\{/,
  'QABridge must expose ui.formalPages.settlementData');
assert.match(gameManager, /claimedArenaSettlementIds:\s*\[\.\.\.saveService\.data\.claimedArenaSettlementIds\]/,
  'GameManager save snapshot must include claimedArenaSettlementIds');
assert.match(qaBridge, /claimedArenaSettlementIds/,
  'QABridge getSettlementSnapshot must check claimedArenaSettlementIds');
assert.doesNotMatch(qaBridge, /claimSettlement|forceClaim|grantSettlement/,
  'QABridge must remain read-only and never mutate settlement');

console.log('[PASS] P6 Settlement design contract and data-binding assertions passed.');
