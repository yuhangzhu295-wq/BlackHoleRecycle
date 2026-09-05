/**
 * Canonical, truthful project audit.
 *
 * This runner intentionally delegates to the official Cocos Creator 3.8.3
 * commands declared in package.json. It must never inspect the archived
 * Three.js prototype or manufacture evidence from Vite output.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  ['typecheck:cocos'],
  ['test:cocos'],
  ['acceptance:v2', '--', '--scope=full'],
  ['build:all'],
];

for (const check of checks) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : npmExecutable;
  // Each command token is a source-controlled literal. `cmd.exe /c` is used
  // instead of Node's `shell: true` compatibility mode so the audit remains
  // warning-free on Windows and does not trigger Node's unsafe shell-args
  // deprecation path.
  const args = isWindows
    ? ['/d', '/s', '/c', `${npmExecutable} run ${check.join(' ')}`]
    : ['run', ...check];
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`[audit] Failed to launch npm for ${check[0]}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('[audit] PASS: official Cocos Creator checks completed.');
