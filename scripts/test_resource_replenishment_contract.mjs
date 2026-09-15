/**
 * Deterministic S1 contract test for the real InfiniteWorldCell implementation.
 *
 * This is not a Cocos renderer/runtime test. It extracts the cell class from
 * the current TypeScript source and supplies only the engine boundary objects
 * needed by the tested lifecycle methods. That keeps the test executable in
 * Node while exercising the implementation rather than duplicating its slot
 * algorithm in a separate model.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const managerPath = path.join(rootDirectory, 'cocos/assets/scripts/world/InfiniteWorldManager.ts');
const source = fs.readFileSync(managerPath, 'utf8');
const authoredContentStart = source.indexOf('public populateAuthoredContent');
const authoredContentEnd = source.indexOf('  public populateAuthoredTraffic', authoredContentStart);
if (authoredContentStart < 0 || authoredContentEnd < 0) throw new Error('populateAuthoredContent source boundary not found');
const authoredContentSource = source.slice(authoredContentStart, authoredContentEnd);
const classStart = source.indexOf('class InfiniteWorldCell');
const classEnd = source.indexOf('\n@ccclass', classStart);
if (classStart < 0 || classEnd < 0) throw new Error('InfiniteWorldCell source boundary not found');

const helperStart = source.lastIndexOf('function isCollectibleObject', classStart);
const extracted = `${source.slice(helperStart, classEnd)}\n;globalThis.__InfiniteWorldCell = InfiniteWorldCell;`;
const compiled = transformSync(`${extracted}\n;globalThis.__InfiniteWorldCell = InfiniteWorldCell;`, {
  loader: 'ts',
  target: 'es2022',
  format: 'iife',
}).code;
globalThis.ObjectTier = { T1: 1, T2: 2 };
globalThis.OBJECT_TEMPLATES = [
  { type: 'test-cardboard', tier: 1, mass: 10, value: 1, radius: 0.3 },
  { type: 'test-bin', tier: 2, mass: 20, value: 2, radius: 0.4 },
];
new Function(compiled)();
const InfiniteWorldCell = globalThis.__InfiniteWorldCell;

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
    this.spawnCount = 0;
  }

  spawn(template, x, z, scale, runtimeId) {
    this.template = template;
    this.position = { x, z };
    this.runtimeId = runtimeId;
    this.state = 'IDLE';
    this.spawnCount += 1;
    this.node.isValid = true;
  }

  recycle() {
    this.state = 'RECYCLED';
  }

  getState() {
    return this.state;
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

const template = { type: 'cardboard', tier: 1, mass: 10, value: 1, radius: 0.3 };
const theme = { id: 'TEST', availableTiers: [1] };
const district = { kind: 'UNKNOWN', resourceClusters: [] };
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

const pool = new FakePool();
const procedural = makeCell();
procedural.populate([{ template, localX: 1, localZ: 2, customId: 'procedural-slot' }], pool, origin);
const absorbed = procedural.objects[0];
record('ABSORB_REMOVES_FROM_CELL', procedural.removeAbsorbedCollectible(absorbed, pool, 4), 'remove returned true');
record('ABSORB_REMOVES_AND_RETURNS_TO_POOL', procedural.objects.length === 0 && pool.getActiveCount() === 0, 'cell=0, pool.active=0');
procedural.advanceRespawnClock(3.99);
record('COOLDOWN_BLOCKS_RESPAWN', procedural.updateCollectibleRespawn(pool, origin, 0, 240) === 0, 'no respawn before four seconds');
procedural.advanceRespawnClock(0.01);
record('COOLDOWN_RESPAWNS_SLOT', procedural.updateCollectibleRespawn(pool, origin, 0, 240) === 1, 'one procedural slot respawned');
record('RESPAWN_REUSES_RUNTIME_ID', procedural.objects[0].runtimeId === 'procedural-slot', 'original slot id reused');

const tutorialStarterPoint = new FakeNode('SpawnPoint_Starter_1', [], { x: 12, y: 0, z: 13 });
const parkPoint = new FakeNode('SpawnPoint_Park_1', [], { x: 14, y: 0, z: 15 });
const citySquarePoint = new FakeNode('SpawnPoint_Square_1', [], { x: 16, y: 0, z: 17 });
const tutorialT2Point = new FakeNode('SpawnPoint_T2_1', [], { x: 18, y: 0, z: 19 });
const authored = makeCell(true, new FakeNode('Cell', [
  new FakeNode('CollectibleSpawnPoints', [
    new FakeNode('TutorialStarter', [tutorialStarterPoint]),
    new FakeNode('TutorialT2Target', [tutorialT2Point]),
    new FakeNode('Cluster_Park', [parkPoint]),
    new FakeNode('Cluster_CitySquare', [citySquarePoint]),
  ]),
]));
const authoredPool = new FakePool();
authored.populateAuthoredContent(authoredPool, origin);
const authoredObject = authored.objects.find((object) => object.runtimeId === 'cluster_TutorialStarter_0');
const authoredT2Object = authored.objects.find((object) => object.runtimeId === 'tutorial_t2_target');
record('TUTORIAL_STARTER_REGISTERED_AS_T1_SLOT', authoredObject?.template.tier === 1 && authoredObject.position.x === 12 && authoredObject.position.z === 13, 'TutorialStarter spawn point became a T1 respawn slot at its authored position');
record('CLUSTER_GROUPS_REGISTERED_AS_T1_SLOTS', authored.objects.filter((object) => object.template.tier === 1).length === 3, 'Cluster_Park and Cluster_CitySquare use T1 templates');
record('TUTORIAL_T2_TARGET_USES_AUTHORED_POINT', authoredT2Object?.template.tier === 2 && authoredT2Object.position.x === 18 && authoredT2Object.position.z === 19, 'TutorialT2Target uses its authored spawn point with a T2 template');
authored.removeAbsorbedCollectible(authoredObject, authoredPool, 4);
authored.removeAbsorbedCollectible(authoredT2Object, authoredPool, 4);
authored.advanceRespawnClock(4);
authored.updateCollectibleRespawn(authoredPool, origin, 0, 240);
authored.updateCollectibleRespawn(authoredPool, origin, 0, 240);
record('AUTHORED_SLOTS_RESPAWN', authored.objects.some((object) => object.runtimeId === 'cluster_TutorialStarter_0') && authored.objects.some((object) => object.runtimeId === 'tutorial_t2_target'), 'TutorialStarter and TutorialT2Target reuse regular authored respawn slots');

authored.recycle(authoredPool);
record('UNLOAD_CLEARS_OBJECTS_AND_SLOTS', authored.objects.length === 0 && authoredPool.getActiveCount() === 0, 'unload releases active objects and clears slot state');
authored.populateAuthoredContent(authoredPool, origin);
record('RELOAD_DOES_NOT_DUPLICATE', authored.objects.length === 4 && authoredPool.getActiveCount() === 4, 'reload recreates each authored slot once');

const fallbackAnchor = new FakeNode('ClusterAnchor_RecyclingSquare', [], { x: 22, y: 0, z: 23 });
const deferredAuthored = makeCell(true, new FakeNode('Cell', [
  new FakeNode('CollectibleSpawnPoints', [new FakeNode('TutorialStarter', [tutorialStarterPoint])]),
  fallbackAnchor,
]));
const deferredPool = new FakePool();
const warnings = [];
const originalWarn = console.warn;
console.warn = (message) => warnings.push(message);
try {
  deferredAuthored.populateAuthoredContent(deferredPool, origin);
} finally {
  console.warn = originalWarn;
}
const fallbackObject = deferredAuthored.objects.find((object) => object.runtimeId === 'tutorial_t2_target');
record('TUTORIAL_T2_DEFERRED_AUTHORING_FALLBACK', fallbackObject?.template.tier === 2 && fallbackObject.position.x === 22 && fallbackObject.position.z === 23 && warnings.some((message) => message.includes('DEFERRED_AUTHORING')), 'missing TutorialT2Target explicitly falls back to the named authored recycling-square anchor');

record(
  'NO_RUNTIME_GOLDEN_CITY_COORDINATE_TABLE',
  !['starterPositions', 'starter_recycling_cluster', 't2_target_bed_box'].some((legacyId) => authoredContentSource.includes(legacyId))
    && !/\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]/.test(authoredContentSource),
  'authored collectible placement has no legacy IDs or numeric position table',
);

const capped = makeCell();
const cappedPool = new FakePool();
capped.populate([
  { template, localX: 0, localZ: 0, customId: 'cap-a' },
  { template, localX: 1, localZ: 0, customId: 'cap-b' },
], cappedPool, origin);
for (const object of [...capped.objects]) capped.removeAbsorbedCollectible(object, cappedPool, 4);
capped.advanceRespawnClock(4.01);
record('GLOBAL_CAP_LIMITS_RESPAWN', capped.updateCollectibleRespawn(cappedPool, origin, 239, 240) === 1, 'one slot fills the final available global capacity');
record('GLOBAL_CAP_PREVENTS_OVERFLOW', capped.updateCollectibleRespawn(cappedPool, origin, 240, 240) === 0 && capped.objects.length === 1, 'second slot remains pending at cap');

console.log('[PASS] S1 deterministic resource replenishment contract (implementation-level, non-renderer).');
console.log('[NOTE] Cocos scene/runtime, visual density, and console-error evidence require acceptance:v2 and are not claimed here.');
