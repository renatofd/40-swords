/**
 * How each enemy kind is drawn from its tools/art sheet (content/sprites):
 * which tags it walks, stands, charges, hops and attacks with, how it faces,
 * and the gold palette swap of elites. Pure data and pure functions (tested
 * without a browser); EnemyView plays them.
 */
import type { EnemyKind } from "@game/shared";
import type { RecolorSpec } from "./recolor";

/** An animation played once when the enemy does something (fires, blinks). */
export interface EnemyAct {
  /** One-shot tag (directional `<tag>-<dir>` rows are used when the sheet has them); none: effect only. */
  anim?: string;
  /**
   * Frame to start from: the frame where the art releases the shot, so the
   * release lines up with the projectiles (the server fires them at once).
   */
  from?: number;
  /** Keeps the pose at least this long (single-frame tags). */
  holdMs?: number;
  /** Effect played at the enemy (a blink plays it where it left and where it lands). */
  fx?: string;
  /** Weapon overlay sheet with a `cast-right` tag, kept on the body's attack frame (like heroes' weapons). */
  overlay?: string;
}

export interface EnemyLook {
  /** Sprite key (content/sprites/<sheet>.png). */
  sheet: string;
  /** Ready-made gold variant for elites; without one, elites get a gold palette swap of `sheet`. */
  eliteSheet?: string;
  /**
   * `rows`: `<tag>-up|right|down` rows (west mirrored unless a `-left` row exists);
   * `side`: one side view, mirrored when heading west; `none`: always faces the viewer.
   */
  facing: "rows" | "side" | "none";
  walk: string;
  idle: string;
  /** The sheet has no standing pose: standing still holds the first walk frame. */
  holdIdle?: boolean;
  /** Plays the walk cycle this much slower while standing (slimes keep wobbling). */
  idleScale?: number;
  /** Hop movers: one jump per burst of movement (`land`: a landing pose when it stops). */
  hop?: { jump: string; land?: string };
  /** Flyers: the body hovers this many px over its shadow. */
  lift?: number;
  /** Shown while it charges (moves much faster than it walks): `start` once, then `anim` looping. */
  charge?: { anim: string; start?: string; timeScale?: number };
  /** On `Msg.enemyShot`: aimed volleys and rings (projectiles all around). */
  aimed?: EnemyAct;
  ring?: EnemyAct;
  /** On a teleport (the server's `blink`). */
  blink?: EnemyAct;
  /** Its own hurt frame (instead of a white flash). */
  hurt?: string;
  /** Highest pixel of the art above its feet (HP bar, hit sparks, explosions). */
  top: number;
  /** Width of its shadow, in px. */
  shadow: number;
}

/** Shots of the hexer and the witch come out of a cast; the hexer swings its staff. */
const HEXER_CAST: EnemyAct = { anim: "attack", overlay: "fx-staff-green" };
const WITCH_CAST: EnemyAct = { anim: "cast", from: 13 };

