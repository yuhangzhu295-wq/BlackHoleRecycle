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
}, 'ArenaPlayerState');

export const ArenaState = schema({
  phase: t.string().default('LOBBY'),
  elapsedMilliseconds: t.uint32().default(0),
  players: t.map(ArenaPlayerState),
}, 'ArenaState');
