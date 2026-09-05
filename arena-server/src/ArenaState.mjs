import { schema, t } from '@colyseus/schema';

/** Only server-written schema fields are replicated to arena clients. */
export const ArenaPlayerState = schema({
  displayName: t.string().default('回收机'),
  x: t.number().default(0),
  z: t.number().default(0),
  inputX: t.number().default(0),
  inputY: t.number().default(0),
  lastInputSequence: t.uint32().default(0),
  connected: t.boolean().default(true),
  /** Server-created competitor when a human slot has not been claimed. */
  isBot: t.boolean().default(false),
  mass: t.uint32().default(140),
  level: t.uint8().default(1),
  maxTier: t.uint8().default(1),
  suctionRadius: t.number().default(2.4),
  collected: t.uint16().default(0),
  kills: t.uint16().default(0),
  alive: t.boolean().default(true),
  respawnMilliseconds: t.uint16().default(0),
  shieldMilliseconds: t.uint16().default(3000),
  settlementCoins: t.uint32().default(0),
  settlementMassCoins: t.uint32().default(0),
  settlementCollectedCoins: t.uint32().default(0),
  settlementEliminationCoins: t.uint32().default(0),
  settlementSurvivalCoins: t.uint32().default(0),
  settlementPlacementCoins: t.uint32().default(0),
}, 'ArenaPlayerState');

/** A server-owned recyclable; clients never grant mass or change this state. */
export const ArenaPickupState = schema({
  x: t.number().default(0),
  z: t.number().default(0),
  tier: t.uint8().default(1),
  mass: t.uint16().default(50),
  state: t.string().default('IDLE'),
  capturedBy: t.string().default(''),
}, 'ArenaPickupState');

export const ArenaState = schema({
  phase: t.string().default('LOBBY'),
  elapsedMilliseconds: t.uint32().default(0),
  /** The server is the only owner of this clock and match-completion boundary. */
  durationMilliseconds: t.uint32().default(180000),
  finishReason: t.string().default('RUNNING'),
  players: t.map(ArenaPlayerState),
  pickups: t.map(ArenaPickupState),
}, 'ArenaState');
