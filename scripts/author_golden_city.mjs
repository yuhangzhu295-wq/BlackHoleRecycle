import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(repo, 'cocos');
const artifacts = path.join(repo, 'artifacts', 'authoring');
const pending = path.join(artifacts, 'pending-job.json');
const processing = path.join(artifacts, 'processing-job.json');
const resultPath = path.join(artifacts, 'result.json');
const runnerTimeoutPath = path.join(artifacts, 'runner-timeout.json');
const startupPath = path.join(project, 'temp', 'startup.json');
const prefabAbs = path.join(project, 'assets', 'prefabs', 'world', 'GoldenCityCell.prefab');
const metaAbs = path.join(project, 'assets', 'prefabs', 'world', 'GoldenCityCell.prefab.meta');
const creatorExe = process.env.COCOS_CREATOR_PATH || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';
const timeoutMs = Number(process.env.AUTHORING_TIMEOUT_MS || 120000);
const jobArg = process.argv.find((arg) => arg.startsWith('--job='))?.slice('--job='.length);
const targetJob = jobArg || process.env.AUTHORING_JOB || 'BUILD_GOLDEN_CITY';

fs.mkdirSync(artifacts, { recursive: true });

function normalizeProjectPath(value) {
  return path.normalize(path.resolve(String(value))).replace(/[\\/]+$/, '').toLowerCase();
}

