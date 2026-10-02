/**
 * V7 PHASE 2C: the `game_art/prefabs/` category tree.
 *
 * The brief asks for a real prefab tree (blackhole / vehicles / buildings /
 * props / collectibles) populated with runtime-loadable prefabs. It also
 * forbids 56 duplicate prefabs: the per-kind world geometry already exists as
 * authored glTF templates bound in `Game.scene`'s `WorldArtLibrary`, so a copy
 * per kind would be pure drift.
 *
 * What this writes instead:
 *
 *   1. One REAL prefab per category. Each is a normal `cc.Prefab` whose
 *      `cc.MeshRenderer` references the authored mesh sub-asset by uuid and the
 *      authored category `.mtl` by uuid. Nothing is generated geometry: the
 *      mesh uuids are read out of the source asset's own `.meta` and the
 *      material uuids out of `game_art/materials/MAT_*.mtl.meta`, so a
 *      re-export or a re-import updates this generator's output automatically.
 *
 *   2. `prefabs/manifest.json`, the identity map the brief asks for: every
 *      `ArtRegistry` artId and every `WorldArtKind` resolved to the authored
 *      asset that actually renders it. It is generated from the live data —
 *      `ArtRegistry.ts` is evaluated, `WorldArtLibrary.ts`'s `WorldArtKind`
 *      union is read, and the kind -> asset binding is derived from the real
 *      `Game.scene` template nodes by following their `_mesh` uuids back to the
 *      GLB that owns them. Hand-typing any of that would let it drift.
 *
 * The blackhole wrapper references the GLB's seven mesh sub-assets directly
 * (same bundle) plus the standalone `MAT_BLACKHOLE`. That is the honest answer
 * to "does the singularity need a wrapper prefab": the GLB-derived prefab
 * (`blackhole/SingularityVortex/SingularityVortex`) is real and loadable, but it
 * references only materials embedded inside the GLB. The wrapper is the asset
 * that references the authored `MAT_BLACKHOLE` material, which is what the
 * brief asks the blackhole category to contain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(repo, 'cocos');
const assets = path.join(cocos, 'assets');
const prefabsRoot = path.join(assets, 'game_art', 'prefabs');
const materialsDir = path.join(assets, 'game_art', 'materials');

// ---------------------------------------------------------------------------
// 1. Read the real registries.
// ---------------------------------------------------------------------------

/** ArtRegistry.ts is pure data with no imports, so it can be evaluated as-is. */
function loadArtEntries() {
  const source = fs.readFileSync(path.join(assets, 'scripts', 'core', 'ArtRegistry.ts'), 'utf8');
  const code = transformSync(
    source + '\nglobalThis.__ART = { getArtEntries, ART_CATEGORIES };',
    { loader: 'ts', target: 'es2022', format: 'iife' },
  ).code;
  new Function(code)();
  const registry = globalThis.__ART;
  if (!registry || typeof registry.getArtEntries !== 'function') {
    throw new Error('[phase2c] ArtRegistry.ts did not expose getArtEntries()');
  }
  return registry;
}

/** The WorldArtKind union, read from its declaration rather than re-listed. */
function loadWorldArtKinds() {
  const source = fs.readFileSync(path.join(assets, 'scripts', 'world', 'WorldArtLibrary.ts'), 'utf8');
  const match = source.match(/export type WorldArtKind =\r?\n([\s\S]*?);/);
  if (!match) throw new Error('[phase2c] Could not parse the WorldArtKind union');
  return match[1].split('|').map((entry) => entry.trim().replace(/'/g, '')).filter(Boolean);
}

/**
 * uuid -> asset path (relative to `cocos/assets`), for every glTF source in the
 * project. Also mesh sub-asset uuid -> source path, so a `_mesh` reference can
 * be traced back to the file that owns it.
 */
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

/** Mesh sub-asset uuid of a named mesh inside a source glTF, from its .meta. */
function meshUuid(metaPath, meshName) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const sub = Object.values(meta.subMetas || {}).find(
    (entry) => entry.importer === 'gltf-mesh' && entry.name === meshName,
  );
  if (!sub) throw new Error(`[phase2c] ${path.basename(metaPath)} has no mesh named ${meshName}`);
  return sub.uuid;
}

/** The authored category material uuid, from the .mtl.meta Creator wrote. */
function materialUuid(name) {
  const metaPath = path.join(materialsDir, name + '.mtl.meta');
  if (!fs.existsSync(metaPath)) throw new Error(`[phase2c] Missing ${name}.mtl.meta; Creator has not imported it.`);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.imported || !meta.uuid) throw new Error(`[phase2c] ${name}.mtl was never imported by Creator.`);
  return meta.uuid;
}

