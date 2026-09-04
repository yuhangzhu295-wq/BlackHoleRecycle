import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { Client } from '@colyseus/sdk';

const port = 25783;
const baseUrl = `http://127.0.0.1:${port}`;

function startServer() {
  const child = spawn(process.execPath, ['src/index.mjs', String(port)], {
    cwd: new URL('..', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, readOutput: () => output };
}

async function waitForHealth() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The child needs a brief moment to bind its HTTP transport.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error('Arena server did not become healthy.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Arena server did not stop after SIGTERM.')), 3_000)),
  ]);
}

test('two Colyseus clients join one room and receive server-authoritative motion', async () => {
  const server = startServer();
  let firstRoom = null;
  let secondRoom = null;
  try {
    await waitForHealth();
    const firstClient = new Client(baseUrl);
    const secondClient = new Client(baseUrl);
    firstRoom = await firstClient.joinOrCreate('black_hole_arena', { displayName: 'Alpha' });
    secondRoom = await secondClient.joinOrCreate('black_hole_arena', { displayName: 'Beta' });

    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(firstRoom.state.players.size, 2);
    assert.equal(secondRoom.state.players.size, 2);
    const initialX = firstRoom.state.players.get(firstRoom.sessionId).x;

    firstRoom.send('input', { sequence: 1, x: 1, y: 0, active: true });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const movedX = secondRoom.state.players.get(firstRoom.sessionId).x;
    assert.ok(movedX > initialX + 0.2, `Expected server motion, ${initialX} -> ${movedX}`);

    // A stale release cannot overwrite a newer move; this is a real network
    // message ordering check, not a direct state mutation.
    firstRoom.send('input', { sequence: 1, x: 0, y: 0, active: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterStaleRelease = secondRoom.state.players.get(firstRoom.sessionId).x;
    assert.ok(afterStaleRelease > movedX, `Stale packet changed authority: ${movedX} -> ${afterStaleRelease}`);
    assert.match(server.readOutput(), /listening/);
  } finally {
    await Promise.allSettled([firstRoom?.leave(), secondRoom?.leave()]);
    await stopServer(server.child);
  }
});
