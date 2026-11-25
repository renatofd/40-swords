/**
 * How each enemy kind is drawn from its tools/art sheet (content/sprites):
 * which tags it walks and stands with, how it faces, and what it shows in each
 * phase of an act (Enemy.act: wind-up → action → recover, see encodeAct), plus
 * the skins picked by place and the gold palette swap of elites. Pure data and
 * pure functions (tested without a browser); EnemyView plays them.
 */
import {
  ACT_MOVE,
  ACT_STONE,
  type AttackType,
  ENEMIES,
  type EnemyKind,
  STONE_RECOVER_TICKS,
  STONE_WINDUP_TICKS,
  TICK_RATE,
} from "@game/shared";
import type { RecolorSpec } from "./recolor";

/** A point from the feet (body px): side-view sheets mirror x when facing west. */
export type Point = readonly [number, number];
/** Sheets with up/down rows give one point per row (west = right mirrored). */
export interface RowPoints {
  right: Point;
  up: Point;
  down: Point;
}

/** An effect played by an act: at the release, on landing (leaps) or where a blink leaves and lands. */
export interface ActFx {
  key: string;
  at: "action" | "land" | "both-spots";
  /** `self`: the middle of the art (default); `feet`: on the ground under it. */
  where?: "self" | "feet";
  /** Sideways offset (px; mirrored with the art), and drawn behind the body (dust kicked up around big feet). */
  dx?: number;
  under?: boolean;
}

/** What one act (an attack slot, the hop, the stone) shows in each phase. */
export interface ActLook {
  /** Tag held during the wind-up; `fit`: stretched to windupTicks (repeat 1, its last frame lands on the release). */
  windup?: string;
  fit?: boolean;
  /** Speed of a non-fitted wind-up tag (loops: shroom, eye, drake ring). */
  timeScale?: number;
  /** Tag from the release on: one-shot (plays to its end before the recover tag), or looped if `loop`. */
  action?: string;
  loop?: boolean;
  actionScale?: number;
  /** Shows only this frame of the action tag, still (the lancer's dash). */
  actionFrame?: number;
  recover?: string;
  /** 1 px body shake during the wind-up: sheets without a wind-up pose. */
  shake?: boolean;
  /** Sprite key shown 2 px over the head during the wind-up (the projectile about to be thrown). */
  held?: string;
  /** fx-shine point ("attack coming") shown min(6, windupTicks) ticks before the release; null: none. */
  tell?: Point | RowPoints | null;
  fx?: readonly ActFx[];
  /** Humanoid weapon overlay (a `cast-right` sheet): `overlayFrames.windup` follow the wind-up, `.action` the action. */
  overlay?: string;
  overlayFrames?: { windup: readonly number[]; action: readonly number[] };
  /** Leaps and hops: in the action the body rises `airLift` + round(4·arc·k(1−k)) px over its shadow (k: 0 → 1). */
  arc?: number;
  airLift?: number;
  /** Recover with the stunned bit (it hit a wall): this pose (`next` after it, if it is a one-shot) and a looping fx-spark. */
  stunned?: { tag: string; next?: string; fx?: string };
}

