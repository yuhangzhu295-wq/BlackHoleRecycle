/**
 * Official Cocos Creator 3.8.3 build evidence for Web Mobile, WeChat Game and
 * ByteDance Mini Game.  Creator's Windows launcher can return before its child
 * build workers finish, so this runner waits for fresh output artifacts rather
 * than treating that launcher exit code as a successful package.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireBuildLock } from './lib/build_ownership.mjs';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const creatorExe = process.env.COCOS_CREATOR_EXE || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';
const reportDirectory = path.join(cocosProject, 'docs', 'evidence', 'v2', 'platform');
const requireReleaseIds = process.argv.includes('--require-release-ids');
const requestedPlatform = process.argv.find((argument) => argument.startsWith('--platform='))?.slice('--platform='.length) || 'all';
/**
 * Platform options are passed as a generated config file, not as `--build` flags.
 *
 * `separateEngine` moves the engine into a folder the mini-game host loads as a
 * subpackage, which takes it out of the main-package budget. The engine is
 * ~3.96 MB of a 20 MB package, so without it the main package cannot approach
 * the 4 MB limit.
 *
 * The flag form cannot express it. `--build` splits its argument on `;` into
 * `key=value` pairs, so a dotted path stays a literal top-level key: the log for
 * `packages.wechatgame.separateEngine=true` shows `packages.wechatgame` arriving
 * with `separateEngine: false`, and a bare `separateEngine=true` arrives as the
 * top-level *string* `"true"`. Passing the options as JSON instead makes Creator
 * ignore every key and silently fall back to `web-desktop`. `configPath=` is the
 * only form that reaches the nested key, so the config is written here and the
 * path is handed to `--build`; the option is then verified by its effect on the
 * built output, because Creator ignores any option it does not recognise.
 */
const buildConfigDirectory = path.join(cocosProject, 'build-configs');

function writePlatformBuildConfig(platform) {
  const config = {
    platform,
    debug: false,
    startScene: REQUIRED_START_SCENE,
    // The engine is compiled per feature set. Creator's "Cache Build Engine"
    // preference keys on "engine code and compile options unchanged", and the
    // wechatgame build was observed reusing an all-features cache after
    // `modules.includeModules` was cropped, which left dragon-bones/spine/tiled-map
    // in the shipped package. Rebuilding the engine every time is the only way the
    // crop is guaranteed to reach the output; it costs about a minute.
    useBuildEngineCache: false,
  };
  if (platformSpecs[platform].miniGame) {
    config.packages = { [platform]: { orientation: 'portrait', separateEngine: true } };
  }
  mkdirSync(buildConfigDirectory, { recursive: true });
  const configPath = path.join(buildConfigDirectory, `${platform}.json`);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

const platformSpecs = {
  'web-mobile': {
    outputName: 'web-mobile',
    miniGame: false,
    requiredFiles: ['index.html', 'application.js', 'src/settings.json'],
  },
  wechatgame: {
    outputName: 'wechatgame',
    miniGame: true,
    requiredFiles: ['game.json', 'project.config.json', 'application.js', 'src/system.bundle.js'],
  },
  'bytedance-mini-game': {
    outputName: 'bytedance-mini-game',
    miniGame: true,
    requiredFiles: ['game.json', 'project.config.json', 'application.js', 'src/system.bundle.js'],
  },
};

const selectedPlatforms = requestedPlatform === 'all'
  ? Object.keys(platformSpecs)
  : requestedPlatform.split(',').filter(Boolean);

/**
 * The scene every platform must launch.
 *
 * `cocos/profiles/v2/packages/builder.json` stores this as `common.startScene`
 * for the GUI, but a headless `--build` invocation does not inherit it: without
 * an explicit value Creator falls back to the alphabetically first scene, which
 * is the empty `Bootstrap.scene` left behind by scripts/format_official_scenes.js.
 * That silently shipped a mini-game package whose first screen had no game in it,
 * so the option is now passed explicitly and asserted on the built output.
 */
const REQUIRED_START_SCENE = 'scene-game-0001-8888-9999-aaaabbbbcccc';
const REQUIRED_LAUNCH_SCENE_PATH = 'db://assets/scenes/Game.scene';
/**
 * Bundles the boot template must load before it schedules the launch scene.
 *
 * Asserted from the built `application.js`, because the failure mode is silent
 * in the build: a bundle the launch scene references but nothing preloads only
 * shows up at runtime as `Please load bundle <name> first`, after which the game
 * never reaches its first frame.
 */
const REQUIRED_BOOT_BUNDLES = ['world-city', 'game-art', 'art-machines'];

/**
 * Mirrors the DevTools' own schema for `project.config.json` -> `libVersion`
 * (`js/common/miniprogram-builder/schema/dist/projectconfig.js`). Creator 3.8.3
 * ships `"game"` in its wechatgame template, which matches neither the enum nor
 * the version pattern, so the DevTools aborts the simulator launch with
 * `libVersion 字段需为 string` and then crashes on `getPreCompileOptions`.
 * The project overrides it through `build-templates/wechatgame/`; this mirrors
 * the platform rule exactly (including the unescaped `.`) so the gate cannot
 * drift away from what the DevTools actually accepts.
 */
const LIB_VERSION_ENUM = new Set(['', 'development', 'latest', 'trial', 'widelyUsed']);

function isValidLibVersion(value) {
  if (typeof value !== 'string') return false;
  if (LIB_VERSION_ENUM.has(value)) return true;
  return /^[0-9]*.[0-9]*.[0-9]*$/.test(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function newestModification(directory) {
  let newest = 0;
  const scan = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) scan(target);
      else newest = Math.max(newest, statSync(target).mtimeMs);
    }
  };
  if (existsSync(directory)) scan(directory);
  return newest;
}