export const ENEMY_LOOKS: Readonly<Record<EnemyKind, EnemyLook>> = {
  slime: {
    sheet: "slime",
    eliteSheet: "slime-gold",
    facing: "none",
    walk: "hop",
    idle: "hop",
    idleScale: 0.5,
    top: 19,
    shadow: 14,
  },
  goblin: { sheet: "goblin", facing: "rows", walk: "walk", idle: "idle", top: 16, shadow: 12 },
  bat: { sheet: "bat", eliteSheet: "bat-gold", facing: "none", walk: "fly", idle: "fly", lift: 6, top: 22, shadow: 8 },
  skeleton: { sheet: "skeleton", facing: "rows", walk: "walk", idle: "idle", top: 16, shadow: 10 },
  scorpion: {
    sheet: "scorpion",
    facing: "rows",
    walk: "walk",
    idle: "walk",
    holdIdle: true,
    charge: { anim: "walk", timeScale: 2.5 },
    top: 16,
    shadow: 10,
  },
  wolf: { sheet: "wolf", facing: "side", walk: "walk", idle: "walk", holdIdle: true, top: 18, shadow: 14 },
  lurker: {
    sheet: "lurker",
    facing: "side",
    walk: "sit",
    idle: "sit",
    hop: { jump: "jump" },
    top: 21,
    shadow: 14,
  },
  brute: {
    sheet: "brute",
    facing: "side",
    walk: "walk",
    idle: "stand",
    charge: { start: "roll-start", anim: "roll" },
    aimed: { anim: "throw", from: 3 },
    top: 32,
    shadow: 24,
  },
  hexer: {
    sheet: "hexer",
    facing: "rows",
    walk: "walk",
    idle: "idle",
    aimed: HEXER_CAST,
    ring: HEXER_CAST,
    blink: { fx: "fx-smoke-16" },
    top: 17,
    shadow: 12,
  },
  warden: {
    sheet: "warden",
    facing: "side",
    walk: "walk",
    idle: "stand",
    charge: { anim: "walk", timeScale: 1.8 },
    aimed: { anim: "throw", from: 4 },
    top: 32,
    shadow: 26,
  },
  witch: {
    sheet: "witch",
    facing: "none",
    walk: "stand",
    idle: "stand",
    aimed: WITCH_CAST,
    ring: WITCH_CAST,
    blink: { anim: "split", from: 4, fx: "fx-smoke-32" },
    top: 32,
    shadow: 28,
  },
  matriarch: {
    sheet: "matriarch",
    // The walk turns its head to screen-right; the other poses are front-on and near symmetric.
    facing: "side",
    walk: "walk",
    idle: "stand",
    charge: { anim: "spin" },
    aimed: { anim: "special", holdMs: 260 },
    hurt: "hurt",
    top: 32,
    shadow: 28,
  },
  colossus: {
    sheet: "colossus",
    facing: "none",
    walk: "walk",
    idle: "stand",
    charge: { anim: "flap" },
    aimed: { anim: "breath" },
    ring: { anim: "stomp", fx: "fx-dust-burst" },
    top: 32,
    shadow: 30,
  },
};

/** Below this speed (px/s) an enemy counts as standing still. */
export const STILL_SPEED = 8;

/** Moving clearly faster than it walks: a charge (or a knockback, which reads the same). */
export function isCharging(speed: number, walkSpeed: number): boolean {
  return speed > Math.max(walkSpeed * 1.8, walkSpeed + 40);
}

/** Mirroring of a side-view sheet: west faces mirror, east faces don't, north and south keep the last one. */
export function sideFlip(facing: number, previous: boolean): boolean {
  const f = ((Math.round(facing) % 8) + 8) % 8;
  if (f >= 3 && f <= 5) return true;
  if (f === 0 || f === 1 || f === 7) return false;
  return previous;
}

/** 8-way facing (0 E, 1 SE, 2 S ... 7 NE) of a direction in radians (y grows down). */
export function angleFacing(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

/**
 * Whether a volley is a ring (projectiles all around) or aimed, and where an
 * aimed one points (its middle projectile).
 */
export function volleyShape(angles: readonly number[]): { ring: boolean; aim: number } {
  const aim = angles[Math.floor(angles.length / 2)] ?? 0;
  if (angles.length < 2) return { ring: false, aim };
  const spread = Math.abs((angles[angles.length - 1] ?? 0) - (angles[0] ?? 0));
  return { ring: spread > Math.PI, aim };
}

// ─── Gold elites ────────────────────────────────────────────────────────────

/** Gold shades, darkest to lightest, and the brown outline of the pack's own gold sheets (Gold Goo, GoldEye). */
const GOLD_RAMP = [0xd09010, 0xf0c028, 0xffe737, 0xfff4b0] as const;
const GOLD_OUTLINE = 0x5c3c0d;

const luminance = (c: number) => (0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff)) / 255;

/**
 * Palette swap that turns a sheet gold: the darkest colour becomes the brown
 * outline (if it is dark), the others take the gold ramp by brightness. Near
 * black details and pure white highlights stay.
 */
export function goldRecolor(colors: Iterable<number>): RecolorSpec {
  const map = new Map<number, number>();
  const rest = [...new Set(colors)].filter((c) => luminance(c) >= 0.06 && c !== 0xffffff);
  rest.sort((a, b) => luminance(a) - luminance(b));
  const outline = rest[0];
  if (outline !== undefined && luminance(outline) < 0.3) {
    map.set(outline, GOLD_OUTLINE);
    rest.shift();
  }
  const lo = luminance(rest[0] ?? 0);
  const hi = luminance(rest[rest.length - 1] ?? 0);
  const last = GOLD_RAMP.length - 1;
  for (const c of rest) {
    const t = hi - lo < 1e-6 ? 0.5 : (luminance(c) - lo) / (hi - lo);
    map.set(c, GOLD_RAMP[Math.min(last, Math.round(t * last))] ?? GOLD_OUTLINE);
  }
  return { map };
}
