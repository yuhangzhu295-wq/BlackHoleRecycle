import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const contract = JSON.parse(read('cocos/docs/design-contracts/endless-hud.json'));
const scene = JSON.parse(read('cocos/assets/scenes/Game.scene'));
const controller = read('cocos/assets/scripts/ui/EndlessHUDController.ts');
const hudView = read('cocos/assets/scripts/ui/HUDView.ts');
const manager = read('cocos/assets/scripts/gameplay/GameManager.ts');
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
const assertBounds = (node, expected) => {
  assert.deepEqual(node._lpos, { __type__: 'cc.Vec3', ...expected.lpos }, expected.name + ' position drift');
  assert.deepEqual(uiTransform(node)?._contentSize, { __type__: 'cc.Size', ...expected.size }, expected.name + ' size drift');
};

assert.deepEqual(contract.canvas, { width: 720, height: 1280, aspectRatio: '9:16' });
const endlessNodes = [...nodeById.values()].filter((node) => node._name === contract.hudRoot);
assert.equal(endlessNodes.length, 1, 'Game.scene must contain exactly one EndlessHUD');
const endless = endlessNodes[0];
assert.equal(nodeById.get(refId(endless._parent))?._name, contract.sceneRoot, 'EndlessHUD must be a direct Canvas child');
assert.deepEqual(uiTransform(endless)?._contentSize, { __type__: 'cc.Size', width: 720, height: 1280 });
for (const element of contract.directElements) {
  const node = directChild(endless, element.name);
  assert(node, 'Missing Canvas/EndlessHUD/' + element.name);
  assertBounds(node, element);
  const types = componentTypes(node);
  for (const expectedType of element.expectedComponents.filter((type) => type.startsWith('cc.'))) {
    assert(types.includes(expectedType), element.name + ' missing ' + expectedType);
  }
  if (element.name === 'Joystick') assert(types.some((type) => !type.startsWith('cc.')), 'Joystick must retain serialized JoystickVisual');
  assert.deepEqual(childNodes(node).map((child) => child._name), element.children || [], element.name + ' child hierarchy drift');
}
assert.deepEqual(childNodes(endless).map((child) => child._name), contract.directElements.map((element) => element.name), 'EndlessHUD direct child order/content drift');

assert.match(controller, /const topShade = this\.node\.getChildByName\('TopShade'\);[\s\S]*?topShade\.active = false/);
assert.match(controller, /eventBus\.emit\('UI_TRIGGER_PAUSE'\)/);
for (const label of ['LevelValue', 'MassValue', 'CoinValue', 'RegionValue']) assert.match(controller, new RegExp("setLabel\\('" + label + "'"));
assert.match(controller, /new PickupFeedbackPresenter\(this\.node, 'CoinValue'\)/);
assert.match(hudView, /controller\?\.updateStats\(mass, level, levelTitle, coins, regionName \|\| '未知区域'\)/);
assert.match(hudView, /currentScreenName === 'Gameplay'[\s\S]*?EndlessHUDController\)\?\.showAbsorbFeedback/);
assert.match(manager, /this\.hud\.updateStats\([\s\S]*?this\.machine\.currentMass,[\s\S]*?this\.machine\.currentLevel,[\s\S]*?this\.machine\.currentConfig\.title,[\s\S]*?this\.currentCoins/);
assert.match(manager, /this\.hud\?\.showAbsorbFeedback\(obj\.getPosition\(\), t\.value \* 10, t\.tier\)/);
assert.match(joystickVisual, /const input = this\.playerController\.moveInput/);
assert.match(joystickVisual, /this\.knob\.setPosition\(input\.x \* this\.knobRadius, input\.y \* this\.knobRadius, 0\)/);
assert.match(pickupFeedback, /public emit\(worldPosition: Readonly<Vec3>, score: number, color: Readonly<Color>\)/);
for (const source of [controller, hudView, joystickVisual, pickupFeedback]) {
  assert.doesNotMatch(source, /QABridge|__BHR_QA__|QA_(?:SPAWN|GRANT|TELEPORT|FORCE)/, 'Endless HUD production path must not depend on QA mutation APIs');
}
console.log('[PASS] Endless HUD authoring and live-data contract assertions (NON_RUNTIME; portrait CDP acceptance remains required).');