function buildPlatform(platform) {
  const localLock = acquireBuildLock({ purpose: `Cocos Creator build (${platform})` });
  return new Promise((resolve, reject) => {
    const child = spawn(
      creatorExe,
      ['--project', cocosProject, '--build', `configPath=${writePlatformBuildConfig(platform)}`],
      { cwd: cocosProject, windowsHide: true },
    );
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (err) => {
      try { localLock.release(); } catch {}
      reject(err);
    });
    child.on('close', (code) => {
      try { localLock.release(); } catch {}
      if (code === 0 || code === 36) resolve({ code, output });
      else reject(new Error(`Creator launcher failed for ${platform} with exit ${code}.\n${output}`));
    });
  });
}

async function waitForFreshOutput(platform, startedAt) {
  const spec = platformSpecs[platform];
  const outputDirectory = path.join(cocosProject, 'build', spec.outputName);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const hasRequiredFiles = spec.requiredFiles.every((relativePath) => existsSync(path.join(outputDirectory, relativePath)));
    const freshEnough = newestModification(outputDirectory) >= startedAt - 2_000;
    if (hasRequiredFiles && freshEnough) return outputDirectory;
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for fresh ${platform} output in ${outputDirectory}.`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function countFiles(directory) {
  let count = 0;
  const scan = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) scan(target);
      else count += 1;
    }
  };
  scan(directory);
  return count;
}

function validateOutput(platform, outputDirectory) {
  const spec = platformSpecs[platform];
  const result = {
    platform,
    outputDirectory,
    fileCount: countFiles(outputDirectory),
    requiredFiles: spec.requiredFiles,
    releaseIdStatus: 'not-applicable',
  };
  assert(result.fileCount > spec.requiredFiles.length, `${platform} emitted too few files (${result.fileCount}).`);
  for (const relativePath of spec.requiredFiles) {
    const filePath = path.join(outputDirectory, relativePath);
    assert(statSync(filePath).size > 0, `${platform} emitted an empty ${relativePath}.`);
  }

  // The first screen is the one thing a package can get wrong while every size
  // and file-presence check still passes, so it is asserted from the real output.
  const settings = readJson(path.join(outputDirectory, 'src', 'settings.json'));
  const launchScene = typeof settings?.launch?.launchScene === 'string' ? settings.launch.launchScene : null;
  result.launchScene = launchScene;
  assert(
    launchScene === REQUIRED_LAUNCH_SCENE_PATH,
    `${platform} launches "${launchScene || '(none)'}" instead of "${REQUIRED_LAUNCH_SCENE_PATH}".`,
  );
  result.preloadBundles = (settings?.assets?.preloadBundles || []).map((entry) => entry?.bundle).filter(Boolean);
  const application = readFileSync(path.join(outputDirectory, 'application.js'), 'utf8');
  for (const bundle of REQUIRED_BOOT_BUNDLES) {
    assert(
      application.includes(`'${bundle}'`),
      `${platform} application.js does not load the "${bundle}" boot bundle before the launch scene.`,
    );
  }
  result.bootBundles = [...REQUIRED_BOOT_BUNDLES];
  result.subpackages = settings?.assets?.subpackages || [];
  if (platform === 'web-mobile') return result;

  const game = readJson(path.join(outputDirectory, 'game.json'));
  assert(game.deviceOrientation === 'portrait', `${platform} game.json is not portrait.`);
  const project = readJson(path.join(outputDirectory, 'project.config.json'));
  const appId = typeof project.appid === 'string' ? project.appid.trim() : '';
  result.appId = appId || null;
  const isPlaceholder = !appId || /^test(app)?id$/i.test(appId) || /^your[-_ ]?app[-_ ]?id$/i.test(appId);
  result.releaseIdStatus = isPlaceholder ? 'placeholder' : 'configured';

  // An unusable libVersion does not fail the build - it fails much later, inside
  // the DevTools, where it aborts the simulator before any of the game runs.
  assert(
    isValidLibVersion(project.libVersion),
    `${platform} project.config.json has libVersion ${JSON.stringify(project.libVersion)}; the DevTools ` +
      'schema only accepts "", "development", "latest", "trial", "widelyUsed" or "x.y.z".',
  );
  result.libVersion = project.libVersion;
  if (requireReleaseIds) {
    assert(!isPlaceholder, `${platform} requires a real AppID for release preflight; found ${appId || '(empty)'}.`);
  }
  return result;
}

async function main() {
  assert(existsSync(creatorExe), `Cocos Creator 3.8.3 was not found: ${creatorExe}`);
  assert(selectedPlatforms.length > 0, 'No platforms selected.');
  for (const platform of selectedPlatforms) assert(platformSpecs[platform], `Unsupported Cocos build platform: ${platform}`);

  const report = {
    status: 'RUNNING',
    creatorExe,
    requestedPlatform,
    requireReleaseIds,
    startedAt: new Date().toISOString(),
    builds: [],
    failures: [],
  };
  let buildLock = null;
  try {
    buildLock = acquireBuildLock({
      purpose: `verify_cocos_minigame_builds --platform=${requestedPlatform}`,
    });
    for (const platform of selectedPlatforms) {
      console.log(`[cocos:mini-builds] Building ${platform} with Cocos Creator 3.8.3...`);
      const startedAt = Date.now();
      const launcher = await buildPlatform(platform);
      const outputDirectory = await waitForFreshOutput(platform, startedAt);
      const validated = validateOutput(platform, outputDirectory);
      report.builds.push({ ...validated, launcherExitCode: launcher.code });
      console.log(`[cocos:mini-builds] PASS ${platform}: ${validated.fileCount} files, launch=${validated.launchScene}, boot=${validated.bootBundles.join('+')}, subpackages=[${validated.subpackages.join(',')}], AppID=${validated.appId || 'n/a'} (${validated.releaseIdStatus}), libVersion=${validated.libVersion ?? 'n/a'}.`);
    }
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.failures.push(error instanceof Error ? error.message : String(error));
    console.error(`[cocos:mini-builds] FAIL: ${report.failures[0]}`);
    process.exitCode = 1;
  } finally {
    if (buildLock) {
      buildLock.release();
    }
    report.finishedAt = new Date().toISOString();
    mkdirSync(reportDirectory, { recursive: true });
    const reportName = requireReleaseIds ? 'mini-build-release-preflight.json' : 'mini-build-report.json';
    const reportPath = path.join(reportDirectory, reportName);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[cocos:mini-builds] Report: ${reportPath}`);
  }
}

await main();
