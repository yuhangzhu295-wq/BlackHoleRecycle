/**
 * Deterministic S2 contract test for traffic replenishment and vehicle lifecycle.
 *
 * This is not a Cocos renderer/runtime test. It exercises the real DynamicVehicle
 * and InfiniteWorldCell implementation extracted from the TypeScript sources,
 * validating movement, turning, absorption removal from both arrays and pool release,
 * cooldown replenishment at route entries, global cap limits, and unload/reload safety.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dvPath = path.join(rootDirectory, 'cocos/assets/scripts/world/DynamicVehicle.ts');
const managerPath = path.join(rootDirectory, 'cocos/assets/scripts/world/InfiniteWorldManager.ts');

const dvSource = fs.readFileSync(dvPath, 'utf8').replace(/^import\s+.*?;/gm, '');
const managerSource = fs.readFileSync(managerPath, 'utf8');

const classStart = managerSource.indexOf('class InfiniteWorldCell');
const classEnd = managerSource.indexOf('\n@ccclass', classStart);
if (classStart < 0 || classEnd < 0) throw new Error('InfiniteWorldCell source boundary not found');

const helperStart = managerSource.lastIndexOf('function isCollectibleObject', classStart);
const extracted = managerSource.slice(helperStart, classEnd);

const fullSource = `
${dvSource}
${extracted}
;globalThis.__InfiniteWorldCell = InfiniteWorldCell;
;globalThis.__DynamicVehicle = DynamicVehicle;
`;

const compiled = transformSync(fullSource, {
  loader: 'ts',
  target: 'es2022',
  format: 'iife',
}).code;

globalThis.ObjectTier = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };
globalThis.OBJECT_TEMPLATES = [
  { type: 'car', tier: 5, mass: 1200, value: 50, radius: 1.2 },
  { type: 'sedan', tier: 5, mass: 1200, value: 50, radius: 1.2 },
  { type: 'delivery_van', tier: 5, mass: 2000, value: 80, radius: 1.5 },
  { type: 'garbage_truck', tier: 5, mass: 5000, value: 150, radius: 2.0 },
];

new Function(compiled)();
const InfiniteWorldCell = globalThis.__InfiniteWorldCell;
const DynamicVehicle = globalThis.__DynamicVehicle;

class FakeNode {
  constructor(name, children = [], worldPosition = { x: 0, y: 0, z: 0 }) {
    this.name = name;
    this.children = children;
    this.worldPosition = worldPosition;
    this.isValid = true;
  }

  destroy() {
    this.isValid = false;
  }
}

class FakeObject {
  constructor(id) {
    this.node = { isValid: true };
    this.runtimeId = id;
    this.state = 'RECYCLED';
    // Mirrors CompressibleObject.stateHistory: the ordered motion-state
    // transitions since the last entry into IDLE. The collectible branch of
    // removeAbsorbedCollectible records it onto the authored slot.
    this.stateHistory = [];
    this.spawnCount = 0;
    this.position = { x: 0, y: 0, z: 0 };
    this.headingDegrees = 0;
    this.spin = 0;
  }

  spawn(template, x, z, scale, runtimeId) {
    this.template = template;
    this.position = { x, y: 0, z };
    this.runtimeId = runtimeId;
    this.state = 'IDLE';
    this.stateHistory = ['IDLE'];
    this.spawnCount += 1;
    this.node.isValid = true;
  }

  /** Mirrors CompressibleObject.transitionTo. */
  setState(nextState) {
    if (this.state === nextState) return;
    if (nextState === 'IDLE') this.stateHistory.length = 0;
    this.state = nextState;
    this.stateHistory.push(nextState);
  }

  recycle() {
    this.setState('RECYCLED');
  }

  getState() {
    return this.state;
  }

  getStateHistory() {
    return this.stateHistory;
  }

  getPosition() {
    return this.position;
  }

  setSuctionSpin(spin) {
    this.spin = spin;
  }

  setRoutePosition(x, z, heading) {
    this.position.x = x;
    this.position.z = z;
    this.headingDegrees = heading;
  }
}

class FakePool {
  constructor() {
    this.items = [];
    this.active = 0;
    this.created = 0;
  }

  get() {
    const object = this.items.pop() || new FakeObject(`pool_${this.created++}`);
    this.active += 1;
    return object;
  }

  release(object) {
    object.recycle();
    this.items.push(object);
    this.active = Math.max(0, this.active - 1);
  }

  getActiveCount() {
    return this.active;
  }
}

const theme = { id: 'TEST', availableTiers: [1, 2, 3, 4, 5] };
const district = { kind: 'RESIDENTIAL', resourceClusters: [] };
// Engine boundary: the authored cell constructor hydrates materials through the
// art library, so the stub mirrors that same seam as a no-op.
const art = { spawn() {}, hydrateAuthoredOpeningMaterials() {}, hydrateConstructionLandmarkMaterials() {} };
const origin = { x: 0, y: 0, z: 0 };

