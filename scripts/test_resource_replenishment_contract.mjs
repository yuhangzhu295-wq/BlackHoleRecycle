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
import { evaluateRenderProfileLiteral } from './lib/render_profile_literals.mjs';

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
// The production `ObjectTier` enum and `OBJECT_TEMPLATES` cover T1..T5 (pinned by
// test_collectible_production_contract.mjs). The authored cell now also runs the
// V4 aspirational pass, so the stub must expose the full ladder or that code path
// silently no-ops and cannot be covered.
globalThis.ObjectTier = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };
globalThis.OBJECT_TEMPLATES = [
  { type: 'test-cardboard', tier: 1, mass: 10, value: 1, radius: 0.3 },
  { type: 'test-bin', tier: 2, mass: 20, value: 2, radius: 0.4 },
  { type: 'test-chair', tier: 3, mass: 60, value: 6, radius: 0.7 },
  { type: 'test-sofa', tier: 4, mass: 160, value: 16, radius: 1.2 },
  { type: 'test-car', tier: 5, mass: 400, value: 40, radius: 2.0 },
];
// Engine boundary: InfiniteWorldManager imports its opening-cell composition
// data from RenderProfile. The harness compiles only the class slice, so the
// imports are absent and must be published as globals before evaluation. Both
// literals are the REAL production values, extracted rather than hand-copied so
// they cannot drift. `OPENING_EDIBLE_SPREAD` used to be stubbed `[]` because
// the real 14-entry spread broke census fixtures written before it existed;
// that meant the spread was completely untested here. The fixtures below now
// account for the real spread instead of excluding it, so the census covers
// production behaviour rather than a spread-free world that never ships.
const renderProfileSource = fs.readFileSync(
  path.join(rootDirectory, 'cocos/assets/scripts/core/RenderProfile.ts'), 'utf8',
);
globalThis.OPENING_CELL_COMPOSITION = evaluateRenderProfileLiteral(renderProfileSource, 'OPENING_CELL_COMPOSITION');
globalThis.OPENING_EDIBLE_SPREAD = evaluateRenderProfileLiteral(renderProfileSource, 'OPENING_EDIBLE_SPREAD');
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
    // Mirrors CompressibleObject.stateHistory: the ordered motion-state
    // transitions since the last entry into IDLE.
    this.stateHistory = [];
    this.spawnCount = 0;
  }

  spawn(template, x, z, scale, runtimeId) {
    this.template = template;
    this.position = { x, z };
    this.runtimeId = runtimeId;
    this.state = 'IDLE';
    this.stateHistory = ['IDLE'];
    this.spawnCount += 1;
    this.node.isValid = true;
  }

  /**
   * Mirrors CompressibleObject.transitionTo: a no-op transition is never
   * recorded, and re-entering IDLE starts a new lifecycle.
   */
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
// The entity is released to the pool the moment it is absorbed, so the authored
// slot is the only thing that outlives the event. Drive a real FSM sequence
// first and prove the slot captures its order: a runtime gate cannot read it
// from the entity afterwards, and the whole tier-1 attraction window is shorter
// than one full composition snapshot.
absorbed.setState('ATTRACTED');
absorbed.setState('SUCKING');
absorbed.setState('ABSORBED');
record('ABSORB_REMOVES_FROM_CELL', procedural.removeAbsorbedCollectible(absorbed, pool, 4), 'remove returned true');
record('ABSORB_RECORDS_FSM_ORDER',
  JSON.stringify(procedural.collectibleSlots[0].lastLifecycle) === JSON.stringify(['IDLE', 'ATTRACTED', 'SUCKING', 'ABSORBED']),
  'the authored slot keeps the ordered FSM sequence that produced the absorption');
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
// Count the authored cluster groups specifically. The real opening edible
// spread also registers T1 slots, so a bare `tier === 1` count is no longer a
// statement about the cluster groups; the predicate below is.
record('CLUSTER_GROUPS_REGISTERED_AS_T1_SLOTS', authored.objects.filter((object) => String(object.runtimeId).startsWith('cluster_') && object.template.tier === 1).length === 3, 'Cluster_Park and Cluster_CitySquare use T1 templates');
record('TUTORIAL_T2_TARGET_USES_AUTHORED_POINT', authoredT2Object?.template.tier === 2 && authoredT2Object.position.x === 18 && authoredT2Object.position.z === 19, 'TutorialT2Target uses its authored spawn point with a T2 template');
// The real opening edible spread is now exercised rather than stubbed away.
// Assert it exactly: one registered object per declared entry, each at its
// authored tier and position, so the spread's tier mix is covered by a gate.
const spreadObjectsById = new Map(authored.objects
  .filter((object) => String(object.runtimeId).startsWith('opening_edible_'))
  .map((object) => [object.runtimeId, object]));
