/**
 * Transport client for the server-authoritative arena protocol.
 *
 * It intentionally contains no client-side mass, pickup, evolution, combat or
 * respawn simulation. Those values are copied only from the replicated
 * Colyseus room state. The local 1v7 Cocos route remains in use until a scene
 * renderer consumes this snapshot; this class is the real transport boundary
 * required for that next step, not a fake online-mode switch.
 */
import { Client, Room } from '@colyseus/sdk';

export type ArenaConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'FAILED' | 'LEFT';

export interface AuthoritativeArenaPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly x: number;
  readonly z: number;
  readonly lastInputSequence: number;
  readonly mass: number;
  readonly level: number;
  readonly maxTier: number;
  readonly suctionRadius: number;
  readonly collected: number;
  readonly kills: number;
  readonly isBot: boolean;
  readonly alive: boolean;
  readonly respawnMilliseconds: number;
  readonly shieldMilliseconds: number;
}

export interface AuthoritativeArenaPickup {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly tier: number;
  readonly mass: number;
  readonly state: string;
  readonly capturedBy: string;
}

export interface AuthoritativeArenaSnapshot {
  readonly phase: string;
  readonly elapsedMilliseconds: number;
  readonly localSessionId: string | null;
  readonly players: readonly AuthoritativeArenaPlayer[];
  readonly pickups: readonly AuthoritativeArenaPickup[];
}

export interface ArenaInputMessage {
  readonly sequence: number;
  readonly x: number;
  readonly y: number;
  readonly active: boolean;
}

type ArenaStateMap = {
  entries?: () => IterableIterator<[string, unknown]>;
};

type ArenaStateLike = {
  phase?: unknown;
  elapsedMilliseconds?: unknown;
  players?: ArenaStateMap;
  pickups?: ArenaStateMap;
};

type ArenaPlayerLike = {
  displayName?: unknown;
  x?: unknown;
  z?: unknown;
  lastInputSequence?: unknown;
  mass?: unknown;
  level?: unknown;
  maxTier?: unknown;
  suctionRadius?: unknown;
  collected?: unknown;
  kills?: unknown;
  isBot?: unknown;
  alive?: unknown;
  respawnMilliseconds?: unknown;
  shieldMilliseconds?: unknown;
};

type ArenaPickupLike = {
  x?: unknown;
  z?: unknown;
  tier?: unknown;
  mass?: unknown;
  state?: unknown;
  capturedBy?: unknown;
};

