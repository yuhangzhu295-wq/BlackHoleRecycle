/**
 * V7 PHASE 3: authored district map prefabs.
 *
 * The brief asks for six static `.scene` files. That is the wrong unit for this
 * game: the world is an infinite streaming X/Z grid, so a static scene would
 * fork the world into "streamed" and "hand-built" systems and break streaming.
 * The correct unit is an authored *cell prefab*, which `GoldenCityCell.prefab`
 * already proves for the opening cell. This generator writes one authored cell
 * prefab per `DistrictKind`, so every streamed cell can be instantiated from an
 * artist-editable asset instead of being generated in code.
 *
 * The seven district kinds are read from `DistrictTemplates.ts`; the six names
 * the brief asks for are used where they map:
 *
 *   Residential  Warehouse  Supermarket  Parking  Construction  CityCenter
 *   Park  (the seventh kind, `PARK`, added rather than dropped)
 *
 * Every uuid in the output is read from a real `.meta`/scene binding:
 *   * mesh uuids come from the live `Game.scene` `WorldArtLibrary` template
 *     nodes, so a re-export or re-import cannot leave a stale reference;
 *   * material uuids come from `game_art/materials/MAT_*.mtl.meta`, which
 *     Creator writes on import.
 *
 * The generator refuses to write a prefab whose mesh or material reference does
 * not resolve, and it refuses to write an "empty" map: each prefab must contain
 * ground, road, building/prop, collectible-spawn and traffic-anchor content.
 *
 * Collectible spawn groups and their `preferredTypes` come straight from
 * `DistrictTemplates.ts`, so the authored map carries the same gameplay
 * semantics the procedural generator used to synthesise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(repo, 'cocos');
const assets = path.join(cocos, 'assets');
const materialsDir = path.join(assets, 'game_art', 'materials');
const mapsDir = path.join(assets, 'game_art', 'maps');

// ---------------------------------------------------------------------------
// 1. Read the real data.
// ---------------------------------------------------------------------------

/** Evaluate an import-free data module and expose one of its bindings. */
function evaluateDataModule(relativePath, exportExpression, globalName) {
  const source = fs.readFileSync(path.join(assets, relativePath), 'utf8');
  const code = transformSync(`${source}\nglobalThis.${globalName} = ${exportExpression};`, {
    loader: 'ts',
    target: 'es2022',
    format: 'iife',
  }).code;
  new Function(code)();
  const value = globalThis[globalName];
  delete globalThis[globalName];
  if (!value) throw new Error(`[phase3] ${relativePath} did not expose ${exportExpression}`);
  return value;
}

/** `DistrictTemplates.ts` is pure data, so it is evaluated rather than parsed. */
function loadDistricts() {
  const districts = evaluateDataModule('scripts/world/DistrictTemplates.ts', 'DISTRICTS', '__PHASE3_DISTRICTS');
  const kinds = Object.keys(districts);
  if (kinds.length !== 7) throw new Error(`[phase3] expected 7 DistrictKind values, got ${kinds.length}`);
  return districts;
}

/** The real gameplay templates, so preferredTypes can be resolved to tiers. */
function loadObjectTemplates() {
  return evaluateDataModule('scripts/data/GameConfig.ts', 'OBJECT_TEMPLATES', '__PHASE3_TEMPLATES');
}

/** The real kind -> category material table, read from its declaration. */
function loadMaterialCategoryTable() {
  const source = fs.readFileSync(path.join(assets, 'scripts', 'world', 'WorldArtLibrary.ts'), 'utf8');
  const block = source.match(/const WORLD_ART_MATERIAL_CATEGORY[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('[phase3] could not parse WORLD_ART_MATERIAL_CATEGORY');
  const table = {};
  for (const match of block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) table[match[1]] = match[2];
  if (Object.keys(table).length < 40) throw new Error('[phase3] WORLD_ART_MATERIAL_CATEGORY looks truncated');
  return table;
}

/** uuid -> source path for every glTF in the project, plus mesh uuid -> source. */
function loadAssetIndex() {
  const byUuid = new Map();
  const meshToSource = new Map();
  const stack = [assets];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (!/\.(glb|gltf|fbx)\.meta$/.test(entry.name)) continue;
      const meta = JSON.parse(fs.readFileSync(full, 'utf8'));
      const sourcePath = path.relative(assets, full.replace(/\.meta$/, '')).split(path.sep).join('/');
      if (meta.uuid) byUuid.set(meta.uuid, sourcePath);
      for (const sub of Object.values(meta.subMetas || {})) {
        if (sub.importer === 'gltf-mesh' && sub.uuid) meshToSource.set(sub.uuid, sourcePath);
      }
    }
  }
  return { byUuid, meshToSource };
}

