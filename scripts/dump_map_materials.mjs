/**
 * Which material does each road/ground node in a map prefab actually carry?
 *
 * The live probe says `tile-low` renders with `mainTexture = null` (flat green)
 * and the road meshes render with a 512x512 atlas, but it reports material NAMES
 * and those come back empty for both. The prefab is what says whether the
 * material is an asset the project owns or one embedded in the GLB, and that
 * decides how the texture gets bound.
 *
 * Usage: node scripts/dump_map_materials.mjs [prefab]
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefabPath = process.argv[2]
  || path.join(repoRoot, 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab');

const doc = JSON.parse(readFileSync(prefabPath, 'utf8'));
const arr = Array.isArray(doc) ? doc : doc.data;

// uuid -> asset name, for everything under cocos/assets.
const names = new Map();
const walkDir = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.name.endsWith('.meta')) {
      try {
        const meta = JSON.parse(readFileSync(full, 'utf8'));
        if (meta.uuid) names.set(meta.uuid, entry.name.replace(/\.meta$/, ''));
      } catch { /* a meta we cannot read is not this tool's problem */ }
    }
  }
};
walkDir(path.join(repoRoot, 'cocos', 'assets'));

const materialOf = (renderer) => {
  const refs = renderer._materials || [];
  return refs.map((ref) => {
    const uuid = ref && ref.__uuid__;
    if (!uuid) return '(none)';
    return `${names.get(uuid) || uuid} [${uuid}]`;
  }).join(', ');
};

console.log(`${path.relative(repoRoot, prefabPath)}: ${arr.length} elements`);
const interesting = /road|tile|ground|cross/i;
for (const [index, obj] of arr.entries()) {
  if (!obj || obj.__type__ !== 'cc.Node') continue;
  if (!interesting.test(obj._name || '')) continue;
  const components = (obj._components || []).map((c) => arr[c.__id__]).filter(Boolean);
  const renderer = components.find((c) => c.__type__ === 'cc.MeshRenderer');
  if (!renderer) continue;
  console.log(`  node[${index}] ${obj._name} active=${obj._active} mesh=${JSON.stringify(renderer._mesh)}`);
  console.log(`    materials: ${materialOf(renderer)}`);
}

// Also list every .mtl in the project with its texture, so the report says what
// a material asset could carry without another round trip.
console.log('\nmaterial assets:');
const matDir = path.join(repoRoot, 'cocos', 'assets', 'game_art', 'materials');
for (const entry of readdirSync(matDir)) {
  if (!entry.endsWith('.mtl')) continue;
  const material = JSON.parse(readFileSync(path.join(matDir, entry), 'utf8'));
  const props = (material._props || [])[0] || {};
  const texture = props.mainTexture ? (props.mainTexture.__uuid__ || 'set') : 'null';
  const defines = JSON.stringify((material._defines || [])[0] || {});
  console.log(`  ${entry}: defines=${defines} mainTexture=${texture}`);
}
