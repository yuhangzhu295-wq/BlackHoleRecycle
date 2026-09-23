/**
 * PHASE WP0 — WeChat release package audit.
 *
 * Measures the real Cocos build output (never a source-tree estimate) and
 * attributes every byte to a source asset so a bundle split can be decided
 * from evidence instead of intuition.
 *
 * Read-only: this script never moves, renames or deletes an asset.
 *
 * Resolution chain:  build file -> uuid -> source path
 *   * native/<xx>/<uuid>@<sub>.<ext>   carries the full uuid in its name
 *   * import/<xx>/<name>.json          resolved through config.json packs[]
 *     (packs maps a merged import file to indices into config.uuids, whose
 *      entries are base64-compressed uuids that decodeUuid() expands)
 *   * source path comes from Creator's own library index
 *     (cocos/library/.assets-info1.0.0.json = path -> uuid, inverted here)
 *
 * A merged import file can hold several assets. When they disagree on owner
 * the bytes are split equally and flagged, never silently assigned.
 *
 * Anything unresolvable is reported as unresolved with its bytes.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');

function argValue(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : fallback;
}

const releaseDir = path.resolve(argValue('--release-dir', path.join(cocosProject, 'build', 'wechatgame')));
const outJson = argValue('--out-json', path.join(cocosProject, 'docs', 'release', 'wechat-package-audit.json'));
const outBundleMap = argValue('--out-bundle-map', path.join(cocosProject, 'docs', 'release', 'wechat-bundle-map.json'));
const topCount = Number(argValue('--top', '50'));

/**
 * Proposed Asset Bundle assignment (PHASE WP0 proposal — nothing is moved yet).
 * Matched against the source path, most specific first. `main` is the built-in
 * bundle and always wins for engine, platform and boot-critical content.
 */