/** The authored category material uuid, from the .mtl.meta Creator wrote. */
function materialUuid(name) {
  const metaPath = path.join(materialsDir, name + '.mtl.meta');
  if (!fs.existsSync(metaPath)) throw new Error(`[phase3] missing ${name}.mtl.meta; Creator has not imported it.`);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.imported || !meta.uuid) throw new Error(`[phase3] ${name}.mtl was never imported by Creator.`);
  return meta.uuid;
}

/**
 * A `cc.MeshRenderer`'s `_materials` array has one entry per mesh *primitive*.
 * A single entry on a two-primitive mesh leaves the second slot without a
 * drawable material (the engine reports `valid: false`), which the opening cell
 * hides only because its runtime hydration rewrites every slot. District map
 * renderers must be valid on their own, so the primitive count is read from the
 * source glTF rather than assumed to be one.
 */
function primitiveCountForMesh(sourcePath, gltfIndex) {
  const absolute = path.join(assets, sourcePath);
  const buffer = fs.readFileSync(absolute);
  let gltf;
  if (sourcePath.endsWith('.gltf')) {
    gltf = JSON.parse(buffer.toString('utf8'));
  } else {
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x46546c67) throw new Error(`[phase3] ${sourcePath} is not a GLB container`);
    let offset = 12;
    gltf = null;
    while (offset + 8 <= buffer.length) {
      const chunkLength = buffer.readUInt32LE(offset);
      const chunkType = buffer.readUInt32LE(offset + 4);
      const data = buffer.subarray(offset + 8, offset + 8 + chunkLength);
      if (chunkType === 0x4e4f534a) { gltf = JSON.parse(data.toString('utf8')); break; }
      offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
    }
    if (!gltf) throw new Error(`[phase3] ${sourcePath} has no JSON chunk`);
  }
  const primitives = gltf.meshes?.[gltfIndex]?.primitives;
  return Array.isArray(primitives) && primitives.length > 0 ? primitives.length : 1;
}

/**
 * The live `Game.scene` `WorldArtLibrary` binding. Each `@property(Node)` names
 * the template node for one `WorldArtKind`; its subtree carries the real mesh
 * uuids and the per-part transforms, so cloning it reconstructs the authored
 * model rather than a single flattened primitive.
 */
function loadSceneTemplates() {
  const scene = JSON.parse(fs.readFileSync(path.join(assets, 'scenes', 'Game.scene'), 'utf8'));
  const component = scene.find((object) => object && typeof object === 'object' && 'roadStraightTemplate' in object);
  if (!component) throw new Error('[phase3] Game.scene has no WorldArtLibrary component');

  const readNode = (id) => {
    const node = scene[id];
    if (!node || node.__type__ !== 'cc.Node') throw new Error(`[phase3] scene id ${id} is not a node`);
    return {
      name: node._name,
      lpos: { x: node._lpos.x, y: node._lpos.y, z: node._lpos.z },
      lrot: { x: node._lrot.x, y: node._lrot.y, z: node._lrot.z, w: node._lrot.w },
      lscale: { x: node._lscale.x, y: node._lscale.y, z: node._lscale.z },
      euler: { x: node._euler.x, y: node._euler.y, z: node._euler.z },
      meshes: (node._components || [])
        .map((componentRef) => scene[componentRef.__id__])
        .filter((candidate) => candidate && candidate.__type__ === 'cc.MeshRenderer')
        .map((renderer) => renderer._mesh?.__uuid__)
        .filter(Boolean),
      children: (node._children || []).map((child) => readNode(child.__id__)),
    };
  };

  const templates = {};
  for (const [property, value] of Object.entries(component)) {
    if (!property.endsWith('Template') || !value || typeof value.__id__ !== 'number') continue;
    templates[property.slice(0, -'Template'.length)] = readNode(value.__id__);
  }
  if (Object.keys(templates).length !== 56) {
    throw new Error(`[phase3] expected 56 WorldArtKind templates, got ${Object.keys(templates).length}`);
  }
  return templates;
}

// ---------------------------------------------------------------------------
// 2. The authored map plan.
// ---------------------------------------------------------------------------

/**
 * Gameplay object type -> the authored world-art mesh that represents it. Used
 * to place one static "pile" prop at each resource cluster, so the authored map
 * visibly matches the district's declared resource semantics.
 */
const TYPE_TO_ART_KIND = {
  soda_can: 'sodaCan', water_bottle: 'waterBottle', battery: 'battery', toy: 'toyDuck',
  apple: 'apple', paper_ball: 'paperScrap', book_stack: 'bookStack', cardboard_box: 'cardboardBox',
  trash_bag: 'trashBag', paint_bucket: 'paintBucket', chair: 'chair', small_table: 'coffeeTable',
  monitor: 'monitor', tire: 'tire', shelf: 'shelf', crate: 'crate', sofa: 'sofa',
  container: 'shippingContainer', car: 'sedan', delivery_van: 'deliveryVan',
  garbage_truck: 'garbageTruck', cone: 'constructionCone',
};

