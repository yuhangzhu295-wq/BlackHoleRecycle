/**
 * V7 PHASE 1: write ArtBootstrap.prefab, the thing that makes the materials ship.
 *
 * A .material file sitting in a bundle folder is NOT enough. In Cocos an asset
 * is packed into a bundle only when something inside that bundle depends on it,
 * which is why the previous attempt produced eight .material files that appeared
 * in no bundle. This prefab is the dependency: each category child holds an
 * ArtMaterialReference whose @property(Material) slots point at the real
 * material uuids.
 *
 * The uuids are read from the .meta files Creator writes on import. This script
 * therefore must run AFTER a Creator import pass, and it refuses to write a
 * prefab with dangling references rather than shipping a silently broken asset.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compressUuid } from './lib/cocos_uuid.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(repo, 'cocos');
const materialsDir = path.join(cocos, 'assets', 'game_art', 'materials');
const outDir = path.join(cocos, 'assets', 'game_art');
const scriptMeta = path.join(cocos, 'assets', 'scripts', 'core', 'ArtMaterialReference.ts.meta');

/**
 * The reference children, each bound to one category material.
 *
 * The brief names seven (grass, road, building, vehicle, metal, blackhole,
 * prop). Vegetation is the eighth: trees, hedges and flowerbeds are a distinct
 * visual category that `WORLD_PALETTE` already tints separately from grass, and
 * leaving it unbound would silently push every tree back onto the runtime
 * material path this prefab exists to retire.
 */
const REFERENCE_NODES = [
  { node: 'GrassReference', property: 'grass', material: 'MAT_GRASS' },
  { node: 'RoadReference', property: 'road', material: 'MAT_ROAD' },
  { node: 'BuildingReference', property: 'building', material: 'MAT_BUILDING' },
  { node: 'VegetationReference', property: 'vegetation', material: 'MAT_VEGETATION' },
  { node: 'VehicleReference', property: 'vehicle', material: 'MAT_VEHICLE' },
  { node: 'MetalReference', property: 'metal', material: 'MAT_METAL' },
  { node: 'BlackholeReference', property: 'blackhole', material: 'MAT_BLACKHOLE' },
  { node: 'PropReference', property: 'prop', material: 'MAT_PROP' },
];

/** Read the uuid Creator assigned, or null if the asset was never imported. */
function readUuid(materialName) {
  const metaPath = path.join(materialsDir, materialName + '.mtl.meta');
  if (!existsSync(metaPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (!meta.imported) return null;
  return meta.uuid || null;
}

const nodes = REFERENCE_NODES.map((entry) => ({ ...entry, uuid: readUuid(entry.material) }));
const missing = nodes.filter((entry) => !entry.uuid);

if (missing.length) {
  console.error('Creator has not imported these materials yet:');
  for (const entry of missing) console.error('  - ' + entry.material + ' (no imported .meta)');
  console.error('\nOpen cocos/ in Creator 3.8.3 and let it import, then re-run.');
  process.exit(1);
}

/**
 * A component's `__type__` is the script's COMPRESSED uuid, not its class name.
 * Writing the class name makes Creator log `Script "..." is missing or invalid`
 * and drop the component (leaving `_components: [null]`), which silently
 * destroys the material references this prefab exists to hold.
 */
if (!existsSync(scriptMeta)) {
  console.error('Creator has not imported ArtMaterialReference.ts yet (no .meta).');
  console.error('Open cocos/ in Creator 3.8.3 and let it import, then re-run.');
  process.exit(1);
}
const scriptUuid = JSON.parse(readFileSync(scriptMeta, 'utf8')).uuid;
if (!scriptUuid) {
  console.error('ArtMaterialReference.ts.meta has no uuid; Creator has not imported it.');
  process.exit(1);
}
const scriptType = compressUuid(scriptUuid);

/**
 * A flat asset array, the same shape Creator writes for every .prefab in this
 * repository: root Prefab, then one Node + PrefabInfo + CompPrefabInfo +
 * component group per child.
 */
const objects = [];

// 0: the prefab root.
objects.push({
  __type__: 'cc.Prefab',
  _name: 'ArtBootstrap',
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  data: { __id__: 1 },
  optimizationPolicy: 0,
  persistent: false,
});

// 1: ArtReferenceRoot.
const childIds = nodes.map((_, index) => 2 + index * 4);
objects.push({
  __type__: 'cc.Node',
  _name: 'ArtReferenceRoot',
  _objFlags: 0,
  __editorExtras__: {},
  _parent: null,
  _children: childIds.map((id) => ({ __id__: id })),
  _active: true,
  _components: [],
  _prefab: { __id__: 2 + nodes.length * 4 },
  _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
  _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
  _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
  _mobility: 0,
  _layer: 1073741824,
  _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
});

nodes.forEach((entry, index) => {
  const nodeId = 2 + index * 4;
  const prefabInfoId = nodeId + 1;
  const compPrefabInfoId = nodeId + 2;
  const componentId = nodeId + 3;
  const rootPrefabInfoId = 2 + nodes.length * 4;

  objects.push({
    __type__: 'cc.Node',
    _name: entry.node,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: { __id__: 1 },
    _children: [],
    _active: true,
    _components: [{ __id__: componentId }],
    _prefab: { __id__: prefabInfoId },
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
    _mobility: 0,
    _layer: 1073741824,
    _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
  });

  objects.push({
    __type__: 'cc.PrefabInfo',
    asset: { __id__: 0 },
    fileId: '',
    instance: null,
    target: { __id__: nodeId },
    rootPrefabInfo: { __id__: rootPrefabInfoId },
    nestedPrefabInstanceRoots: [],
  });

  objects.push({
    __type__: 'cc.CompPrefabInfo',
    fileId: '',
    instance: null,
    target: { __id__: componentId },
    inlined: false,
    nestedPrefabInstanceRoots: [],
  });

  // Only the one category this node owns is bound; the rest stay null.
  const slots = {};
  for (const other of REFERENCE_NODES) slots[other.property] = null;
  slots[entry.property] = { __uuid__: entry.uuid, __expectedType__: 'cc.Material' };

  objects.push({
    __type__: scriptType,
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    __prefab: { __id__: compPrefabInfoId },
    node: { __id__: nodeId },
    _enabled: true,
    ...slots,
    _id: '',
  });
});

// Root prefab info, last.
objects.push({
  __type__: 'cc.PrefabInfo',
  asset: { __id__: 0 },
  fileId: '',
  instance: null,
  target: { __id__: 1 },
  rootPrefabInfo: null,
  nestedPrefabInstanceRoots: [],
});

mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'ArtBootstrap.prefab');
writeFileSync(outFile, JSON.stringify(objects, null, 2) + '\n', 'utf8');

console.log('wrote ' + path.relative(repo, outFile) + ' with ' + nodes.length + ' material references:');
for (const entry of nodes) console.log('  ' + entry.node + ' -> ' + entry.material + ' (' + entry.uuid + ')');
console.log('\nCreator must import this prefab too; then it will pull the materials into the game-art bundle.');
