import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const reportPath = path.join(repoRoot, 'artifacts', 'qa', 'portrait', 'acceptance-report-full.json');

const countArg = process.argv.find((arg) => arg.startsWith('--count='))?.slice('--count='.length);
const targetCount = countArg ? parseInt(countArg, 10) : 10;
const startArg = process.argv.find((arg) => arg.startsWith('--start='))?.slice('--start='.length);
const startIndex = startArg ? parseInt(startArg, 10) : 1;
const totalTargetArg = process.argv.find((arg) => arg.startsWith('--total='))?.slice('--total='.length);
const totalTarget = totalTargetArg ? parseInt(totalTargetArg, 10) : targetCount;

const outReportPath = path.join(repoRoot, 'artifacts', 'qa', `${totalTarget}x-full-acceptance-report.json`);

let runs = [];
if (startIndex > 1 && existsSync(outReportPath)) {
  try {
    runs = JSON.parse(readFileSync(outReportPath, 'utf8'));
  } catch {}
}

console.log(`=== RUNNING BATCH: runs ${startIndex} to ${startIndex + targetCount - 1} of ${totalTarget} ===`);

for (let i = startIndex; i < startIndex + targetCount; i++) {
  const startTime = new Date().toISOString();
  console.log(`\n============================================================`);
  console.log(`>>> RUN ${i}/${totalTarget} starting at ${startTime}...`);
  console.log(`============================================================`);

  if (existsSync(reportPath)) {
    try {
      unlinkSync(reportPath);
    } catch {}
  }

  let exitCode = 0;
  try {
    execSync('node scripts/test_cocos_portrait_acceptance.mjs --scope=full', {
      cwd: repoRoot,
      stdio: 'inherit',
      timeout: 480000,
    });
  } catch (error) {
    exitCode = error.status || 1;
    if (error.killed) {
      console.error(`Run ${i} was killed by timeout`);
    }
  }

  let status = 'UNKNOWN';
  let failures = [];
  let consoleErrors = [];
  try {
    if (existsSync(reportPath)) {
      const rep = JSON.parse(readFileSync(reportPath, 'utf8'));
      status = rep.status;
      failures = rep.failures || [];
      consoleErrors = rep.consoleErrors || [];
    } else {
      status = exitCode === 0 ? 'PASS' : 'FAIL';
      failures = [`REPORT_MISSING (exitCode=${exitCode})`];
    }
  } catch (e) {
    status = exitCode === 0 ? 'PASS' : 'FAIL';
    failures = [e.message];
  }

  const runResult = {
    run: i,
    exitCode,
    status,
    failures,
    consoleErrors,
    startTime,
    endTime: new Date().toISOString(),
  };
  runs.push(runResult);
  writeFileSync(outReportPath, JSON.stringify(runs, null, 2), 'utf8');
  console.log(`\n>>> RUN ${i}/${totalTarget} finished: status=${status}, exitCode=${exitCode}, failures=${JSON.stringify(failures)}`);
}

const passedCount = runs.filter(r => r.status === 'PASS' && r.exitCode === 0).length;
console.log(`\n============================================================`);
console.log(`=== CUMULATIVE VERIFICATION: ${passedCount}/${runs.length} passed ===`);
console.log(`============================================================`);
if (passedCount === runs.length) {
  console.log(`SUCCESS: ${runs.length}/${runs.length} CONSECUTIVE PASSES ACHIEVED!`);
} else {
  process.exitCode = 1;
}