const spreadTierCounts = globalThis.OPENING_EDIBLE_SPREAD.reduce((counts, entry) => {
  counts[entry.tier] = (counts[entry.tier] || 0) + 1;
  return counts;
}, {});
record('OPENING_EDIBLE_SPREAD_REGISTERED',
  spreadObjectsById.size === globalThis.OPENING_EDIBLE_SPREAD.length
  && globalThis.OPENING_EDIBLE_SPREAD.every((entry, index) => {
    const object = spreadObjectsById.get('opening_edible_' + index);
    return object
      && object.template.tier === entry.tier
      && Math.abs(object.position.x - entry.x) < 1e-9
      && Math.abs(object.position.z - entry.z) < 1e-9;
  })
  && [1, 2, 3].every((tier) => authored.objects
    .filter((object) => String(object.runtimeId).startsWith('opening_edible_') && object.template.tier === tier).length === (spreadTierCounts[tier] || 0)),
  'every one of the ' + globalThis.OPENING_EDIBLE_SPREAD.length + ' declared opening edible entries is registered at its authored tier and position, tier mix ' + JSON.stringify(spreadTierCounts));
authored.removeAbsorbedCollectible(authoredObject, authoredPool, 4);
authored.removeAbsorbedCollectible(authoredT2Object, authoredPool, 4);
authored.advanceRespawnClock(4);
authored.updateCollectibleRespawn(authoredPool, origin, 0, 240);
authored.updateCollectibleRespawn(authoredPool, origin, 0, 240);
record('AUTHORED_SLOTS_RESPAWN', authored.objects.some((object) => object.runtimeId === 'cluster_TutorialStarter_0') && authored.objects.some((object) => object.runtimeId === 'tutorial_t2_target'), 'TutorialStarter and TutorialT2Target reuse regular authored respawn slots');

authored.recycle(authoredPool);
record('UNLOAD_CLEARS_OBJECTS_AND_SLOTS', authored.objects.length === 0 && authoredPool.getActiveCount() === 0, 'unload releases active objects and clears slot state');
authored.populateAuthoredContent(authoredPool, origin);
// V4 gameplay-composition contract §5/§6. The authored prefab ships only T1/T2
// anchors, so the opening cell used to contain no T4/T5 collectible at all and
// "a low-level player must still SEE T4/T5 and be unable to swallow them" could
// not be satisfied. The authored cell now also exposes one T4-class and one
// T5-class aspirational target on its outer band.
const authoredAspirational = authored.objects.filter((object) => object.runtimeId.startsWith('aspirational_authored_'));
record('AUTHORED_CELL_EXPOSES_T4_T5_ASPIRATIONAL',
  authoredAspirational.length === 2
  && authoredAspirational.some((object) => object.template.tier === 4)
  && authoredAspirational.some((object) => object.template.tier === 5),
  'authored opening cell exposes exactly one T4 and one T5 aspirational target');
record('AUTHORED_ASPIRATIONAL_STAYS_OUTSIDE_TUTORIAL_RING',
  authoredAspirational.every((object) => Math.hypot(object.position.x, object.position.z) >= 12),
  'aspirational targets sit on the outer band, clear of the authored tutorial ring (radius <= 6m)');
// The reload total now includes the real spread. Assert the breakdown as well
// as the total, plus id uniqueness, so "each slot exactly once" is proven for
// every source rather than only the two that predate the spread.
const reloadedIds = authored.objects.map((object) => object.runtimeId);
const reloadedAuthoredCount = authored.objects.filter((object) => String(object.runtimeId).startsWith('cluster_') || object.runtimeId === 'tutorial_t2_target').length;
const reloadedAspirationalCount = authored.objects.filter((object) => String(object.runtimeId).startsWith('aspirational_authored_')).length;
const reloadedSpreadCount = authored.objects.filter((object) => String(object.runtimeId).startsWith('opening_edible_')).length;
const expectedReloadedTotal = 4 + 2 + globalThis.OPENING_EDIBLE_SPREAD.length;
record('RELOAD_DOES_NOT_DUPLICATE',
  authored.objects.length === expectedReloadedTotal
  && authoredPool.getActiveCount() === expectedReloadedTotal
  && reloadedAuthoredCount === 4
  && reloadedAspirationalCount === 2
  && reloadedSpreadCount === globalThis.OPENING_EDIBLE_SPREAD.length
  && new Set(reloadedIds).size === reloadedIds.length,
  'reload recreates each slot once and re-registers the real spread (4 authored + 2 aspirational + '
  + globalThis.OPENING_EDIBLE_SPREAD.length + ' spread = ' + expectedReloadedTotal + '), ids unique');

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
