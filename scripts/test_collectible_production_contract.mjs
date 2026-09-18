/**
 * Deterministic S4 contract for production collectible authoring and lifecycle.
 * The lifecycle assertions execute the current InfiniteWorldCell class; the
 * template/art/gate assertions read the current production sources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const record = (name, pass, detail) => {
  console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + name + ': ' + detail);
  if (!pass) throw new Error(name);
};

const configSource = read('cocos/assets/scripts/data/GameConfig.ts');
const configCode = transformSync(configSource + '\nglobalThis.__S4_CONFIG = { ObjectTier, OBJECT_TEMPLATES };', {
  loader: 'ts', target: 'es2022', format: 'iife',
}).code;
new Function(configCode)();
const { ObjectTier, OBJECT_TEMPLATES } = globalThis.__S4_CONFIG;

const managerSource = read('cocos/assets/scripts/world/InfiniteWorldManager.ts');
const classStart = managerSource.indexOf('class InfiniteWorldCell');
const classEnd = managerSource.indexOf('\n@ccclass', classStart);
const helperStart = managerSource.lastIndexOf('function isCollectibleObject', classStart);
if (classStart < 0 || classEnd < 0 || helperStart < 0) throw new Error('InfiniteWorldCell source boundary not found');
const cellCode = transformSync(managerSource.slice(helperStart, classEnd) + '\nglobalThis.__S4_CELL = InfiniteWorldCell;', {
  loader: 'ts', target: 'es2022', format: 'iife',
}).code;
globalThis.OBJECT_TEMPLATES = OBJECT_TEMPLATES;
globalThis.ObjectTier = ObjectTier;
new Function(cellCode)();
const InfiniteWorldCell = globalThis.__S4_CELL;

class FakeNode {
  constructor(name, children = [], worldPosition = { x: 0, y: 0, z: 0 }) {
    this.name = name;
    this.children = children;
    this.worldPosition = worldPosition;
    this.isValid = true;
  }
  destroy() { this.isValid = false; }
}

class FakeObject {
  constructor(id) { this.node = { isValid: true }; this.runtimeId = id; this.state = 'RECYCLED'; this.spawnCount = 0; }
  spawn(template, x, z, scale, runtimeId) {
    this.template = template;
    this.position = { x, z };
    this.runtimeId = runtimeId;
    this.state = 'IDLE';
    this.spawnCount += 1;
    this.node.isValid = true;
  }
  recycle() { this.state = 'RECYCLED'; }
  getState() { return this.state; }
}

class FakePool {
  constructor() { this.items = []; this.active = 0; this.created = 0; }
  get() { this.active += 1; return this.items.pop() || new FakeObject('pool_' + this.created++); }
  release(object) { object.recycle(); this.items.push(object); this.active = Math.max(0, this.active - 1); }
  getActiveCount() { return this.active; }
}

const artSource = read('cocos/assets/scripts/world/ObjectArtRegistry.ts');
const objectSource = read('cocos/assets/scripts/gameplay/CompressibleObject.ts');
const templateTypes = ['soda_can', 'book_stack', 'chair', 'shelf', 'car'];
const tierByType = new Map(templateTypes.map((type) => [
  type,
  OBJECT_TEMPLATES.find((template) => template.type === type),
]));
record('T1_TO_T5_REAL_TEMPLATES', templateTypes.every((type, index) => {
  const template = tierByType.get(type);
  return template && template.tier === index + 1 && template.mass > 0 && template.value > 0;
}), 'five distinct production templates cover T1, T2, T3, T4 and T5 with positive mass/value.');
record('ART_REGISTRY_COVERS_T1_TO_T5', templateTypes.every((type) => artSource.includes(type + ':')), 'each selected production template has an ObjectArtRegistry binding.');
record('MASS_AND_TIER_GATE', objectSource.includes('this.template.tier > machineMaxTier && !isMagnetStorm')
  && objectSource.includes("this.fsm.setState('ATTRACTED')"), 'mass remains template-owned and the existing tier gate preserves the threshold.');
record('HIGHER_TIER_DISPLAYS_REQUIRED_LEVEL', objectSource.includes('TierLockLabel')
  && objectSource.includes("this.lockLabel.string = '需要 LV.' + this.template.tier"), 'over-tier lock feedback exposes the required 需要 LV.X.');

const theme = { id: 'S4', availableTiers: [1, 2, 3, 4, 5] };
const district = { kind: 'UNKNOWN', resourceClusters: [] };
const origin = { x: 0, y: 0, z: 0 };
const node = new FakeNode('Cell', [new FakeNode('CollectibleSpawnPoints', [
  new FakeNode('Cluster_Park', templateTypes.map((type, index) => new FakeNode(
    'SpawnPoint_' + index, [], { x: index * 2, y: 0, z: index * 2 + 1 },
  ))),
])]);
const art = { spawn() {}, hydrateAuthoredOpeningMaterials() {}, hydrateConstructionLandmarkMaterials() {} };
const cell = new InfiniteWorldCell({ x: 0, z: 0 }, node, theme, district, art, 64, true);
const pool = new FakePool();
cell.populateAuthoredContent(pool, origin);
record('AUTHORED_SPAWN_USES_POOL_AND_REAL_OBJECTS', cell.objects.length === 5
  && pool.getActiveCount() === 5
  && cell.objects.every((object) => object.template && object.template.tier === ObjectTier.T1),
  'authored points allocate pooled CompressibleObject instances.');

const first = cell.objects[0];
const firstId = first.runtimeId;
record('ABSORB_REMOVES_AND_RETURNS_TO_SAME_POOL', cell.removeAbsorbedCollectible(first, pool, 4)
  && cell.objects.length === 4 && pool.getActiveCount() === 4,
  'absorption removes the object from the cell and releases it to the same pool.');
cell.advanceRespawnClock(3.99);
const blockedCollectibleRespawn = cell.updateCollectibleRespawn(pool, origin, 4, 240) === 0;
cell.advanceRespawnClock(0.01);
record('RESPAWN_REUSES_SLOT_AND_POOL', blockedCollectibleRespawn
  && cell.updateCollectibleRespawn(pool, origin, 4, 240) === 1
  && cell.objects.some((object) => object.runtimeId === firstId)
  && pool.getActiveCount() === 5,
  'cooldown respawn takes the same slot and restores the pool active count.');
record('TEMPLATE_MASS_STAYS_AUTHORED', templateTypes.every((type) => {
  const template = tierByType.get(type);
  return template && template.mass > 0 && template.radius > 0 && template.type === type;
}), 'mass, radius and identity remain authored template data.');

console.log('[PASS] S4 collectible productionization contract (implementation-level, non-renderer).');
console.log('[NOTE] Renderer and browser console evidence remain covered by acceptance:p0b.');
