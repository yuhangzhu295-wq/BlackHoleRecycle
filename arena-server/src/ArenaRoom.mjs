import { Room } from 'colyseus';
import { ArenaPlayerState, ArenaState } from './ArenaState.mjs';

const MAX_CLIENTS = 8;
const ARENA_RADIUS_METERS = 44;
const MOVE_SPEED_METERS_PER_SECOND = 5.2;
const INPUT_TIMEOUT_MILLISECONDS = 750;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizedDisplayName(value) {
  if (typeof value !== 'string') return '回收机';
  const trimmed = value.trim().slice(0, 18);
  return trimmed || '回收机';
}

/**
 * Minimal, but genuine, authority for a multiplayer arena transport slice.
 *
 * The server alone owns player position and validates input samples. It is
 * intentionally not wired into the production Cocos arena yet: object intake,
 * elimination and rewards must move to this authority before a human match is
 * advertised from the client.
 */
export class ArenaRoom extends Room {
  maxClients = MAX_CLIENTS;
  lastInputAtMilliseconds = new Map();

  onCreate() {
    this.setState(new ArenaState());
    this.state.phase = 'RUNNING';
    this.setSimulationInterval((deltaTime) => this.step(deltaTime), 50);
    this.onMessage('input', (client, payload) => this.acceptInput(client, payload));
  }

  onJoin(client, options) {
    const player = new ArenaPlayerState();
    player.displayName = normalizedDisplayName(options?.displayName);
    const slot = this.state.players.size;
    const angle = (Math.PI * 2 * slot) / MAX_CLIENTS;
    player.x = Math.cos(angle) * 8;
    player.z = Math.sin(angle) * 8;
    this.state.players.set(client.sessionId, player);
    this.lastInputAtMilliseconds.set(client.sessionId, this.state.elapsedMilliseconds);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.lastInputAtMilliseconds.delete(client.sessionId);
    if (this.state.players.size === 0) this.state.phase = 'LOBBY';
  }

  acceptInput(client, payload) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !payload || typeof payload !== 'object') return;

    const { sequence, x, y, active } = payload;
    if (!Number.isInteger(sequence) || sequence <= player.lastInputSequence
      || !finiteNumber(x) || !finiteNumber(y) || typeof active !== 'boolean') {
      return;
    }

    const magnitude = Math.hypot(x, y);
    if (magnitude > 1.001) return;
    player.lastInputSequence = sequence;
    player.inputX = active ? x : 0;
    player.inputY = active ? y : 0;
    player.connected = true;
    this.lastInputAtMilliseconds.set(client.sessionId, this.state.elapsedMilliseconds);
  }

  step(deltaTime) {
    const deltaMilliseconds = Math.max(0, Math.min(250, Math.floor(deltaTime)));
    this.state.elapsedMilliseconds += deltaMilliseconds;
    const deltaSeconds = deltaMilliseconds / 1000;

    this.state.players.forEach((player, sessionId) => {
      // The schema deliberately does not expose transport timestamps. They are
      // authority-internal and only decide when stale directional input stops.
      const inputAge = this.state.elapsedMilliseconds - (this.lastInputAtMilliseconds.get(sessionId) || 0);
      const inputX = inputAge <= INPUT_TIMEOUT_MILLISECONDS ? player.inputX : 0;
      const inputY = inputAge <= INPUT_TIMEOUT_MILLISECONDS ? player.inputY : 0;
      player.x += inputX * MOVE_SPEED_METERS_PER_SECOND * deltaSeconds;
      player.z += inputY * MOVE_SPEED_METERS_PER_SECOND * deltaSeconds;

      const distance = Math.hypot(player.x, player.z);
      if (distance > ARENA_RADIUS_METERS) {
        const scale = ARENA_RADIUS_METERS / distance;
        player.x *= scale;
        player.z *= scale;
      }
    });
  }
}
