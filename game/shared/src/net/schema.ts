import { type SchemaType, schema, t } from "@colyseus/schema";

/**
 * One input frame, consumed by the server's `defineInput()` buffer.
 * Flat and minimal on purpose: no seq, no dt, no timestamp. The engine's input
 * counter is the sequence and one input advances exactly one fixed step.
 * The int8<-1|0|1> type only narrows TypeScript; the room's `sanitize` clamp
 * is what enforces it against a modified client.
 */
export const MoveInput = schema({
  moveX: t.int8<-1 | 0 | 1>(),
  moveY: t.int8<-1 | 0 | 1>(),
});
export type MoveInput = SchemaType<typeof MoveInput>;

export const Player = schema({
  name: t.string(),
  /** Index into PLAYER_COLORS. */
  color: t.uint8(),
  x: t.number(),
  y: t.number(),
  vx: t.number(),
  vy: t.number(),
});
export type Player = SchemaType<typeof Player>;

/** Lightweight per-player info everyone receives (scoreboard, player list), unlike the AoI-filtered `players`. */
export const RosterEntry = schema({
  name: t.string(),
  score: t.uint32(),
});
export type RosterEntry = SchemaType<typeof RosterEntry>;

export const ArenaState = schema({
  /** Map identifier; the client loads the matching .tmj. */
  mapId: t.string(),
  /** `.view()`: each client only receives the players in its area of interest. */
  players: t.map(Player).view(),
  /** Everyone in the room, by session id. Changes rarely, so it is cheap to send to all. */
  roster: t.map(RosterEntry),
});
export type ArenaState = SchemaType<typeof ArenaState>;
