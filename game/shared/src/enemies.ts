/**
 * Enemy archetypes: regular enemies (any of them can spawn as an elite),
 * mini-bosses and dungeon bosses, with how they move and attack. Pure data +
 * pure functions; the server AI (game/server/src/enemies) runs them, the
 * client reads the timings to fit its animations.
 *
 * Every attack goes wind-up → action → recover (the act machine, see
 * `encodeAct`): the wind-up is the readable tell, the action releases it.
 * Times are in ticks (TICK_RATE 30), speeds in px/s, distances in px.
 */

// APPEND ONLY: never reorder (maps and old clients rely on the first entries).
export const ENEMY_KINDS = [
  "slime",
  "goblin",
  "bat",
  "skeleton",
  "scorpion",
  "wolf",
  "lurker",
  "brute",
  "hexer",
  "warden",
  "witch",
  "matriarch",
  "colossus",
  "shroom",
  "spider",
  "wisp",
  "eye",
  "archer",
  "raider",
  "lancer",
  "cobra",
  "axeman",
  "kultist",
  "drake",
  "warlord",
] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export const isEnemyKind = (v: unknown): v is EnemyKind =>
  typeof v === "string" && (ENEMY_KINDS as readonly string[]).includes(v);

export type EnemyRank = "normal" | "miniboss" | "boss";

/**
 * How an enemy moves: drifts around (`wander`), runs at heroes within
 * `aggroRange` (`chase`), flutters (`erratic`), jumps (`hop`, see HopDef),
 * holds its ground (`guard`), keeps its distance (`kite`, see KiteDef) or
 * flies diagonally and bounces off walls (`bounce`).
 */
export type Behaviour = "wander" | "chase" | "erratic" | "hop" | "guard" | "kite" | "bounce";

/** Hop movers: crouch (the tell), jump at `speed` toward a hero within `seek` (else a random way), land, rest. */
export interface HopDef {
  crouch: number;
  air: number;
  land: number;
  /** Ticks between hops, inclusive range. */
  rest: readonly [number, number];
  /** Jumps toward a hero within this many px; 0: always a random way. */
  seek: number;
}

/** Kiters keep their target between `min` and `max` px, strafing in between. */
export interface KiteDef {
  min: number;
  max: number;
}

/** Witch: turns to stone (invulnerable) each time its HP crosses a mark. */
export interface StoneDef {
  /** HP shares, highest first. */
  marks: readonly number[];
  /** Ticks it stays stone (the act's action phase). */
  ticks: number;
  /** Summoned when it turns to stone. */
  summon?: { kind: EnemyKind; count: number; max: number };
  /** Fired when it wakes up from the stone. */
  endRing?: ShotVolley;
}

/** Wind-up (the flash into stone) and recover ticks of the stone act. */
export const STONE_WINDUP_TICKS = 6;
export const STONE_RECOVER_TICKS = 6;

// APPEND ONLY: never reorder (old maps and clients rely on the first entries).
/** Look of an enemy projectile (the client picks the `hostile-<style>` sheet). */
export const SHOT_STYLES = [
  "bone",
  "rock",
  "orb",
  "sting",
  "axe",
  "web",
  "arrow",
  "bolt",
  "curse",
  "spore",
  "spear",
] as const;
export type ShotStyle = (typeof SHOT_STYLES)[number];

/** Hit radius (px) of each style and its side effect: `slowTicks` webs the hero it hits (Player.slow). */
export const SHOT_DEFS: Readonly<Record<ShotStyle, { radius: number; slowTicks?: number }>> = {
  bone: { radius: 3 },
  rock: { radius: 4 },
  orb: { radius: 4 },
  sting: { radius: 3 },
  axe: { radius: 4 },
  web: { radius: 5, slowTicks: 45 },
  arrow: { radius: 2 },
  bolt: { radius: 5 },
  curse: { radius: 5 },
  spore: { radius: 4 },
  spear: { radius: 3 },
};

/** Projectiles all around (a ring). */
export interface ShotVolley {
  count: number;
  speed: number;
  range: number;
  damage: number;
  style: ShotStyle;
}