const BUNDLE_RULES = [
  // --- world regions that own dedicated art ---------------------------------
  ['world-construction', /^cocos\/assets\/resources\/art\/construction\//],
  ['world-city', /^cocos\/assets\/art\/world\/city\//],
  ['endless', /^cocos\/assets\/art\/world\/residential\//],
  ['endless', /^cocos\/assets\/prefabs\/chunks\//],
  ['world-opening', /^cocos\/assets\/prefabs\/world\/GoldenCityCell\.prefab$/],
  // --- shared 3D gameplay art: needed from gameplay start, not from boot -----
  ['shared-gameplay', /^cocos\/assets\/art\/machines\//],
  ['shared-gameplay', /^cocos\/assets\/art\/machine-modules\//],
  ['shared-gameplay', /^cocos\/assets\/art\/vehicles\//],
  ['shared-gameplay', /^cocos\/assets\/art\/recyclables\//],
  ['shared-gameplay', /^cocos\/assets\/art\/props\//],
  ['shared-gameplay', /^cocos\/assets\/art\/world\//],
  ['shared-gameplay', /^cocos\/assets\/prefabs\/(art|machine|objects)\//],
  ['shared-gameplay', /^cocos\/assets\/prefabs\/ui\/(HUD|EndlessHUD|PausePage|SettlementPage)\.prefab$/],
  ['shared-gameplay', /^cocos\/assets\/textures\/ui\//],
  // --- everything else stays in main ---------------------------------------
  ['main', /.*/],
];

/** Bundles the plan reserves but that own no asset today. */
const RESERVED_BUNDLES = [
  {
    name: 'arena',
    ownerLabel: 'ARENA_ONLY',
    note: 'Reserved. The audit found no asset that belongs to Arena alone: Arena reuses the shared gameplay art and the same Game.scene. Creating this bundle now would only duplicate assets, so it stays empty until Arena gains dedicated art.',
  },
  {
    name: 'cosmetics',
    ownerLabel: 'COSMETIC_OPTIONAL',
    note: 'Reserved. All five skins in SKINS_CONFIG are colour/rimColor data applied to the existing machine art; there is no cosmetic-only mesh or texture to split.',
  },
];

// --------------------------------------------------------- compressed uuid

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUES = new Array(123).fill(64);
for (let i = 0; i < 64; i += 1) BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;
const HEX_CHARS = '0123456789abcdef'.split('');
const UUID_TEMPLATE = (() => {
  const t = ['', '', '', ''];
  return t.concat(t, '-', t, '-', t, '-', t, '-', t, t, t);
})();
const UUID_INDICES = UUID_TEMPLATE.map((x, i) => (x === '-' ? NaN : i)).filter((i) => !Number.isNaN(i));

/** Creator's compressed-uuid decoder. Non-22-char ids are already literal. */
function decodeUuid(compressed) {
  const head = compressed.split('@')[0];
  if (head.length !== 22) return compressed;
  UUID_TEMPLATE[0] = compressed[0];
  UUID_TEMPLATE[1] = compressed[1];
  for (let i = 2, j = 2; i < 22; i += 2) {
    const lhs = BASE64_VALUES[compressed.charCodeAt(i)];
    const rhs = BASE64_VALUES[compressed.charCodeAt(i + 1)];
    UUID_TEMPLATE[UUID_INDICES[j]] = HEX_CHARS[lhs >> 2];
    j += 1;
    UUID_TEMPLATE[UUID_INDICES[j]] = HEX_CHARS[((lhs & 3) << 2) | (rhs >> 4)];
    j += 1;
    UUID_TEMPLATE[UUID_INDICES[j]] = HEX_CHARS[rhs & 0xf];
    j += 1;
  }
  return UUID_TEMPLATE.join('');
}

// ---------------------------------------------------------------- source index

/** uuid -> repo-relative source path, from Creator's own library index. */
function loadUuidIndex() {
  const index = new Map();
  const absolutePaths = new Map();
  const sources = [];
  for (const name of ['.assets-info1.0.0.json', '.internal-info1.0.0.json']) {
    const file = path.join(cocosProject, 'library', name);
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    let added = 0;
    for (const [absolutePath, meta] of Object.entries(parsed.map || {})) {
      if (!meta || typeof meta.uuid !== 'string' || index.has(meta.uuid)) continue;
      index.set(meta.uuid, path.relative(repoRoot, absolutePath).split(path.sep).join('/'));
      absolutePaths.set(meta.uuid, absolutePath);
      added += 1;
    }
    sources.push({ file: `cocos/library/${name}`, entries: added });
  }
  return { index, absolutePaths, sources };
}

// ---------------------------------------------------------------- file walking

function walk(directory, base = directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, base, out);
    else out.push({ absolute: target, relative: path.relative(base, target).split(path.sep).join('/'), bytes: statSync(target).size });
  }
  return out;
}

// ---------------------------------------------------------------- classification

const TEXTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ktx', '.ktx2', '.astc', '.pkm', '.basis']);
const MESH_EXT = new Set(['.glb', '.gltf', '.fbx', '.obj', '.dae']);
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.aac']);
const FONT_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const SCRIPT_EXT = new Set(['.ts', '.js', '.mjs', '.cjs']);

function extensionOf(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot);
}

/**
 * Category is decided from the *source* asset when the build file resolves to
 * one: a gltf mesh and its .bin buffer both land as native/*.bin and are
 * indistinguishable from the output alone.
 */
function categorise(buildRelative, sourcePath) {
  const buildExt = extensionOf(buildRelative);
  const sourceExt = sourcePath ? extensionOf(sourcePath) : '';

  if (buildRelative.startsWith('cocos-js/')) return 'EngineJS';
  if (buildRelative.startsWith('src/')) return 'ProjectJS';
  if (/^assets\/[^/]+\/index\.js$/.test(buildRelative)) return 'BundleJS';
  if (buildRelative.endsWith('config.json')) return 'ConfigJSON';
  if (buildRelative.startsWith('assets/') && buildRelative.includes('/import/')) return 'AssetDataJSON';
  if (buildRelative.startsWith('assets/') && buildRelative.includes('/native/')) {
    if (TEXTURE_EXT.has(sourceExt)) return 'Texture';
    if (MESH_EXT.has(sourceExt)) return 'Mesh';
    if (sourceExt === '.bin') return 'Mesh';
    if (sourceExt === '.mtl') return 'Material';
    if (AUDIO_EXT.has(sourceExt)) return 'Audio';
    if (FONT_EXT.has(sourceExt)) return 'Font';
    if (sourceExt === '.json') return 'Other';
    if (TEXTURE_EXT.has(buildExt)) return 'Texture';
    return 'Other';
  }
  if (buildExt === '.wasm') return 'WASM';
  if (AUDIO_EXT.has(buildExt)) return 'Audio';
  if (FONT_EXT.has(buildExt)) return 'Font';
  if (TEXTURE_EXT.has(buildExt)) return 'Texture';
  if (buildExt === '.json') return 'ConfigJSON';
  if (SCRIPT_EXT.has(buildExt)) return 'PlatformJS';
  return 'Other';
}

/**
 * Owner taxonomy is fixed by the mandate. Rules match the source path, most
 * specific first. Engine internals and platform bootstrap are decided from the
 * build path instead, because they have no project source asset.
 */
const OWNER_RULES = [
  [/^cocos\/assets\/scripts\/dev\//, 'DEV_QA'],
  [/^cocos\/assets\/scenes\/Bootstrap\.scene$/, 'BOOT_REQUIRED'],
  [/^cocos\/assets\/textures\/home\//, 'BOOT_REQUIRED'],
  [/^cocos\/assets\/prefabs\/ui\/(HomePage|ModeSelectPage)\.prefab$/, 'BOOT_REQUIRED'],
  [/^cocos\/assets\/art\/world\/city\//, 'WORLD_CITY'],
  [/^cocos\/assets\/art\/world\/residential\//, 'ENDLESS_ONLY'],
  [/^cocos\/assets\/resources\/art\/construction\//, 'WORLD_CONSTRUCTION'],
  [/^cocos\/assets\/prefabs\/world\/GoldenCityCell\.prefab$/, 'WORLD_OPENING'],
  [/^cocos\/assets\/prefabs\/chunks\//, 'ENDLESS_ONLY'],
  [/^cocos\/assets\/art\//, 'SHARED_RUNTIME'],
  [/^cocos\/assets\/prefabs\//, 'SHARED_RUNTIME'],
  [/^cocos\/assets\/textures\//, 'SHARED_RUNTIME'],
  [/^cocos\/assets\/resources\//, 'SHARED_RUNTIME'],
  [/^cocos\/assets\/scripts\//, 'SHARED_RUNTIME'],
  [/^cocos\/assets\/scenes\//, 'SHARED_RUNTIME'],
  [/^cocos\/assets\//, 'SHARED_RUNTIME'],
];

function ownerOf(buildRelative, sourcePath) {
  // engine, platform bootstrap and bundle metadata: no project source asset
  if (buildRelative.startsWith('cocos-js/')) return 'BOOT_REQUIRED';
  if (buildRelative.startsWith('src/chunks/')) return 'SHARED_RUNTIME'; // project code chunk
  if (buildRelative.startsWith('src/')) return 'BOOT_REQUIRED';
  if (buildRelative.startsWith('assets/internal/')) return 'BOOT_REQUIRED';
  if (/^assets\/[^/]+\/config\.json$/.test(buildRelative)) return 'BOOT_REQUIRED';
  if (/^assets\/[^/]+\/index\.js$/.test(buildRelative)) return 'SHARED_RUNTIME';
  // platform bootstrap at the release root (game.js, application.js, adapters...)
  if (!buildRelative.includes('/')) return 'BOOT_REQUIRED';
  if (!sourcePath) return 'UNRESOLVED';
  if (!sourcePath.startsWith('cocos/assets/')) return 'BOOT_REQUIRED'; // engine internal asset
  for (const [pattern, owner] of OWNER_RULES) if (pattern.test(sourcePath)) return owner;
  return 'UNRESOLVED';
}

/** Proposed Asset Bundle for a build file. Engine, platform and anything
 *  unattributable stay in the built-in main bundle — never guessed into a
 *  subpackage, because a wrong move shows up as a missing-UUID at runtime. */
function bundleTargetOf(buildRelative, sourcePath) {
  if (buildRelative.startsWith('cocos-js/')) return 'main';
  if (buildRelative.startsWith('src/')) return 'main';
  if (buildRelative.startsWith('assets/internal/')) return 'main';
  if (/^assets\/[^/]+\/(config\.json|index\.js)$/.test(buildRelative)) return 'main';
  if (!buildRelative.includes('/')) return 'main';
  if (!sourcePath) return 'main';
  if (!sourcePath.startsWith('cocos/assets/')) return 'main';
  for (const [bundle, pattern] of BUNDLE_RULES) if (pattern.test(sourcePath)) return bundle;
  return 'main';
}

// ---------------------------------------------------------------- bundle layout

function readSubpackageRoots() {
  const gameJson = path.join(releaseDir, 'game.json');
  if (!existsSync(gameJson)) return { declared: false, roots: [] };
  const parsed = JSON.parse(readFileSync(gameJson, 'utf8'));
  const subpackages = Array.isArray(parsed.subpackages) ? parsed.subpackages : [];
  return {
    declared: subpackages.length > 0,
    roots: subpackages.map((s) => String(s.root || '').replace(/\/+$/, '')),
  };
}

function bundleOf(relative) {
  const match = /^assets\/([^/]+)\//.exec(relative);
  return match ? match[1] : null;
}

/** config.json packs: importFileName -> [indices into uuids] -> decoded uuids. */
function loadBundlePacks(bundleDir) {
  const byImportName = new Map();
  const configPath = path.join(bundleDir, 'config.json');
  if (!existsSync(configPath)) return byImportName;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const uuids = Array.isArray(config.uuids) ? config.uuids : [];
  for (const [importName, indices] of Object.entries(config.packs || {})) {
    if (!Array.isArray(indices) || indices.length === 0) continue;
    const members = indices
      .map((i) => uuids[i])
      .filter((u) => typeof u === 'string' && u)
      .map(decodeUuid);
    if (members.length) byImportName.set(importName, members);
  }
  return byImportName;
}

// ---------------------------------------------------------------- main

function main() {
  if (!existsSync(releaseDir)) throw new Error(`Release directory not found: ${releaseDir}`);

  const { index: uuidToPath, absolutePaths, sources } = loadUuidIndex();
  const subpackages = readSubpackageRoots();
  const files = walk(releaseDir);

  const packCache = new Map();
  const packsFor = (bundle) => {
    if (!packCache.has(bundle)) packCache.set(bundle, loadBundlePacks(path.join(releaseDir, 'assets', bundle)));
    return packCache.get(bundle);
  };

  const records = [];

  // Weight a merged import file by each member's own source size. Every asset
  // has a source file, so JSON-only assets (prefabs, scenes, materials) are
  // weighted too — a native-bytes-only weight would zero them out.
  const sourceSizeCache = new Map();
  function sourceWeight(uuid) {
    if (sourceSizeCache.has(uuid)) return sourceSizeCache.get(uuid);
    const absolute = absolutePaths.get(uuid);
    let weight = 0;
    if (absolute) {
      try {
        weight = statSync(absolute).size;
      } catch {
        weight = 0;
      }
    }
    sourceSizeCache.set(uuid, weight);
    return weight;
  }

  for (const file of files) {
    const bundle = bundleOf(file.relative);
    let uuid = null;
    let packMembers = null;

    if (bundle) {
      const nativeMatch = /^assets\/[^/]+\/native\/[^/]+\/([^@/]+)(?:@[^/]*)?\.[^./]+$/.exec(file.relative);
      const importMatch = /^assets\/[^/]+\/import\/[^/]+\/([^/]+)\.json$/.exec(file.relative);
      if (nativeMatch) {
        uuid = nativeMatch[1];
      } else if (importMatch) {
        const name = importMatch[1];
        if (packsFor(bundle).has(name)) {
          packMembers = packsFor(bundle).get(name);
          if (packMembers.length === 1) uuid = packMembers[0];
        } else if (uuidToPath.has(name)) {
          uuid = name;
        } else if (name.includes('@')) {
          uuid = name.split('@')[0];
        }
      }
    }

    // A merged import file resolves to several assets. Weight its bytes by each
    // member's own source size; fall back to an equal split when no member has
    // a measurable source, and record which basis was used. Owner and bundle
    // shares use the same weights so the two rollups reconcile exactly.
    const shareOf = (classify) => {
      if (uuid) return [[classify(uuid), 1]];
      if (packMembers && packMembers.length > 1) {
        const weights = packMembers.map((member) => sourceWeight(member));
        const totalWeight = weights.reduce((s, w) => s + w, 0);
        const useWeights = totalWeight > 0;
        const shares = new Map();
        packMembers.forEach((member, i) => {
          const key = classify(member);
          const weight = useWeights ? weights[i] / totalWeight : 1 / packMembers.length;
          shares.set(key, (shares.get(key) || 0) + weight);
        });
        return { entries: [...shares.entries()], useWeights, count: shares.size };
      }
      return [[classify(null), 1]];
    };

    const ownerResult = shareOf((member) => ownerOf(file.relative, member ? uuidToPath.get(member) || null : null));
    const bundleResult = shareOf((member) => bundleTargetOf(file.relative, member ? uuidToPath.get(member) || null : null));
    const ownerShares = Array.isArray(ownerResult) ? ownerResult : ownerResult.entries;
    const bundleShares = Array.isArray(bundleResult) ? bundleResult : bundleResult.entries;

    let ownerBasis = 'exact';
    if (!uuid && packMembers && packMembers.length > 1) {
      const weights = packMembers.map((member) => sourceWeight(member));
      const useWeights = weights.reduce((s, w) => s + w, 0) > 0;
      ownerBasis = ownerShares.length === 1
        ? 'pack-uniform'
        : (useWeights ? 'pack-shared-source-weighted' : 'pack-shared-equal-split');
    } else if (!uuid) {
      ownerBasis = 'unresolved';
    }

    const sourcePath = uuid ? uuidToPath.get(uuid) || null : null;
    records.push({
      path: file.relative,
      bytes: file.bytes,
      bundle,
      uuid,
      packMemberCount: packMembers ? packMembers.length : null,
      sourcePath,
      category: categorise(file.relative, sourcePath),
      ownerShares,
      bundleShares,
      ownerBasis,
    });
  }

  const isSubpackageFile = (relative) => subpackages.roots.some((root) => root && (relative === root || relative.startsWith(`${root}/`)));
  const subpackageRecords = records.filter((r) => isSubpackageFile(r.path));
  const mainRecords = records.filter((r) => !isSubpackageFile(r.path));

  const totalReleaseBytes = records.reduce((s, r) => s + r.bytes, 0);
  const mainPackageBytes = mainRecords.reduce((s, r) => s + r.bytes, 0);
  const subpackageBytesByName = {};
  for (const root of subpackages.roots) {
    subpackageBytesByName[root] = records
      .filter((r) => r.path === root || r.path.startsWith(`${root}/`))
      .reduce((s, r) => s + r.bytes, 0);
  }
  const allSubpackagesBytes = subpackageRecords.reduce((s, r) => s + r.bytes, 0);

  /** Owner rollup honouring split shares. */
  function ownerRollup(list) {
    const out = {};
    for (const record of list) {
      for (const [owner, share] of record.ownerShares) {
        out[owner] = (out[owner] || 0) + record.bytes * share;
      }
    }
    return Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]),
    );
  }
  function groupSum(list, key) {
    const out = {};
    for (const record of list) out[record[key]] = (out[record[key]] || 0) + record.bytes;
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
  }

  /**
   * Finer than owner: the source folder a byte came from. A bundle map needs
   * this because one owner label can span several folders with different
   * boot requirements.
   */
  function sourceGroupOf(sourcePath, buildRelative) {
    if (!sourcePath) return buildRelative.startsWith('cocos-js/') ? 'cocos-js (engine)' : `(build) ${buildRelative.split('/')[0]}`;
    if (!sourcePath.startsWith('cocos/assets/')) return '(engine internal asset)';
    const parts = sourcePath.split('/'); // cocos / assets / <group> / ...
    if (parts.length <= 3) return sourcePath;
    const group = parts.slice(2, 4).join('/');
    // art/* and prefabs/* are two levels deep by design
    if (parts[2] === 'art' || parts[2] === 'prefabs') return parts.slice(2, 4).join('/');
    if (parts[2] === 'scenes') return 'scenes';
    if (parts[2] === 'scripts') return 'scripts';
    if (parts[2] === 'textures') return parts.slice(2, 4).join('/');
    if (parts[2] === 'resources') return parts.slice(2, 4).join('/');
    return group;
  }
  function sourceGroupSum(list, shareKey = 'ownerShares') {
    const out = {};
    for (const record of list) {
      const key = sourceGroupOf(record.sourcePath, record.path);
      for (const [, share] of record[shareKey]) {
        out[key] = (out[key] || 0) + record.bytes * share;
      }
    }
    return Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]),
    );
  }

  const assetRecords = records.filter((r) => r.bundle);
  const isAttributed = (r) => Boolean(r.sourcePath) || r.ownerBasis.startsWith('pack-');
  const resolvedAssetBytes = assetRecords.filter(isAttributed).reduce((s, r) => s + r.bytes, 0);
  const unresolvedAssetBytes = assetRecords.filter((r) => !isAttributed(r)).reduce((s, r) => s + r.bytes, 0);
  const assetBytesTotal = resolvedAssetBytes + unresolvedAssetBytes;

  const topLargestFiles = [...records]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, topCount)
    .map((r) => ({
      path: r.path,
      bytes: r.bytes,
      category: r.category,
      owner: r.ownerShares.map(([o, s]) => (s === 1 ? o : `${o}(${Math.round(s * 100)}%)`)).join('+'),
      ownerBasis: r.ownerBasis,
      sourcePath: r.sourcePath,
    }));

  const mainOwners = ownerRollup(mainRecords);
  const totalOwners = ownerRollup(records);

  // --- trim candidates: byte reductions that are not bundle splits ---------
  function sumWhere(predicate, list = records) {
    return list.filter(predicate).reduce((s, r) => s + r.bytes, 0);
  }
  const engineModule = (module) => sumWhere((r) => r.path.startsWith('cocos-js/') && r.path.includes(module));
  const skyboxRecords = records.filter((r) => (r.sourcePath || '').toLowerCase().includes('skybox'));

  const trimCandidates = [
    {
      id: 'ENGINE_FEATURE_CROPPING_BULLET',
      bytes: engineModule('bullet'),
      rationale: 'cocos/settings/v2/packages/engine.json declares no feature cropping, so the bullet physics module ships. No gameplay script constructs a Collider or RigidBody; the only two matches in the codebase are comments stating the runtime ships none.',
      risk: 'LOW — remove only after confirming no scene component references a physics type.',
      requiresOwnerSignOff: false,
    },
    {
      id: 'ENGINE_FEATURE_CROPPING_SPINE',
      bytes: engineModule('spine'),
      rationale: 'No spine reference exists anywhere in cocos/assets/scripts or the scenes; the module is shipped by default.',
      risk: 'LOW — remove only after confirming no Skeleton component is serialised in a scene or prefab.',
      requiresOwnerSignOff: false,
    },
    {
      id: 'SKYBOX_PAYLOAD',
      bytes: skyboxRecords.reduce((s, r) => s + r.bytes, 0),
      fileCount: skyboxRecords.length,
      rationale: 'Two HDR skyboxes ship as 12 mip-mapped PNGs. The renderer is builtin-unlit with no lighting, and both scenes reference a skybox, so this is a composition decision rather than dead data.',
      risk: 'MEDIUM — visible background change; needs the owner to confirm the skybox is wanted.',
      requiresOwnerSignOff: true,
    },
  ];

  // --- proposed bundle rollup ---------------------------------------------
  function bundleRollup(list) {
    const out = {};
    for (const record of list) {
      for (const [target, share] of record.bundleShares) {
        out[target] = (out[target] || 0) + record.bytes * share;
      }
    }
    return Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]),
    );
  }
  const proposedBundles = bundleRollup(records);
  const proposedMainBytes = proposedBundles.main || 0;

  /** Records scaled by how much of each stays in the proposed main bundle. */
  const proposedMainRecords = records
    .map((record) => {
      const share = (record.bundleShares.find(([target]) => target === 'main') || [null, 0])[1];
      return { ...record, bytes: record.bytes * share };
    })
    .filter((record) => record.bytes > 0);

  const trimSavings = trimCandidates.filter((c) => !c.requiresOwnerSignOff).reduce((s, c) => s + c.bytes, 0);

  const report = {
    schema: 'bhr.wechat-package-audit/1',
    generatedBy: 'scripts/audit_wechat_package.mjs',
    releaseDirectory: path.relative(repoRoot, releaseDir).split(path.sep).join('/'),
    fileCount: records.length,
    uuidIndexSources: sources,
    uuidIndexEntries: uuidToPath.size,
    subpackageDeclaration: {
      declared: subpackages.declared,
      roots: subpackages.roots,
      note: subpackages.declared
        ? 'game.json declares subpackages; the main package excludes those roots.'
        : 'game.json declares no subpackages, so every byte counts toward the main package.',
    },
    totals: {
      totalReleaseBytes,
      mainPackageBytes,
      subpackageBytesByName,
      allSubpackagesBytes,
      totalReleaseKB: Math.round(totalReleaseBytes / 1024),
      mainPackageKB: Math.round(mainPackageBytes / 1024),
      allSubpackagesKB: Math.round(allSubpackagesBytes / 1024),
    },
    assetResolution: {
      assetFileCount: assetRecords.length,
      resolvedFileCount: assetRecords.filter(isAttributed).length,
      resolvedBytes: resolvedAssetBytes,
      unresolvedBytes: unresolvedAssetBytes,
      resolvedPercentOfAssetBytes: assetBytesTotal ? Number(((resolvedAssetBytes / assetBytesTotal) * 100).toFixed(2)) : 0,
    },
    sizeByCategory: groupSum(records, 'category'),
    sizeByBundle: groupSum(records, 'bundle'),
    sizeByOwner: totalOwners,
    mainPackageSizeByOwner: mainOwners,
    mainPackageSizeByCategory: groupSum(mainRecords, 'category'),
    mainPackageSizeBySourceGroup: sourceGroupSum(mainRecords),
    proposedMainSizeBySourceGroup: sourceGroupSum(proposedMainRecords),
    proposedMainSizeByOwner: ownerRollup(proposedMainRecords),
    proposedMainSizeByCategory: groupSum(proposedMainRecords, 'category'),
    trimCandidates,
    splitProjection: {
      basis: 'A bundle split only moves bytes out of main; it does not shrink the total release.',
      proposedBundleBytes: proposedBundles,
      proposedMainBytes: Math.round(proposedMainBytes),
      proposedMainKB: Math.round(proposedMainBytes / 1024),
      proposedMainWithLowRiskTrimKB: Math.round((proposedMainBytes - trimSavings) / 1024),
      lowRiskTrimBytes: trimSavings,
    },
    topLargestFiles,
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

  // --- bundle map ----------------------------------------------------------
  const bundleMap = {
    schema: 'bhr.wechat-bundle-map/1',
    generatedBy: 'scripts/audit_wechat_package.mjs',
    note: 'PHASE WP0 proposal. Nothing has been moved. Sizes are computed from the current release build by attributing each output file back to its source asset.',
    platformLimitsKB: {
      wechatMainPackageMaxKB: 4096,
      wechatAllPackagesMaxKB: 30720,
      wechatSingleNormalSubpackage: 'unlimited',
      wechatSingleIndependentSubpackageMaxKB: 4096,
      internalMainTargetKB: Math.round(4096 * 0.85),
      internalTargetNote: 'Internal headroom target (85% of the official 4 MB main-package limit). This is our own margin, not a WeChat threshold.',
    },
    bundleConfiguration: {
      compressionType: '小游戏分包 (mini-game subpackage)',
      targetPlatform: 'wechatgame',
      remote: false,
      remoteNote: 'A 小游戏分包 cannot be a remote package — Creator locks the 配置为远程包 checkbox. Remote delivery is therefore a separate, later decision.',
    },
    bundles: Object.entries(proposedBundles)
      .map(([name, bytes]) => ({
        name,
        bytes,
        KB: Math.round(bytes / 1024),
        builtIn: name === 'main',
        assetBytes: bytes,
      }))
      .concat(RESERVED_BUNDLES.filter((r) => !proposedBundles[r.name]).map((r) => ({
        name: r.name,
        bytes: 0,
        KB: 0,
        builtIn: false,
        reserved: true,
        note: r.note,
      }))),
    rules: BUNDLE_RULES.map(([bundle, pattern]) => ({ bundle, sourcePathPattern: String(pattern) })),
    totals: {
      proposedMainBytes: Math.round(proposedMainBytes),
      proposedMainKB: Math.round(proposedMainBytes / 1024),
      proposedSubpackageBytes: Math.round(totalReleaseBytes - proposedMainBytes),
      proposedSubpackageKB: Math.round((totalReleaseBytes - proposedMainBytes) / 1024),
      proposedTotalKB: Math.round(totalReleaseBytes / 1024),
    },
    verdict: {
      mainUnderOfficialLimit: proposedMainBytes <= 4096 * 1024,
      mainUnderInternalTarget: proposedMainBytes <= Math.round(4096 * 0.85) * 1024,
      totalUnderOfficialLimit: totalReleaseBytes <= 30720 * 1024,
    },
  };
  mkdirSync(path.dirname(outBundleMap), { recursive: true });
  writeFileSync(outBundleMap, `${JSON.stringify(bundleMap, null, 2)}\n`);

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`[audit] release dir      : ${report.releaseDirectory}`);
  console.log(`[audit] files            : ${records.length}`);
  console.log(`[audit] total release    : ${kb(totalReleaseBytes)}`);
  console.log(`[audit] main package     : ${kb(mainPackageBytes)}  (subpackages declared: ${subpackages.declared})`);
  console.log(`[audit] all subpackages  : ${kb(allSubpackagesBytes)}`);
  console.log(`[audit] uuid resolution  : ${report.assetResolution.resolvedPercentOfAssetBytes}% of asset bytes (${report.assetResolution.resolvedFileCount}/${report.assetResolution.assetFileCount} files), unresolved ${kb(unresolvedAssetBytes)}`);
  console.log('[audit] MAIN package by owner:');
  for (const [owner, bytes] of Object.entries(mainOwners)) console.log(`         ${owner.padEnd(20)} ${kb(bytes).padStart(9)}`);
  console.log('[audit] trim candidates:');
  for (const c of trimCandidates) console.log(`         ${c.id.padEnd(34)} ${kb(c.bytes).padStart(9)}${c.requiresOwnerSignOff ? '  (needs owner sign-off)' : ''}`);
  console.log('[audit] PROPOSED bundles:');
  for (const [name, bytes] of Object.entries(proposedBundles)) console.log(`         ${name.padEnd(20)} ${kb(bytes).padStart(9)}`);
  console.log(`[audit] proposed main    : ${kb(proposedMainBytes)} (limit 4096 KB) -> ${proposedMainBytes <= 4096 * 1024 ? 'WITHIN LIMIT' : 'OVER LIMIT'}`);
  console.log(`[audit] with low-risk trim: ${kb(proposedMainBytes - trimSavings)}`);
  console.log(`[audit] report written   : ${path.relative(repoRoot, outJson).split(path.sep).join('/')}`);
  console.log(`[audit] bundle map       : ${path.relative(repoRoot, outBundleMap).split(path.sep).join('/')}`);
}

main();
