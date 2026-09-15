/** Deterministic S3 contract for the existing WorldStreamer lifecycle. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const streamerPath = path.join(root, 'cocos/assets/scripts/world/WorldStreamer.ts');
const managerPath = path.join(root, 'cocos/assets/scripts/world/InfiniteWorldManager.ts');
const streamerSource = fs.readFileSync(streamerPath, 'utf8').replace(/^import .*?;\r?\n/m, '').replace(/import type .*?;\r?\n/m, '');
const compiled = transformSync(streamerSource + '\nglobalThis.__WorldStreamer = WorldStreamer;', { loader: 'ts', target: 'es2022', format: 'iife' }).code;

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
}
globalThis.Vec3 = Vec3;
new Function(compiled)();
const WorldStreamer = globalThis.__WorldStreamer;
const assert = (condition, message) => { console.log('[' + (condition ? 'PASS' : 'FAIL') + '] ' + message); if (!condition) throw new Error(message); };
const cellKey = (x, z) => String(x) + ':' + String(z);
const streamer = new WorldStreamer({ cellSize: 64, activeRadius: 1, rebaseThreshold: 192 });
const active = new Set();
const loaded = [];
const unloaded = [];
function streamAt(x, z) {
  loaded.length = 0;
  unloaded.length = 0;
  streamer.stream(new Vec3(x, 0, z), active,
    (coord) => { const key = cellKey(coord.x, coord.z); active.add(key); loaded.push(key); },
    (key) => { active.delete(key); unloaded.push(key); });
}

streamAt(0, 0);
assert(active.size === 9, 'OPENING_LOADS_EXACT_3X3');
assert(active.has('0:0') && loaded.includes('0:0'), 'OPENING_CELL_PRESENT');
const initial = new Set(active);
streamAt(64, 0);
assert(active.size === 9 && active.has('1:0'), 'EAST_STREAM_KEEPS_3X3');
assert(unloaded.length === 3, 'EAST_UNLOADS_ONLY_EXITING_COLUMN');
assert([...initial].filter((key) => !active.has(key)).length === 3, 'EAST_HAS_NO_STALE_CELLS');
streamAt(-64, 0);
assert(active.size === 9 && active.has('-1:0') && active.has('0:0'), 'WEST_RELOADS_OPENING_3X3');
streamAt(0, 64);
assert(active.size === 9 && active.has('0:1'), 'NORTH_STREAM_KEEPS_3X3');
streamAt(0, -64);
assert(active.size === 9 && active.has('0:-1'), 'SOUTH_STREAM_KEEPS_3X3');
let callbackCount = 0;
const rebase = streamer.rebaseIfNeeded(new Vec3(200, 0, 0), () => { callbackCount += 1; });
assert(rebase !== null && callbackCount === 1, 'REBASE_TRIGGERED_PAST_THRESHOLD');
assert(rebase.shift.x === 192 && streamer.logicalOrigin.x === 192, 'REBASE_SHIFTS_BY_WHOLE_CELLS');
assert(streamer.rebaseIfNeeded(new Vec3(32, 0, 0), () => {}) === null, 'REBASE_STAYS_QUIET_WITHIN_THRESHOLD');
const managerSource = fs.readFileSync(managerPath, 'utf8');
assert(managerSource.includes('cell.recycle(this.objectPool!)'), 'MANAGER_UNLOAD_RECYCLES_CELL_CONTENT');
assert(managerSource.includes('cell.applyWorldRebase(rebase.shift)'), 'MANAGER_REBASES_CELL_CONTENT');
assert(managerSource.includes('slot.route.forEach') && managerSource.includes('slot.spawnX -= shift.x'), 'TRAFFIC_ROUTE_AND_ENTRY_REBASE_TOGETHER');
assert(managerSource.includes('this.collectibleSlots.length = 0') && managerSource.includes('this.trafficSlots.length = 0'), 'RECYCLE_CLEARS_RESPAWN_SLOTS');
console.log('[PASS] S3 deterministic cell lifecycle/rebase contract (implementation-level, non-renderer).');
console.log('[NOTE] Renderer traversal and console-error evidence require acceptance:v2 and are not claimed here.');