interface AttackBase {
  /** Ticks before it can start again, counted from the end of the act (plus 0-14 random ticks). */
  cooldownTicks: number;
  /** The tell: ticks between the start and the release. */
  windupTicks: number;
  /** Ticks it stands still after the action. */
  recoverTicks: number;
  /** Starts only with the target this far away, inclusive [min, max] px (default [0, aggroRange]). */
  within?: readonly [number, number];
  /** Starts only with the target within this many px of its row or column; the act then runs along that axis. */
  aligned?: number;
  /** Only in this phase (see EnemyDef.phase2At). */
  phase?: 1 | 2;
}

/**
 * What an enemy can do besides touching heroes. Damage values are tier 0:
 * the AI multiplies them by `EnemyStats.shotDamage`.
 */
export type AttackDef = AttackBase &
  (
    | {
        type: "aimed";
        count: number;
        spreadDeg: number;
        speed: number;
        range: number;
        damage: number;
        style: ShotStyle;
      }
    | ({ type: "ring" } & ShotVolley)
    | {
        type: "charge";
        speed: number;
        ticks: number;
        /** Hitting a wall: stunned this many ticks (recover phase with the stunned bit) instead of recoverTicks. */
        stunTicks?: number;
        /** Reflects off this many walls before stopping (matriarch). */
        bounces?: number;
      }
    /** An area hit at `offset` px along the aim. */
    | { type: "strike"; offset: number; radius: number; damage: number }
    /** Flies (untargetable, no contact) for `ticks` to where the target stood, then hits the area it lands on. */
    | { type: "leap"; ticks: number; range: number; radius: number; damage: number; ring?: ShotVolley }
    | { type: "summon"; kind: EnemyKind; count: number; max: number }
    /** Teleports to a free spot of its screen at least `minFromTarget` px (default 40) from the target. */
    | { type: "blink"; minFromTarget?: number }
  );
export type AttackType = AttackDef["type"];

export interface EnemyDef {
  rank: EnemyRank;
  maxHp: number;
  /** Contact damage. */
  damage: number;
  defense: number;
  /** px/s */
  speed: number;
  /** Collision half-extent in px. */
  half: number;
  xp: number;
  /** Rupees dropped on death, inclusive range. */
  rupees: [number, number];
  behaviour: Behaviour;
  /** Distance at which it notices heroes (chasing and attacks). */
  aggroRange: number;
  /** Seconds before its spawner brings it back. */
  respawnSeconds: number;
  /** In priority order (melee first): the first ready attack whose gates pass starts. At most MAX_ATTACKS. */
  attacks: AttackDef[];
  /** Moves along rows/columns, lining up with its target first (tolerance px). */
  cardinal?: number;
  /** chase: moves `burst[0]` ticks, stands `burst[1]` ticks. */
  burst?: readonly [number, number];
  /** Required iff behaviour === "hop". */
  hop?: HopDef;
  /** Required iff behaviour === "kite". */
  kite?: KiteDef;
  /** Dormant (no move, no attack) until a hero is within this many px; dozes off again after WAKE_SETTLE_TICKS without one. */
  wake?: number;
  stone?: StoneDef;
  /**
   * Front block (lancer): share of damage taken from blows within ±60° of its facing, no knockback from those.
   * Named `block` so it never gets mixed up with `behaviour: "guard"` (stationary).
   */
  block?: number;
  /** HP share at or below which phase 2 starts: phase-gated attacks swap, cooldowns × PHASE2_COOLDOWN, speed × PHASE2_SPEED. */
  phase2At?: number;
  /** Added to enemyDanger (bots, screen ratings). */
  danger?: number;
}

// ─── Acts on the wire (Enemy.act) ───────────────────────────────────────────

/** Attack slots 0-5. */
export const MAX_ATTACKS = 6;
/** Slot of the stone act (witch). */
export const ACT_STONE = 6;
/** Slot of a hop (crouch / air / land). */
export const ACT_MOVE = 7;
export const ActPhase = { none: 0, windup: 1, action: 2, recover: 3 } as const;
export type ActPhase = (typeof ActPhase)[keyof typeof ActPhase];
/** Bits 0-1 phase, 2-4 slot, 5 stunned. 0 = doing nothing. */
export const encodeAct = (slot: number, phase: ActPhase, stunned = false): number =>
  phase === 0 ? 0 : (stunned ? 32 : 0) | ((slot & 7) << 2) | phase;
