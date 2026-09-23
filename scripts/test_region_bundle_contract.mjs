/**
 * Region bundle loading contract.
 *
 * Product rule: region-scoped art lives in Asset Bundles that are loaded on
 * demand, and a region whose art never arrived must produce an explicit message
 * plus a Retry instead of an empty world or a black screen.
 *
 * Two layers are involved and both are checked here:
 *   * boot  — `cocos/build-templates/<platform>/application.js` loads the art the
 *             launch scene already references, between `game.init()` and
 *             `game.run()`. The engine preloads `preloadBundles` before the
 *             launch scene but has no error surface, so this is the only point
 *             where retryable loading still precedes the first screen.
 *   * runtime — `RegionBundleService`, exercised here against a stubbed asset
 *             manager so the retry/terminal-state behaviour is executed rather
 *             than grepped.
 *
 * The state machine checks below are source-level execution, not a runtime
 * package run; the package-level behaviour is covered by the release gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readFile = (relative) => fs.readFileSync(path.join(rootDirectory, relative), 'utf8');

const record = (name, pass, detail) => {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

// ---------------------------------------------------------------- boot layer

/** Parse `BOOT_BUNDLES = ['a', 'b']` out of a build template. */
function bootBundlesOf(relativePath) {
  const source = readFile(relativePath);
  const match = source.match(/var\s+BOOT_BUNDLES\s*=\s*\[([^\]]*)\]/);
  if (!match) return null;
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const platformTemplates = ['wechatgame', 'bytedance-mini-game', 'web-mobile'];
const bootBundlesByPlatform = new Map();
for (const platform of platformTemplates) {
  const bundles = bootBundlesOf(`cocos/build-templates/${platform}/application.js`);
  record(
    `BOOT_TEMPLATE_${platform.toUpperCase().replace(/-/g, '_')}`,
    Array.isArray(bundles) && bundles.length > 0,
    bundles === null ? 'BOOT_BUNDLES not found' : `BOOT_BUNDLES=[${bundles.join(',')}]`,
  );
  bootBundlesByPlatform.set(platform, bundles);
}

const uniqueBootSets = new Set([...bootBundlesByPlatform.values()].map((bundles) => bundles.join('+')));
record('BOOT_TEMPLATES_AGREE', uniqueBootSets.size === 1, `distinct BOOT_BUNDLES sets: ${[...uniqueBootSets].join(' | ')}`);

// The runtime layer's bundle names must match the boot layer's, or the boot
// preload would load a bundle nothing references.
const worldManagerSource = readFile('cocos/assets/scripts/world/InfiniteWorldManager.ts');
const regionBundleTable = worldManagerSource.match(/const REGION_ASSET_BUNDLES[\s\S]*?=\s*\{([\s\S]*?)\};/);
const regionBundles = regionBundleTable
  ? [...regionBundleTable[1].matchAll(/:\s*'([^']+)'/g)].map((match) => match[1])
  : [];
const bootBundles = bootBundlesByPlatform.get('wechatgame') || [];
record(
  'BOOT_AND_RUNTIME_BUNDLES_AGREE',
  regionBundles.length > 0 && regionBundles.every((name) => bootBundles.includes(name)),
  `runtime=[${regionBundles.join(',')}] boot=[${bootBundles.join(',')}]`,
);

// ------------------------------------------------------- bundle root hygiene
//
// Creator does not support nested Asset Bundles, and `assets/resources` is
// itself a bundle: a bundle root placed underneath it silently never becomes its
// own package. Enumerate the real roots rather than trusting a hand-written list.
function bundleRoots() {
  const found = [];
  const walk = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) { walk(child); continue; }
      if (!entry.name.endsWith('.meta')) continue;
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(child, 'utf8')); } catch { continue; }
      if (parsed?.userData?.isBundle !== true) continue;
      found.push({
        root: path.relative(rootDirectory, child).replace(/\.meta$/, '').replace(/\\/g, '/'),
        name: parsed.userData.bundleName,
        config: parsed.userData.bundleConfigID,
      });
    }
  };
  walk(path.join(rootDirectory, 'cocos/assets'));
  return found;
}

const bundleRootsFound = bundleRoots();
record(
  'BUNDLE_ROOTS_ENUMERATED',
  bundleRootsFound.length >= 2,
  bundleRootsFound.map((bundle) => `${bundle.root}=${bundle.name}(${bundle.config})`).join(' | '),
);

const nestedBundleRoots = bundleRootsFound.filter((bundle) =>
  bundleRootsFound.some((other) => other !== bundle && bundle.root.startsWith(`${other.root}/`)));
record(
  'NO_NESTED_BUNDLE_ROOTS',
  nestedBundleRoots.length === 0,
  nestedBundleRoots.length ? nestedBundleRoots.map((bundle) => bundle.root).join(',') : 'none nested',
);

