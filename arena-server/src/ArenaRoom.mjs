import { Room } from 'colyseus';
import { ArenaPickupState, ArenaPlayerState, ArenaState } from './ArenaState.mjs';

const MAX_CLIENTS = 8;
const ARENA_RADIUS_METERS = 44;
const MOVE_SPEED_METERS_PER_SECOND = 5.2;
const INPUT_TIMEOUT_MILLISECONDS = 750;
const START_MASS = 140;
const LV2_MASS = 900;
const LV2_RADIUS = 3.4;
const PICKUP_SPEED_METERS_PER_SECOND = 8;
const PICKUP_CAPTURE_DISTANCE = 0.32;
const RESPAWN_MILLISECONDS = 2_500;
const SHIELD_MILLISECONDS = 3_000;
const CONSUME_RATIO = 1.32;
const CONSUME_DISTANCE = 1.28;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizedDisplayName(value) {
  if (typeof value !== 'string') return '回收机';
  const trimmed = value.trim().slice(0, 18);
  return trimmed || '回收机';
}

/**
 * Genuine server authority for the reusable multiplayer arena core.
 *
 * The server alone owns sequenced player input, position, recyclable pickup
 * state, LV1-to-LV2 evolution, combat, dropped mass, respawn, and shields.
 * It is intentionally not wired into the production Cocos arena yet: the
 * current client must consume this schema for rendering and the reward ledger
 * must be persisted only after a server-finalized match before human matching
 * is advertised from the game UI.
 */
export class ArenaRoom extends Room {
  maxClients = MAX_CLIENTS;
  lastInputAtMilliseconds = new Map();
  nextPickupId = 0;

  onCreate() {
    this.setState(new ArenaState());
    this.state.phase = 'RUNNING';
    this.spawnOpeningCluster();
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
      if (!player.alive) {
        player.respawnMilliseconds = Math.max(0, player.respawnMilliseconds - deltaMilliseconds);
        if (player.respawnMilliseconds === 0) this.respawn(sessionId, player);
        return;
      }
      player.shieldMilliseconds = Math.max(0, player.shieldMilliseconds - deltaMilliseconds);
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
    this.updatePickupSuction(deltaSeconds);
    this.updateCombat();
  }

  spawnOpeningCluster() {
    // This is a real shared resource cluster, deliberately positioned near
    // slot zero's spawn. It creates the same LV1 -> LV2 -> T2 flow that the
    // Cocos vertical slice uses, without any client-side mass grant.
    for (let index = 0; index < 16; index++) {
      const angle = (Math.PI * 2 * index) / 16;
      const radius = 0.55 + (index % 4) * 0.22;
      this.spawnPickup(8 + Math.cos(angle) * radius, Math.sin(angle) * radius, 1, 50, `opening-t1-${index}`);
    }
    // It is intentionally beyond the LV1 radius but within the LV2 loop
    // after the player travels towards it using an ordinary input message.
    this.spawnPickup(8, -4.4, 2, 180, 'opening-t2');
  }

  spawnPickup(x, z, tier, mass, id = `pickup-${this.nextPickupId++}`) {
    const pickup = new ArenaPickupState();
    pickup.x = x;
    pickup.z = z;
    pickup.tier = tier;
    pickup.mass = mass;
    this.state.pickups.set(id, pickup);
    return id;
  }