export const actSlot = (act: number): number => (act >> 2) & 7;
export const actPhase = (act: number): ActPhase => (act & 3) as ActPhase;
export const actStunned = (act: number): boolean => (act & 32) !== 0;

/** The aim stops tracking this long before the release. */
export const AIM_LOCK_TICKS = 6;
/** Pause after any act before another attack or hop starts. */
export const ACT_GAP_TICKS = 8;
/** Cardinal kinds: a still enemy turns to a new quadrant only after this long. */
export const TURN_TICKS = 12;
/** A failed line-of-sight check waits this long. */
export const LOS_RECHECK_TICKS = 6;
/** Ticks a woken enemy (EnemyDef.wake) stays awake without a hero near. */
export const WAKE_SETTLE_TICKS = 150;
export const PHASE2_COOLDOWN = 0.75;
export const PHASE2_SPEED = 1.15;
/** Hero speed share while webbed (Player.slow > 0). */
export const SLOW_FACTOR = 0.6;
/** No new web right after one ends. */
export const SLOW_IMMUNE_TICKS = 30;

/** Phase of a mini-boss or boss: 2 once its HP is at or below `phase2At` of the max. */
export const enemyPhase = (def: EnemyDef, hp: number, maxHp: number): 1 | 2 =>
  def.phase2At !== undefined && hp <= def.phase2At * maxHp ? 2 : 1;

// ─── The roster ─────────────────────────────────────────────────────────────

type Timing = Pick<AttackBase, "cooldownTicks" | "windupTicks" | "recoverTicks">;
const timing = (cooldownTicks: number, windupTicks: number, recoverTicks: number): Timing => ({
  cooldownTicks,
  windupTicks,
  recoverTicks,
});