function splitWindowsCommandLine(commandLine) {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let backslashes = 0;

  for (const character of String(commandLine || '')) {
    if (character === '\\') {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      current += '\\'.repeat(Math.floor(backslashes / 2));
      if (backslashes % 2 === 0) inQuotes = !inQuotes;
      else current += '"';
      backslashes = 0;
      continue;
    }
    if (/\s/.test(character) && !inQuotes) {
      current += '\\'.repeat(backslashes);
      backslashes = 0;
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += '\\'.repeat(backslashes) + character;
    backslashes = 0;
  }
  current += '\\'.repeat(backslashes);
  if (current) tokens.push(current);
  return tokens;
}

function analyzeCreatorProcess(processInfo, normalizedTarget) {
  const pid = Number(processInfo?.ProcessId);
  const commandLine = String(processInfo?.CommandLine || '');
  const tokens = splitWindowsCommandLine(commandLine);
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const projectIndex = lowerTokens.findIndex((token) => token === '--project' || token.startsWith('--project='));
  const projectValue = projectIndex === -1
    ? null
    : (lowerTokens[projectIndex] === '--project'
      ? tokens[projectIndex + 1]
      : tokens[projectIndex].slice('--project='.length));
  const reasons = [];

  if (!Number.isInteger(pid) || pid <= 0) reasons.push('invalid-pid');
  if (!projectValue) reasons.push('missing-project-argument');
  else if (normalizeProjectPath(projectValue) !== normalizedTarget) reasons.push('different-project');
  if (lowerTokens.some((token) => token === '--help' || token === '-h' || token === '/?' || token.startsWith('--help='))) {
    reasons.push('help-or-cli-command');
  }
  if (lowerTokens.some((token) => token === '--version' || token === '-v' || token.startsWith('--version=') || token.startsWith('--type='))) {
    reasons.push('non-editor-process');
  }

  return {
    pid,
    commandLine,
    projectArgument: projectValue,
    accepted: reasons.length === 0,
    reasons,
  };
}

function queryCocosCreatorProcesses() {
  if (process.env.AUTHORING_PROCESS_SNAPSHOT) {
    const supplied = JSON.parse(process.env.AUTHORING_PROCESS_SNAPSHOT);
    return Array.isArray(supplied) ? supplied : [supplied];
  }
  const ps = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name = 'CocosCreator.exe'\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"
  ], { encoding: 'utf8', windowsHide: true });
  if (ps.status !== 0) {
    throw new Error((ps.stderr || ps.stdout || 'Cocos Creator process query failed').trim());
  }
  if (!ps.stdout || !ps.stdout.trim()) return [];
  const parsed = JSON.parse(ps.stdout.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

function findProjectCreatorPid(projectDir) {
  const normalizedTarget = normalizeProjectPath(projectDir);
  let startupPid = null;
  try {
    const raw = JSON.parse(fs.readFileSync(startupPath, 'utf8'));
    if (raw && raw.pid) startupPid = Number(raw.pid);
  } catch {}

  try {
    const candidates = queryCocosCreatorProcesses()
      .map((processInfo) => analyzeCreatorProcess(processInfo, normalizedTarget))
      .sort((left, right) => left.pid - right.pid);
    const accepted = candidates.filter((candidate) => candidate.accepted);
    const evidence = {
      targetProject: normalizedTarget,
      startupPid,
      candidates,
      selectedPid: null,
    };
    if (accepted.length === 1) {
      return { status: 'SELECTED', ...evidence, selectedPid: accepted[0].pid };
    }
    if (accepted.length > 1) {
      return { status: 'AMBIGUOUS_MATCHING_EDITORS', ...evidence };
    }
    return { status: 'NO_MATCHING_EDITOR', ...evidence };
  } catch (error) {
    return {
      status: 'DISCOVERY_ERROR',
      targetProject: normalizedTarget,
      startupPid,
      candidates: [],
      selectedPid: null,
      error: error.stack || String(error),
    };
  }
}

function dependencyPreflight() {
  const checks = {
    cocosPackage: fs.existsSync(path.join(project, 'package.json')),
    gameScene: fs.existsSync(path.join(project, 'assets', 'scenes', 'Game.scene')),
    extensionMain: fs.existsSync(path.join(project, 'extensions', 'black-hole-world-art-builder', 'main.js')),
    extensionScene: fs.existsSync(path.join(project, 'extensions', 'black-hole-world-art-builder', 'scene.js')),
    sdkResolved: false,
    sdkPath: null,
    errors: [],
  };
  try {
    const probe = spawnSync(process.execPath, ['-e', "console.log(require.resolve('@colyseus/sdk/package.json'))"], {
      cwd: project,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (probe.status === 0) {
      checks.sdkPath = probe.stdout.trim();
      checks.sdkResolved = checks.sdkPath.toLowerCase().startsWith(path.join(project, 'node_modules', '@colyseus', 'sdk').toLowerCase());
    } else {
      checks.errors.push((probe.stderr || probe.stdout || 'sdk resolution failed').trim());
    }
  } catch (error) {
    checks.errors.push(error.stack || String(error));
  }
  for (const [name, ok] of Object.entries(checks)) {
    if (['errors', 'sdkPath', 'sdkResolved'].includes(name)) continue;
    if (!ok) checks.errors.push(name + ' missing');
  }
  checks.pass = checks.errors.length === 0 && checks.sdkResolved;
  return checks;
}

if (process.env.AUTHORING_PROCESS_SELECTION_TEST === '1') {
  const discovery = findProjectCreatorPid(project);
  console.log(JSON.stringify(discovery, null, 2));
  process.exitCode = discovery.status === 'SELECTED' ? 0 : 1;
  process.exit();
}

const preflight = dependencyPreflight();
if (!preflight.pass) {
  const blocked = {
    job: targetJob,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    success: false,
    phase: 'DEPENDENCY_PREFLIGHT',
    dependencyPreflight: preflight,
    prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
    prefabExists: fs.existsSync(prefabAbs),
    metaExists: fs.existsSync(metaAbs),
    error: preflight.errors.join('; ') || 'dependency preflight failed',
  };
  fs.writeFileSync(resultPath, JSON.stringify(blocked, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(blocked, null, 2));
  process.exit(1);
}
console.log('[runner] AUTHORING_DEPENDENCY_PREFLIGHT = PASS');

// Clean previous run signals if not currently processing
if (!fs.existsSync(processing)) {
  for (const file of [pending, resultPath, runnerTimeoutPath]) {
    try { fs.rmSync(file, { force: true }); } catch {}
  }
}

const creatorDiscovery = findProjectCreatorPid(project);
let existingPid = creatorDiscovery.selectedPid;

if (creatorDiscovery.status === 'DISCOVERY_ERROR' || creatorDiscovery.status === 'AMBIGUOUS_MATCHING_EDITORS') {
  const errorResult = {
    job: targetJob,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    success: false,
    prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
    prefabExists: fs.existsSync(prefabAbs),
    metaExists: fs.existsSync(metaAbs),
    verifyResult: null,
    phase: creatorDiscovery.status === 'DISCOVERY_ERROR' ? 'CREATOR_PROCESS_DISCOVERY_FAILED' : 'AMBIGUOUS_CREATOR_INSTANCE',
    error: creatorDiscovery.status === 'DISCOVERY_ERROR'
      ? 'Unable to determine a safe Cocos Creator editor process'
      : 'More than one eligible Cocos Creator editor process targets this project',
    creatorDiscovery,
  };
  fs.writeFileSync(resultPath, JSON.stringify(errorResult, null, 2) + '\n');
  console.log(JSON.stringify(errorResult, null, 2));
  process.exit(1);
}

if (!existingPid) {
  if (!fs.existsSync(creatorExe)) {
    const errorResult = {
      job: targetJob,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      success: false,
      prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
      prefabExists: fs.existsSync(prefabAbs),
      metaExists: fs.existsSync(metaAbs),
      verifyResult: null,
      phase: 'CREATOR_NOT_FOUND',
      error: 'Cocos Creator executable not found: ' + creatorExe,
      creatorDiscovery,
    };
    fs.writeFileSync(resultPath, JSON.stringify(errorResult, null, 2) + '\n');
    console.log(JSON.stringify(errorResult, null, 2));
    process.exit(1);
  }

  console.log('[runner] No active Creator found for project. Launching dedicated instance: ' + creatorExe + ' --project ' + project);
  const launched = spawn(creatorExe, ['--project', project], { detached: true, stdio: 'ignore', windowsHide: false });
  launched.unref();
  existingPid = Number(launched.pid);
  if (!Number.isInteger(existingPid) || existingPid <= 0) throw new Error('Unable to determine PID for launched Cocos Creator editor');
}

const job = {
  jobId: randomUUID(),
  job: targetJob,
  requestedAt: new Date().toISOString(),
  targetCreatorPid: existingPid,
  targetProjectPath: normalizeProjectPath(project),
};

// Atomically publish a job only after the target Creator PID is known.
const pendingTmp = path.join(artifacts, 'pending-job.' + Date.now() + '.' + Math.random().toString(36).slice(2) + '.tmp');
fs.writeFileSync(pendingTmp, JSON.stringify(job, null, 2) + '\n', 'utf8');
fs.renameSync(pendingTmp, pending);

if (existingPid) {
  console.log('[runner] Discovered active Cocos Creator editor for project: PID ' + existingPid);
  console.log('[runner] Creator process selection evidence: ' + JSON.stringify(creatorDiscovery));
}

console.log('[runner] Waiting up to ' + timeoutMs + 'ms for Extension authoring job execution...');
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  if (fs.existsSync(resultPath)) {
    try {
      const content = fs.readFileSync(resultPath, 'utf8');
      const result = JSON.parse(content);
      console.log(JSON.stringify({ ...result, existingCreatorPid: existingPid, creatorDiscovery }, null, 2));
      process.exitCode = result.success ? 0 : 1;
      process.exit();
    } catch (parseErr) {
      // Possible write-in-progress, continue polling
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Timeout reached. Check again if result was just written
if (fs.existsSync(resultPath)) {
  try {
    const content = fs.readFileSync(resultPath, 'utf8');
    const result = JSON.parse(content);
    console.log(JSON.stringify({ ...result, existingCreatorPid: existingPid, creatorDiscovery }, null, 2));
    process.exitCode = result.success ? 0 : 1;
    process.exit();
  } catch {}
}

const creatorProcessing = fs.existsSync(processing);
const timeoutRecord = {
  job: job.job,
  startedAt: job.requestedAt,
  finishedAt: new Date().toISOString(),
  success: false,
  prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
  prefabExists: fs.existsSync(prefabAbs),
  metaExists: fs.existsSync(metaAbs),
  verifyResult: null,
  phase: creatorProcessing
    ? 'TIMEOUT_WHILE_PROCESSING'
    : (existingPid ? 'EXISTING_CREATOR_EXTENSION_NOT_RELOADED' : 'AUTHORING_TIMEOUT'),
  error: existingPid
    ? ('Existing Creator PID ' + existingPid + ' was reused, but its loaded extension did not finish the job within ' + timeoutMs + 'ms (creatorProcessing: ' + creatorProcessing + ')')
    : ('No authoring result within ' + timeoutMs + 'ms'),
  runnerTimeout: true,
  existingCreatorPid: existingPid,
  creatorDiscovery,
  creatorProcessing,
};

// Write runner timeout report
fs.writeFileSync(runnerTimeoutPath, JSON.stringify(timeoutRecord, null, 2) + '\n', 'utf8');

// Do not overwrite Creator result if Creator already created or is creating result.json
try {
  fs.writeFileSync(resultPath, JSON.stringify(timeoutRecord, null, 2) + '\n', { flag: 'wx' });
} catch (e) {
  if (e && e.code === 'EEXIST') {
    try {
      const content = fs.readFileSync(resultPath, 'utf8');
      const realResult = JSON.parse(content);
      console.log(JSON.stringify({ ...realResult, existingCreatorPid: existingPid, creatorDiscovery }, null, 2));
      process.exitCode = realResult.success ? 0 : 1;
      process.exit();
    } catch {}
  }
}

console.log(JSON.stringify(timeoutRecord, null, 2));
process.exitCode = 1;