const finite = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[ColyseusArenaClient] Invalid authoritative ${field}: ${String(value)}`);
  }
  return value;
};

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`[ColyseusArenaClient] Invalid authoritative ${field}: ${String(value)}`);
  }
  return value;
};

const bool = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`[ColyseusArenaClient] Invalid authoritative ${field}: ${String(value)}`);
  }
  return value;
};

const entries = (collection: ArenaStateMap | undefined, field: string): Array<[string, unknown]> => {
  if (!collection?.entries) {
    throw new Error(`[ColyseusArenaClient] Missing authoritative ${field} map.`);
  }
  return Array.from(collection.entries());
};

/**
 * Real Colyseus 0.18 client. `join()` completes only after a room handshake;
 * `snapshot` is updated solely by schema state callbacks.
 */
export class ColyseusArenaClient {
  public status: ArenaConnectionStatus = 'IDLE';
  public lastError: string | null = null;
  public snapshot: AuthoritativeArenaSnapshot | null = null;

  private room: Room<any, ArenaStateLike> | null = null;
  private nextInputSequence: number = 0;

  public async join(endpoint: string, displayName: string): Promise<AuthoritativeArenaSnapshot> {
    if (this.status === 'CONNECTING') throw new Error('[ColyseusArenaClient] A join is already in progress.');
    if (this.room) await this.leave();
    if (!/^wss?:\/\//.test(endpoint) && !/^https?:\/\//.test(endpoint)) {
      throw new Error(`[ColyseusArenaClient] Endpoint must use ws(s) or http(s): ${endpoint}`);
    }

    this.status = 'CONNECTING';
    this.lastError = null;
    this.snapshot = null;
    this.nextInputSequence = 0;
    try {
      const client = new Client(endpoint);
      const room = await client.joinOrCreate<ArenaStateLike>('black_hole_arena', { displayName });
      this.room = room;
      room.onStateChange((state) => {
        this.snapshot = this.readSnapshot(state, room.sessionId);
      });
      room.onError((code, message) => {
        this.lastError = `room error ${code}: ${message || 'unknown'}`;
        this.status = 'FAILED';
      });
      room.onLeave((code, reason) => {
        if (this.status !== 'LEFT') {
          this.lastError = `room left ${code}: ${reason || 'no reason'}`;
          this.status = 'FAILED';
        }
        this.room = null;
      });

      // `joinOrCreate()` returns after the room handshake. The initial schema
      // state arrives asynchronously, so wait only for state delivered by the
      // server instead of fabricating a local opening snapshot.
      const initial = await this.waitForInitialSnapshot();
      this.status = 'CONNECTED';
      return initial;
    } catch (error) {
      this.room = null;
      this.status = 'FAILED';
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  public sendMovement(x: number, y: number, active: boolean): ArenaInputMessage | null {
    if (this.status !== 'CONNECTED' || !this.room) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1.001) return null;
    const message: ArenaInputMessage = {
      sequence: ++this.nextInputSequence,
      x: active ? x : 0,
      y: active ? y : 0,
      active,
    };
    this.room.send('input', message);
    return message;
  }

  public async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.status = 'LEFT';
    if (room) await room.leave();
  }

  private async waitForInitialSnapshot(): Promise<AuthoritativeArenaSnapshot> {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (this.snapshot) return this.snapshot;
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('[ColyseusArenaClient] Timed out waiting for replicated arena state.');
  }

  private readSnapshot(state: ArenaStateLike, localSessionId: string): AuthoritativeArenaSnapshot {
    const players = entries(state.players, 'players').map(([id, rawPlayer]) => {
      const player = rawPlayer as ArenaPlayerLike;
      return {
        id,
        displayName: text(player.displayName, `players.${id}.displayName`),
        x: finite(player.x, `players.${id}.x`),
        z: finite(player.z, `players.${id}.z`),
        lastInputSequence: finite(player.lastInputSequence, `players.${id}.lastInputSequence`),
        mass: finite(player.mass, `players.${id}.mass`),
        level: finite(player.level, `players.${id}.level`),
        maxTier: finite(player.maxTier, `players.${id}.maxTier`),
        suctionRadius: finite(player.suctionRadius, `players.${id}.suctionRadius`),
        collected: finite(player.collected, `players.${id}.collected`),
        kills: finite(player.kills, `players.${id}.kills`),
        isBot: bool(player.isBot, `players.${id}.isBot`),
        alive: bool(player.alive, `players.${id}.alive`),
        respawnMilliseconds: finite(player.respawnMilliseconds, `players.${id}.respawnMilliseconds`),
        shieldMilliseconds: finite(player.shieldMilliseconds, `players.${id}.shieldMilliseconds`),
      } as const;
    });
    const pickups = entries(state.pickups, 'pickups').map(([id, rawPickup]) => {
      const pickup = rawPickup as ArenaPickupLike;
      return {
        id,
        x: finite(pickup.x, `pickups.${id}.x`),
        z: finite(pickup.z, `pickups.${id}.z`),
        tier: finite(pickup.tier, `pickups.${id}.tier`),
        mass: finite(pickup.mass, `pickups.${id}.mass`),
        state: text(pickup.state, `pickups.${id}.state`),
        capturedBy: text(pickup.capturedBy, `pickups.${id}.capturedBy`),
      } as const;
    });
    return {
      phase: text(state.phase, 'phase'),
      elapsedMilliseconds: finite(state.elapsedMilliseconds, 'elapsedMilliseconds'),
      localSessionId,
      players,
      pickups,
    };
  }
}