const normal = (d: Omit<EnemyDef, "rank" | "attacks"> & { attacks?: AttackDef[] }): EnemyDef => ({
  rank: "normal",
  attacks: [],
  ...d,
});

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: normal({
    maxHp: 18,
    damage: 6,
    defense: 0,
    speed: 54,
    half: 5,
    xp: 4,
    rupees: [1, 2],
    behaviour: "hop",
    hop: { crouch: 6, air: 8, land: 4, rest: [22, 40], seek: 0 },
    aggroRange: 0,
    respawnSeconds: 20,
  }),
  goblin: normal({
    maxHp: 34,
    damage: 10,
    defense: 1,
    speed: 44,
    half: 5,
    xp: 10,
    rupees: [2, 4],
    behaviour: "chase",
    aggroRange: 80,
    respawnSeconds: 25,
  }),
  bat: normal({
    maxHp: 12,
    damage: 5,
    defense: 0,
    speed: 62,
    half: 4,
    xp: 5,
    rupees: [1, 2],
    behaviour: "erratic",
    wake: 72,
    aggroRange: 0,
    respawnSeconds: 18,
  }),
  skeleton: normal({
    maxHp: 40,
    damage: 9,
    defense: 2,
    speed: 30,
    half: 5,
    xp: 14,
    rupees: [2, 5],
    behaviour: "chase",
    aggroRange: 110,
    respawnSeconds: 30,
    attacks: [
      {
        type: "aimed",
        count: 1,
        spreadDeg: 0,
        speed: 120,
        range: 140,
        damage: 8,
        style: "bone",
        within: [24, 110],
        ...timing(75, 12, 6),
      },
    ],
  }),
  scorpion: normal({
    maxHp: 30,
    damage: 12,
    defense: 2,
    speed: 46,
    half: 5,
    xp: 12,
    rupees: [2, 4],
    behaviour: "chase",
    cardinal: 6,
    aggroRange: 100,
    respawnSeconds: 25,
    attacks: [{ type: "charge", speed: 170, ticks: 10, aligned: 6, within: [16, 100], ...timing(90, 10, 10) }],
  }),
  wolf: normal({
    maxHp: 28,
    // 9 → 7 (8B balance: wolves were the top killer of heroes, §6.3 knob 3).
    damage: 7,
    defense: 1,
    speed: 72,
    half: 5,
    xp: 12,
    rupees: [2, 4],
    behaviour: "chase",
    burst: [16, 8],
    aggroRange: 110,
    respawnSeconds: 25,
  }),
  lurker: normal({
    maxHp: 26,
    damage: 10,
    defense: 1,
    speed: 90,
    half: 5,
    xp: 11,
    rupees: [2, 4],
    // The hop is the attack: contact on landing.
    behaviour: "hop",
    hop: { crouch: 7, air: 9, land: 4, rest: [26, 44], seek: 110 },
    aggroRange: 110,
    respawnSeconds: 25,
  }),
  // ─── Mini-bosses (guard the middle of each dungeon) ─────────────────────
  brute: {
    rank: "miniboss",
    maxHp: 260,
    damage: 16,
    defense: 3,
    speed: 34,
    half: 9,
    xp: 120,
    rupees: [20, 30],
    behaviour: "chase",
    aggroRange: 220,
    respawnSeconds: 180,
    phase2At: 0.5,
    attacks: [
      // The roll.
      { type: "charge", speed: 190, ticks: 20, stunTicks: 30, within: [40, 200], ...timing(100, 12, 12) },
      {
        type: "aimed",
        count: 3,
        spreadDeg: 30,
        speed: 110,
        range: 180,
        damage: 10,
        style: "rock",
        ...timing(120, 14, 8),
      },
    ],
  },
  hexer: {
    rank: "miniboss",
    maxHp: 200,
    damage: 12,
    defense: 2,
    speed: 26,
    half: 7,
    xp: 120,
    rupees: [20, 30],
    behaviour: "kite",
    kite: { min: 70, max: 130 },
    aggroRange: 240,
    respawnSeconds: 180,
    phase2At: 0.5,
    attacks: [
      { type: "blink", minFromTarget: 80, within: [0, 56], ...timing(150, 10, 4) },
      { type: "aimed", count: 3, spreadDeg: 20, speed: 120, range: 200, damage: 8, style: "orb", ...timing(60, 12, 6) },
      { type: "ring", count: 10, speed: 90, range: 170, damage: 9, style: "orb", phase: 2, ...timing(100, 18, 10) },
    ],
  },
  // ─── Bosses (one per dungeon; they drop a chest) ─────────────────────────
  warden: {
    rank: "boss",
    maxHp: 900,
    damage: 18,
    defense: 4,
    speed: 32,
    half: 12,
    xp: 600,
    rupees: [80, 120],
    behaviour: "chase",
    aggroRange: 320,
    respawnSeconds: 300,
    phase2At: 0.5,
    attacks: [
      // Halberd sweep: frames 21-23 plant it beside and behind the rider, so the area is centred.
      { type: "strike", offset: 6, radius: 26, damage: 22, within: [0, 30], ...timing(50, 12, 12) },
      // Gallop.
      { type: "charge", speed: 170, ticks: 14, stunTicks: 20, within: [60, 240], ...timing(150, 14, 12) },
      {
        type: "aimed",
        count: 1,
        spreadDeg: 0,
        speed: 170,
        range: 220,
        damage: 14,
        style: "spear",
        phase: 1,
        within: [40, 220],
        ...timing(60, 15, 8),
      },
      {
        type: "aimed",
        count: 3,
        spreadDeg: 24,
        speed: 170,
        range: 220,
        damage: 12,
        style: "spear",
        phase: 2,
        within: [40, 220],
        ...timing(60, 15, 8),
      },
      { type: "summon", kind: "skeleton", count: 2, max: 4, ...timing(240, 20, 6) },
    ],
  },
  witch: {
    rank: "boss",
    maxHp: 800,
    damage: 14,
    defense: 3,
    // Unused: `guard` stands still (kept > 0 so no speed is ever 0).
    speed: 24,
    half: 10,
    xp: 600,
    rupees: [80, 120],
    behaviour: "guard",
    aggroRange: 320,
    respawnSeconds: 300,
    phase2At: 0.5,
    stone: {
      marks: [0.66, 0.33],
      ticks: 120,
      summon: { kind: "wisp", count: 2, max: 3 },
      endRing: { count: 12, speed: 85, range: 200, damage: 10, style: "orb" },
    },
    attacks: [
      { type: "ring", count: 14, speed: 90, range: 200, damage: 10, style: "orb", ...timing(70, 14, 8) },
      {
        type: "aimed",
        count: 3,
        spreadDeg: 24,
        speed: 130,
        range: 220,
        damage: 9,
        style: "orb",
        phase: 1,
        ...timing(50, 10, 6),
      },
      {
        type: "aimed",
        count: 5,
        spreadDeg: 40,
        speed: 130,
        range: 220,
        damage: 9,
        style: "orb",
        phase: 2,
        ...timing(50, 10, 6),
      },
      { type: "blink", ...timing(130, 13, 7) },
      { type: "summon", kind: "wisp", count: 2, max: 3, ...timing(260, 20, 6) },
    ],
  },
  matriarch: {
    rank: "boss",
    maxHp: 1100,
    damage: 20,
    defense: 5,
    speed: 40,
    half: 12,
    xp: 700,
    rupees: [90, 130],
    behaviour: "chase",
    aggroRange: 320,
    respawnSeconds: 300,
    phase2At: 0.5,
    attacks: [
      // Shell spin.
      { type: "charge", speed: 210, ticks: 30, bounces: 2, within: [40, 260], ...timing(110, 12, 16) },
      // Dragon fire (green, like the cobra and the drake).
      {
        type: "aimed",
        count: 5,
        spreadDeg: 60,
        speed: 150,
        range: 200,
        damage: 11,
        style: "sting",
        ...timing(55, 15, 8),
      },
      { type: "summon", kind: "scorpion", count: 2, max: 4, ...timing(280, 20, 6) },
    ],
  },
  colossus: {
    rank: "boss",
    maxHp: 1400,
    damage: 24,
    defense: 6,
    speed: 22,
    half: 14,
    xp: 900,
    rupees: [100, 150],
    behaviour: "chase",
    aggroRange: 320,
    respawnSeconds: 300,
    phase2At: 0.5,
    attacks: [
      // Stomp in place.
      { type: "strike", offset: 0, radius: 30, damage: 22, within: [0, 40], ...timing(60, 12, 12) },
      // Crouch, fly, stomp: a ring of rocks where it lands.
      {
        type: "leap",
        ticks: 24,
        range: 200,
        radius: 36,
        damage: 26,
        ring: { count: 12, speed: 110, range: 160, damage: 12, style: "rock" },
        within: [56, 200],
        ...timing(150, 15, 18),
      },
      {
        type: "aimed",
        count: 3,
        spreadDeg: 30,
        speed: 130,
        range: 220,
        damage: 12,
        style: "orb",
        phase: 1,
        ...timing(70, 12, 8),
      },
      {
        type: "aimed",
        count: 5,
        spreadDeg: 40,
        speed: 130,
        range: 220,
        damage: 12,
        style: "orb",
        phase: 2,
        ...timing(70, 12, 8),
      },
    ],
  },
  // ─── Regular kinds added in stage 8B ────────────────────────────────────
  shroom: normal({
    maxHp: 30,
    damage: 6,
    defense: 1,
    speed: 16,
    half: 5,
    xp: 8,
    rupees: [1, 3],
    behaviour: "wander",
    aggroRange: 56,
    respawnSeconds: 22,
    attacks: [
      {
        type: "ring",
        count: 6,
        speed: 64,
        range: 40,
        damage: 6,
        style: "spore",
        within: [0, 36],
        ...timing(90, 15, 10),
      },
    ],
  }),
  spider: normal({
    maxHp: 36,
    damage: 10,
    defense: 1,
    speed: 96,
    half: 6,
    xp: 16,
    rupees: [2, 5],
    behaviour: "hop",
    hop: { crouch: 8, air: 8, land: 4, rest: [24, 40], seek: 120 },
    wake: 100,
    aggroRange: 130,
    respawnSeconds: 30,
    danger: 1,
    attacks: [
      // The web slows the hero it hits (SHOT_DEFS.web.slowTicks).
      {
        type: "aimed",
        count: 1,
        spreadDeg: 0,
        speed: 100,
        range: 130,
        damage: 4,
        style: "web",
        within: [40, 130],
        ...timing(120, 12, 6),
      },
    ],
  }),
  wisp: normal({
    maxHp: 24,
    damage: 10,
    defense: 3,
    speed: 48,
    half: 5,
    xp: 12,
    rupees: [2, 4],
    // Contact only.
    behaviour: "bounce",
    aggroRange: 0,
    respawnSeconds: 25,
    danger: 1,
  }),
  eye: normal({
    maxHp: 34,
    damage: 6,
    defense: 2,
    speed: 20,
    half: 6,
    xp: 16,
    rupees: [2, 5],
    behaviour: "bounce",
    aggroRange: 200,
    respawnSeconds: 35,
    danger: 1,
    attacks: [
      {
        type: "aimed",
        count: 1,
        spreadDeg: 0,
        speed: 150,
        range: 200,
        damage: 9,
        style: "bolt",
        ...timing(100, 18, 8),
      },
    ],
  }),
  archer: normal({
    maxHp: 30,
    damage: 6,
    defense: 1,
    speed: 40,
    half: 5,
    xp: 14,
    rupees: [2, 5],
    behaviour: "kite",
    kite: { min: 56, max: 112 },
    aggroRange: 150,
    respawnSeconds: 30,
    danger: 1,
    attacks: [
      {
        type: "aimed",
        count: 1,
        spreadDeg: 0,
        speed: 170,
        range: 180,
        damage: 7,
        style: "arrow",
        within: [24, 150],
        ...timing(75, 14, 8),
      },
    ],
  }),
  raider: normal({
    maxHp: 40,
    damage: 8,
    defense: 2,
    speed: 46,
    half: 5,
    xp: 16,
    rupees: [2, 5],
    behaviour: "chase",
    aggroRange: 110,
    respawnSeconds: 28,
    danger: 1,
    attacks: [{ type: "strike", offset: 14, radius: 14, damage: 12, within: [0, 26], ...timing(50, 10, 10) }],
  }),
  lancer: normal({
    maxHp: 48,
    damage: 12,
    defense: 3,
    speed: 34,
    half: 6,
    xp: 20,
    rupees: [3, 6],
    behaviour: "chase",
    cardinal: 6,
    block: 0.3,
    aggroRange: 140,
    respawnSeconds: 35,
    danger: 1,
    attacks: [
      {
        type: "charge",
        speed: 160,
        ticks: 16,
        stunTicks: 24,
        aligned: 6,
        within: [24, 140],
        ...timing(80, 14, 10),
      },
    ],
  }),
  cobra: normal({
    maxHp: 32,
    damage: 8,
    defense: 1,
    speed: 24,
    half: 5,
    xp: 13,
    rupees: [2, 4],
    behaviour: "kite",
    kite: { min: 40, max: 100 },
    cardinal: 8,
    aggroRange: 150,
    respawnSeconds: 25,
    danger: 1,
    attacks: [
      {
        type: "aimed",
        count: 3,
        spreadDeg: 20,
        speed: 110,
        range: 150,
        damage: 7,
        style: "sting",
        aligned: 10,
        ...timing(90, 12, 8),
      },
    ],
  }),
  axeman: normal({
    maxHp: 44,
    damage: 11,
    defense: 2,
    speed: 36,
    half: 5,
    xp: 18,
    rupees: [3, 5],
    behaviour: "chase",
    aggroRange: 120,
    respawnSeconds: 30,
    danger: 1,
    attacks: [
      {
        type: "aimed",
        count: 1,
        spreadDeg: 0,
        speed: 110,
        range: 140,
        damage: 9,
        style: "axe",
        within: [32, 120],
        ...timing(90, 14, 10),
      },
    ],
  }),
  kultist: normal({
    maxHp: 34,
    damage: 7,
    defense: 1,
    speed: 28,
    half: 5,
    xp: 16,
    rupees: [2, 5],
    behaviour: "kite",
    kite: { min: 60, max: 110 },
    aggroRange: 150,
    respawnSeconds: 30,
    danger: 1,
    attacks: [
      { type: "blink", minFromTarget: 80, within: [0, 48], ...timing(210, 10, 4) },
      { type: "aimed", count: 1, spreadDeg: 0, speed: 90, range: 160, damage: 9, style: "curse", ...timing(90, 16, 8) },
    ],
  }),
  // ─── Mini-bosses added in stage 8B ──────────────────────────────────────
  drake: {
    rank: "miniboss",
    maxHp: 230,
    damage: 14,
    defense: 2,
    speed: 40,
    half: 9,
    xp: 120,
    rupees: [20, 30],
    behaviour: "kite",
    kite: { min: 48, max: 96 },
    aggroRange: 220,
    respawnSeconds: 180,
    phase2At: 0.5,
    attacks: [
      {
        type: "aimed",
        count: 3,
        spreadDeg: 30,
        speed: 120,
        range: 180,
        damage: 10,
        style: "sting",
        ...timing(70, 14, 8),
      },
      { type: "ring", count: 8, speed: 90, range: 150, damage: 9, style: "sting", phase: 2, ...timing(130, 18, 10) },
    ],
  },
  warlord: {
    rank: "miniboss",
    maxHp: 280,
    damage: 16,
    defense: 4,
    speed: 38,
    half: 7,
    xp: 140,
    rupees: [22, 32],
    behaviour: "chase",
    aggroRange: 220,
    respawnSeconds: 180,
    phase2At: 0.5,
    attacks: [
      // Hammer swing.
      { type: "strike", offset: 14, radius: 20, damage: 18, within: [0, 32], ...timing(45, 14, 12) },
      { type: "charge", speed: 170, ticks: 12, within: [48, 180], ...timing(120, 14, 12) },
      { type: "summon", kind: "raider", count: 2, max: 2, phase: 2, ...timing(300, 20, 6) },
    ],
  },
};

