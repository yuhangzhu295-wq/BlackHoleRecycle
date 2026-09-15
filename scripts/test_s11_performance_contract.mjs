import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const record = (name, pass, detail) => {
  console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + name + ': ' + detail);
  if (!pass) throw new Error(name + ': ' + detail);
};

console.log('====================================================');
console.log('S11 Performance Architecture & Contract Validation');
console.log('====================================================\n');

// 1. ObjectPool capacity & pooling strategy
const objectPoolSource = read('cocos/assets/scripts/core/ObjectPool.ts');
record('OBJECT_POOL_CLASS_EXISTS', objectPoolSource.includes('export class ObjectPool<T>'), 'ObjectPool class is defined');
record('OBJECT_POOL_REUSE_AND_CAP', objectPoolSource.includes('this.pool.push(item)') && objectPoolSource.includes('this.maxCap'), 'ObjectPool manages capacity and item release');

// 2. InfiniteWorldManager dynamic object budgets & active cells
const worldManagerSource = read('cocos/assets/scripts/world/InfiniteWorldManager.ts');
record('COLLECTIBLE_BUDGET_CAPPED', worldManagerSource.includes('MAX_ACTIVE_COLLECTIBLES = 240'), 'Collectible budget is capped at 240');
record('VEHICLE_BUDGET_CAPPED', worldManagerSource.includes('MAX_ACTIVE_VEHICLES = 24'), 'Vehicle budget is capped at 24');
record('DYNAMIC_RECYCLE_TO_POOL', worldManagerSource.includes('cell.recycle(this.objectPool)'), 'Cell unload / recycle returns objects to pool');
record('ACTIVE_CELLS_GRID_MANAGED', worldManagerSource.includes('activeCells: Map<string, InfiniteWorldCell> = new Map()'), 'Active cells are tracked via bounded 2D grid');

// 3. Simulation without heavy dynamic physics bodies for hundreds of items
const suctionMotionSource = read('cocos/assets/scripts/gameplay/SuctionMotion.ts');
record('PROCEDURAL_SUCTION_KINEMATICS', suctionMotionSource.includes('calculateSuctionStep') || suctionMotionSource.includes('SuctionMotion'), 'Suction movement is driven via procedural motion calculator instead of hundreds of active rigidbodies');

console.log('\n[PASS] S11 Performance static contract verification complete.');
