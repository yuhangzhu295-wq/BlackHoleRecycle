/**
 * Vehicle art contamination contract (implementation-level, non-renderer).
 *
 * Proves VEHICLE_ART_CONTAMINATION = NONE for real DynamicVehicle-compatible
 * CompressibleObject instances:
 *  - The tier-lock feedback never instantiates a traffic-cone (or any) art
 *    model; it is a lightweight text indicator only.
 *  - Vehicle templates bind to their real vehicle art (sedan/deliveryVan/
 *    garbageTruck), never to a cone/marker/debug fallback.
 *  - A T5 vehicle instance contains no cone/marker/debug node anywhere in
 *    its real node tree, before and during the lock feedback.
 *  - The same instance still runs the full swallow FSM at sufficient level,
 *    including the vehicle suction spin.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readScript = (relative) => fs.readFileSync(path.join(rootDirectory, relative), 'utf8');

const record = (name, pass, detail) => {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

// ---- 1. Source-level guarantees --------------------------------------------
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const compressibleSource = stripComments(readScript('cocos/assets/scripts/gameplay/CompressibleObject.ts'));
record('SOURCE_NO_CONE_IN_LOCK_INDICATOR', !compressibleSource.includes('constructionCone'),
  'CompressibleObject.ts contains no constructionCone reference');
const lockBlock = compressibleSource.slice(
  compressibleSource.indexOf("new Node('TierLockWarning')"),
  compressibleSource.indexOf('private initFSM'),
);
record('SOURCE_LOCK_INDICATOR_SPAWNS_NO_ART', !lockBlock.includes('.spawn('),
  'TierLockWarning block creates no art instances');

const registrySource = readScript('cocos/assets/scripts/world/ObjectArtRegistry.ts');
const bindingOf = (type) => {
  const match = registrySource.match(new RegExp(`['"]?${type}['"]?\\s*:\\s*[^\\n]+`));
  return match ? match[0] : '';
};
record('REGISTRY_CAR_IS_SEDAN', /car['"]?\s*:\s*\{[^}]*'sedan'/.test(registrySource) || bindingOf('car').includes('sedan'),
  bindingOf('car').trim());
record('REGISTRY_VAN_IS_DELIVERYVAN', bindingOf('delivery_van').includes('deliveryVan'), bindingOf('delivery_van').trim());
record('REGISTRY_TRUCK_IS_GARBAGETRUCK', bindingOf('garbage_truck').includes('garbageTruck'), bindingOf('garbage_truck').trim());
record('REGISTRY_NO_DEBUG_FALLBACK', !/debug|marker/i.test(registrySource),
  'ObjectArtRegistry contains no debug/marker bindings');

// ---- 2. Runtime node-tree inspection of a real vehicle object --------------
const stripImports = (source) => source.replace(/^import\s+.*?;$/gm, '');
const fullSource = `
${stripImports(readScript('cocos/assets/scripts/core/FSM.ts'))}
${stripImports(readScript('cocos/assets/scripts/gameplay/SuctionMotion.ts'))}
${stripImports(readScript('cocos/assets/scripts/gameplay/CompressibleObject.ts'))}
;globalThis.__CompressibleObject = CompressibleObject;
`;
const compiled = transformSync(fullSource, {
  loader: 'ts',
  target: 'es2022',
  format: 'iife',
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
}).code;

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  set(a, b, c) {
    if (a instanceof Vec3) { this.x = a.x; this.y = a.y; this.z = a.z; }
    else { this.x = a; this.y = b; this.z = c; }
    return this;
  }
  subtract(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
}
Vec3.ONE = new Vec3(1, 1, 1);
Vec3.ZERO = new Vec3(0, 0, 0);

class FakeNode {
  constructor(name = 'Node') {
    this.name = name;
    this.children = [];
    this.components = [];
    this.active = true;
    this.isValid = true;
    this.position = new Vec3();
    this.scale = new Vec3(1, 1, 1);
    this.euler = new Vec3();
    this.parent = null;
  }
  addChild(child) { child.parent = this; this.children.push(child); }
  removeAllChildren() { this.children.length = 0; }
  addComponent(ctor) { const c = new ctor(); c.node = this; this.components.push(c); return c; }
  setPosition(a, b, c) { this.position.set(a, b, c); }
  getPosition() { return this.position; }
  setScale(a, b, c) { this.scale.set(a, b, c); }
  setRotationFromEuler(x, y, z) { this.euler.set(x, y, z); }
  getChildByName(name) { return this.children.find((child) => child.name === name) || null; }
}
class FakeComponent { constructor() { this.node = null; } }
class FakeLabel { constructor() { this.string = ''; this.fontSize = 0; this.color = null; } }
class FakeColor { constructor(r, g, b, a) { this.r = r; this.g = g; this.b = b; this.a = a; } }

const spawnedArt = [];
const fakeArtLibrary = {
  spawn(kind, parent, position, scale, yaw = 0, name = kind) {
    spawnedArt.push({ kind, name, parent: parent.name });
    const node = new FakeNode(name);
    node.setPosition(position || Vec3.ZERO);
    if (scale) node.setScale(scale);
    parent.addChild(node);
    return node;
  },
};

globalThis.Vec3 = Vec3;
globalThis.math = { lerp: (a, b, t) => a + (b - a) * t, clamp01: (v) => Math.max(0, Math.min(1, v)) };
globalThis.Node = FakeNode;
globalThis.Component = FakeComponent;
globalThis.Label = FakeLabel;
globalThis.Color = FakeColor;
globalThis._decorator = { ccclass: () => (target) => target, property: () => () => undefined };
globalThis.director = { getScene: () => ({ getComponentInChildren: () => fakeArtLibrary }) };
globalThis.WorldArtLibrary = class WorldArtLibrary {};
globalThis.getObjectArtBinding = (type) => {
  const bindings = {
    car: { kind: 'sedan', yOffset: 0, scale: new Vec3(1, 1, 1), yaw: 0 },
    delivery_van: { kind: 'deliveryVan', yOffset: 0, scale: new Vec3(1, 1, 1), yaw: 0 },
    garbage_truck: { kind: 'garbageTruck', yOffset: 0, scale: new Vec3(1, 1, 1), yaw: 0 },
  };
  const binding = bindings[type];
  if (!binding) throw new Error(`unbound test type: ${type}`);
  return binding;
};
globalThis.OBJECT_TEMPLATES = [];
globalThis.ObjectTier = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };

new Function(compiled)();
const CompressibleObject = globalThis.__CompressibleObject;

const CAR = { type: 'car', name: 'Car', tier: 5, mass: 25000, value: 3000, radius: 3.5 };
const DT = 1 / 60;

const collectNames = (node, acc = []) => {
  acc.push(node.name);
  node.children.forEach((child) => collectNames(child, acc));
  return acc;
};

const vehicle = new CompressibleObject();
vehicle.node = new FakeNode('TrafficVehicle');
vehicle.onLoad();
vehicle.spawn(CAR, 5, 0, 0.35, 'traffic_0_0_sedan');
vehicle.setSuctionSpin(300);

const names = collectNames(vehicle.node);
record('VEHICLE_TREE_HAS_NO_CONE', !names.some((name) => /cone/i.test(name)),
  `tree: ${names.join(', ')}`);
record('VEHICLE_TREE_HAS_NO_MARKER_OR_DEBUG', !names.some((name) => /marker|debug|fallback/i.test(name)),
  'no marker/debug/fallback nodes');
record('VEHICLE_BODY_ART_IS_SEDAN', spawnedArt.some((art) => art.kind === 'sedan' && art.parent === 'Visual'),
  `spawned art: ${spawnedArt.map((art) => `${art.kind}@${art.parent}`).join(', ')}`);
record('LOCK_INDICATOR_IS_TEXT_ONLY',
  !spawnedArt.some((art) => art.parent === 'TierLockWarning'),
  'no art spawned under TierLockWarning');

// Lock feedback: text only, with the explicit LV requirement. The vehicle is
// 5m away, so use an LV1 machine whose radius still reaches it for the probe.
vehicle.updateMotion(DT, new Vec3(0, 0.35, 0), 8.0, 1, false, 'player', 1.0);
const warning = vehicle.node.getChildByName('TierLockWarning');
const labelNode = warning?.getChildByName('TierLockLabel');
const labelText = labelNode?.components?.[0]?.string ?? '';
record('LOCK_FEEDBACK_ACTIVE_ON_LOW_LEVEL', Boolean(warning?.active) && vehicle.isShowingLockAlert(),
  'lock indicator visible while tier-insufficient');
record('LOCK_FEEDBACK_TEXT', /需要 LV\.5/.test(labelText),
  `label text: ${labelText || '(none)'}`);
record('LOCK_FEEDBACK_STILL_NO_CONE', !collectNames(vehicle.node).some((name) => /cone/i.test(name)),
  'still no cone node while the lock feedback is visible');

// Full swallow at sufficient level, with the vehicle spin applied.
const swallow = new CompressibleObject();
swallow.node = new FakeNode('TrafficVehicle2');
swallow.onLoad();
swallow.spawn(CAR, 6, 0, 0.35, 'traffic_0_0_sedan');
swallow.setSuctionSpin(300);
const machinePos = new Vec3(0, 0.35, 0);
let absorbed = false;
let elapsed = 0;
let spun = false;
for (let i = 0; i < Math.ceil(12 / DT) && !absorbed; i++) {
  absorbed = swallow.updateMotion(DT, machinePos, 8.0, 5, false, 'player', 1.0);
  const visual = swallow.node.getChildByName('Visual');
  if (visual && (Math.abs(visual.euler.y) > 1 || Math.abs(visual.euler.z) > 0.5)) spun = true;
  elapsed += DT;
}
record('VEHICLE_SWALLOW_AT_LV5', absorbed, `vehicle absorbed after ${elapsed.toFixed(2)}s of sustained suction`);
record('VEHICLE_SPIN_DURING_SUCTION', spun, 'visual yaw/roll rotated while being pulled in');
record('VEHICLE_ART_CONTAMINATION_NONE', !collectNames(swallow.node).some((name) => /cone|marker|debug/i.test(name)),
  'post-swallow tree remains clean');

console.log('[PASS] vehicle art contract: VEHICLE_ART_CONTAMINATION = NONE.');
console.log('[NOTE] On-screen pixel evidence still requires acceptance:v2 and is not claimed here.');