/**
 * kind -> authored asset, derived from the live `Game.scene` binding.
 *
 * The WorldArtLibrary component serialises one `@property(Node)` per kind, and
 * each template node's `cc.MeshRenderer._mesh` names the authored mesh. This
 * follows that chain rather than trusting a second hand-written table.
 */
function loadWorldArtKindBindings(meshToSource) {
  const scene = JSON.parse(fs.readFileSync(path.join(assets, 'scenes', 'Game.scene'), 'utf8'));
  const component = scene.find((object) => object && typeof object === 'object' && 'roadStraightTemplate' in object);
  if (!component) throw new Error('[phase2c] Game.scene has no WorldArtLibrary component');

  const meshUuidsUnder = (nodeId) => {
    const found = [];
    const visit = (id) => {
      const node = scene[id];
      if (!node) return;
      for (const componentRef of node._components || []) {
        const comp = scene[componentRef.__id__];
        if (comp && comp.__type__ === 'cc.MeshRenderer' && comp._mesh?.__uuid__) found.push(comp._mesh.__uuid__);
      }
      for (const child of node._children || []) visit(child.__id__);
    };
    visit(nodeId);
    return found;
  };

  const bindings = {};
  for (const [property, value] of Object.entries(component)) {
    if (!property.endsWith('Template') || !value || typeof value.__id__ !== 'number') continue;
    const kind = property.slice(0, -'Template'.length);
    const meshes = meshUuidsUnder(value.__id__);
    const sources = [...new Set(meshes.map((uuid) => meshToSource.get(uuid)).filter(Boolean))];
    bindings[kind] = { meshUuids: meshes, authoredAssets: sources };
  }
  return bindings;
}

// ---------------------------------------------------------------------------
// 2. The category wrappers.
// ---------------------------------------------------------------------------

const CATEGORIES = ['blackhole', 'vehicles', 'buildings', 'props', 'collectibles'];

/**
 * One representative authored asset per category. `parts` names the mesh
 * sub-asset to wrap; the uuid is resolved from the source's `.meta`, so this
 * table cannot go stale if the art is re-exported.
 */