/**
 * Per-district dressing. `group` is one of the authored cell's top-level
 * groups, which `WorldArtLibrary.hydrateAuthoredOpeningMaterials` already knows
 * how to material-hydrate. Landmark names are the exact node names the region
 * acceptance gate looks for, so an authored map stays visually equivalent to
 * the district it replaces.
 *
 * `scale` is either a number or `[x, y, z]`; `yaw` is degrees.
 */
const STREET_LIGHTS = [
  ['streetLight', 'DistrictStreetLight', -5.3, -5.5, 3.8, 0],
  ['streetLight', 'DistrictStreetLight', 5.3, -7.5, 3.8, 0],
  ['streetLight', 'DistrictStreetLight', -5.3, -15.5, 3.8, 0],
  ['streetLight', 'DistrictStreetLight', 5.3, -17.5, 3.8, 0],
];

const DISTRICT_PLAN = {
  RESIDENTIAL: {
    file: 'Residential',
    items: [
      ['buildings', 'buildingB', 'ResidentialHouseWest', -6.8, -10.5, 1.35, 90],
      ['buildings', 'buildingC', 'ResidentialHouseEast', 6.8, -10.5, 1.35, -90],
      ['buildings', 'commercialBuildingF', 'NeighbourhoodMarket', -3.9, -13.5, 1.25, 90],
      ['buildings', 'commercialBuildingG', 'NeighbourhoodClinic', 3.9, -13.5, 1.25, -90],
      ['buildings', 'commercialBuildingH', 'NeighbourhoodService', 0, -16.2, 1.2, 0],
      ['buildings', 'commercialSkyscraperA', 'ArenaSkylineWest', -7.4, -17.2, 1.1, 90],
      ['buildings', 'commercialSkyscraperB', 'ArenaSkylineEast', 7.4, -17.2, 1.1, -90],
      ['park', 'treeLarge', 'DistrictTreeLarge', -11.5, 5.2, 1.18, 0],
      ['park', 'treeSmall', 'DistrictTreeSmall', 11.5, 5.2, 1.18, 0],
      ['props', 'pathStones', 'ResidentialWalkway', -7.3, -14.5, [3.2, 1, 4.6], 90],
      ['props', 'fence', 'ResidentialFence', 7.3, -15.5, [3.2, 1.5, 3.8], 90],
      ['props', 'sedan', 'ResidentialParkedSedan', 3.1, -8.5, 1.35, -90],
      ...STREET_LIGHTS.map((entry) => ['props', ...entry]),
    ],
  },
  PARK: {
    file: 'Park',
    items: [
      ['park', 'parkTreeLarge', 'ParkTree', -9, -8, 1.0, 0],
      ['park', 'parkTreeLarge', 'ParkTree', 9, -8, 1.0, 0],
      ['park', 'parkTreeLarge', 'ParkTree', -9, 8, 1.0, 0],
      ['park', 'parkTreeLarge', 'ParkTree', 9, 8, 1.0, 0],
      ['park', 'parkFountain', 'ParkFountain', 0, -7, 1.15, 0],
      ['park', 'parkBench', 'ParkBench', -6, -7, 1.2, 70],
      ['park', 'parkBench', 'ParkBench', 6, -7, 1.2, -70],
      ['park', 'parkBench', 'ParkBench', -6, 5, 1.2, 110],
      ['park', 'parkBench', 'ParkBench', 6, 5, 1.2, -110],
      ['park', 'parkBush', 'ParkBush', -5, -12, 1.25, 0],
      ['park', 'parkBush', 'ParkBush', 5, -12, 1.25, 0],
      ['park', 'parkBush', 'ParkBush', -5, 11, 1.25, 0],
      ['park', 'parkBush', 'ParkBush', 5, 11, 1.25, 0],
      ['park', 'parkHedgeLong', 'ParkHedgeWest', -8.5, 0, 1.2, 90],
      ['park', 'parkHedgeLong', 'ParkHedgeEast', 8.5, 0, 1.2, 90],
      ['park', 'parkGrassTile', 'ParkGrassTile', -6, -1, [1.6, 1, 1.6], 0],
      ['park', 'parkGrassTile', 'ParkGrassTile', 0, -1, [1.6, 1, 1.6], 0],
      ['park', 'parkGrassTile', 'ParkGrassTile', 6, -1, [1.6, 1, 1.6], 0],
      ['park', 'parkGrassTile', 'ParkGrassTile', -6, -13, [1.6, 1, 1.6], 0],
      ['park', 'parkGrassTile', 'ParkGrassTile', 0, -13, [1.6, 1, 1.6], 0],
      ['park', 'parkGrassTile', 'ParkGrassTile', 6, -13, [1.6, 1, 1.6], 0],
      ['park', 'parkCobblePath', 'ParkCobbleWest', -3, -7, [1.2, 1, 1.2], 0],
      ['park', 'parkCobblePath', 'ParkCobbleEast', 3, -7, [1.2, 1, 1.2], 0],
      ['park', 'parkTree', 'ParkTreeCenter', 0, -13, 1.0, 0],
      ['props', 'pathStones', 'ParkWalkwayWest', -8, 0, [3.5, 1, 7.5], 90],
      ['props', 'pathStones', 'ParkWalkwayEast', 8, 0, [3.5, 1, 7.5], 90],
      ['props', 'fence', 'ParkFence', 0, 15, [4.5, 1.5, 4.5], 0],
      ...STREET_LIGHTS.map((entry) => ['props', ...entry]),
    ],
  },
  SUPERMARKET: {
    file: 'Supermarket',
    items: [
      ['buildings', 'commercialBuildingA', 'SupermarketBuilding', -8.8, -12, 2.5, 90],
      ['buildings', 'commercialBuildingD', 'SupermarketAnnex', 8.8, -12, 2.5, -90],
      ['props', 'deliveryVan', 'SupermarketDeliveryVan', -3.2, -7.6, 1.15, 90],
      ['props', 'sedan', 'SupermarketCustomerSedan', 3.2, -7.6, 1.2, -90],
      ['props', 'recyclingBox', 'SupermarketBoxStack', -8, 8, 1.1, 0],
      ...STREET_LIGHTS.map((entry) => ['props', ...entry]),
    ],
  },
  WAREHOUSE: {
    file: 'Warehouse',
    items: [
      ['props', 'shippingContainer', 'WarehouseContainerWest', -9, -10, 1.3, 90],
      ['props', 'shippingContainer', 'WarehouseContainerEast', 9, -10, 1.3, -90],
      ['props', 'shelf', 'WarehouseShelf', -8, 8, 1.15, 0],
      ['props', 'crate', 'WarehouseCrateStack', 8, 8, 1.15, 0],
      ['props', 'deliveryVan', 'WarehouseDeliveryVan', -3.3, -4.5, 1.15, 90],
      ['props', 'garbageTruck', 'WarehouseGarbageTruck', 3.3, -4.5, 1.15, -90],
      ['props', 'fence', 'WarehouseFence', 0, 15, [4.5, 1.5, 4.5], 0],
    ],
  },
  PARKING: {
    file: 'Parking',
    items: [
      ['props', 'sedan', 'ParkingSedanWest', -8, -9, 1.2, 90],
      ['props', 'sedan', 'ParkingSedanEast', 8, -9, 1.2, -90],
      ['props', 'deliveryVan', 'ParkingDeliveryVan', -8, 8, 1.15, 90],
      ['props', 'garbageTruck', 'ParkingGarbageTruck', 8, 8, 1.15, -90],
      ['buildings', 'commercialBuildingD', 'ParkingServiceBuilding', 0, -17, 2.2, 0],
      ...STREET_LIGHTS.map((entry) => ['props', ...entry]),
    ],
  },
  CONSTRUCTION: {
    file: 'Construction',
    items: [
      ['props', 'bulldozer', 'ConstructionBulldozer', -7, -8, 1.2, 90],
      ['props', 'shippingContainer', 'ConstructionContainer', 8, -10, 1.3, -90],
      ['props', 'crate', 'ConstructionCrateStack', -8, 8, 1.2, 0],
      ['props', 'garbageTruck', 'ConstructionHauler', 7, 8, 1.15, -90],
      ['props', 'fence', 'ConstructionFence', -3, 13, [3.8, 1.5, 3.8], 90],
      ['props', 'constructionCone', 'ConstructionCone', 3, 12, 4.5, 0],
      ['props', 'constructionCone', 'ConstructionCone', 6, 12, 4.5, 0],
      ['props', 'constructionCone', 'ConstructionCone', 3, -4, 4.5, 0],
      ['props', 'constructionCone', 'ConstructionCone', 6, -4, 4.5, 0],
    ],
  },
  DOWNTOWN: {
    file: 'CityCenter',
    items: [
      ['buildings', 'commercialBuildingA', 'DowntownShopWest', -9, -12, 2.65, 90],
      ['buildings', 'commercialBuildingD', 'DowntownShopEast', 9, -12, 2.65, -90],
      ['buildings', 'commercialBuildingD', 'DowntownTowerWest', -9, 10, 2.45, 90],
      ['buildings', 'commercialBuildingA', 'DowntownTowerEast', 9, 10, 2.45, -90],
      ['props', 'sedan', 'DowntownSedan', -3.5, -5, 1.2, 90],
      ['props', 'deliveryVan', 'DowntownDeliveryVan', 3.5, -5, 1.15, -90],
      ...STREET_LIGHTS.map((entry) => ['props', ...entry]),
    ],
  },
};

