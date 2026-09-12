import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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

const job = {
  job: targetJob,
  requestedAt: new Date().toISOString(),
};

// Atomically publish pending job
const pendingTmp = path.join(artifacts, 'pending-job.' + Date.now() + '.' + Math.random().toString(36).slice(2) + '.tmp');
fs.writeFileSync(pendingTmp, JSON.stringify(job, null, 2) + '\n', 'utf8');
fs.renameSync(pendingTmp, pending);

function findProjectCreatorPid(projectDir) {
  const normalizedTarget = path.resolve(projectDir).toLowerCase();

  // 1. Check startup.json
  let startupPid = null;
  try {
    const raw = JSON.parse(fs.readFileSync(startupPath, 'utf8'));
    if (raw && raw.pid) startupPid = Number(raw.pid);
  } catch {}

  // 2. Query PowerShell CIM for CocosCreator.exe processes
  try {
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name = 'CocosCreator.exe'\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', windowsHide: true });

    if (ps.status === 0 && ps.stdout && ps.stdout.trim()) {
      const parsed = JSON.parse(ps.stdout.trim());
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || !item.ProcessId) continue;
        const pid = Number(item.ProcessId);
        const cmd = (item.CommandLine || '').toLowerCase();
        if (cmd.includes(normalizedTarget) || (startupPid && pid === startupPid)) {
          return pid;
        }
      }
    }
  } catch {}

  // 3. Fallback to tasklist if startupPid exists
  if (startupPid) {
    try {
      const tl = spawnSync('tasklist', ['/FI', 'PID eq ' + startupPid, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
      if (tl.status === 0 && tl.stdout && tl.stdout.includes('CocosCreator.exe')) {
        return startupPid;
      }
    } catch {}
  }

  return null;
}

let existingPid = findProjectCreatorPid(project);

if (existingPid) {
  console.log('[runner] Discovered active Cocos Creator for project: PID ' + existingPid);
} else {
  if (!fs.existsSync(creatorExe)) {
    const errorResult = {
      job: job.job,
      startedAt: job.requestedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      prefabPath: 'cocos/assets/prefabs/world/GoldenCityCell.prefab',
      prefabExists: fs.existsSync(prefabAbs),
      metaExists: fs.existsSync(metaAbs),
      verifyResult: null,
      phase: 'CREATOR_NOT_FOUND',
      error: 'Cocos Creator executable not found: ' + creatorExe,
    };
    fs.writeFileSync(resultPath, JSON.stringify(errorResult, null, 2) + '\n');
    console.log(JSON.stringify(errorResult, null, 2));
    process.exit(1);
  }

  console.log('[runner] No active Creator found for project. Launching dedicated instance: ' + creatorExe + ' --project ' + project);
  spawn(creatorExe, ['--project', project], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

console.log('[runner] Waiting up to ' + timeoutMs + 'ms for Extension authoring job execution...');
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  if (fs.existsSync(resultPath)) {
    try {
      const content = fs.readFileSync(resultPath, 'utf8');
      const result = JSON.parse(content);
      console.log(JSON.stringify({ ...result, existingCreatorPid: existingPid }, null, 2));
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
    console.log(JSON.stringify({ ...result, existingCreatorPid: existingPid }, null, 2));
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
      console.log(JSON.stringify({ ...realResult, existingCreatorPid: existingPid }, null, 2));
      process.exitCode = realResult.success ? 0 : 1;
      process.exit();
    } catch {}
  }
}

console.log(JSON.stringify(timeoutRecord, null, 2));
process.exitCode = 1;
