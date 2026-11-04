import { type CollisionGrid, clamp } from "@core/shared";
import { facingVector } from "./simulation/facing";

/**
 * Weapon relics. They fire with the sword button, each on its own cooldown.
 * Every copy a hero owns adds `perCopy` projectiles to the volley, with no cap.
 *
 * The order of WEAPON_IDS is part of the protocol (bit masks and indexes on the
 * wire): append new weapons at the end and bump PROTOCOL_VERSION.
 */
export const WEAPON_IDS = ["dagger", "fireball", "arrow", "nova"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export const isWeaponId = (v: unknown): v is WeaponId =>
  typeof v === "string" && (WEAPON_IDS as readonly string[]).includes(v);

export interface WeaponDef {
  /** Ticks between volleys (before the hero's cooldown percent). */
  cooldownTicks: number;
  /** px/s */
  speed: number;
  /** Max distance in px. */
  range: number;
  /** Damage of a common copy. */
  damage: number;
  /** Share of the hero's strength added to each projectile. */
  scaling: number;
  /** Collision radius in px. */
  radius: number;
  /** Enemies a projectile passes through before stopping. */
  pierce: number;
  /** Projectiles each copy adds to a volley. */
  perCopy: number;
  /** Angle between projectiles of a fan, in degrees; the whole fan never exceeds `maxSpreadDeg`. */
  spreadDeg: number;
  maxSpreadDeg: number;
  /** Fires all around the hero instead of a fan. */
  ring: boolean;
  /** Knockback speed on hit (px/s); 0 for none. */
  knock: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  /** Fast, short-range blades thrown in a fan. */
  dagger: {
    cooldownTicks: 24,
    speed: 230,
    range: 120,
    damage: 5,
    scaling: 0.3,
    radius: 3,
    pierce: 0,
    perCopy: 1,
    spreadDeg: 10,
    maxSpreadDeg: 120,
    ring: false,
    knock: 80,
  },
  /** Slow, heavy fireballs. */
  fireball: {
    cooldownTicks: 42,
    speed: 120,
    range: 150,
    damage: 12,
    scaling: 0.4,
    radius: 5,
    pierce: 0,
    perCopy: 1,
    spreadDeg: 16,
    maxSpreadDeg: 160,
    ring: false,
    knock: 160,
  },
  /** Long-range arrows that pierce two enemies. */
  arrow: {
    cooldownTicks: 33,
    speed: 300,
    range: 220,
    damage: 7,
    scaling: 0.3,
    radius: 2,
    pierce: 2,
    perCopy: 1,
    spreadDeg: 6,
    maxSpreadDeg: 90,
    ring: false,
    knock: 60,
  },
  /** A ring of shards around the hero. */
  nova: {
    cooldownTicks: 60,
    speed: 150,
    range: 72,
    damage: 6,
    scaling: 0.2,
    radius: 3,
    pierce: 0,
    perCopy: 8,
    spreadDeg: 0,
    maxSpreadDeg: 0,
    ring: true,
    knock: 120,
  },
};

/** Cooldown in ticks after the hero's cooldown percent (integer math: deterministic everywhere). */
export const scaledCooldown = (ticks: number, cooldownPct: number): number =>
  Math.max(4, Math.round((ticks * cooldownPct) / 100));

/** Directions (radians) of the `total` projectiles of a volley fired facing `facing`. */
export function volleyAngles(weapon: WeaponId, total: number, facing: number): number[] {
  const [fx, fy] = facingVector(facing);
  const base = Math.atan2(fy, fx);
  const def = WEAPONS[weapon];
  if (total <= 0) return [];
  if (def.ring) return Array.from({ length: total }, (_, i) => base + (i * 2 * Math.PI) / total);
  if (total === 1) return [base];
  const spread = (Math.min(def.spreadDeg * (total - 1), def.maxSpreadDeg) * Math.PI) / 180;
  const step = spread / (total - 1);
  return Array.from({ length: total }, (_, i) => base - spread / 2 + i * step);
}

/** How far a projectile flies from (x, y) along (dx, dy) before a wall or its range stops it. */
export function travelDistance(grid: CollisionGrid, x: number, y: number, dx: number, dy: number, range: number) {
  const STEP = 2;
  for (let d = STEP; d <= range; d += STEP) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (grid.isSolid(Math.floor(px / grid.tileSize), Math.floor(py / grid.tileSize))) return d - STEP;
  }
  return range;
}

/**
 * True when a circle of radius `r` moving from a to b touches the box of
 * half-extent `half` centred at c (closest point of the path to the centre).
 */
export function sweptHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  cx: number,
  cy: number,
  half: number,
): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? clamp(((cx - ax) * vx + (cy - ay) * vy) / len2, 0, 1) : 0;
  const px = ax + vx * t;
  const py = ay + vy * t;
  const qx = clamp(px, cx - half, cx + half);
  const qy = clamp(py, cy - half, cy + half);
  return (px - qx) ** 2 + (py - qy) ** 2 <= r * r;
}

/** Identifies one projectile on the wire: owner, volley, weapon index and index in the volley. */
export const projectileKey = (owner: string, volley: number, weapon: number, index: number) =>
  `${owner}:${volley}:${weapon}:${index}`;
