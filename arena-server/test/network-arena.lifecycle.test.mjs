import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import { Client } from '@colyseus/sdk';

// Port differs from arena-room.integration.test.mjs (25783). Verified free at startup.
const PORT = 25784;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  const child = spawn(process.execPath, ['src/index.mjs', String(PORT)], {
    cwd: new URL('..', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (c) => { output += c.toString(); });
  child.stderr.on('data', (c) => { output += c.toString(); });
  return { child, readOutput: () => output };
}

async function verifyPortFree() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) => reject(new Error(`Port ${PORT} is not free: ${err.message}`)));
    probe.listen(PORT, '127.0.0.1', () => probe.close(resolve));
  });
}

async function waitForHealth(timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(80);
  }
  throw new Error('Arena server did not become healthy.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Arena server did not stop.')), 4_000)),
  ]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function countBots(room) {
  return [...room.state.players.values()].filter((p) => p.isBot).length;
}

function collectMessage(room, type) {
  const messages = [];
  room.onMessage(type, (msg) => messages.push(msg));
  return messages;
}

test('network arena lifecycle: all 10 items', async (t) => {
  await verifyPortFree();
  const server = startServer();
  let clientA = null;
  let roomA = null;
  let clientB = null;
  let roomB = null;

  try {
    await waitForHealth();

    // Item 1: connect+join: 8 entries, 7 isBot.
    await t.test('1 connect+join: 8 entries, 7 isBot', async () => {
      clientA = new Client(BASE_URL);
      roomA = await clientA.joinOrCreate('black_hole_arena', { displayName: 'PlayerA' });
      collectMessage(roomA, 'pickup_absorbed');
      collectMessage(roomA, 'player_defeated');
      collectMessage(roomA, 'match_finished');
      await sleep(180);
      assert.equal(roomA.state.players.size, 8, 'roster size must be 8');
      assert.equal(countBots(roomA), 7, '7 bots after one human joins');
    });

    // Item 2: leave+bot fill.
    await t.test('2 leave+bot fill: departed slot becomes bot key', async () => {
      const departedId = roomA.sessionId;
      await roomA.leave();
      roomA = null;
      clientA = new Client(BASE_URL);
      roomA = await clientA.joinOrCreate('black_hole_arena', { displayName: 'Observer' });
      collectMessage(roomA, 'pickup_absorbed');
      collectMessage(roomA, 'player_defeated');
      collectMessage(roomA, 'match_finished');
      await sleep(200);
      assert.equal(roomA.state.players.size, 8, 'roster must remain 8');
      assert.equal(roomA.state.players.get(departedId), undefined,
        'departed human sessionId absent; slot now a bot-N key');
    });

    // Reset for items 3-10: two persistent clients.
    await roomA.leave();
    roomA = null;

    clientA = new Client(BASE_URL);
    roomA = await clientA.joinOrCreate('black_hole_arena', { displayName: 'Alpha' });
    const absorbedA = collectMessage(roomA, 'pickup_absorbed');
    collectMessage(roomA, 'player_defeated');
    collectMessage(roomA, 'match_finished');

    clientB = new Client(BASE_URL);
    roomB = await clientB.joinOrCreate('black_hole_arena', { displayName: 'Beta' });
    collectMessage(roomB, 'pickup_absorbed');
    const defeatedB = collectMessage(roomB, 'player_defeated');
    collectMessage(roomB, 'match_finished');
    await sleep(180);

    // Item 3: sequenced input; stale ignored.
    await t.test('3 input: sequence advances; out-of-order ignored', async () => {
      const playerA = roomA.state.players.get(roomA.sessionId);
      roomA.send('input', { sequence: 10, x: 0, y: 0, active: false });
      await sleep(120);
      assert.equal(playerA.lastInputSequence, 10, 'seq 10 accepted');
      roomA.send('input', { sequence: 5, x: 1, y: 0, active: true });
      await sleep(120);
      assert.equal(playerA.lastInputSequence, 10, 'stale seq 5 ignored');
      roomA.send('input', { sequence: 10, x: 1, y: 0, active: true });
      await sleep(120);
      assert.equal(playerA.lastInputSequence, 10, 'duplicate seq 10 ignored');
    });

    // Item 4: movement advances; 44m clamp holds.
    await t.test('4 movement: position advances; 44m clamp holds', async () => {
      const playerA = roomB.state.players.get(roomA.sessionId);
      const zBefore = playerA.z;
      roomA.send('input', { sequence: 20, x: 0, y: -1, active: true });
      await sleep(700);
      assert.ok(playerA.z < zBefore - 2.0,
        `z must decrease; was ${zBefore}, now ${playerA.z}`);
      roomA.send('input', { sequence: 21, x: 0, y: -1, active: true });
      await sleep(3_200);
      const dist = Math.hypot(playerA.x, playerA.z);
      assert.ok(dist <= 44.05, `position within 44m; dist=${dist.toFixed(3)}`);
      roomA.send('input', { sequence: 22, x: 0, y: 0, active: false });
    });

    // Item 5: pickup+mass.
    // Evidence is cumulative: absorbedA has been collecting since join.
    // By this point playerA has driven through the opening cluster absorbing pickups.
    await t.test('5 pickup+mass: absorb pickup; collected++, mass grows', async () => {
      const playerA = roomA.state.players.get(roomA.sessionId);
      const ownEvents = absorbedA.filter((m) => m.ownerId === roomA.sessionId);
      assert.ok(ownEvents.length > 0, 'pickup_absorbed message must exist for playerA');
      assert.ok(playerA.collected > 0, 'collected must be > 0 after absorbing pickups');
      assert.ok(playerA.mass > 140, 'mass must exceed START_MASS after absorbing pickups');
    });

    // Item 6: LV1->LV2.
    await t.test('6 tier: LV2 at mass>=900', async () => {
      const playerA = roomA.state.players.get(roomA.sessionId);
      if (playerA.level < 2) {
        roomA.send('input', { sequence: 50, x: 0, y: 1, active: true });
        const deadline = Date.now() + 9_000;
        while (Date.now() < deadline) {
          await sleep(200);
          if (playerA.level >= 2) break;
        }
        roomA.send('input', { sequence: 60, x: 0, y: 0, active: false });
      }
      assert.equal(playerA.level, 2, `level must be 2; got ${playerA.level}`);
      assert.equal(playerA.maxTier, 2, 'maxTier must be 2');
      assert.ok(Math.abs(playerA.suctionRadius - 3.4) < 0.01,
        `suctionRadius=3.4; got ${playerA.suctionRadius}`);
      assert.ok(playerA.mass >= 900, `mass>=900 at LV2; got ${playerA.mass}`);
    });

    // Item 7: death.
    await t.test('7 death: A defeats B; kills++, B.alive=false', async () => {
      await sleep(3_200);
      const attackerBefore = roomB.state.players.get(roomA.sessionId);
      const killsBefore = attackerBefore?.kills ?? 0;
      let defeated = false;
      for (let step = 0; step < 30; step++) {
        const attacker = roomB.state.players.get(roomA.sessionId);
        const victim = roomB.state.players.get(roomB.sessionId);
        if (!victim || !victim.alive) { defeated = true; break; }
        if (!attacker || !attacker.alive) break;
        const dx = victim.x - attacker.x;
        const dz = victim.z - attacker.z;
        const d = Math.hypot(dx, dz);
        roomA.send('input', {
          sequence: 100 + step,
          x: d > 0.001 ? dx / d : 0,
          y: d > 0.001 ? dz / d : 0,
          active: d > 0.001,
        });
        await sleep(180);
      }
      const victim = roomB.state.players.get(roomB.sessionId);
      const attacker = roomB.state.players.get(roomA.sessionId);
      defeated ||= !victim?.alive;
      assert.equal(defeated, true,
        `victim defeated; attacker.mass=${attacker?.mass}, victim.mass=${victim?.mass}`);
      assert.ok((attacker?.kills ?? 0) > killsBefore,
        `attacker.kills must increment; was ${killsBefore}, now ${attacker?.kills}`);
      assert.equal(victim?.alive, false, 'victim.alive must be false');
      assert.ok((victim?.respawnMilliseconds ?? 0) > 0, 'victim.respawnMilliseconds>0');
      assert.ok(defeatedB.some((m) => m.victimId === roomB.sessionId),
        'player_defeated broadcast must name victim');
    });

    // Item 8: respawn.
    await t.test('8 respawn: victim alive+shielded after 2500ms', async () => {
      await sleep(2_700);
      const victim = roomB.state.players.get(roomB.sessionId);
      assert.equal(victim.alive, true, 'victim must be alive after RESPAWN');
      assert.ok(victim.shieldMilliseconds > 0, 'victim must have shield');
    });

    // Item 9: disconnect+reconnect.
    // Mechanism: server onDrop calls allowReconnection(client, 15).
    // Client uses Client.reconnect(reconnectionToken).
    // sessionId PRESERVED: server reuses same sessionId in _reserveSeat().
    await t.test('9 disconnect+reconnect: state preserved; sessionId preserved', async () => {
      const reconnectionToken = roomA.reconnectionToken;
      assert.ok(typeof reconnectionToken === 'string' && reconnectionToken.includes(':'),
        `reconnectionToken format; got: ${String(reconnectionToken)}`);

      const playerABefore = roomB.state.players.get(roomA.sessionId);
      const massBefore = playerABefore.mass;
      const levelBefore = playerABefore.level;
      const sessionIdBefore = roomA.sessionId;

      // Ungraceful disconnect: close raw transport. This triggers onDrop, not onLeave.
      roomA.reconnection.enabled = false;
      roomA.connection.close();
      roomA = null;

      await sleep(500);

      // Player must remain in roster during window (not immediately bot-replaced).
      const playerDuring = roomB.state.players.get(sessionIdBefore);
      assert.ok(playerDuring !== undefined,
        'player must remain in roster during reconnection window');
      assert.equal(playerDuring.isBot, false, 'entry during window must remain human');

      const freshClient = new Client(BASE_URL);
      let reconnectedRoom;
      try {
        reconnectedRoom = await freshClient.reconnect(reconnectionToken);
      } catch (e) {
        throw new Error(
          'BLOCKED: SDK Client.reconnect() threw: ' + e.message + '. ' +
          'allowReconnection() is in place server-side.'
        );
      }
      collectMessage(reconnectedRoom, 'pickup_absorbed');
      collectMessage(reconnectedRoom, 'player_defeated');
      collectMessage(reconnectedRoom, 'match_finished');
      await sleep(300);

      assert.equal(reconnectedRoom.sessionId, sessionIdBefore,
        'sessionId must be identical after reconnect');
      const playerAfter = roomB.state.players.get(sessionIdBefore);
      assert.ok(playerAfter !== undefined, 'player must be in roster after reconnect');
      assert.equal(playerAfter.isBot, false, 'player remains human after reconnect');
      assert.equal(playerAfter.mass, massBefore,
        `mass preserved; was ${massBefore}, now ${playerAfter.mass}`);
      assert.equal(playerAfter.level, levelBefore,
        `level preserved; was ${levelBefore}, now ${playerAfter.level}`);

      roomA = reconnectedRoom;
      clientA = freshClient;
    });

    // Item 10: settlement.
    await t.test('10 settlement: coins correct; match_finished broadcast', async () => {
      const finishedMessages = collectMessage(roomB, 'match_finished');
      roomB.send('forfeit');
      await sleep(200);
      assert.equal(roomB.state.phase, 'FINISHED', 'phase must be FINISHED');
      assert.equal(roomB.state.finishReason, 'FORFEIT', 'finishReason FORFEIT');
      assert.ok(finishedMessages.length > 0, 'match_finished must be broadcast');
      for (const [sessionId, player] of roomB.state.players.entries()) {
        const expected =
          player.settlementMassCoins + player.settlementCollectedCoins +
          player.settlementEliminationCoins + player.settlementSurvivalCoins +
          player.settlementPlacementCoins;
        assert.equal(player.settlementCoins, expected,
          `${sessionId}: settlementCoins ${player.settlementCoins} != sum ${expected}`);
      }
    });

  } finally {
    const leaves = [];
    if (roomA) leaves.push(roomA.leave().catch(() => {}));
    if (roomB) leaves.push(roomB.leave().catch(() => {}));
    await Promise.allSettled(leaves);
    await stopServer(server.child);
  }
});
