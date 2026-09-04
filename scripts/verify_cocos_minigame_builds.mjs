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

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const creatorExe = process.env.COCOS_CREATOR_EXE || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';
const reportDirectory = path.join(cocosProject, 'docs', 'evidence', 'v2', 'platform');
const requireReleaseIds = process.argv.includes('--require-release-ids');
const requestedPlatform = process.argv.find((argument) => argument.startsWith('--platform='))?.slice('--platform='.length) || 'all';
const platformSpecs = {
  'web-mobile': {
    outputName: 'web-mobile',
    requiredFiles: ['index.html', 'application.js', 'src/settings.json'],
  },
  wechatgame: {
    outputName: 'wechatgame',
    requiredFiles: ['game.json', 'project.config.json', 'application.js', 'src/system.bundle.js'],
  },
  'bytedance-mini-game': {
    outputName: 'bytedance-mini-game',
    requiredFiles: ['game.json', 'project.config.json', 'application.js', 'src/system.bundle.js'],
  },
};

const selectedPlatforms = requestedPlatform === 'all'
  ? Object.keys(platformSpecs)
  : requestedPlatform.split(',').filter(Boolean);

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
  return new Promise((resolve, reject) => {
    const child = spawn(
      creatorExe,
      ['--project', cocosProject, '--build', `platform=${platform};debug=false;orientation=portrait;`],
      { cwd: cocosProject, windowsHide: true },
    );
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
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
  if (platform === 'web-mobile') return result;

  const game = readJson(path.join(outputDirectory, 'game.json'));
  assert(game.deviceOrientation === 'portrait', `${platform} game.json is not portrait.`);
  const project = readJson(path.join(outputDirectory, 'project.config.json'));
  const appId = typeof project.appid === 'string' ? project.appid.trim() : '';
  result.appId = appId || null;
  const isPlaceholder = !appId || /^test(app)?id$/i.test(appId) || /^your[-_ ]?app[-_ ]?id$/i.test(appId);
  result.releaseIdStatus = isPlaceholder ? 'placeholder' : 'configured';
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
  try {
    for (const platform of selectedPlatforms) {
      console.log(`[cocos:mini-builds] Building ${platform} with Cocos Creator 3.8.3...`);
      const startedAt = Date.now();
      const launcher = await buildPlatform(platform);
      const outputDirectory = await waitForFreshOutput(platform, startedAt);
      const validated = validateOutput(platform, outputDirectory);
      report.builds.push({ ...validated, launcherExitCode: launcher.code });
      console.log(`[cocos:mini-builds] PASS ${platform}: ${validated.fileCount} files, AppID=${validated.appId || 'n/a'} (${validated.releaseIdStatus}).`);
    }
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.failures.push(error instanceof Error ? error.message : String(error));
    console.error(`[cocos:mini-builds] FAIL: ${report.failures[0]}`);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    mkdirSync(reportDirectory, { recursive: true });
    const reportName = requireReleaseIds ? 'mini-build-release-preflight.json' : 'mini-build-report.json';
    const reportPath = path.join(reportDirectory, reportName);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[cocos:mini-builds] Report: ${reportPath}`);
  }
}

await main();
