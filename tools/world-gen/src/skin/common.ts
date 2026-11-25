/**
 * Shared skin helpers. A skin turns the glyph grid (the layout, see
 * generate.ts) into tile keys of the catalogue (tiles.ts) on five tile layers.
 * It never changes the layout: generate.ts checks that the collision of the
 * placed tiles equals the glyph walkability, cell by cell.
 *
 * Layers (bottom → top):
 *   ground   opaque base (grass, sand, floors, water)
 *   ground2  walkable or solid overlays and decals (flowers, rims...)
 *   walls    solid things (trees, rocks, walls, furniture) and entrance pieces
 *   props    tall grass and pots (game/shared/src/props.ts), never solid
 *   above    drawn over the heroes (statue heads, canopies); never solid
 */
import type { PropKind } from "@game/shared";
import type { RoomRole } from "../build";
import type { Landmark, Shape } from "../overworld";
import type { DungeonDef } from "../world";

export const LAYERS = ["ground", "ground2", "walls", "props", "above"] as const;
export type LayerName = (typeof LAYERS)[number];

export type ScreenKind = "overworld" | "dungeon" | "cave" | "arena" | "bedrock";

export interface ScreenInfo {
  kind: ScreenKind;
  col: number;
  row: number;
  /** Overworld biome letter (world.ts BIOMES). */
  biome?: string;
  dungeon?: DungeonDef;
  /** Role of a dungeon room (build.ts). */
  room?: RoomRole;
  /** Index of the cave (CAVES order). */
  cave?: number;
}

/** What a skin may read about the world (never write). */
export interface WorldView {
  width: number;
  height: number;
  screenW: number;
  screenH: number;
  overworldRows: number;
  /** Glyph at a tile ("K" outside the world). */
  glyph(x: number, y: number): string;
  /** Solid for movement (outside the world counts as solid). */
  solid(x: number, y: number): boolean;
  screen(x: number, y: number): ScreenInfo | undefined;
  /** A path cell drawn like the ground (cosmetic: the skin may show a worn trail). */
  trail(x: number, y: number): boolean;
  /** Tall grass or pot placed on this tile, if any. */
  prop(x: number, y: number): PropKind | undefined;
  /** Seed of the cosmetic choices (never used for the layout). */
  seed: number;
  /** Overworld walls laid out as rectangles (world tiles), in the order they were placed. */
  shapes: readonly Shape[];
  /** Overworld multi-cell landmarks (world tiles). */
  landmarks: readonly Landmark[];
}

/** The skin's output: one tile key per cell and layer ("" = empty). */
export class SkinLayers {
  readonly data: Record<LayerName, string[]>;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = Object.fromEntries(LAYERS.map((l) => [l, Array(width * height).fill("")])) as Record<
      LayerName,
      string[]
    >;
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  set(layer: LayerName, x: number, y: number, key: string) {
    if (this.inside(x, y)) this.data[layer][y * this.width + x] = key;
  }
  get(layer: LayerName, x: number, y: number) {
    return this.inside(x, y) ? (this.data[layer][y * this.width + x] ?? "") : "";
  }
}

// ─── Cosmetic randomness ────────────────────────────────────────────────────

/**
 * A number in [0, 1) from a cell and a salt: cosmetic variation that never
 * depends on the order tiles are visited nor on the layout's random stream.
 */
