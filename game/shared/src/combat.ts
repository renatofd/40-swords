import type { Stats } from "./classes";
import { clampRarity, RARITY_WEAPON_POWER } from "./relics";
import type { Rng } from "./rng";
import { facingVector } from "./simulation/facing";
import { WEAPONS, type WeaponId } from "./weapons";

/** Circle the sword covers on the swing tick. */
export interface Hitbox {
  x: number;
  y: number;
  r: number;
}

export function swordHitbox(x: number, y: number, facing: number, reach: number): Hitbox {
  const [fx, fy] = facingVector(facing);
  return { x: x + fx * reach * 0.55, y: y + fy * reach * 0.55, r: reach * 0.6 };
}

/** True when a box of half-extent `half` centred at (x, y) touches the hitbox. */
export function hitboxTouches(box: Hitbox, x: number, y: number, half: number): boolean {
  const reach = box.r + half;
  return (x - box.x) ** 2 + (y - box.y) ** 2 <= reach * reach;
}

export interface HitResult {
  amount: number;
  crit: boolean;
  /** HP the attacker recovers through life steal. */
  heal: number;
}

/** Applies the attacker's crit and life steal to a raw hit, then the target's flat defense (min 1). */
function rollDamage(raw: number, attacker: Stats, targetDefense: number, rng: Rng): HitResult {
  const crit = rng() < attacker.critChance;
  const amount = Math.max(1, Math.round(raw * (crit ? attacker.critDamage : 1) - targetDefense));
  return { amount, crit, heal: amount * attacker.lifesteal };
}

/** Damage of one sword hit. */
export const rollHit = (attacker: Stats, targetDefense: number, rng: Rng): HitResult =>
  rollDamage(attacker.damage, attacker, targetDefense, rng);

/** Damage of a weapon projectile before crits: its rarity plus a share of the hero's strength. */
export const projectileDamage = (weapon: WeaponId, rarity: number, attacker: Stats): number =>
  WEAPONS[weapon].damage * (RARITY_WEAPON_POWER[clampRarity(rarity)] ?? 1) + attacker.damage * WEAPONS[weapon].scaling;

/** Damage of one weapon projectile hit. */
export const rollProjectileHit = (
  weapon: WeaponId,
  rarity: number,
  attacker: Stats,
  targetDefense: number,
  rng: Rng,
): HitResult => rollDamage(projectileDamage(weapon, rarity, attacker), attacker, targetDefense, rng);

/** Damage taken from a raw hit, after flat defense (min 1). */
export const mitigate = (raw: number, defense: number): number => Math.max(1, Math.round(raw - defense));

/** Rupees dropped, with luck giving a chance (4% per point, max 60%) to double them. */
export function rollRupees(range: [number, number], luck: number, rng: Rng): number {
  const [min, max] = range;
  const base = min + Math.floor(rng() * (max - min + 1));
  const double = rng() < Math.min(0.6, luck * 0.04);
  return double ? base * 2 : base;
}