/** Top-level group -> the authored group name, matching the hydration table. */
const GROUP_NAMES = {
  ground: 'Ground',
  roads: 'Roads',
  buildings: 'Buildings',
  park: 'Park',
  props: 'Props',
};

/** The four road arms the authored-traffic route reads by name. */
const ROAD_ARMS = [
  { name: 'RoadNorth', x: 0, z: 16, yaw: 0 },
  { name: 'RoadSouth', x: 0, z: -16, yaw: 0 },
  { name: 'RoadWest', x: -16, z: 0, yaw: 90 },
  { name: 'RoadEast', x: 16, z: 0, yaw: 90 },
];

/** Two authored traffic anchors per map; the runtime drives them on the loop. */
const TRAFFIC_ANCHORS = [
  { name: 'VehicleAnchor_SedanWest', x: -12, z: 0 },
  { name: 'VehicleAnchor_DeliveryVanEast', x: 12, z: 0 },
];

const CLUSTER_SPAWN_OFFSETS = [
  [1.8, 0.2, 0.0],
  [-0.9, 0.2, 1.55],
  [-0.9, 0.2, -1.55],
];

// ---------------------------------------------------------------------------
// 3. Prefab serialisation (the exact shape Creator writes).
// ---------------------------------------------------------------------------

const FILE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Deterministic 22-char fileId, unique per seed within one prefab. */
function fileId(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  for (let index = 0; index < 22; index += 1) {
    hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5;
    hash = Math.imul(hash, 2654435761);
    out += FILE_ID_ALPHABET[Math.abs(hash) % 64];
  }
  return out;
}

