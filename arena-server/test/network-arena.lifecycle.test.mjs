import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { Client } from '@colyseus/sdk';

const port = 25785;
const baseUrl = 'http://127.0.0.1:' + port;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function startServer() {
  const child = spawn(process.execPath, ['src/index.mjs', String(port)], {
    cwd: new URL('..', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}

async function waitForHealth() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(baseUrl + '/health')).ok) return;
    } catch {}
    await sleep(75);
  }
  throw new Error('Arena server did not become healthy.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Arena server did not stop.')), 3_000)),
  ]);
}

test('dropped player reconnects with the same authoritative identity and state', async () => {
  const server = startServer();
  let observer = null;
  let reconnected = null;
  try {
    await waitForHealth();
    const player = await new Client(baseUrl).joinOrCreate('black_hole_arena', { displayName: 'Reconnect Player' });
    observer = await new Client(baseUrl).joinOrCreate('black_hole_arena', { displayName: 'Observer' });
    await sleep(900);

    const sessionId = player.sessionId;
    const token = player.reconnectionToken;
    const before = observer.state.players.get(sessionId);
    assert.ok(before, 'Expected the player in the authoritative roster.');
    const saved = { mass: before.mass, level: before.level, collected: before.collected, kills: before.kills };
    assert.ok(saved.mass >= 900 && saved.level === 2,
      'Expected the real opening resource cluster to evolve the player before reconnect.');

    player.reconnection.enabled = false;
    player.connection.close();
    await sleep(350);
    const during = observer.state.players.get(sessionId);
    assert.ok(during && !during.isBot && !during.connected,
      'Dropped player must keep its human slot during the reconnect window.');

    reconnected = await new Client(baseUrl).reconnect(token);
    await sleep(250);
    assert.equal(reconnected.sessionId, sessionId, 'Reconnection must preserve the session id.');
    const after = observer.state.players.get(sessionId);
    assert.ok(after && after.connected && !after.isBot,
      'Reconnected player must restore its original human roster entry.');
    assert.deepEqual(
      { mass: after.mass, level: after.level, collected: after.collected, kills: after.kills },
      saved,
      'Reconnect must preserve authoritative progression and combat state.',
    );

    reconnected.send('input', { sequence: 1, x: 1, y: 0, active: true });
    await sleep(250);
    assert.equal(observer.state.players.get(sessionId).lastInputSequence, 1,
      'Reconnected player must resume authoritative input.');
    assert.match(server.output(), /listening/);
  } finally {
    await Promise.allSettled([observer?.leave(), reconnected?.leave()]);
    await stopServer(server.child);
  }
});
