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
globalThis.ObjectTier = { T1: 1 };
globalThis.OBJECT_TEMPLATES = [{ type: 'test-cardboard', tier: 1, mass: 10, value: 1, radius: 0.3 }];
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
const art = { spawn() {} };
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
record('COOLDOWN_BLOCKS_RESPAWN', procedural.updateCollectibleRespawn(3.99, pool, origin, 0, 240) === 0, 'no respawn before four seconds');
record('COOLDOWN_RESPAWNS_SLOT', procedural.updateCollectibleRespawn(0.01, pool, origin, 0, 240) === 1, 'one procedural slot respawned');
record('RESPAWN_REUSES_RUNTIME_ID', procedural.objects[0].runtimeId === 'procedural-slot', 'original slot id reused');

const authoredPoint = new FakeNode('SpawnPoint_0', [], { x: 12, y: 0, z: 13 });
const authored = makeCell(true, new FakeNode('Cell', [
  new FakeNode('CollectibleSpawnPoints', [new FakeNode('Cluster_A', [authoredPoint])]),
]));
const authoredPool = new FakePool();
authored.populateAuthoredContent(authoredPool, origin);
const authoredObject = authored.objects[0];
record('AUTHORED_SLOT_REGISTERED', authoredObject?.runtimeId === 'cluster_Cluster_A_0', 'authored spawn point became a respawn slot');
authored.removeAbsorbedCollectible(authoredObject, authoredPool, 4);
authored.updateCollectibleRespawn(4, authoredPool, origin, 0, 240);
record('AUTHORED_SLOT_RESPAWNS', authored.objects.length === 1 && authored.objects[0].runtimeId === 'cluster_Cluster_A_0', 'authored id and position slot reused');

authored.recycle(authoredPool);
record('UNLOAD_CLEARS_OBJECTS_AND_SLOTS', authored.objects.length === 0 && authoredPool.getActiveCount() === 0, 'unload releases active objects and clears slot state');
authored.populateAuthoredContent(authoredPool, origin);
record('RELOAD_DOES_NOT_DUPLICATE', authored.objects.length === 1 && authoredPool.getActiveCount() === 1, 'reload creates one authored object');

const capped = makeCell();
const cappedPool = new FakePool();
capped.populate([
  { template, localX: 0, localZ: 0, customId: 'cap-a' },
  { template, localX: 1, localZ: 0, customId: 'cap-b' },
], cappedPool, origin);
for (const object of [...capped.objects]) capped.removeAbsorbedCollectible(object, cappedPool, 4);
record('GLOBAL_CAP_LIMITS_RESPAWN', capped.updateCollectibleRespawn(4.01, cappedPool, origin, 239, 240) === 1, 'one slot fills the final available global capacity');
record('GLOBAL_CAP_PREVENTS_OVERFLOW', capped.updateCollectibleRespawn(0, cappedPool, origin, 240, 240) === 0 && capped.objects.length === 1, 'second slot remains pending at cap');

console.log('[PASS] S1 deterministic resource replenishment contract (implementation-level, non-renderer).');
console.log('[NOTE] Cocos scene/runtime, visual density, and console-error evidence require acceptance:v2 and are not claimed here.');