  updatePickupSuction(deltaSeconds) {
    this.state.pickups.forEach((pickup, pickupId) => {
      if (pickup.state === 'ABSORBED') return;
      let ownerId = pickup.capturedBy || null;
      let owner = ownerId ? this.state.players.get(ownerId) : null;
      if (!owner || !owner.alive || pickup.tier > owner.maxTier) {
        ownerId = null;
        owner = null;
        pickup.capturedBy = '';
        pickup.state = 'IDLE';
      }

      if (!owner) {
        let bestDistance = Number.POSITIVE_INFINITY;
        this.state.players.forEach((candidate, candidateId) => {
          if (!candidate.alive || pickup.tier > candidate.maxTier) return;
          const distance = Math.hypot(candidate.x - pickup.x, candidate.z - pickup.z);
          if (distance <= candidate.suctionRadius && distance < bestDistance) {
            owner = candidate;
            ownerId = candidateId;
            bestDistance = distance;
          }
        });
        if (!owner || !ownerId) return;
        pickup.capturedBy = ownerId;
        pickup.state = 'ATTRACTED';
      }

      const dx = owner.x - pickup.x;
      const dz = owner.z - pickup.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= PICKUP_CAPTURE_DISTANCE) {
        this.absorbPickup(pickupId, pickup, owner);
        return;
      }
      const step = Math.min(distance, PICKUP_SPEED_METERS_PER_SECOND * deltaSeconds);
      pickup.x += dx / distance * step;
      pickup.z += dz / distance * step;
      pickup.state = 'SUCKING';
    });
  }

  absorbPickup(pickupId, pickup, owner) {
    if (pickup.state === 'ABSORBED') return;
    pickup.state = 'ABSORBED';
    pickup.capturedBy = '';
    owner.mass += pickup.mass;
    owner.collected += 1;
    this.updateEvolution(owner);
    this.broadcast('pickup_absorbed', {
      pickupId,
      ownerId: this.findPlayerId(owner),
      tier: pickup.tier,
      mass: pickup.mass,
    });
  }

  updateEvolution(player) {
    if (player.mass < LV2_MASS || player.level >= 2) return;
    player.level = 2;
    player.maxTier = 2;
    player.suctionRadius = LV2_RADIUS;
  }

  updateCombat() {
    const active = [];
    this.state.players.forEach((player, sessionId) => {
      if (player.alive && player.shieldMilliseconds === 0) active.push([sessionId, player]);
    });
    for (let left = 0; left < active.length; left++) {
      for (let right = left + 1; right < active.length; right++) {
        const [leftId, leftPlayer] = active[left];
        const [rightId, rightPlayer] = active[right];
        const attacker = leftPlayer.mass >= rightPlayer.mass ? [leftId, leftPlayer] : [rightId, rightPlayer];
        const victim = attacker[0] === leftId ? [rightId, rightPlayer] : [leftId, leftPlayer];
        if (attacker[1].mass < victim[1].mass * CONSUME_RATIO) continue;
        if (Math.hypot(attacker[1].x - victim[1].x, attacker[1].z - victim[1].z) > CONSUME_DISTANCE) continue;
        this.defeat(attacker[0], attacker[1], victim[0], victim[1]);
        return;
      }
    }
  }

  defeat(attackerId, attacker, victimId, victim) {
    if (!victim.alive) return;
    const droppedMass = Math.max(100, Math.floor(victim.mass * 0.35));
    attacker.kills += 1;
    victim.alive = false;
    victim.respawnMilliseconds = RESPAWN_MILLISECONDS;
    victim.inputX = 0;
    victim.inputY = 0;
    victim.mass = Math.max(START_MASS, victim.mass - droppedMass);
    this.spawnPickup(victim.x - 0.45, victim.z, 1, Math.ceil(droppedMass / 2), `fragment-${this.nextPickupId++}-a`);
    this.spawnPickup(victim.x + 0.45, victim.z, 1, Math.floor(droppedMass / 2), `fragment-${this.nextPickupId++}-b`);
    this.broadcast('player_defeated', { attackerId, victimId, droppedMass });
  }

  respawn(sessionId, player) {
    const slot = [...this.state.players.keys()].indexOf(sessionId);
    const angle = (Math.PI * 2 * Math.max(0, slot)) / MAX_CLIENTS;
    player.x = Math.cos(angle) * 8;
    player.z = Math.sin(angle) * 8;
    player.alive = true;
    player.respawnMilliseconds = 0;
    player.shieldMilliseconds = SHIELD_MILLISECONDS;
    player.inputX = 0;
    player.inputY = 0;
  }

  findPlayerId(target) {
    for (const [sessionId, player] of this.state.players.entries()) {
      if (player === target) return sessionId;
    }
    return null;
  }
}
