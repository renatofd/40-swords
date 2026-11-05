import { type ClassId, type Stats, statsFor } from "./classes";
import type { Rng } from "./rng";
import { isWeaponId, scaledCooldown, WEAPON_IDS, type WeaponId } from "./weapons";

// ─── Rarity ───────────────────────────────────────────────────────────────

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type RarityId = (typeof RARITIES)[number];
export const MAX_RARITY = RARITIES.length - 1;

export const clampRarity = (r: number): number => Math.min(MAX_RARITY, Math.max(0, Math.floor(r) || 0));

/** How much stronger a passive relic is at each rarity. */
export const RARITY_POWER = [1, 1.5, 2.2, 3.2, 5] as const;
/** Damage multiplier of a weapon relic at each rarity. */
export const RARITY_WEAPON_POWER = [1, 1.35, 1.8, 2.5, 3.5] as const;
/** Colour of each rarity (relic borders, names). */
export const RARITY_COLORS = [0xc8c8d0, 0x4fd16a, 0x4a9eff, 0xb35cff, 0xff9a2a] as const;

/** Base chance weights of each rarity, and how much one point of luck raises each (0.25 = +25%). */
const RARITY_WEIGHTS = [60, 25, 10, 4, 1] as const;
const LUCK_PER_POINT = [0, 0.06, 0.1, 0.15, 0.25] as const;

/** Relative chance of each rarity for a hero with this much luck. */
export function rarityWeights(luck: number): number[] {
  const l = Math.max(0, luck);
  return RARITY_WEIGHTS.map((w, r) => w * (1 + l * (LUCK_PER_POINT[r] ?? 0)));
}

/** Rolls a rarity; luck makes the better ones more likely. `min` sets a floor (e.g. boss chests). */
export function rollRarity(luck: number, rng: Rng, min = 0): number {
  const weights = rarityWeights(luck).map((w, r) => (r < min ? 0 : w));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let r = 0; r < weights.length; r++) {
    roll -= weights[r] ?? 0;
    if (roll < 0) return r;
  }
  return MAX_RARITY;
}

// ─── Relics ───────────────────────────────────────────────────────────────

/** Passive relics: each adds to one attribute. Append new ones at the end. */
export const PASSIVE_IDS = ["heart", "power", "boots", "clover", "eye", "mark", "fang", "shield", "haste"] as const;
export type PassiveId = (typeof PASSIVE_IDS)[number];

export const RELIC_IDS = [...PASSIVE_IDS, ...WEAPON_IDS] as const;
export type RelicKind = PassiveId | WeaponId;

export const isPassiveId = (v: unknown): v is PassiveId =>
  typeof v === "string" && (PASSIVE_IDS as readonly string[]).includes(v);
export const isRelicKind = (v: unknown): v is RelicKind => isPassiveId(v) || isWeaponId(v);

/** The attribute a passive relic improves ("haste" lowers every cooldown). */
export type PassiveStat =
  | "maxHp"
  | "damage"
  | "speed"
  | "luck"
  | "critChance"
  | "critDamage"
  | "lifesteal"
  | "defense"
  | "haste";

/** Value of a common copy; rarer copies multiply it by RARITY_POWER. */
export const PASSIVES: Record<PassiveId, { stat: PassiveStat; base: number }> = {
  heart: { stat: "maxHp", base: 12 },
  power: { stat: "damage", base: 1.5 },
  boots: { stat: "speed", base: 5 },
  clover: { stat: "luck", base: 2 },
  eye: { stat: "critChance", base: 0.03 },
  mark: { stat: "critDamage", base: 0.15 },
  fang: { stat: "lifesteal", base: 0.015 },
  shield: { stat: "defense", base: 1 },
  haste: { stat: "haste", base: 4 },
};

/** Amount one passive relic adds to its attribute. */
export const passiveValue = (kind: PassiveId, rarity: number): number =>
  PASSIVES[kind].base * (RARITY_POWER[clampRarity(rarity)] ?? 1);

/** Anything shaped like an owned relic (the synced `Relic` schema or a plain object). */
export interface RelicLike {
  kind: string;
  rarity: number;
}

/** Physical limits, not balance caps: movement must stay below one tile per tick. */
export const MAX_SPEED = 200;
export const MAX_LIFESTEAL = 0.5;
export const MIN_COOLDOWN_PCT = 30;

/** A hero's attributes: class and level, plus every passive relic owned. */
export function computeStats(classId: ClassId, level: number, relics: Iterable<RelicLike>): Stats {
  const s = statsFor(classId, level);
  let haste = 0;
  for (const relic of relics) {
    if (!isPassiveId(relic.kind)) continue;
    const value = passiveValue(relic.kind, relic.rarity);
    const stat = PASSIVES[relic.kind].stat;
    if (stat === "haste") haste += value;
    else s[stat] += value;
  }
  s.maxHp = Math.round(s.maxHp);
  s.speed = Math.min(MAX_SPEED, Math.round(s.speed));
  s.critChance = Math.min(1, s.critChance);
  s.lifesteal = Math.min(MAX_LIFESTEAL, s.lifesteal);
  s.cooldownPct = Math.max(MIN_COOLDOWN_PCT, Math.round(100 - haste));
  s.attackCooldownTicks = scaledCooldown(s.attackCooldownTicks, s.cooldownPct);
  return s;
}

/** Rarities of every copy of a weapon owned, strongest first. */
export function weaponCopies(relics: Iterable<RelicLike>, weapon: WeaponId): number[] {
  const copies: number[] = [];
  for (const relic of relics) if (relic.kind === weapon) copies.push(clampRarity(relic.rarity));
  return copies.sort((a, b) => b - a);
}

// ─── Shops ────────────────────────────────────────────────────────────────

/** What a vendor sells: a relic, or a potion that restores all health. */
export type OfferItem = RelicKind | "potion";

const RELIC_PRICES = [6, 12, 25, 50, 100] as const;
export const POTION_PRICE = 10;

/** Price in rupees; weapons cost 50% more. */
export function offerPrice(item: OfferItem, rarity: number): number {
  if (item === "potion") return POTION_PRICE;
  const base = RELIC_PRICES[clampRarity(rarity)] ?? RELIC_PRICES[0];
  return isWeaponId(item) ? Math.round(base * 1.5) : base;
}

/** Items on a vendor's counter. */
export const OFFER_SLOTS = 3;

/** Where offer `slot` lies: in a row two tiles in front of the vendor. */
export function offerPosition(vendor: { x: number; y: number }, slot: number) {
  return { x: vendor.x + (slot - 1) * 32, y: vendor.y + 32 };
}
