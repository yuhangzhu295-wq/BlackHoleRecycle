/**
 * Suction progression contract (implementation-level, non-renderer).
 *
 * Exercises the REAL CompressibleObject FSM + SuctionMotionCalculator extracted
 * from the TypeScript sources with minimal cc stubs. Proves:
 *  - T1 targets complete IDLE -> ATTRACTED -> SUCKING -> ABSORBED quickly.
 *  - A target whose tier exceeds the machine maxTier is never absorbed, stays
 *    IDLE, and raises the LV lock feedback instead.
 *  - A high-tier target with sufficient level cannot be absorbed in the same
 *    frame; it must pass through a real sustained suction process.
 *  - An ATTRACTED target dragged out of the influence ring escapes to IDLE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readScript = (relative) => fs.readFileSync(path.join(rootDirectory, relative), 'utf8');

const stripImports = (source) => source.replace(/^import\s+.*?;$/gm, '');

const fullSource = `
${stripImports(readScript('cocos/assets/scripts/core/FSM.ts'))}
${stripImports(readScript('cocos/assets/scripts/gameplay/SuctionMotion.ts'))}
${stripImports(readScript('cocos/assets/scripts/gameplay/CompressibleObject.ts'))}
;globalThis.__CompressibleObject = CompressibleObject;
;globalThis.__SuctionMotionCalculator = SuctionMotionCalculator;
;globalThis.__getSuctionTierProfile = getSuctionTierProfile;
`;

const compiled = transformSync(fullSource, {
  loader: 'ts',
  target: 'es2022',
  format: 'iife',
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
}).code;

// ---- minimal cc stubs ------------------------------------------------------
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
    this.active = true;
    this.isValid = true;
    this.position = new Vec3();
    this.scale = new Vec3(1, 1, 1);
    this.euler = new Vec3();
    this.parent = null;
  }
  addChild(child) { child.parent = this; this.children.push(child); }
  removeAllChildren() { this.children.length = 0; }
  addComponent(ctor) { const c = new ctor(); c.node = this; return c; }
  setPosition(a, b, c) { this.position.set(a, b, c); }
  getPosition() { return this.position; }
  setScale(a, b, c) { this.scale.set(a, b, c); }
  setRotationFromEuler(x, y, z) { this.euler.set(x, y, z); }
  getChildByName(name) { return this.children.find((child) => child.name === name) || null; }
}

class FakeComponent { constructor() { this.node = null; } }
class FakeLabel { constructor() { this.string = ''; this.fontSize = 0; this.color = null; } }
class FakeColor { constructor(r, g, b, a) { this.r = r; this.g = g; this.b = b; this.a = a; } }

const fakeArtLibrary = {
  spawn(kind, parent, position, scale, yaw = 0, name = kind) {
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
globalThis.getObjectArtBinding = (type) => ({ kind: `art_${type}`, yOffset: 0, scale: new Vec3(1, 1, 1), yaw: 0 });
globalThis.OBJECT_TEMPLATES = [];
globalThis.ObjectTier = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };

new Function(compiled)();
const CompressibleObject = globalThis.__CompressibleObject;
const getSuctionTierProfile = globalThis.__getSuctionTierProfile;

const record = (name, pass, detail) => {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

const T1 = { type: 'soda_can', name: 'Soda Can', tier: 1, mass: 50, value: 5, radius: 0.25 };
const T5 = { type: 'car', name: 'Car', tier: 5, mass: 25000, value: 3000, radius: 3.5 };
const DT = 1 / 60;

const makeObject = (template, x, z) => {
  const object = new CompressibleObject();
  object.node = new FakeNode('Object');
  object.onLoad();
  object.spawn(template, x, z);
  return object;
};

const runSuction = (object, machinePos, radius, maxTier, seconds, magnet = false) => {
  const trace = [];
  let absorbed = false;
  let elapsed = 0;
  let lockAlertSeen = false;
  const frames = Math.ceil(seconds / DT);
  for (let i = 0; i < frames && !absorbed; i++) {
    const stateBefore = object.getState();
    if (trace[trace.length - 1] !== stateBefore) trace.push(stateBefore);
    absorbed = object.updateMotion(DT, machinePos, radius, maxTier, magnet, 'player', 1.0);
    if (object.isShowingLockAlert()) lockAlertSeen = true;
    elapsed += DT;
  }
  const finalState = object.getState();
  if (trace[trace.length - 1] !== finalState) trace.push(finalState);
  return { absorbed, elapsed, trace, lockAlertSeen };
};

// 1. T1 fast absorb: full real FSM chain within a short time.
{
  const object = makeObject(T1, 1.5, 0);
  const result = runSuction(object, new Vec3(0, 0.35, 0), 2.4, 1, 3.0);
  const chain = result.trace.join('>');
  record('T1_FAST_FULL_CHAIN', result.absorbed && result.elapsed < 1.5
    && result.trace.includes('ATTRACTED') && result.trace.includes('SUCKING'),
    `chain=${chain} absorbed in ${result.elapsed.toFixed(2)}s`);
}

// 2. Tier-insufficient target is never absorbed and shows the LV lock feedback.
{
  const object = makeObject(T5, 2.3, 0);
  const result = runSuction(object, new Vec3(0, 0.35, 0), 2.4, 1, 3.0);
  record('T5_LOCKED_NEVER_ABSORBED', !result.absorbed && object.getState() === 'IDLE',
    `state=${object.getState()} after ${result.elapsed.toFixed(2)}s inside radius`);
  record('T5_LOCKED_SHOWS_LV_FEEDBACK', result.lockAlertSeen,
    'lock alert raised with LV requirement text');
  const distance = Math.hypot(object.getPosition().x, object.getPosition().z);
  // standoff = max(2.4*0.45, 3.5*0.5) = 1.75; the locked target must stop there.
  record('T5_LOCKED_ONLY_SLIGHT_PULL', distance > 1.7 && distance < 2.3,
    `target crept from 2.3m to ${distance.toFixed(2)}m and held at the standoff ring (no capture)`);
}

// 3. High tier with sufficient level requires a real sustained suction process.
{
  const object = makeObject(T5, 6.0, 0);
  const result = runSuction(object, new Vec3(0, 0.35, 0), 8.0, 5, 12.0);
  const chain = result.trace.join('>');
  record('T5_SUSTAINED_CHAIN', result.absorbed
    && result.trace.includes('ATTRACTED') && result.trace.includes('SUCKING'),
    `chain=${chain}`);
  record('T5_NOT_INSTANT', result.elapsed > 2.0,
    `T5 absorb took ${result.elapsed.toFixed(2)}s of sustained suction (not same-frame)`);
}

// 4. An ATTRACTED target escapes when dragged out of the influence ring.
{
  const object = makeObject(T5, 7.5, 0);
  const machinePos = new Vec3(0, 0.35, 0);
  object.updateMotion(DT, machinePos, 8.0, 5, false, 'player', 1.0);
  record('T5_ATTRACTED_FIRST', object.getState() === 'ATTRACTED', `state=${object.getState()}`);
  const farPos = new Vec3(30, 0.35, 0);
  object.updateMotion(DT, farPos, 8.0, 5, false, 'player', 1.0);
  record('T5_ESCAPE_TO_IDLE', object.getState() === 'IDLE' && object.getCaptureOwnerId() === null,
    'target escaped back to IDLE after machine left the influence ring');
}

// 5. Tier profiles are strictly progressive.
{
  const t1 = getSuctionTierProfile(1);
  const t3 = getSuctionTierProfile(3);
  const t5 = getSuctionTierProfile(5);
  record('TIER_PROFILE_PROGRESSION',
    t5.pullResistance > t3.pullResistance && t3.pullResistance > t1.pullResistance
    && t5.suckDuration > t3.suckDuration && t3.suckDuration > t1.suckDuration,
    `resistance ${t1.pullResistance}/${t3.pullResistance}/${t5.pullResistance}, duration ${t1.suckDuration}/${t3.suckDuration}/${t5.suckDuration}`);
}

console.log('[PASS] suction progression contract (implementation-level, non-renderer).');
console.log('[NOTE] Visual/runtime evidence still requires acceptance:v2 and is not claimed here.');