// ------------------------------------------------- non-region landmark bundle
//
// The authored construction-site landmark is the single heaviest asset in the
// project. It is not region art and nothing waits on it, so it must be loaded on
// demand and must never appear in BOOT_BUNDLES: that would make every player wait
// for the whole subpackage before the first frame.
const constructionMetaPath = 'cocos/assets/bundles/world-construction.meta';
record(
  'CONSTRUCTION_BUNDLE_META_EXISTS',
  fs.existsSync(path.join(rootDirectory, constructionMetaPath)),
  constructionMetaPath,
);
const constructionMeta = JSON.parse(readFile(constructionMetaPath));
record(
  'CONSTRUCTION_BUNDLE_IS_SUBPACKAGE',
  constructionMeta.userData?.isBundle === true
    && constructionMeta.userData?.bundleConfigID === 'mini-game-subpackage'
    && constructionMeta.userData?.bundleName === 'world-construction',
  JSON.stringify(constructionMeta.userData),
);

const constructionBundleDirectory = 'cocos/assets/bundles/world-construction';
const constructionBundleEntries = fs.existsSync(path.join(rootDirectory, constructionBundleDirectory))
  ? fs.readdirSync(path.join(rootDirectory, constructionBundleDirectory)).filter((entry) => !entry.endsWith('.meta'))
  : [];