const record = (name, pass, detail) => {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

const makeCell = (authored = true, node = new FakeNode('Cell')) => new InfiniteWorldCell(
  { x: 0, z: 0 }, node, theme, district, art, 64, authored,
);

// 1. Procedural route vehicle move and turn
const pool = new FakePool();
const proceduralCell = makeCell(true);
proceduralCell.populate([], pool, origin);
record('PROCEDURAL_VEHICLE_INITIALIZED', proceduralCell.dynamicVehicles.length === 1 && proceduralCell.objects.length === 1 && pool.getActiveCount() === 1, '1 vehicle spawned into objects and dynamicVehicles');

const pVehicle = proceduralCell.dynamicVehicles[0];
const initialPos = { ...pVehicle.object.getPosition() };
proceduralCell.updateDynamicTraffic(0.5);
const movedPos = { ...pVehicle.object.getPosition() };
record('VEHICLE_MOVES_ALONG_ROUTE', movedPos.x !== initialPos.x || movedPos.z !== initialPos.z, `pos shifted from (${initialPos.x},${initialPos.z}) to (${movedPos.x},${movedPos.z})`);

let turned = false;
for (let i = 0; i < 30; i++) {
  proceduralCell.updateDynamicTraffic(0.2);
  if (pVehicle.state === 'TURN') {
    turned = true;
    break;
  }
}
record('VEHICLE_TURNS_AT_CORNER', turned, 'vehicle transitioned to TURN state at road waypoint');

// 2. Absorption removal from both arrays and return to same ObjectPool
const vehicleObj = pVehicle.object;
const removeResult = proceduralCell.removeAbsorbedVehicle(vehicleObj, pool, 4);
record('VEHICLE_ABSORB_REMOVES_FROM_CELL_AND_TRAFFIC', removeResult && proceduralCell.objects.length === 0 && proceduralCell.dynamicVehicles.length === 0, 'removed from both cell.objects and cell.dynamicVehicles');
record('VEHICLE_ABSORB_RELEASES_TO_SAME_POOL', pool.getActiveCount() === 0, 'vehicle object returned to same FakePool');

// 3. Cooldown replenishment
proceduralCell.advanceRespawnClock(3.99);
record('TRAFFIC_COOLDOWN_BLOCKS_PREMATURE_RESPAWN', proceduralCell.replenishTraffic(pool, 24, 0) === 0, 'no vehicle respawn before 4s cooldown expires');
proceduralCell.advanceRespawnClock(0.02);
record('TRAFFIC_COOLDOWN_RESPAWNS_VEHICLE', proceduralCell.replenishTraffic(pool, 24, 0) === 1, 'vehicle respawned after cooldown expired');
record('RESPAWN_RE_REGISTERS_ARRAYS_AND_POOL', proceduralCell.objects.length === 1 && proceduralCell.dynamicVehicles.length === 1 && pool.getActiveCount() === 1, 'respawned vehicle present in objects, dynamicVehicles, and active pool');

// 4. Global cap limits
const cappedPool = new FakePool();
const cappedCell = makeCell(true);
cappedCell.populate([], cappedPool, origin);
cappedCell.removeAbsorbedVehicle(cappedCell.dynamicVehicles[0].object, cappedPool, 4);
cappedCell.advanceRespawnClock(4.01);
record('TRAFFIC_CAP_BLOCKS_WHEN_FULL', cappedCell.replenishTraffic(cappedPool, 24, 24) === 0, 'replenishTraffic returns 0 when activeVehicleCount >= MAX_ACTIVE_VEHICLES');
record('TRAFFIC_CAP_ALLOWS_WHEN_UNDER_LIMIT', cappedCell.replenishTraffic(cappedPool, 24, 23) === 1, 'replenishTraffic spawns when below cap');

// 5. Authored TrafficRoutes
const authoredNode = new FakeNode('Cell', [
  new FakeNode('TrafficRoutes', [
    new FakeNode('VehicleAnchor_Sedan', [], { x: 10, y: 0, z: 10 }),
    new FakeNode('VehicleAnchor_DeliveryVan', [], { x: 20, y: 0, z: 20 }),
    new FakeNode('VehicleAnchor_GarbageTruck', [], { x: 30, y: 0, z: 30 }),
  ]),
  new FakeNode('RoadWest', [], { x: -20, y: 0, z: 0 }),
  new FakeNode('RoadNorth', [], { x: 0, y: 0, z: 20 }),
  new FakeNode('RoadEast', [], { x: 20, y: 0, z: 0 }),
  new FakeNode('RoadSouth', [], { x: 0, y: 0, z: -20 }),
]);
const authoredPool = new FakePool();
const authoredCell = makeCell(true, authoredNode);
authoredCell.populateAuthoredTraffic(authoredPool, origin);
record('AUTHORED_TRAFFIC_REGISTERED', authoredCell.dynamicVehicles.length === 3 && authoredCell.objects.length === 3 && authoredPool.getActiveCount() === 3, '3 authored vehicles spawned');

const authoredVehicles = [...authoredCell.dynamicVehicles];
for (const v of authoredVehicles) {
  authoredCell.removeAbsorbedVehicle(v.object, authoredPool, 4);
}
record('AUTHORED_VEHICLES_ABSORBED_ALL', authoredCell.objects.length === 0 && authoredCell.dynamicVehicles.length === 0 && authoredPool.getActiveCount() === 0, 'all 3 authored vehicles removed and released to pool');

authoredCell.advanceRespawnClock(4.01);
const authoredReplenished = authoredCell.replenishTraffic(authoredPool, 24, 0);
record('AUTHORED_VEHICLES_COOLDOWN_REPLENISHED', authoredReplenished === 3 && authoredCell.dynamicVehicles.length === 3, 'all 3 authored slots replenished after cooldown');

// 7. One shared clock advances once even though both respawn consumers run every frame.
const clockPool = new FakePool();
const clockCell = makeCell(true);
clockCell.populate([{ template: globalThis.OBJECT_TEMPLATES[0], localX: 1, localZ: 1, customId: 'clock-collectible' }], clockPool, origin);
const clockCollectible = clockCell.objects.find((object) => object.runtimeId === 'clock-collectible');
const clockVehicle = clockCell.dynamicVehicles[0]?.object;
record('RESPAWN_CLOCK_FIXTURE_INITIALIZED', Boolean(clockCollectible) && Boolean(clockVehicle), 'one collectible and one traffic slot are active');
clockCell.removeAbsorbedCollectible(clockCollectible, clockPool, 4);
clockCell.removeAbsorbedVehicle(clockVehicle, clockPool, 4);

const runRespawnFrame = () => {
  clockCell.advanceRespawnClock(1 / 60);
  const collectibleSpawns = clockCell.updateCollectibleRespawn(clockPool, origin, 0, 240);
  const trafficSpawns = clockCell.replenishTraffic(clockPool, 24, clockCell.dynamicVehicles.length);
  return { collectibleSpawns, trafficSpawns };
};

let firstSecondSpawns = 0;
for (let frame = 0; frame < 60; frame += 1) {
  const spawned = runRespawnFrame();
  firstSecondSpawns += spawned.collectibleSpawns + spawned.trafficSpawns;
}
record('RESPAWN_CLOCK_SINGLE_ADVANCE', Math.abs(clockCell.respawnClock - 1) < 1e-9 && firstSecondSpawns === 0,
  '60 frames at 1/60 advance the shared cell clock to 1.0s, not 2.0s, without crossing the 4s cooldown');

const preCooldownSpawns = (() => {
  clockCell.advanceRespawnClock(2.99);
  const collectibleSpawns = clockCell.updateCollectibleRespawn(clockPool, origin, 0, 240);
  const trafficSpawns = clockCell.replenishTraffic(clockPool, 24, clockCell.dynamicVehicles.length);
  return collectibleSpawns + trafficSpawns;
})();
record('SHARED_CLOCK_PRESERVES_FOUR_SECOND_COOLDOWNS', preCooldownSpawns === 0 && Math.abs(clockCell.respawnClock - 3.99) < 1e-9,
  'collectible and traffic slots both remain unavailable before their configured 4s cooldown');
clockCell.advanceRespawnClock(0.01);
const cooldownExpirySpawns = {
  collectibleSpawns: clockCell.updateCollectibleRespawn(clockPool, origin, 0, 240),
  trafficSpawns: clockCell.replenishTraffic(clockPool, 24, clockCell.dynamicVehicles.length),
};
record('SHARED_CLOCK_REPLENISHES_BOTH_AFTER_CONFIGURED_DELAY', cooldownExpirySpawns.collectibleSpawns === 1 && cooldownExpirySpawns.trafficSpawns === 1,
  'both slots replenish when the shared clock reaches the existing 4s delay');

// 6. Unload and reload does not duplicate
authoredCell.recycle(authoredPool);
record('UNLOAD_CLEARS_VEHICLES_AND_SLOTS', authoredCell.objects.length === 0 && authoredCell.dynamicVehicles.length === 0 && authoredPool.getActiveCount() === 0, 'recycle cleared all objects, dynamicVehicles, and slots');

authoredCell.populateAuthoredTraffic(authoredPool, origin);
record('RELOAD_DOES_NOT_DUPLICATE_TRAFFIC', authoredCell.dynamicVehicles.length === 3 && authoredCell.objects.length === 3 && authoredPool.getActiveCount() === 3, 'reload recreates exactly 3 authored vehicles without duplicates');

console.log('[PASS] S2 deterministic traffic replenishment contract (implementation-level, non-renderer).');
console.log('[NOTE] Cocos scene/runtime, visual density, and console-error evidence require acceptance:v2 and are not claimed here.');
