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

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('two Colyseus clients receive authoritative movement, LV2 evolution and T2 absorption', async () => {
  const server = startServer();
  let firstRoom = null;
  let secondRoom = null;
  try {
    await waitForHealth();
    const firstClient = new Client(baseUrl);
    const secondClient = new Client(baseUrl);
    firstRoom = await firstClient.joinOrCreate('black_hole_arena', { displayName: 'Alpha' });
    secondRoom = await secondClient.joinOrCreate('black_hole_arena', { displayName: 'Beta' });
    // A production Cocos client uses these room events for sound/visual
    // feedback. Register them in the protocol test so Colyseus confirms the
    // messages are consumable rather than warning about an unhandled type.
    firstRoom.onMessage('pickup_absorbed', () => {});
    secondRoom.onMessage('pickup_absorbed', () => {});
    firstRoom.onMessage('player_defeated', () => {});
    secondRoom.onMessage('player_defeated', () => {});

    await sleep(160);
    assert.equal(firstRoom.state.players.size, 2);
    assert.equal(secondRoom.state.players.size, 2);
    const before = firstRoom.state.players.get(firstRoom.sessionId);
    assert.equal(before.level, 1);
    assert.equal(before.maxTier, 1);
    assert.equal(secondRoom.state.pickups.get('opening-t2').state, 'IDLE');

    // Pickup ownership, mass, and evolution occur only in the room's 20Hz
    // simulation loop. No test code directly mutates Colyseus state.
    await sleep(900);
    const evolved = secondRoom.state.players.get(firstRoom.sessionId);
    assert.equal(evolved.level, 2);
    assert.equal(evolved.maxTier, 2);
    assert.ok(Math.abs(evolved.suctionRadius - 3.4) < 0.001, `Expected LV2 radius, got ${evolved.suctionRadius}`);
    assert.ok(evolved.mass >= 900, `Expected T1 authority mass, got ${evolved.mass}`);
    const evolvedMass = evolved.mass;
    assert.equal(secondRoom.state.pickups.get('opening-t2').state, 'IDLE');

    const initialZ = evolved.z;
    firstRoom.send('input', { sequence: 1, x: 0, y: -1, active: true });
    await sleep(700);
    const moving = secondRoom.state.players.get(firstRoom.sessionId);
    assert.ok(moving.z < initialZ - 2.5, `Expected server motion, ${initialZ} -> ${moving.z}`);
    await sleep(500);
    assert.equal(secondRoom.state.pickups.get('opening-t2').state, 'ABSORBED');
    assert.ok(secondRoom.state.players.get(firstRoom.sessionId).mass >= evolvedMass + 180);

    // A stale release cannot overwrite a newer move; this is a real network
    // message ordering check, not a direct state mutation.
    firstRoom.send('input', { sequence: 2, x: 0, y: 1, active: true });
    await sleep(120);
    const movingZ = secondRoom.state.players.get(firstRoom.sessionId).z;
    firstRoom.send('input', { sequence: 1, x: 0, y: 0, active: false });
    await sleep(150);
    const afterStaleRelease = secondRoom.state.players.get(firstRoom.sessionId).z;
    assert.ok(afterStaleRelease > movingZ, `Stale packet changed authority: ${movingZ} -> ${afterStaleRelease}`);

    // Let the real opening shields expire, then steer the stronger player to
    // the second player's replicated position. This sends normalized network
    // input only; no test calls a server combat or respawn method.
    await sleep(1_300);
    let defeated = false;
    for (let step = 0; step < 18; step++) {
      const attacker = secondRoom.state.players.get(firstRoom.sessionId);
      const victim = secondRoom.state.players.get(secondRoom.sessionId);
      if (!victim.alive) {
        defeated = true;
        break;
      }
      const dx = victim.x - attacker.x;
      const dz = victim.z - attacker.z;
      const distance = Math.hypot(dx, dz);
      firstRoom.send('input', {
        sequence: 3 + step,
        x: distance > 0.001 ? dx / distance : 0,
        y: distance > 0.001 ? dz / distance : 0,
        active: distance > 0.001,
      });
      await sleep(160);
    }
    const defeatedVictim = secondRoom.state.players.get(secondRoom.sessionId);
    const victoriousAttacker = secondRoom.state.players.get(firstRoom.sessionId);
    defeated ||= !defeatedVictim.alive;
    assert.equal(defeated, true, `Expected real server defeat: ${JSON.stringify({ attacker: victoriousAttacker, victim: defeatedVictim })}`);
    assert.equal(victoriousAttacker.kills, 1);
    assert.ok([...secondRoom.state.pickups.keys()].some((id) => id.startsWith('fragment-')),
      'Expected defeated mass to become real server-side recyclable fragments.');

    await sleep(2_700);
    const respawnedVictim = secondRoom.state.players.get(secondRoom.sessionId);
    assert.equal(respawnedVictim.alive, true);
    assert.ok(respawnedVictim.shieldMilliseconds > 0, 'Expected a real respawn protection interval.');
    assert.match(server.readOutput(), /listening/);
  } finally {
    await Promise.allSettled([firstRoom?.leave(), secondRoom?.leave()]);
    await stopServer(server.child);
  }
});
