/**
 * Playable classes and their stats. Pure data + pure functions: the server uses
 * them for combat, the client for prediction (speed, cooldown) and the HUD.
 */

export const CLASS_IDS = ["knight", "rogue", "barbarian"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const isClassId = (v: unknown): v is ClassId =>
  typeof v === "string" && (CLASS_IDS as readonly string[]).includes(v);

/** Everything that defines how strong a character is at a given level. */
export interface Stats {
  /** Maximum hit points. */
  maxHp: number;
  /** Sword damage per hit (before crits and the target's defense). */
  damage: number;
  /** Walking speed in px/s. */
  speed: number;
  /** Luck: better drops (stage 1: chance of double rupees; later: relic rarity). */
  luck: number;
  /** Chance of a critical hit, 0..1. */
  critChance: number;
  /** Damage multiplier of a critical hit (1.5 = +50%). */
  critDamage: number;
  /** Fraction of damage dealt that heals the attacker, 0..1. */
  lifesteal: number;
  /** Flat damage reduction per hit taken. */
  defense: number;
  /** Ticks between sword swings. */
  attackCooldownTicks: number;
  /** Sword reach in px. */
  reach: number;
}

interface ClassDef {
  base: Stats;
  /** Added per level above 1. */
  perLevel: Pick<Stats, "maxHp" | "damage" | "defense" | "critChance">;
  /** Placeholder colour of the character (until real sprites exist). */
  color: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  /** Tough and steady: lots of HP and defense, average sword. */
  knight: {
    base: {
      maxHp: 120,
      damage: 10,
      speed: 80,
      luck: 2,
      critChance: 0.05,
      critDamage: 1.5,
      lifesteal: 0,
      defense: 4,
      attackCooldownTicks: 12,
      reach: 18,
    },
    perLevel: { maxHp: 14, damage: 1.5, defense: 0.5, critChance: 0.002 },
    color: 0x5a8ff2,
  },
  /** Fast and lucky: frequent crits and short, quick stabs, but fragile. */
  rogue: {
    base: {
      maxHp: 80,
      damage: 8,
      speed: 100,
      luck: 8,
      critChance: 0.15,
      critDamage: 1.75,
      lifesteal: 0.03,
      defense: 1,
      attackCooldownTicks: 8,
      reach: 15,
    },
    perLevel: { maxHp: 8, damage: 1.2, defense: 0.2, critChance: 0.005 },
    color: 0x5ad18a,
  },
  /** Heavy hitter: slow wide swings, huge crits and life steal. */
  barbarian: {
    base: {
      maxHp: 100,
      damage: 14,
      speed: 86,
      luck: 3,
      critChance: 0.08,
      critDamage: 2,
      lifesteal: 0.06,
      defense: 2,
      attackCooldownTicks: 16,
      reach: 21,
    },
    perLevel: { maxHp: 11, damage: 2, defense: 0.3, critChance: 0.003 },
    color: 0xe0703c,
  },
};

/** Stats of a class at a level (1-based). */
export function statsFor(classId: ClassId, level: number): Stats {
  const { base, perLevel } = CLASSES[classId];
  const n = Math.max(0, Math.floor(level) - 1);
  return {
    ...base,
    maxHp: Math.round(base.maxHp + perLevel.maxHp * n),
    damage: base.damage + perLevel.damage * n,
    defense: base.defense + perLevel.defense * n,
    critChance: Math.min(1, base.critChance + perLevel.critChance * n),
  };
}

/** Highest reachable level. */
export const MAX_LEVEL = 30;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => 10 + level * 10;