const WRAPPERS = [
  {
    category: 'blackhole',
    file: 'SingularityVortex',
    source: 'game_art/blackhole/SingularityVortex.glb',
    material: 'MAT_BLACKHOLE',
    parts: ['AbyssBase', 'HoleInner', 'InnerSwirl', 'MidSwirl', 'OuterSwirl', 'ShimmerSwirl', 'HoleRing']
      .map((name) => ({ node: name, mesh: name + '.mesh' })),
  },
  {
    category: 'vehicles',
    file: 'Sedan',
    source: 'art/vehicles/sedan.glb',
    material: 'MAT_VEHICLE',
    parts: [{ node: 'body', mesh: 'body.mesh' }],
  },
  {
    category: 'buildings',
    file: 'BuildingTypeB',
    source: 'art/world/residential/building-type-b.glb',
    material: 'MAT_BUILDING',
    parts: [{ node: 'building-type-b', mesh: 'building-type-b.mesh' }],
  },
  {
    category: 'props',
    file: 'Bench',
    source: 'art/world/pretty-park/bench.gltf',
    material: 'MAT_PROP',
    parts: [{ node: 'bench', mesh: 'bench.mesh' }],
  },
  {
    category: 'collectibles',
    file: 'SodaCan',
    source: 'art/recyclables/food/soda-can.glb',
    material: 'MAT_PROP',
    parts: [{ node: 'soda-can', mesh: 'soda-can.mesh' }],
  },
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
const quat = () => ({ __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 });

function nodeObject({ name, parent, children, components, prefabId }) {
  return {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parent,
    _children: children,
    _active: true,
    _components: components,
    _prefab: { __id__: prefabId },
    _lpos: vec3(0, 0, 0),
    _lrot: quat(),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: 1073741824,
    _euler: vec3(0, 0, 0),
    _id: '',
  };
}

function meshRendererObject({ nodeId, prefabInfoId, bakeSettingsId, meshUuid, materialUuid }) {
  return {
    __type__: 'cc.MeshRenderer',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: prefabInfoId },
    _materials: [{ __uuid__: materialUuid, __expectedType__: 'cc.Material' }],
    _visFlags: 0,
    bakeSettings: { __id__: bakeSettingsId },
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
}

function bakeSettingsObject() {
  return {
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
}

const prefabInfoObject = (fileIdValue) => ({
  __type__: 'cc.PrefabInfo',
  root: { __id__: 1 },
  asset: { __id__: 0 },
  fileId: fileIdValue,
  instance: null,
  targetOverrides: null,
  nestedPrefabInstanceRoots: null,
});

/** Build the object array for one root + N mesh nodes. */
function buildPrefab(name, parts) {
  const perPart = 5;
  const rootPrefabInfoId = 2 + parts.length * perPart;
  const objects = [];

  objects.push({
    __type__: 'cc.Prefab',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });

  objects.push(nodeObject({
    name,
    parent: null,
    children: parts.map((_, index) => ({ __id__: 2 + index * perPart })),
    components: [],
    prefabId: rootPrefabInfoId,
  }));

  parts.forEach((part, index) => {
    const base = 2 + index * perPart;
    const nodeId = base;
    const rendererId = base + 1;
    const compPrefabInfoId = base + 2;
    const bakeSettingsId = base + 3;
    const prefabInfoId = base + 4;
    const seed = `${name}:${part.node}`;

    objects.push(nodeObject({
      name: part.node,
      parent: { __id__: 1 },
      children: [],
      components: [{ __id__: rendererId }],
      prefabId: prefabInfoId,
      seed,
    }));
    objects.push(meshRendererObject({
      nodeId,
      prefabInfoId: compPrefabInfoId,
      bakeSettingsId,
      meshUuid: part.meshUuid,
      materialUuid: part.materialUuid,
    }));
    objects.push({ __type__: 'cc.CompPrefabInfo', fileId: fileId(seed + ':comp') });
    objects.push(bakeSettingsObject());
    objects.push(prefabInfoObject(fileId(seed + ':node')));
  });

  objects.push(prefabInfoObject(fileId(name + ':rootInfo')));
  return objects;
}

// ---------------------------------------------------------------------------
// 4. Run.
// ---------------------------------------------------------------------------

/**
 * Creator's bundle rule, quoted from its own UI tooltip:
 *   "When multiple bundles use the same asset, the asset will be exported to
 *    the bundle with the highest priority. If multiple bundles have equal
 *    priority, the asset will be exported to multiple bundles simultaneously."
 *
 * The world geometry (sedan, buildings, park props, collectibles) lives in the
 * main bundle and is referenced by `Game.scene` itself. With `game-art` at its
 * original priority 9 it out-ranked `main`, so Creator moved those shared meshes
 * into `game-art` — which made the always-resident `main` bundle depend on the
 * lazily-loaded `game-art`, and the game failed to boot with
 * "Please load bundle game-art first" during scene deserialisation.
 *
 * Priority 1 ranks `game-art` below `main`, so the shared world assets stay in
 * `main` (where the scene already expects them) and Creator records the correct
 * `game-art -> main` dependency instead. `main` is always resident, so a boot
 * with no `game-art` still works and the category prefabs resolve. Priority 0
 * was measured to be wrong: Creator then leaves stale uuids in `game-art`'s
 * `packs` table that are absent from its `uuids`, and the engine throws
 * "Cannot read properties of undefined (reading 'packs')" while parsing the
 * bundle config.
 */
function enforceGameArtPriority() {
  const metaPath = path.join(assets, 'game_art.meta');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.userData || meta.userData.isBundle !== true) {
    throw new Error('[phase2c] cocos/assets/game_art.meta is not an asset bundle');
  }
  if (meta.userData.priority !== 1) {
    meta.userData.priority = 1;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    console.log('set game-art bundle priority to 1 (must rank below main; see enforceGameArtPriority)');
  }
}

enforceGameArtPriority();

const artRegistry = loadArtEntries();
const artEntries = artRegistry.getArtEntries();
const worldArtKinds = loadWorldArtKinds();
const assetIndex = loadAssetIndex();
const kindBindings = loadWorldArtKindBindings(assetIndex.meshToSource);

const wrappers = WRAPPERS.map((wrapper) => {
  const metaPath = path.join(assets, wrapper.source + '.meta');
  if (!fs.existsSync(metaPath)) throw new Error(`[phase2c] Missing source asset ${wrapper.source}`);
  const material = materialUuid(wrapper.material);
  return {
    ...wrapper,
    materialUuid: material,
    parts: wrapper.parts.map((part) => ({
      node: part.node,
      meshUuid: meshUuid(metaPath, part.mesh),
      materialUuid: material,
    })),
  };
});

// Sanity: every wrapped mesh must trace back to the declared source, and every
// part must carry both references. A missing material uuid would serialise as a
// bare `__expectedType__` and silently ship a prefab with no material.
for (const wrapper of wrappers) {
  for (const part of wrapper.parts) {
    if (!part.meshUuid) throw new Error(`[phase2c] ${wrapper.file}/${part.node} has no mesh uuid`);
    if (!part.materialUuid) throw new Error(`[phase2c] ${wrapper.file}/${part.node} has no material uuid`);
    const owner = assetIndex.meshToSource.get(part.meshUuid);
    if (owner !== wrapper.source) {
      throw new Error(`[phase2c] ${part.meshUuid} belongs to ${owner}, not ${wrapper.source}`);
    }
  }
}

const written = [];
for (const wrapper of wrappers) {
  const dir = path.join(prefabsRoot, wrapper.category);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, wrapper.file + '.prefab');
  fs.writeFileSync(file, JSON.stringify(buildPrefab(wrapper.file, wrapper.parts), null, 2) + '\n', 'utf8');
  written.push({ ...wrapper, file });
}