export function noise(seed: number, x: number, y: number, salt = 0): number {
  let h =
    Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(x + 0x1000, 0xc2b2ae35) ^ Math.imul(y + 0x2000, 0x27d4eb2f);
  h ^= Math.imul(salt + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth noise in [0, 1): value noise on a lattice every `size` cells, eased
 * between the lattice points. Values above a threshold make round-ish patches
 * a few cells wide (patches of a second ground, dunes, wet mud...).
 */
export function blob(seed: number, x: number, y: number, size: number, salt = 0): number {
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const u = ease((x - gx * size) / size);
  const v = ease((y - gy * size) / size);
  const a = noise(seed, gx, gy, salt);
  const b = noise(seed, gx + 1, gy, salt);
  const c = noise(seed, gx, gy + 1, salt);
  const d = noise(seed, gx + 1, gy + 1, salt);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Smooth noise in [0, 1) without the lattice look of `blob`: two octaves on
 * offset lattices, sampled through a small domain warp, so patches above a
 * threshold come out as irregular blobs instead of grid-aligned rectangles.
 */
export function patch(seed: number, x: number, y: number, size: number, salt = 0): number {
  const wx = x + 3 * (blob(seed, x, y, 3, salt + 2) - 0.5);
  const wy = y + 3 * (blob(seed, x, y, 3, salt + 3) - 0.5);
  const fine = Math.max(2, Math.round(size * 0.6));
  return 0.65 * blob(seed, wx, wy, size, salt) + 0.35 * blob(seed, wx + 2, wy + 3, fine, salt + 1);
}

/** One of `items`, chosen by the cell (see noise). */
export const variant = <T>(items: readonly T[], seed: number, x: number, y: number, salt = 0): T =>
  items[Math.floor(noise(seed, x, y, salt) * items.length)] as T;

// ─── Neighbourhoods ─────────────────────────────────────────────────────────

/** Bits of a 4-neighbour mask (also used by tiles.ts rimPieces). */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
/** Diagonal bits of an 8-neighbour mask. */
export const NE = 16;
export const SE = 32;
export const SW = 64;
export const NW = 128;

const DIRS: [number, number, number][] = [
  [0, -1, N],
  [1, 0, E],
  [0, 1, S],
  [-1, 0, W],
  [1, -1, NE],
  [1, 1, SE],
  [-1, 1, SW],
  [-1, -1, NW],
];

/** 8-neighbour mask of the cells around (x, y) that pass `test`. */
export function mask8(x: number, y: number, test: (x: number, y: number) => boolean): number {
  let m = 0;
  for (const [dx, dy, bit] of DIRS) if (test(x + dx, y + dy)) m |= bit;
  return m;
}

/** 4-neighbour mask (N, E, S, W bits). */
export const mask4 = (x: number, y: number, test: (x: number, y: number) => boolean) => mask8(x, y, test) & 15;

// ─── Rectangles ─────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Splits the cells of a region (inside the bounds) into rectangles of at least
 * minW x minH, greedily (biggest area first from each free top-left cell);
 * the cells left over come back as `singles`. For art without concave pieces
 * (the cliff band, 9-slice frames).
 */
export function splitRects(
  bounds: Rect,
  inRegion: (x: number, y: number) => boolean,
  minW = 2,
  minH = 2,
): { rects: Rect[]; singles: [number, number][] } {
  const taken = new Set<number>();
  const key = (x: number, y: number) => y * 100000 + x;
  const free = (x: number, y: number) =>
    x >= bounds.x &&
    y >= bounds.y &&
    x < bounds.x + bounds.w &&
    y < bounds.y + bounds.h &&
    !taken.has(key(x, y)) &&
    inRegion(x, y);
  const rects: Rect[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++)
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      if (!free(x, y)) continue;
      let best: Rect | undefined;
      let maxW = 0;
      while (free(x + maxW, y)) maxW++;
      for (let h = 1, w = maxW; w > 0; h++) {
        let rowW = 0;
        while (rowW < w && free(x + rowW, y + h - 1)) rowW++;
        w = rowW;
        if (w === 0) break;
        if (w >= minW && h >= minH && (!best || w * h > best.w * best.h)) best = { x, y, w, h };
      }
      if (!best) continue;
      rects.push(best);
      for (let yy = best.y; yy < best.y + best.h; yy++)
        for (let xx = best.x; xx < best.x + best.w; xx++) taken.add(key(xx, yy));
    }
  const singles: [number, number][] = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++)
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) if (free(x, y)) singles.push([x, y]);
  return { rects, singles };
}

/** Role of a cell inside a rectangle, for 9-slice art. */
export function rectRole(r: Rect, x: number, y: number): "nw" | "n" | "ne" | "w" | "mid" | "e" | "sw" | "s" | "se" {
  const v = y === r.y ? "n" : y === r.y + r.h - 1 ? "s" : "";
  const h = x === r.x ? "w" : x === r.x + r.w - 1 ? "e" : "";
  return (v + h || "mid") as ReturnType<typeof rectRole>;
}

/** Cells of every screen of a kind, screen by screen. */
export function screensOf(view: WorldView, kind: ScreenKind): { info: ScreenInfo; bounds: Rect }[] {
  const out: { info: ScreenInfo; bounds: Rect }[] = [];
  for (let sy = 0; sy * view.screenH < view.height; sy++)
    for (let sx = 0; sx * view.screenW < view.width; sx++) {
      const info = view.screen(sx * view.screenW, sy * view.screenH);
      if (info?.kind === kind)
        out.push({ info, bounds: { x: sx * view.screenW, y: sy * view.screenH, w: view.screenW, h: view.screenH } });
    }
  return out;
}

export const cellsOf = function* (r: Rect): Generator<[number, number]> {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) yield [x, y];
};