const vec3 = (x, y, z) => ({ __type__: 'cc.Vec3', x, y, z });
const IDENTITY_ROT = { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 };
const yawQuat = (degrees) => {
  const half = (degrees * Math.PI) / 180 / 2;
  return { __type__: 'cc.Quat', x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
};
const scaleVec = (scale) => (Array.isArray(scale)
  ? vec3(scale[0], scale[1], scale[2])
  : vec3(scale, scale, scale));

function nodeSpec({ name, lpos = { x: 0, y: 0, z: 0 }, lrot = IDENTITY_ROT, lscale = { x: 1, y: 1, z: 1 }, euler = { x: 0, y: 0, z: 0 }, meshes = [], children = [], artKind = null }) {
  return { name, lpos, lrot, lscale, euler, meshes, children, artKind };
}

/** Deep-clone a template subtree, overriding only the placement transform/name. */
function placeTemplate(template, artKind, name, x, z, scale, yaw, height = 0) {
  const clone = JSON.parse(JSON.stringify(template));
  const apply = (node) => {
    node.meshes = node.meshes || [];
    node.children = node.children || [];
    // Every renderer in the cloned subtree belongs to the same authored kind, so
    // each part resolves the same category material as its placement root.
    node.artKind = artKind;
    node.children.forEach(apply);
  };
  apply(clone);
  clone.name = name;
  clone.artKind = artKind;
  clone.lpos = { x, y: height, z };
  clone.lrot = yawQuat(yaw);
  clone.euler = { x: 0, y: yaw, z: 0 };
  const resolved = scaleVec(scale);
  clone.lscale = resolved;
  return clone;
}

/**
 * Assign object indices in the same DFS order `emit` writes them: node, then
 * one (renderer, compPrefabInfo, bakeSettings) triple per mesh, then children,
 * then the node's PrefabInfo.
 */
function layout(spec, start) {
  spec.nodeId = start;
  let cursor = start + 1;
  spec.rendererIds = [];
  for (let index = 0; index < spec.meshes.length; index += 1) {
    spec.rendererIds.push(cursor);
    cursor += 3;
  }
  for (const child of spec.children) cursor = layout(child, cursor);
  spec.prefabInfoId = cursor;
  return cursor + 1;
}

function emit(objects, spec, parentId, seed, materialFor) {
  const componentIds = spec.rendererIds.map((rendererId) => ({ __id__: rendererId }));
  objects[spec.nodeId] = {
    __type__: 'cc.Node',
    _name: spec.name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parentId === null ? null : { __id__: parentId },
    _children: spec.children.map((child) => ({ __id__: child.nodeId })),
    _active: true,
    _components: componentIds,
    _prefab: { __id__: spec.prefabInfoId },
    _lpos: spec.lpos,
    _lrot: spec.lrot,
    _lscale: spec.lscale,
    _mobility: 0,
    _layer: 1073741824,
    _euler: spec.euler,
    _id: '',
  };
  spec.meshes.forEach((meshUuid, index) => {
    const rendererId = spec.rendererIds[index];
    const partSeed = `${seed}:${spec.name}:${index}`;
    // One material entry per mesh primitive: a shorter array leaves the extra
    // sub-mesh slots with no drawable material.
    const materialEntry = { __uuid__: materialFor(spec.artKind || 'prop'), __expectedType__: 'cc.Material' };
    const slots = meshPrimitiveCount(meshUuid);
    objects[rendererId] = {
      __type__: 'cc.MeshRenderer',
      _name: '',
      _objFlags: 0,
      __editorExtras__: {},
      node: { __id__: spec.nodeId },
      _enabled: true,
      __prefab: { __id__: rendererId + 1 },
      _materials: Array.from({ length: slots }, () => ({ ...materialEntry })),
      _visFlags: 0,
      bakeSettings: { __id__: rendererId + 2 },
      _mesh: { __uuid__: meshUuid, __expectedType__: 'cc.Mesh' },
      _shadowCastingMode: 0,
      _shadowReceivingMode: 1,
      _shadowBias: 0,
      _shadowNormalBias: 0,
      _reflectionProbeId: -1,
      _reflectionProbeBlendId: -1,
      _reflectionProbeBlendWeight: 0,
      _enabledGlobalStandardSkinObject: false,
      _enableMorph: true,
      _id: '',
    };
    objects[rendererId + 1] = { __type__: 'cc.CompPrefabInfo', fileId: fileId(partSeed + ':comp') };
    objects[rendererId + 2] = {
      __type__: 'cc.ModelBakeSettings',
      texture: null,
      uvParam: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
      _bakeable: false,
      _castShadow: false,
      _receiveShadow: false,
      _recieveShadow: false,
      _lightmapSize: 64,
      _useLightProbe: false,
      _bakeToLightProbe: true,
      _reflectionProbeType: 0,
      _bakeToReflectionProbe: true,
    };
  });
  objects[spec.prefabInfoId] = {
    __type__: 'cc.PrefabInfo',
    root: { __id__: 1 },
    asset: { __id__: 0 },
    fileId: fileId(seed + ':' + spec.name + ':node'),
    instance: null,
    targetOverrides: null,
    nestedPrefabInstanceRoots: null,
  };
  for (const child of spec.children) emit(objects, child, spec.nodeId, seed, materialFor);
}

function buildPrefab(name, rootSpec, materialFor) {
  // Index 0 is the cc.Prefab and index 1 is the root node it points at.
  const end = layout(rootSpec, 1);
  const objects = new Array(end);
  objects[0] = {
    __type__: 'cc.Prefab',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  };
  emit(objects, rootSpec, null, name, materialFor);
  return objects;
}

// ---------------------------------------------------------------------------
// 4. Build the seven district maps.
// ---------------------------------------------------------------------------

const districts = loadDistricts();
const objectTemplates = loadObjectTemplates();
const materialCategories = loadMaterialCategoryTable();
const sceneTemplates = loadSceneTemplates();
const assetIndex = loadAssetIndex();

const MATERIAL_UUIDS = {
  grass: materialUuid('MAT_GRASS'),
  road: materialUuid('MAT_ROAD'),
  building: materialUuid('MAT_BUILDING'),
  vegetation: materialUuid('MAT_VEGETATION'),
  vehicle: materialUuid('MAT_VEHICLE'),
  prop: materialUuid('MAT_PROP'),
  metal: materialUuid('MAT_METAL'),
};

/** Every mesh uuid the scene templates can emit, for dangling-reference checks. */
const knownMeshUuids = new Set();
for (const template of Object.values(sceneTemplates)) {
  const visit = (node) => { node.meshes.forEach((uuid) => knownMeshUuids.add(uuid)); node.children.forEach(visit); };
  visit(template);
}

const primitiveCountCache = new Map();
/** Mesh sub-asset uuid -> its primitive count, read from the source glTF. */
function meshPrimitiveCount(meshUuid) {
  const cached = primitiveCountCache.get(meshUuid);
  if (cached !== undefined) return cached;
  const source = assetIndex.meshToSource.get(meshUuid);
  if (!source) throw new Error(`[phase3] mesh ${meshUuid} does not resolve to a glTF source`);
  const meta = JSON.parse(fs.readFileSync(path.join(assets, source + '.meta'), 'utf8'));
  const sub = Object.values(meta.subMetas || {}).find((entry) => entry.uuid === meshUuid);
  const gltfIndex = sub?.userData?.gltfIndex ?? 0;
  const count = primitiveCountForMesh(source, gltfIndex);
  primitiveCountCache.set(meshUuid, count);
  return count;
}

function materialFor(kind) {
  const category = materialCategories[kind];
  const uuid = category ? MATERIAL_UUIDS[category] : null;
  if (!uuid) throw new Error(`[phase3] no authored material for kind ${kind} (category ${category})`);
  return uuid;
}

/** Ground + road network shared by every district. */
function buildCommonGroups() {
  // Ground and crossroad are FLAT tiles: their local mesh is a thin slab
  // (~0.02 m tall), so the X/Z footprint scale must never be applied to Y.
  // A scalar `32` is expanded by `scaleVec` to (32, 32, 32), which turns the
  // 0.02 m tile into a 0.64 m slab that swallows the player (body y 0.13-0.19),
  // the contact shadows (y 0.10), every collectible and every low prop. The
  // authored opening cell already uses (32, 1, 32) for exactly this reason; the
  // district maps must match it. Same for the 16x crossroad: (16, 1, 16).
  const ground = nodeSpec({
    name: GROUP_NAMES.ground,
    children: [
      placeTemplate(sceneTemplates.terrainTile, 'terrainTile', 'GroundTile_1', -16, -16, [32, 1, 32], 0, 0.01),
      placeTemplate(sceneTemplates.terrainTile, 'terrainTile', 'GroundTile_2', 16, -16, [32, 1, 32], 0, 0.01),
      placeTemplate(sceneTemplates.terrainTile, 'terrainTile', 'GroundTile_3', -16, 16, [32, 1, 32], 0, 0.01),
      placeTemplate(sceneTemplates.terrainTile, 'terrainTile', 'GroundTile_4', 16, 16, [32, 1, 32], 0, 0.01),
    ],
  });
  const roads = nodeSpec({
    name: GROUP_NAMES.roads,
    children: [
      placeTemplate(sceneTemplates.roadCrossroad, 'roadCrossroad', 'MainCrossroad', 0, 0, [16, 1, 16], 0, 0.05),
      ...ROAD_ARMS.map((arm) => placeTemplate(sceneTemplates.roadStraight, 'roadStraight', arm.name, arm.x, arm.z, [12, 1, 16], arm.yaw, 0.05)),
    ],
  });
  return { ground, roads };
}

/** One authored cluster group per declared `resourceCluster`. */
function buildClusterGroups(district) {
  const groups = [];
  for (const cluster of district.resourceClusters) {
    const [centerX, centerZ] = cluster.center;
    const spawnPoints = CLUSTER_SPAWN_OFFSETS.map(([dx, y, dz], index) => nodeSpec({
      name: `SpawnPoint_${index + 1}`,
      lpos: { x: centerX + dx, y, z: centerZ + dz },
    }));
    // A static authored prop so the map visibly carries the cluster's declared
    // resource semantics, not just an invisible spawn marker.
    const artKind = cluster.preferredTypes.map((type) => TYPE_TO_ART_KIND[type]).find(Boolean);
    if (artKind && sceneTemplates[artKind]) {
      spawnPoints.push(placeTemplate(sceneTemplates[artKind], artKind, `ClusterProp_${cluster.id}`, centerX, centerZ, 1, 0, 0.05));
    }
    groups.push(nodeSpec({ name: cluster.id, children: spawnPoints }));
  }
  return groups;
}

function buildDistrictRoot(kind) {
  const plan = DISTRICT_PLAN[kind];
  const district = districts[kind];
  if (!plan) throw new Error(`[phase3] no authored plan for district ${kind}`);
  const { ground, roads } = buildCommonGroups();

  const grouped = { buildings: [], park: [], props: [] };
  for (const [group, artKind, name, x, z, scale, yaw] of plan.items) {
    const template = sceneTemplates[artKind];
    if (!template) throw new Error(`[phase3] ${kind}: unknown WorldArtKind ${artKind}`);
    grouped[group].push(placeTemplate(template, artKind, name, x, z, scale, yaw));
  }

  const traffic = nodeSpec({
    name: 'TrafficRoutes',
    children: TRAFFIC_ANCHORS.map((anchor) => nodeSpec({
      name: anchor.name,
      lpos: { x: anchor.x, y: 0.1, z: anchor.z },
    })),
  });
  const clusters = nodeSpec({ name: 'CollectibleSpawnPoints', children: buildClusterGroups(district) });

  return nodeSpec({
    name: plan.file,
    children: [
      ground,
      roads,
      nodeSpec({ name: GROUP_NAMES.buildings, children: grouped.buildings }),
      nodeSpec({ name: GROUP_NAMES.park, children: grouped.park }),
      nodeSpec({ name: GROUP_NAMES.props, children: grouped.props }),
      traffic,
      clusters,
    ],
  });
}

/** Refuse to write a prefab whose asset references do not resolve. */
function auditPrefab(kind, objects) {
  const meshRefs = new Set();
  const materialRefs = new Set();
  const materialUuidSet = new Set(Object.values(MATERIAL_UUIDS));
  for (const object of objects) {
    if (!object || object.__type__ !== 'cc.MeshRenderer') continue;
    const meshUuid = object._mesh?.__uuid__;
    if (!meshUuid || !knownMeshUuids.has(meshUuid)) {
      throw new Error(`[phase3] ${kind}: dangling mesh reference ${meshUuid}`);
    }
    if (!assetIndex.meshToSource.has(meshUuid)) {
      throw new Error(`[phase3] ${kind}: mesh ${meshUuid} does not resolve to a glTF .meta`);
    }
    const expectedSlots = meshPrimitiveCount(meshUuid);
    if (!Array.isArray(object._materials) || object._materials.length < expectedSlots) {
      throw new Error(`[phase3] ${kind}: mesh ${meshUuid} needs ${expectedSlots} material slot(s), got ${object._materials?.length}`);
    }
    for (const slot of object._materials) {
      if (!slot?.__uuid__ || !materialUuidSet.has(slot.__uuid__)) {
        throw new Error(`[phase3] ${kind}: dangling material reference ${slot?.__uuid__}`);
      }
      materialRefs.add(slot.__uuid__);
    }
    meshRefs.add(meshUuid);
  }
  const nodes = objects.filter((object) => object && object.__type__ === 'cc.Node');
  const rendererCount = objects.filter((object) => object && object.__type__ === 'cc.MeshRenderer').length;
  const names = new Set(nodes.map((node) => node._name));
  const requiredGroups = [GROUP_NAMES.ground, GROUP_NAMES.roads, GROUP_NAMES.buildings, GROUP_NAMES.park, GROUP_NAMES.props, 'TrafficRoutes', 'CollectibleSpawnPoints'];
  for (const group of requiredGroups) {
    if (!names.has(group)) throw new Error(`[phase3] ${kind}: missing required group ${group}`);
  }
  if (nodes.filter((node) => node._name === 'SpawnPoint_1').length === 0) {
    throw new Error(`[phase3] ${kind}: no authored collectible spawn points`);
  }
  if (![...names].some((name) => name.startsWith('VehicleAnchor_'))) {
    throw new Error(`[phase3] ${kind}: no authored traffic anchors`);
  }
  if (meshRefs.size === 0) throw new Error(`[phase3] ${kind}: prefab has no mesh content`);
  return {
    nodes: nodes.length,
    renderers: rendererCount,
    distinctMeshes: meshRefs.size,
    materials: [...materialRefs].length,
    spawnGroups: nodes.filter((node) => districts[kind].resourceClusters.some((cluster) => cluster.id === node._name)).length,
    spawnPoints: nodes.filter((node) => node._name.startsWith('SpawnPoint_')).length,
    trafficAnchors: nodes.filter((node) => node._name.startsWith('VehicleAnchor_')).length,
    landmarks: nodes.map((node) => node._name).filter((name) => DISTRICT_PLAN[kind].items.some((item) => item[2] === name)),
  };
}

const KIND_ORDER = ['RESIDENTIAL', 'PARK', 'SUPERMARKET', 'WAREHOUSE', 'PARKING', 'CONSTRUCTION', 'DOWNTOWN'];

fs.mkdirSync(mapsDir, { recursive: true });
const manifest = {
  schemaVersion: 1,
  generatedBy: 'scripts/v7_phase3_maps.mjs',
  note: 'Authored district cell prefabs. Generated from DistrictTemplates.ts, WorldArtLibrary.ts, '
    + 'Game.scene and the imported MAT_*.mtl assets. Do not hand-edit; re-run the generator instead.',
  districts: {},
};

for (const kind of KIND_ORDER) {
  const plan = DISTRICT_PLAN[kind];
  const rootSpec = buildDistrictRoot(kind);
  const objects = buildPrefab(plan.file, rootSpec, materialFor);
  const audit = auditPrefab(kind, objects);
  const file = path.join(mapsDir, plan.file + '.prefab');
  fs.writeFileSync(file, JSON.stringify(objects, null, 2) + '\n', 'utf8');
  manifest.districts[kind] = {
    prefab: `maps/${plan.file}`,
    file: path.relative(assets, file).split(path.sep).join('/'),
    ...audit,
  };
  console.log(`${kind} -> maps/${plan.file}.prefab  nodes=${audit.nodes} renderers=${audit.renderers} `
    + `materials=${audit.materials} clusters=${audit.spawnGroups} spawnPoints=${audit.spawnPoints} anchors=${audit.trafficAnchors}`);
}

const manifestFile = path.join(mapsDir, 'manifest.json');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('wrote ' + path.relative(repo, manifestFile).split(path.sep).join('/')
  + ` (${Object.keys(manifest.districts).length} districts)`);
