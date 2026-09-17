import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const contract = JSON.parse(read('cocos/docs/design-contracts/arena-hud.json'));
const scene = JSON.parse(read('cocos/assets/scenes/Game.scene'));
const controller = read('cocos/assets/scripts/ui/ArenaHUDController.ts');
const hudView = read('cocos/assets/scripts/ui/HUDView.ts');
const manager = read('cocos/assets/scripts/gameplay/GameManager.ts');
const matchManager = read('cocos/assets/scripts/gameplay/ArenaMatchManager.ts');
const joystickVisual = read('cocos/assets/scripts/ui/JoystickVisual.ts');
const pickupFeedback = read('cocos/assets/scripts/ui/PickupFeedbackPresenter.ts');

const refId = (value) => value && typeof value === 'object' && Number.isInteger(value.__id__) ? value.__id__ : null;
const nodeById = new Map(scene.map((entry, id) => [id, entry]).filter(([, entry]) => entry?.__type__ === 'cc.Node'));
const componentTypes = (node) => (node._components || []).map(refId).filter((id) => id !== null).map((id) => scene[id]?.__type__ || '');
const childNodes = (node) => (node._children || []).map(refId).filter((id) => id !== null).map((id) => nodeById.get(id)).filter(Boolean);
const directChild = (node, name) => childNodes(node).find((child) => child._name === name) || null;
const uiTransform = (node) => {
  const id = (node._components || []).map(refId).find((candidate) => scene[candidate]?.__type__ === 'cc.UITransform');
  return id === undefined ? null : scene[id];
};

assert.deepEqual(contract.canvas, { width: 720, height: 1280, aspectRatio: '9:16' });
const arenaNodes = [...nodeById.values()].filter((node) => node._name === contract.hudRoot);
assert.equal(arenaNodes.length, 1, 'Game.scene must contain exactly one ArenaHUD');
const arena = arenaNodes[0];
assert.equal(nodeById.get(refId(arena._parent))?._name, contract.sceneRoot, 'ArenaHUD must be a direct Canvas child');
assert.deepEqual(uiTransform(arena)?._contentSize, { __type__: 'cc.Size', width: 720, height: 1280 });
for (const element of contract.directElements) {
  const node = directChild(arena, element.name);
  assert(node, 'Missing Canvas/ArenaHUD/' + element.name);
  assert.deepEqual(node._lpos, { __type__: 'cc.Vec3', ...element.lpos }, element.name + ' position drift');
  assert.deepEqual(uiTransform(node)?._contentSize, { __type__: 'cc.Size', ...element.size }, element.name + ' size drift');
  const types = componentTypes(node);
  for (const expectedType of element.expectedComponents.filter((type) => type.startsWith('cc.'))) assert(types.includes(expectedType), element.name + ' missing ' + expectedType);
  if (element.name === 'Joystick') assert(types.some((type) => !type.startsWith('cc.')), 'Joystick must retain serialized JoystickVisual');
  assert.deepEqual(childNodes(node).map((child) => child._name), element.children || [], element.name + ' child hierarchy drift');
  if (element.runtimeActive === false) assert.equal(node._active, false, element.name + ' must be authored inactive');
}
assert.deepEqual(childNodes(arena).map((child) => child._name), contract.directElements.map((element) => element.name), 'ArenaHUD direct child order/content drift');

assert.match(controller, /this\.setLabel\('TimerValue', formatClock\(snapshot\.remainingSeconds\)\)/);
assert.match(controller, /this\.setLabel\('KillValue', `\$\{snapshot\.localKills\}`\)/);
assert.match(controller, /snapshot\.leaderboard\.slice\(0, 5\)/);
assert.match(controller, /entry\.isLocal \? '你' : entry\.name/);
assert.match(controller, /competitor\.isLocal \? new Color\(104, 238, 104, 255\)/);
assert.match(controller, /private getGameplayCamera\(\): Camera \| null[\s\S]*?getChildByName\('Main Camera'\)/);
assert.doesNotMatch(controller, /getComponentInChildren\(Camera\)/, 'Arena world projection must not depend on scene traversal order');
assert.match(controller, /updateOffscreenBotArrows\(snapshot\)/);
assert.match(controller, /this\.node\.getChildByName\(`BotArrow\$\{side\}`\)/);
assert.match(controller, /new PickupFeedbackPresenter\(this\.node, 'Top1'\)/);
assert.match(controller, /eventBus\.emit\('UI_TRIGGER_PAUSE'\)/);
assert.match(hudView, /controller\?\.updateMatch\(snapshot\)/);
assert.match(hudView, /ArenaHUDController\)\?\.showAbsorbFeedback/);
assert.match(manager, /this\.hud\?\.updateArena\(this\.arenaMatchManager\.getSnapshot\(\)\)/);
assert.match(manager, /this\.hud\?\.showAbsorbFeedback\(obj\.getPosition\(\), t\.value \* 10, t\.tier\)/);
assert.match(matchManager, /localKills: local\?\.kills \|\| 0/);
assert.match(matchManager, /leaderboard: ordered/);
assert.match(joystickVisual, /const input = this\.playerController\.moveInput/);
assert.match(pickupFeedback, /public emit\(worldPosition: Readonly<Vec3>, score: number, color: Readonly<Color>\)/);
for (const source of [controller, hudView, joystickVisual, pickupFeedback]) assert.doesNotMatch(source, /QABridge|__BHR_QA__|QA_(?:SPAWN|GRANT|TELEPORT|FORCE)/, 'Arena HUD production path must not depend on QA mutation APIs');
console.log('[PASS] Arena HUD authoring and live-data contract assertions (NON_RUNTIME; portrait CDP acceptance remains required).');