record(
  'CONSTRUCTION_BUNDLE_OWNS_ITS_ASSET',
  constructionBundleEntries.some((entry) => entry.endsWith('.fbx')),
  `non-meta entries: [${constructionBundleEntries.join(',')}]`,
);
record(
  'CONSTRUCTION_BUNDLE_NOT_IN_BOOT',
  !bootBundles.includes('world-construction'),
  `boot=[${bootBundles.join(',')}]`,
);
record(
  'CONSTRUCTION_LOADER_USES_BUNDLE',
  /ensureLoaded\(CONSTRUCTION_LANDMARK_BUNDLE\)/.test(worldManagerSource)
    && /getBundle\(CONSTRUCTION_LANDMARK_BUNDLE\)/.test(worldManagerSource)
    && /bundle\.load\(CONSTRUCTION_LANDMARK_ASSET,\s*Prefab/.test(worldManagerSource)
    && !/\bresources\.load\(/.test(worldManagerSource),
  'landmark loads from its own bundle; no resources.load remains',
);

// The boot template must not resolve before the bundles are resident, otherwise
// game.run() would schedule the launch scene without them.
const wechatTemplate = readFile('cocos/build-templates/wechatgame/application.js');
const wechatTemplateCode = wechatTemplate
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
record(
  'BOOT_PRELOAD_PRECEDES_RUN',
  /\.then\(function\s*\(\)\s*\{\s*return\s+ensureBootBundles\(\);\s*\}\)/.test(wechatTemplateCode)
    && wechatTemplateCode.indexOf('ensureBootBundles();') < wechatTemplateCode.indexOf('cc.game.run()'),
  'ensureBootBundles() is awaited before cc.game.run()',
);
record(
  'BOOT_FAILURE_HAS_RETRY',
  /showModal/.test(wechatTemplate) && /'重试'/.test(wechatTemplate) && /typeof document/.test(wechatTemplate),
  'mini-game modal and web overlay both offer Retry',
);

// ------------------------------------------------------------- release gate

const buildScript = readFile('scripts/verify_cocos_minigame_builds.mjs');
record(
  'BUILD_PASSES_START_SCENE',
  /startScene=\$\{REQUIRED_START_SCENE\}/.test(buildScript),
  'headless build passes startScene explicitly',
);
record(
  'BUILD_ASSERTS_LAUNCH_SCENE',
  /launchScene === REQUIRED_LAUNCH_SCENE_PATH/.test(buildScript),
  'built settings.json launch scene is asserted, not assumed',
);

// Creator 3.8.3's own wechatgame template ships "libVersion": "game", which the
// DevTools schema rejects - the simulator then aborts before the game ever runs.
// The override lives in build-templates/ and the build asserts it, so both ends
// are checked here without paying for a build.
const wechatProjectConfigTemplate = JSON.parse(readFile('cocos/build-templates/wechatgame/project.config.json'));
const LIB_VERSION_ENUM = new Set(['', 'development', 'latest', 'trial', 'widelyUsed']);
const templateLibVersion = wechatProjectConfigTemplate.libVersion;
record(
  'WECHAT_TEMPLATE_OVERRIDES_LIB_VERSION',
  typeof templateLibVersion === 'string'
    && (LIB_VERSION_ENUM.has(templateLibVersion) || /^[0-9]*.[0-9]*.[0-9]*$/.test(templateLibVersion)),
  `build-templates libVersion=${JSON.stringify(templateLibVersion)}`,
);
record(
  'BUILD_ASSERTS_LIB_VERSION',
  /isValidLibVersion\(project\.libVersion\)/.test(buildScript),
  'built project.config.json libVersion is asserted against the DevTools schema',
);

// ---------------------------------------------------------------- ui layer

const platformInterface = readFile('cocos/assets/scripts/platform/IPlatformAdapter.ts');
const platformImplementation = readFile('cocos/assets/scripts/platform/EditorPlatformAdapter.ts');
record(
  'PLATFORM_ADAPTER_EXPOSES_RETRY',
  /showRetryDialog\(/.test(platformInterface)
    && (platformImplementation.match(/showRetryDialog\(/g) || []).length === 3,
  `${(platformImplementation.match(/showRetryDialog\(/g) || []).length} implementations (web, WeChat, Douyin)`,
);
record(
  'GAME_MANAGER_SURFACES_REGION_FAILURE',
  /eventBus\.on\('UI_REGION_ART_FAILED'/.test(readFile('cocos/assets/scripts/gameplay/GameManager.ts')),
  'GameManager turns the region-art failure event into a Retry dialog',
);

// ------------------------------------------------- runtime state machine

const serviceSource = readFile('cocos/assets/scripts/world/RegionBundleService.ts')
  .replace(/^import\s+\{[^}]*\}\s+from\s+'cc';$/m, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const compiled = transformSync(
  'const __stub = { calls: [], outcomes: [] };\n'
  + 'const assetManager = { loadBundle: (name, callback) => { __stub.calls.push(name); const outcome = __stub.outcomes.shift(); if (outcome) callback(outcome, null); else callback(null, { name }); } };\n'
  + serviceSource
  + '\n;globalThis.__RegionBundleService = RegionBundleService;'
  + '\n;globalThis.__regionBundleStub = __stub;',
  { loader: 'ts', target: 'es2022', format: 'iife' },
).code;

new Function(compiled)();
const RegionBundleService = globalThis.__RegionBundleService;
/** Shared with the compiled stub, so resetting these fields steers the service. */
const state = globalThis.__regionBundleStub;

// 1. Happy path.
{
  const service = new RegionBundleService();
  await service.ensureLoaded('world-city');
  record('SERVICE_LOADS_BUNDLE', service.isLoaded('world-city') && service.getStatus('world-city').state === 'LOADED',
    `state=${service.getStatus('world-city').state} calls=${state.calls.length}`);
}

// 2. Concurrent callers share one download.
{
  state.calls = [];
  state.outcomes = [];
  const service = new RegionBundleService();
  await Promise.all([service.ensureLoaded('world-city'), service.ensureLoaded('world-city'), service.ensureLoaded('world-city')]);
  record('SERVICE_DEDUPES_IN_FLIGHT', state.calls.length === 1, `loadBundle calls=${state.calls.length}`);
}

// 3. Failures retry, then become terminal with a player-facing message.
{
  state.calls = [];
  state.outcomes = [new Error('network down'), new Error('network down'), new Error('network down')];
  const service = new RegionBundleService({ maxAttempts: 3, retryDelayMs: 0 });
  let rejected = false;
  await service.ensureLoaded('world-city').catch(() => { rejected = true; });
  const status = service.getStatus('world-city');
  const failure = service.getLastFailure();
  record('SERVICE_RETRIES_THEN_FAILS',
    rejected && status.state === 'FAILED' && status.attempts === 3 && state.calls.length === 3,
    `attempts=${status.attempts} calls=${state.calls.length} state=${status.state}`);
  record('SERVICE_FAILURE_IS_PLAYER_READABLE',
    Boolean(failure && /区域资源加载失败/.test(failure.message) && failure.bundleName === 'world-city'),
    failure ? failure.message : 'no failure recorded');

  // 4. FAILED is terminal: no silent per-frame hammering.
  const callsBefore = state.calls.length;
  await service.ensureLoaded('world-city').catch(() => undefined);
  record('SERVICE_FAILED_IS_TERMINAL', state.calls.length === callsBefore,
    `calls before=${callsBefore} after=${state.calls.length}`);

  // 5. An explicit retry starts a fresh budget and can recover.
  state.outcomes = [];
  service.reset('world-city');
  await service.ensureLoaded('world-city');
  record('SERVICE_RETRY_RECOVERS', service.isLoaded('world-city') && service.getLastFailure() === null,
    `state=${service.getStatus('world-city').state}`);
}

// 6. preload never becomes an unhandled rejection.
{
  state.calls = [];
  state.outcomes = [new Error('offline'), new Error('offline')];
  const service = new RegionBundleService({ maxAttempts: 2, retryDelayMs: 0 });
  service.preload('world-city', '0:0');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const status = service.getStatus('world-city');
  record('SERVICE_PRELOAD_REPORTS_WAITING',
    status.state === 'FAILED' && status.waitingCount === 1,
    `state=${status.state} waiting=${status.waitingCount}`);
  service.release('world-city', '0:0');
  record('SERVICE_RELEASE_CLEARS_WAITING', service.getStatus('world-city').waitingCount === 0,
    `waiting=${service.getStatus('world-city').waitingCount}`);
}

console.log('\n[region-bundle-contract] all checks passed.');