/** Chance a regular enemy spawns as an elite, outdoors and in dungeons. */
export const ELITE_CHANCE = 0.1;
export const ELITE_CHANCE_DUNGEON = 0.2;
/** Chance an elite drops a chest when it dies. */
export const ELITE_CHEST_CHANCE = 0.3;
/** Lowest rarity of the chest a boss / mini-boss drops (indexes into RARITIES). */
export const BOSS_CHEST_RARITY = 2;
export const MINIBOSS_CHEST_RARITY = 1;

/** Stats of one enemy after its tier (distance from the start, dungeon depth) and elite status. */
export interface EnemyStats {
  maxHp: number;
  damage: number;
  defense: number;
  speed: number;
  half: number;
  xp: number;
  rupees: [number, number];
  /** Multiplier for the damage of its projectiles. */
  shotDamage: number;
}

/**
 * Regular monsters of the overworld around the start (tiers 0 to 2) are weaker
 * than the formula below gives, so new heroes get going: the share of health
 * and damage they keep, by tier (rewards stay the same).
 */
export const START_AREA_SOFTENING: readonly number[] = [0.7, 0.75, 0.88];

/**
 * Stats of a monster. `overworld`: it lives outside the dungeons (only those
 * get START_AREA_SOFTENING near the start; dungeon monsters and bosses don't).
 */
export function enemyStats(kind: EnemyKind, tier: number, elite: boolean, overworld = false): EnemyStats {
  const def = ENEMIES[kind];
  const t = Math.max(0, tier);
  const e = elite ? 1 : 0;
  const soft = overworld && def.rank === "normal" ? (START_AREA_SOFTENING[Math.floor(t)] ?? 1) : 1;
  const damageMult = (1 + 0.15 * t) * (elite ? 1.5 : 1) * soft;
  const rupeeMult = (1 + 0.2 * t) * (elite ? 3 : 1);
  return {
    maxHp: Math.round(def.maxHp * (1 + 0.3 * t) * (elite ? 3 : 1) * soft),
    damage: Math.round(def.damage * damageMult),
    defense: def.defense + 0.5 * t + e,
    speed: def.speed * (elite ? 1.1 : 1),
    half: def.half + e,
    xp: Math.round(def.xp * (1 + 0.35 * t) * (elite ? 3 : 1)),
    rupees: [Math.round(def.rupees[0] * rupeeMult), Math.round(def.rupees[1] * rupeeMult)],
    shotDamage: damageMult,
  };
}
