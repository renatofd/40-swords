/**
 * Enemy archetypes: regular enemies (any of them can spawn as an elite),
 * mini-bosses and dungeon bosses. Pure data + pure functions.
 */

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
] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export const isEnemyKind = (v: unknown): v is EnemyKind =>
  typeof v === "string" && (ENEMY_KINDS as readonly string[]).includes(v);

export type EnemyRank = "normal" | "miniboss" | "boss";

/**
 * How an enemy moves: drifts around, runs at players within `aggroRange`,
 * flutters (fast, frequent turns), moves in hops, or holds its ground.
 */
export type Behaviour = "wander" | "chase" | "erratic" | "hop" | "guard";

/** Look of an enemy projectile (the client picks the texture). */
export const SHOT_STYLES = ["bone", "rock", "orb", "sting"] as const;
export type ShotStyle = (typeof SHOT_STYLES)[number];

/** What an enemy can do besides touching players. Cooldowns in ticks. */
export type AttackDef =
  | {
      type: "aimed";
      cooldownTicks: number;
      count: number;
      spreadDeg: number;
      speed: number;
      range: number;
      damage: number;
      style: ShotStyle;
    }
  | {
      type: "ring";
      cooldownTicks: number;
      count: number;
      speed: number;
      range: number;
      damage: number;
      style: ShotStyle;
    }
  | { type: "charge"; cooldownTicks: number; speed: number; ticks: number }
  | { type: "summon"; cooldownTicks: number; kind: EnemyKind; count: number; max: number }
  | { type: "blink"; cooldownTicks: number };

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
  /** Distance at which it notices players (chasing and attacks). */
  aggroRange: number;
  /** Seconds before its spawner brings it back. */
  respawnSeconds: number;
  /** Placeholder colour. */
  color: number;
  attacks: AttackDef[];
}

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
    speed: 22,
    half: 5,
    xp: 4,
    rupees: [1, 2],
    behaviour: "wander",
    aggroRange: 0,
    respawnSeconds: 20,
    color: 0x6fd64f,
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
    color: 0xc94a4a,
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
    aggroRange: 0,
    respawnSeconds: 18,
    color: 0x8a6ad0,
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
    color: 0xe8e4d0,
    attacks: [
      { type: "aimed", cooldownTicks: 75, count: 1, spreadDeg: 0, speed: 120, range: 140, damage: 8, style: "bone" },
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
    aggroRange: 90,
    respawnSeconds: 25,
    color: 0xd08a30,
    attacks: [{ type: "charge", cooldownTicks: 90, speed: 160, ticks: 8 }],
  }),
  wolf: normal({
    maxHp: 28,
    damage: 9,
    defense: 1,
    speed: 64,
    half: 5,
    xp: 12,
    rupees: [2, 4],
    behaviour: "chase",
    aggroRange: 110,
    respawnSeconds: 25,
    color: 0x8a8a96,
  }),
  lurker: normal({
    maxHp: 26,
    damage: 10,
    defense: 1,
    speed: 76,
    half: 5,
    xp: 11,
    rupees: [2, 4],
    behaviour: "hop",
    aggroRange: 0,
    respawnSeconds: 25,
    color: 0x4ab09a,
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
    color: 0x9a6a4a,
    attacks: [
      { type: "charge", cooldownTicks: 100, speed: 190, ticks: 12 },
      { type: "aimed", cooldownTicks: 120, count: 3, spreadDeg: 30, speed: 110, range: 180, damage: 10, style: "rock" },
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
    behaviour: "wander",
    aggroRange: 240,
    respawnSeconds: 180,
    color: 0x6a4ab0,
    attacks: [
      { type: "ring", cooldownTicks: 90, count: 10, speed: 90, range: 170, damage: 9, style: "orb" },
      { type: "aimed", cooldownTicks: 60, count: 3, spreadDeg: 20, speed: 120, range: 200, damage: 8, style: "orb" },
      { type: "blink", cooldownTicks: 150 },
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
    color: 0xd8d0b8,
    attacks: [
      { type: "aimed", cooldownTicks: 45, count: 5, spreadDeg: 40, speed: 130, range: 220, damage: 10, style: "bone" },
      { type: "summon", cooldownTicks: 240, kind: "skeleton", count: 2, max: 4 },
      { type: "charge", cooldownTicks: 160, speed: 170, ticks: 14 },
    ],
  },
  witch: {
    rank: "boss",
    maxHp: 800,
    damage: 14,
    defense: 3,
    speed: 24,
    half: 10,
    xp: 600,
    rupees: [80, 120],
    behaviour: "guard",
    aggroRange: 320,
    respawnSeconds: 300,
    color: 0x58a04a,
    attacks: [
      { type: "ring", cooldownTicks: 70, count: 14, speed: 90, range: 200, damage: 10, style: "orb" },
      { type: "aimed", cooldownTicks: 50, count: 3, spreadDeg: 24, speed: 130, range: 220, damage: 9, style: "orb" },
      { type: "blink", cooldownTicks: 120 },
      { type: "summon", cooldownTicks: 260, kind: "lurker", count: 2, max: 4 },
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
    color: 0xc07a28,
    attacks: [
      { type: "charge", cooldownTicks: 110, speed: 210, ticks: 14 },
      { type: "aimed", cooldownTicks: 55, count: 5, spreadDeg: 60, speed: 160, range: 200, damage: 11, style: "sting" },
      { type: "summon", cooldownTicks: 280, kind: "scorpion", count: 2, max: 4 },
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
    color: 0x8a8070,
    attacks: [
      { type: "ring", cooldownTicks: 80, count: 16, speed: 110, range: 220, damage: 13, style: "rock" },
      { type: "charge", cooldownTicks: 180, speed: 150, ticks: 18 },
      { type: "aimed", cooldownTicks: 70, count: 3, spreadDeg: 30, speed: 130, range: 220, damage: 12, style: "rock" },
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
