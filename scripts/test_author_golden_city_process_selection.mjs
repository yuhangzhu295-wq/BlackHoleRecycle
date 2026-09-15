import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'author_golden_city.mjs');
const project = 'C:\\Users\\zyu33\\Documents\\Codex\\2026-08-28\\ji\\cocos';

function discover(snapshot) {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AUTHORING_PROCESS_SELECTION_TEST: '1',
      AUTHORING_PROCESS_SNAPSHOT: JSON.stringify(snapshot),
    },
  });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

const selected = discover([
  { ProcessId: 60148, CommandLine: 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe --project ' + project + ' --help' },
  { ProcessId: 41152, CommandLine: 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe --project ' + project },
  { ProcessId: 100, CommandLine: 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe --type=renderer' },
]);
assert.equal(selected.status, 0);
assert.equal(selected.output.status, 'SELECTED');
assert.equal(selected.output.selectedPid, 41152);
assert.deepEqual(selected.output.candidates.find((candidate) => candidate.pid === 60148).reasons, ['help-or-cli-command']);

const ambiguous = discover([
  { ProcessId: 41152, CommandLine: 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe --project ' + project },
  { ProcessId: 41153, CommandLine: 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe --project=' + project },
]);
assert.equal(ambiguous.status, 1);
assert.equal(ambiguous.output.status, 'AMBIGUOUS_MATCHING_EDITORS');

console.log('author_golden_city process selection: PASS');
