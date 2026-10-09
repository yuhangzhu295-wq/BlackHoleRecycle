/**
 * Every bundle the launch scene references must be resident before it loads.
 *
 * A mini-game subpackage is deliberately absent from
 * `settings.assets.preloadBundles`, and the engine only reports the problem at
 * runtime: `Please load bundle <name> first`, after which the game never reaches
 * its first frame. Nothing in a build's exit code, file list or launch-scene
 * assertion notices it -- declaring `cocos/assets/game_art` a subpackage shipped
 * exactly that defect.
 *
 * So this walks the launch scenes, follows every prefab reference, and requires
 * each bundle that turns up to be named in the boot template's `BOOT_BUNDLES`
 * (or to be one the engine always preloads).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(repoRoot, 'cocos', 'assets');
const scenesRoot = path.join(assetsRoot, 'scenes');
const templateRoot = path.join(repoRoot, 'cocos', 'build-templates');

/** Bundles the engine loads itself before the launch scene. */
const ENGINE_PRELOADED = new Set(['resources', 'main', 'internal']);

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, visit);
    else visit(target);
  }
}

/** uuid -> source file (a texture's sub-assets resolve to the texture itself). */
function buildUuidIndex() {
  const index = new Map();
  walk(assetsRoot, (filePath) => {
    if (!filePath.endsWith('.meta')) return;
    let meta;
    try {
      meta = readJson(filePath);
    } catch {
      return;
    }
    const source = filePath.slice(0, -'.meta'.length);
    if (meta.uuid) index.set(meta.uuid, source);
    for (const sub of Object.values(meta.subMetas || {})) {
      if (sub && sub.uuid) index.set(sub.uuid, source);
    }
  });
  return index;
}

/** Folder -> { name, configID } for every declared asset bundle. */
function readBundles() {
  const bundles = new Map();
  walk(assetsRoot, (filePath) => {
    if (!filePath.endsWith('.meta')) return;
    let meta;
    try {
      meta = readJson(filePath);
    } catch {
      return;
    }
    const data = meta.userData || {};
    if (data.isBundle !== true) return;
    bundles.set(filePath.slice(0, -'.meta'.length), {
      name: data.bundleName || path.basename(filePath, '.meta'),
      configID: data.bundleConfigID || 'default',
    });
  });
  return bundles;
}

/**
 * A serialized reference is a bare uuid or `<uuid>@<sub-asset id>`; matching only
 * the bare form silently skips most references, since sprites and meshes point
 * at sub-assets.
 */
const UUID_PATTERN = /"__uuid__"\s*:\s*"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;

function closure(seeds, uuidIndex) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const filePath = queue.pop();
    if (seen.has(filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) continue;
    seen.add(filePath);
    if (!filePath.endsWith('.scene') && !filePath.endsWith('.prefab')) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const match of text.matchAll(UUID_PATTERN)) {
      const target = uuidIndex.get(match[1]);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

function bundleOwning(filePath, bundles) {
  for (const [folder, bundle] of bundles) {
    if (filePath === folder || filePath.startsWith(`${folder}${path.sep}`)) return bundle;
  }
  return null;
}

function readBootBundles(platform) {
  const template = path.join(templateRoot, platform, 'application.js');
  if (!existsSync(template)) return null;
  const match = /var BOOT_BUNDLES = \[([^\]]*)\]/.exec(readFileSync(template, 'utf8'));
  if (!match) {
    fail(`${platform}/application.js has no BOOT_BUNDLES declaration.`);
    return null;
  }
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function readRegionBundles() {
  const source = path.join(assetsRoot, 'scripts', 'world', 'InfiniteWorldManager.ts');
  if (!existsSync(source)) return [];
  const block = /const REGION_ASSET_BUNDLES[^=]*=\s*\{([^}]*)\}/.exec(readFileSync(source, 'utf8'));
  if (!block) return [];
  return [...block[1].matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
}

const uuidIndex = buildUuidIndex();
const bundles = readBundles();

const platforms = readdirSync(templateRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(templateRoot, entry.name, 'application.js')))
  .map((entry) => entry.name);
if (platforms.length === 0) fail('no platform boot templates found.');

const bootBundlesByPlatform = new Map();
for (const platform of platforms) {
  const names = readBootBundles(platform);
  if (names) bootBundlesByPlatform.set(platform, names);
}

const reference = bootBundlesByPlatform.get(platforms[0]) || [];
for (const [platform, names] of bootBundlesByPlatform) {
  if (JSON.stringify([...names].sort()) !== JSON.stringify([...reference].sort())) {
    fail(`${platform} boots [${names}] but ${platforms[0]} boots [${reference}]; the templates have drifted.`);
  }
}

const declaredNames = new Set([...bundles.values()].map((bundle) => bundle.name));
for (const name of reference) {
  if (!declaredNames.has(name)) fail(`BOOT_BUNDLES names "${name}", which is not a declared asset bundle.`);
}

const sceneSeeds = readdirSync(scenesRoot)
  .filter((name) => name.endsWith('.scene'))
  .map((name) => path.join(scenesRoot, name));
const reachable = closure(sceneSeeds, uuidIndex);

const referencedBundles = new Map();
for (const filePath of reachable) {
  const bundle = bundleOwning(filePath, bundles);
  if (!bundle) continue;
  if (!referencedBundles.has(bundle.name)) referencedBundles.set(bundle.name, []);
  referencedBundles.get(bundle.name).push(path.relative(assetsRoot, filePath));
}

for (const [name, files] of referencedBundles) {
  if (reference.includes(name) || ENGINE_PRELOADED.has(name)) continue;
  fail(
    `the launch scenes reference ${files.length} asset(s) in bundle "${name}" (e.g. ${files[0]}), `
    + `but no boot template loads it; the runtime fails with "Please load bundle ${name} first".`,
  );
}

for (const name of readRegionBundles()) {
  if (!reference.includes(name)) fail(`REGION_ASSET_BUNDLES names "${name}" but BOOT_BUNDLES does not load it.`);
}

notes.push(`${reachable.size} assets reachable from ${sceneSeeds.length} scene(s)`);
notes.push(`${bundles.size} declared bundle(s): ${[...bundles.values()].map((b) => `${b.name}(${b.configID})`).join(', ')}`);
notes.push(`boot bundles: ${reference.join(', ')}`);
for (const [name, files] of referencedBundles) notes.push(`  scene-referenced: ${name} -> ${files.length} asset(s)`);

for (const note of notes) console.log(`[boot-bundles] ${note}`);

if (failures.length > 0) {
  for (const message of failures) console.error(`[boot-bundles] FAIL: ${message}`);
  process.exitCode = 1;
} else {
  console.log('[boot-bundles] PASS: every bundle the launch scenes reference is resident before the launch scene.');
}