export interface EnemyLook {
  /** Sprite key (content/sprites/<sheet>.png); skins by place come from enemySkin. */
  sheet: string;
  /** Ready-made gold variant for elites; without one, elites get a gold palette swap of their skin. */
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
  /** Plays the idle tag this much slower. */
  idleScale?: number;
  /** Flyers: the body hovers this many px over its shadow (and bobs). */
  lift?: number;
  /** Its own hurt frame (instead of a white flash). */
  hurt?: string;
  /** Highest pixel of the art above its feet (HP bar, hit sparks, explosions, held items, stun sparks). */
  top: number;
  /** Width of its shadow, in px. */
  shadow: number;
  /** Index-aligned with ENEMIES[kind].attacks. */
  acts: readonly (ActLook | undefined)[];
  /** Hop movers (ACT_MOVE): crouch is fitted to the hop's crouch ticks; the body arcs over its shadow in the air. */
  hop?: { crouch: string; air: string; land: string; arc?: number; airLift?: number };
  /** Witch: the flash into stone, the stone pose, and the effect when she wakes up. */
  stone?: { windup: string; action: string; endFx: string };
  /** Shown when it has stood still (and done nothing) for `restAfterMs`: a dormant bat or spider. */
  rest?: { tag: string; afterMs: number; timeScale?: number; lift?: number };
  /** Plays this tag before the death smoke. */
  death?: { tag: string; ms: number };
  /** Humanoids: shown 200 ms when a blow cancels its wind-up. */
  stun?: string;
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

const SPARK = "fx-spark";
/** Humanoid shots and swings: aim (cols 8-9) fitted to the wind-up, release at col 10 (strike = cols 10-11). */
const humanoidShot = (overlay: string, tell: RowPoints): ActLook => ({
  windup: "aim",
  fit: true,
  overlay,
  tell,
  action: "strike",
  recover: "idle",
});
const HUMANOID = { facing: "rows", walk: "walk", idle: "idle", hurt: "hurt", stun: "stun" } as const;
/** 16x16 walkers without a wind-up pose: stand, shake, then the arm forward (col 3). */
const walkerThrow = (tell: RowPoints, held?: string): ActLook => ({
  windup: "idle",
  shake: true,
  held,
  tell,
  action: "strike",
  recover: "idle",
});
const same = (p: Point): RowPoints => ({ right: p, up: p, down: p });
/**
 * Humanoid tells sit on the weapon as the overlay holds it at the end of the
 * wind-up (frame 1, turned with the row): the drawn bow, the blade held low
 * behind, the staff's orb in the hand.
 */
const STAFF_ORB: RowPoints = { right: [1, -7], up: [1, -9], down: [-1, -7] };
const SMOKE_32_SELF: readonly ActFx[] = [{ key: "fx-smoke-32", at: "action" }];

export const ENEMY_LOOKS: Readonly<Record<EnemyKind, EnemyLook>> = {
  slime: {
    sheet: "slime",
    eliteSheet: "slime-gold",
    facing: "none",
    walk: "idle",
    idle: "idle",
    hop: { crouch: "crouch", air: "jump", land: "land", arc: 4 },
    top: 19,
    shadow: 14,
    acts: [],
  },
  goblin: { sheet: "goblin", facing: "rows", walk: "walk", idle: "idle", top: 16, shadow: 12, acts: [] },
  bat: {
    sheet: "bat",
    eliteSheet: "bat-gold",
    facing: "none",
    walk: "fly",
    idle: "fly",
    lift: 6,
    rest: { tag: "rest", afterMs: 400, lift: 1 },
    top: 22,
    shadow: 8,
    acts: [],
  },
  skeleton: {
    sheet: "skeleton",
    facing: "rows",
    walk: "walk",
    idle: "idle",
    top: 16,
    shadow: 10,
    // The tell sits on the bone it holds up (2 px over its head).
    acts: [walkerThrow(same([0, -26]), "hostile-bone")],
  },
  scorpion: {
    sheet: "scorpion",
    facing: "rows",
    walk: "walk",
    idle: "ready",
    top: 16,
    shadow: 10,
    acts: [
      {
        windup: "ready",
        shake: true,
        tell: { right: [6, -10], up: [0, -14], down: [0, -6] },
        action: "walk",
        loop: true,
        actionScale: 3,
        recover: "ready",
      },
    ],
  },
  wolf: { sheet: "wolf", facing: "side", walk: "walk", idle: "walk", holdIdle: true, top: 18, shadow: 14, acts: [] },
  lurker: {
    sheet: "lurker",
    facing: "side",
    walk: "sit",
    idle: "sit",
    // The air frames hang its legs 5 px under the feet line: lifted so they clear the shadow.
    hop: { crouch: "crouch", air: "air", land: "crouch", arc: 6, airLift: 6 },
    death: { tag: "fall", ms: 300 },
    top: 21,
    shadow: 14,
    acts: [],
  },
  brute: {
    sheet: "brute",
    facing: "side",
    walk: "walk",
    idle: "stand",
    top: 32,
    shadow: 24,
    acts: [
      {
        windup: "roll-start",
        fit: true,
        action: "roll",
        loop: true,
        recover: "stand",
        stunned: { tag: "roll-end", next: "stand", fx: SPARK },
      },
      { windup: "throw-windup", fit: true, action: "throw-release", recover: "stand" },
    ],
  },
  hexer: {
    ...HUMANOID,
    sheet: "hexer",
    top: 17,
    shadow: 12,
    acts: [
      { windup: "stun", action: "idle", fx: [{ key: "fx-smoke-16", at: "both-spots" }], recover: "idle" },
      humanoidShot("fx-staff-green", STAFF_ORB),
      humanoidShot("fx-staff-green", STAFF_ORB),
    ],
  },
  warden: {
    sheet: "warden",
    facing: "side",
    walk: "walk",
    idle: "stand",
    top: 32,
    shadow: 26,
    acts: [
      { windup: "swing-windup", fit: true, action: "swing-release", recover: "stand" },
      {
        windup: "rear",
        fit: true,
        action: "walk",
        loop: true,
        actionScale: 2,
        recover: "stand",
        stunned: { tag: "stand", fx: SPARK },
      },
      { windup: "throw-windup", fit: true, action: "throw-release", recover: "stand" },
      { windup: "throw-windup", fit: true, action: "throw-release", recover: "stand" },
      { windup: "rear", fit: true, action: "stand", fx: SMOKE_32_SELF, recover: "stand" },
    ],
  },
  witch: {
    sheet: "witch",
    facing: "none",
    walk: "stand",
    idle: "stand",
    top: 32,
    shadow: 28,
    stone: { windup: "flash", action: "stone", endFx: "fx-explosion-magic" },
    acts: [
      {
        windup: "cast-windup",
        fit: true,
        action: "cast-release",
        fx: [{ key: "fx-explosion-magic", at: "action" }],
        recover: "stand",
      },
      { windup: "cast-windup-short", fit: true, action: "cast-release", recover: "stand" },
      { windup: "cast-windup-short", fit: true, action: "cast-release", recover: "stand" },
      {
        windup: "split-windup",
        fit: true,
        action: "split-release",
        fx: [{ key: "fx-smoke-32", at: "both-spots" }],
        recover: "stand",
      },
      { windup: "split-windup", fit: true, action: "split-release", recover: "stand" },
    ],
  },
  matriarch: {
    sheet: "matriarch",
    // The walk turns its head to screen-right; the other poses are front-on and near symmetric.
    facing: "side",
    walk: "walk",
    idle: "stand",
    hurt: "hurt",
    top: 32,
    shadow: 28,
    acts: [
      { windup: "spin", timeScale: 0.4, shake: true, action: "spin", loop: true, recover: "stand" },
      { windup: "special", tell: [0, -10], action: "stand", recover: "stand" },
      { windup: "stand", shake: true, action: "stand", fx: SMOKE_32_SELF, recover: "stand" },
    ],
  },
  colossus: {
    sheet: "colossus",
    facing: "none",
    walk: "walk",
    idle: "stand",
    top: 32,
    shadow: 30,
    acts: [
      {
        windup: "crouch",
        fit: true,
        action: "stomp",
        // Two plumes beside the feet, behind the body (one in the middle would cross its face).
        fx: [
          { key: "fx-dust-burst", at: "action", where: "feet", dx: -12, under: true },
          { key: "fx-dust-burst", at: "action", where: "feet", dx: 12, under: true },
        ],
        recover: "stand",
      },
      {
        windup: "crouch",
        fit: true,
        action: "flap",
        loop: true,
        arc: 24,
        recover: "stomp",
        fx: [
          { key: "fx-dust-burst", at: "land", where: "feet", dx: -12, under: true },
          { key: "fx-dust-burst", at: "land", where: "feet", dx: 12, under: true },
          { key: "fx-explosion-big", at: "land", where: "feet" },
        ],
      },
      { windup: "breath-windup", fit: true, action: "breath-release", recover: "stand" },
      { windup: "breath-windup", fit: true, action: "breath-release", recover: "stand" },
    ],
  },
  shroom: {
    sheet: "shroom",
    facing: "none",
    walk: "walk",
    idle: "walk",
    top: 15,
    shadow: 10,
    acts: [
      {
        windup: "walk",
        timeScale: 3,
        shake: true,
        tell: [0, -14],
        action: "walk",
        fx: [{ key: "fx-smoke-small", at: "action", where: "feet" }],
        recover: "walk",
      },
    ],
  },
  spider: {
    sheet: "spider",
    facing: "none",
    walk: "walk",
    idle: "idle",
    hop: { crouch: "crouch", air: "air", land: "land", arc: 8 },
    rest: { tag: "idle", afterMs: 2000, timeScale: 0.5 },
    top: 12,
    shadow: 16,
    acts: [{ windup: "crouch", fit: true, shake: true, tell: [0, -8], action: "rear", recover: "idle" }],
  },
  wisp: {
    sheet: "wisp",
    facing: "none",
    walk: "float",
    idle: "float",
    hurt: "hurt",
    lift: 4,
    top: 15,
    shadow: 8,
    acts: [],
  },
  eye: {
    sheet: "eye",
    facing: "none",
    walk: "float",
    idle: "float",
    lift: 5,
    top: 16,
    shadow: 10,
    acts: [{ windup: "float", timeScale: 3, tell: [0, -8], action: "float", recover: "float" }],
  },
  archer: {
    ...HUMANOID,
    sheet: "archer",
    top: 17,
    shadow: 12,
    acts: [humanoidShot("fx-bow", { right: [-5, -13], up: [-5, -3], down: [5, -13] })],
  },
  raider: {
    ...HUMANOID,
    sheet: "raider",
    top: 17,
    shadow: 12,
    acts: [humanoidShot("fx-sword-long", { right: [-10, -6], up: [2, 2], down: [-2, -18] })],
  },
  lancer: {
    sheet: "lancer",
    facing: "rows",
    walk: "walk",
    idle: "idle",
    top: 16,
    shadow: 12,
    acts: [
      {
        windup: "idle",
        shake: true,
        tell: { right: [7, -3], down: [-3, -2], up: [5, -10] },
        // The sheet has no thrust frame: the dash is the thrust.
        action: "walk",
        actionFrame: 1,
        recover: "idle",
        stunned: { tag: "idle", fx: SPARK },
      },
    ],
  },
  cobra: {
    sheet: "cobra",
    facing: "rows",
    walk: "walk",
    idle: "ready",
    top: 16,
    shadow: 10,
    acts: [
      {
        windup: "ready",
        shake: true,
        tell: { right: [5, -11], up: [0, -14], down: [0, -8] },
        action: "spit",
        recover: "ready",
      },
    ],
  },
  axeman: {
    sheet: "axeman",
    facing: "rows",
    walk: "walk",
    idle: "idle",
    top: 16,
    shadow: 10,
    // No held icon: the axe is in its hand in every frame.
    acts: [walkerThrow({ right: [6, -6], up: [-5, -8], down: [5, -4] })],
  },
  kultist: {
    sheet: "kultist",
    facing: "rows",
    walk: "walk",
    idle: "idle",
    top: 16,
    shadow: 10,
    acts: [
      {
        windup: "strike",
        shake: true,
        action: "idle",
        fx: [{ key: "fx-smoke-16", at: "both-spots" }],
        recover: "idle",
      },
      { windup: "strike", shake: true, held: "hostile-curse", tell: same([0, -26]), action: "idle", recover: "idle" },
    ],
  },
  drake: {
    sheet: "drake",
    facing: "side",
    walk: "flap",
    idle: "flap",
    lift: 8,
    top: 30,
    shadow: 20,
    acts: [
      // The stop in the flapping is the tell.
      { windup: "inhale", shake: true, tell: [10, -12], action: "breath", recover: "flap" },
      { windup: "flap", timeScale: 2.5, tell: [10, -12], action: "breath", recover: "flap" },
    ],
  },
  warlord: {
    ...HUMANOID,
    sheet: "warlord",
    top: 17,
    shadow: 12,
    acts: [
      {
        windup: "aim",
        fit: true,
        overlay: "fx-hammer",
        overlayFrames: { windup: [0], action: [1, 2, 3] },
        action: "strike",
        recover: "idle",
      },
      { windup: "aim", fit: true, action: "charge", loop: true, recover: "idle" },
      { windup: "burn", action: "idle", fx: SMOKE_32_SELF, recover: "idle" },
    ],
  },
};

/** Below this speed (px/s) an enemy counts as standing still. */
export const STILL_SPEED = 8;
/** One server tick, in ms. */
export const TICK_MS = 1000 / TICK_RATE;
/** The tell shows this many ticks before the release at most. */
export const TELL_LEAD_TICKS = 6;

/** Default overlay frames of a humanoid weapon: startup and raised in the wind-up, the action and recovery after. */
export const OVERLAY_FRAMES = { windup: [0, 1], action: [2, 3] } as const;

/** What an act slot of a kind is, for the view: its look, its wind-up length and its attack type. */
export interface ActInfo {
  look: ActLook;
  windupTicks: number;
  /** Ticks of the action phase when it lasts (charge, leap, stone); 0: an instant release. */
  actionTicks: number;
  recoverTicks: number;
  type: AttackType | "hop" | "stone";
}

/** The act of `slot` (0-5 attacks, ACT_STONE, ACT_MOVE) for a kind; undefined if it has none there. */
export function actInfo(kind: EnemyKind, slot: number): ActInfo | undefined {
  const def = ENEMIES[kind];
  const look = ENEMY_LOOKS[kind];
  if (slot === ACT_MOVE) {
    if (!def.hop || !look.hop) return undefined;
    const { crouch, air, land, arc, airLift } = look.hop;
    return {
      look: { windup: crouch, fit: true, action: air, recover: land, arc, airLift },
      windupTicks: def.hop.crouch,
      actionTicks: def.hop.air,
      recoverTicks: def.hop.land,
      type: "hop",
    };
  }
  if (slot === ACT_STONE) {
    if (!def.stone || !look.stone) return undefined;
    return {
      look: { windup: look.stone.windup, action: look.stone.action, loop: true, recover: look.idle },
      windupTicks: STONE_WINDUP_TICKS,
      actionTicks: def.stone.ticks,
      recoverTicks: STONE_RECOVER_TICKS,
      type: "stone",
    };
  }
  const attack = def.attacks[slot];
  const act = look.acts[slot];
  if (!attack || !act) return undefined;
  const actionTicks = attack.type === "charge" || attack.type === "leap" ? attack.ticks : 0;
  return {
    look: act,
    windupTicks: attack.windupTicks,
    actionTicks,
    recoverTicks: attack.recoverTicks,
    type: attack.type,
  };
}

/** Animation speed that stretches a `tagMs` long tag over `ticks` server ticks (ending `leadMs` early). */
export const fitScale = (tagMs: number, ticks: number, leadMs = 0): number =>
  ticks > 0 ? tagMs / Math.max(1, ticks * TICK_MS - leadMs) : 1;

/** Ms from the start of a wind-up to its tell (min(6, windupTicks) ticks before the release). */
export const tellDelayMs = (windupTicks: number): number =>
  (windupTicks - Math.min(TELL_LEAD_TICKS, windupTicks)) * TICK_MS;

/**
 * Where a tell goes (px from the feet) for a sheet row: per-row points take the
 * row's own (west mirrors the right one); a single point is mirrored with the body.
 */
export function tellOffset(tell: Point | RowPoints, dir: "up" | "right" | "down" | "left", flip: boolean): Point {
  if (!("right" in tell)) return flip ? [-tell[0], tell[1]] : tell;
  if (dir === "up") return tell.up;
  if (dir === "down") return tell.down;
  const p = tell.right;
  return dir === "left" || flip ? [-p[0], p[1]] : p;
}

/**
 * Overlay frame for the current phase: one per body frame when the counts
 * match (the humanoid template), else spread over the phase's progress (0-1).
 */
export function overlayFrame(
  frames: readonly number[],
  bodyIndex: number,
  bodyFrames: number,
  progress: number,
): number {
  const n = frames.length;
  if (n === 0) return 0;
  const i = n === bodyFrames ? bodyIndex : Math.floor(Math.max(0, Math.min(0.999, progress)) * n);
  return frames[Math.max(0, Math.min(n - 1, i))] ?? 0;
}

/** Mirroring of a side-view sheet: west faces mirror, east faces don't, north and south keep the last one. */
export function sideFlip(facing: number, previous: boolean): boolean {
  const f = ((Math.round(facing) % 8) + 8) % 8;
  if (f >= 3 && f <= 5) return true;
  if (f === 0 || f === 1 || f === 7) return false;
  return previous;
}

/** Moved to the shared simulation (the server AI faces with it too). */
export { angleFacing } from "@game/shared";

// ─── Skins by place ─────────────────────────────────────────────────────────

/** Where an enemy lives: the overworld biome letter of its screen, or the dungeon it is in. */
export interface EnemyPlace {
  biome?: string;
  dungeon?: string;
}

const inBiome = (place: EnemyPlace, letters: string) => place.biome !== undefined && letters.includes(place.biome);

/**
 * Sheet of an enemy where it lives (enemies never leave their home screen):
 * the pack's colour variants by biome or dungeon, and the pack's gold sheets
 * for elites that have one. Other elites get a gold swap of this sheet (EnemyView).
 */
export function enemySkin(kind: EnemyKind, elite: boolean, place: EnemyPlace): string {
  const look = ENEMY_LOOKS[kind];
  if (elite && look.eliteSheet) return look.eliteSheet;
  const { dungeon } = place;
  switch (kind) {
    case "slime":
      return inBiome(place, "LMB") || dungeon === "lair" ? "slime-blue" : "slime";
    case "bat":
      return inBiome(place, "MRY") || dungeon !== undefined ? "bat-brown" : "bat";
    case "lurker":
      return inBiome(place, "W") || dungeon === "lair" ? "lurker-black" : "lurker";
    case "wisp":
      if (inBiome(place, "Y") || dungeon === "crypt") return "wisp";
      return inBiome(place, "W") || dungeon === "lair" ? "wisp-cyan" : "wisp-magenta";
    case "archer":
      return inBiome(place, "Y") || dungeon === "crypt" ? "archer-skeleton" : "archer";
    default:
      return look.sheet;
  }
}

/** Every sheet a kind can be drawn with (its default, its skins and its pack gold sheet). */
export const SKINS: Readonly<Partial<Record<EnemyKind, readonly string[]>>> = {
  slime: ["slime", "slime-blue", "slime-gold"],
  bat: ["bat", "bat-brown", "bat-gold"],
  lurker: ["lurker", "lurker-black"],
  wisp: ["wisp", "wisp-cyan", "wisp-magenta"],
  archer: ["archer", "archer-skeleton"],
};

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
