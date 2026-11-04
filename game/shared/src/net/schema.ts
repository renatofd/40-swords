import { type SchemaType, schema, t } from "@colyseus/schema";

/**
 * One input frame, consumed by the server's `defineInput()` buffer.
 * Flat and minimal on purpose: no seq, no dt, no timestamp. The engine's input
 * counter is the sequence and one input advances exactly one fixed step.
 * The narrowed int types only help TypeScript; the room's `sanitize` clamp is
 * what enforces them against a modified client.
 */
export const PlayerInput = schema({
  moveX: t.int8<-1 | 0 | 1>(),
  moveY: t.int8<-1 | 0 | 1>(),
  /** 1 while the attack button is held. */
  attack: t.uint8<0 | 1>(),
});
export type PlayerInput = SchemaType<typeof PlayerInput>;

/** One relic a hero owns. `kind` is a RelicKind, `rarity` an index into RARITIES. */
export const Relic = schema({
  kind: t.string().default(""),
  rarity: t.uint8().default(0),
});
export type Relic = SchemaType<typeof Relic>;

export const Player = schema({
  name: t.string().default(""),
  classId: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0),
  vx: t.number().default(0),
  vy: t.number().default(0),
  facing: t.uint8().default(0),
  cooldown: t.uint8().default(0),
  lock: t.uint8().default(0),
  swing: t.uint8().default(0),
  knockX: t.number().default(0),
  knockY: t.number().default(0),
  knockTicks: t.uint8().default(0),
  dead: t.boolean().default(false),
  hp: t.float32().default(0),
  maxHp: t.uint16().default(0),
  level: t.uint8().default(0),
  xp: t.uint32().default(0),
  rupees: t.uint32().default(0),
  /** Invulnerability ticks left after a hit (client blinks the sprite). */
  invuln: t.uint8().default(0),
  // Simulation fields set by the server from the hero's attributes (see PlayerSimState).
  speed: t.uint16().default(0),
  swingCd: t.uint8().default(0),
  cdPct: t.uint8().default(100),
  vseq: t.uint8().default(0),
  vmask: t.uint8().default(0),
  warp: t.uint8().default(0),
  // Weapons: copies owned and cooldown ticks, one pair per WEAPON_IDS entry.
  daggerN: t.uint16().default(0),
  daggerCd: t.uint8().default(0),
  fireballN: t.uint16().default(0),
  fireballCd: t.uint8().default(0),
  arrowN: t.uint16().default(0),
  arrowCd: t.uint8().default(0),
  novaN: t.uint16().default(0),
  novaCd: t.uint8().default(0),
  /** Every relic owned (the winner of a PvP fight takes one of them). */
  relics: t.array(Relic),
  /** Knocked out of the arena: watches until the next match (always `dead` too). */
  out: t.boolean().default(false),
});
export type Player = SchemaType<typeof Player>;

export const Enemy = schema({
  kind: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0),
  hp: t.float32().default(0),
  maxHp: t.uint16().default(0),
  facing: t.uint8().default(0),
  /** Ticks left of the hurt flash. */
  hurt: t.uint8().default(0),
  /** Stronger variant: more HP, damage and loot, and a chance to drop a chest. */
  elite: t.boolean().default(false),
});
export type Enemy = SchemaType<typeof Enemy>;

export const Pickup = schema({
  kind: t.string().default(""),
  value: t.uint16().default(0),
  x: t.number().default(0),
  y: t.number().default(0),
});
export type Pickup = SchemaType<typeof Pickup>;

/** A chest placed on the map; it reopens a while after someone empties it. */
export const Chest = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  open: t.boolean().default(false),
});
export type Chest = SchemaType<typeof Chest>;

/** Lightweight per-player info everyone receives (scoreboard, player list), unlike the AoI-filtered `players`. */
export const RosterEntry = schema({
  name: t.string().default(""),
  classId: t.string().default(""),
  level: t.uint8().default(0),
});
export type RosterEntry = SchemaType<typeof RosterEntry>;

export const WorldState = schema({
  /** Map identifier; the client loads the matching .tmj. */
  mapId: t.string(),
  /** `.view()`: each client only receives what is in its area of interest. */
  players: t.map(Player).view(),
  enemies: t.map(Enemy).view(),
  pickups: t.map(Pickup).view(),
  chests: t.map(Chest).view(),
  /** Everyone in the room who picked a class, by session id. Cheap to send to all. */
  roster: t.map(RosterEntry),
  // ─── The match (see match.ts) ───
  /** MatchPhase. */
  phase: t.uint8().default(0),
  /** Seconds since the match started. */
  clock: t.uint16().default(0),
  /** Value of `clock` when the current phase ends; 0 while the arena fight lasts. */
  phaseEnds: t.uint16().default(0),
  /** Safe zone radius (px) around the arena centre during prep and the fight. */
  zone: t.uint16().default(0),
  /** Heroes still standing in the arena. */
  alive: t.uint8().default(0),
  /** Session id and name of the winner once the match ended (empty: nobody survived). */
  winner: t.string().default(""),
  winnerName: t.string().default(""),
});
export type WorldState = SchemaType<typeof WorldState>;