// The manifest: every artId and every WorldArtKind -> the asset that renders it.
const wrapperBySource = new Map(written.map((wrapper) => [wrapper.source, wrapper]));
const wrapperPath = (wrapper) => path.relative(assets, wrapper.file).split(path.sep).join('/');

const artIds = {};
for (const entry of artEntries) {
  const wrapper = entry.prefab ? wrapperBySource.get(entry.prefab) : null;
  artIds[entry.artId] = {
    category: entry.category,
    authoredAsset: entry.prefab,
    // Only the representative entry for a category resolves to the wrapper;
    // the other kinds render through the live WorldArtLibrary binding.
    categoryPrefab: wrapper ? wrapperPath(wrapper) : null,
    gameplayTypes: entry.gameplayTypes,
  };
}

const worldKinds = {};
for (const kind of worldArtKinds) {
  const binding = kindBindings[kind];
  worldKinds[kind] = {
    authoredAssets: binding ? binding.authoredAssets : [],
    meshUuids: binding ? binding.meshUuids : [],
  };
}

const manifest = {
  schemaVersion: 1,
  generatedBy: 'scripts/v7_phase2_prefabs.mjs',
  note: 'Generated from ArtRegistry.ts, WorldArtLibrary.ts and the live Game.scene '
    + 'WorldArtLibrary binding. Do not hand-edit; re-run the generator instead.',
  categories: Object.fromEntries(written.map((wrapper) => [
    wrapper.category,
    {
      prefab: wrapperPath(wrapper),
      sourceAssets: [wrapper.source],
      material: wrapper.material,
    },
  ])),
  artIds,
  worldArtKinds: worldKinds,
};

fs.mkdirSync(prefabsRoot, { recursive: true });
const manifestFile = path.join(prefabsRoot, 'manifest.json');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('wrote ' + written.length + ' category prefabs:');
for (const wrapper of written) {
  console.log('  ' + path.relative(repo, wrapper.file).split(path.sep).join('/')
    + '  (' + wrapper.parts.length + ' mesh part(s), material ' + wrapper.material + ')');
}
console.log('wrote ' + path.relative(repo, manifestFile).split(path.sep).join('/')
  + '  (' + Object.keys(artIds).length + ' artIds, ' + Object.keys(worldKinds).length + ' WorldArtKinds)');
