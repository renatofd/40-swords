/**
 * Atlas baker: turns catalogue entries (tiles.ts) into ONE extruded tileset
 * image plus the matching embedded Tiled tileset entry.
 *
 * An entry stacks source tiles (bottom → top), each cut from a pack sheet with
 * an optional transform, crop and shift. Animated layers bake one atlas cell
 * per frame (frame i of every animated layer), and the base cell gets a Tiled
 * `animation` array (Phaser plays it natively in WebGL).
 *
 * Only the entries the map actually uses are baked, in catalogue order, so
 * ids are stable while the skin and catalogue stay the same.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PropKind } from "@game/shared";
import { PNG } from "pngjs";

export const T = 16;
/** Extrusion: 1 px border around the image, 2 px between cells (each cell's edges are copied 1 px out). */
export const MARGIN = 1;
export const SPACING = 2;
export const ATLAS_COLUMNS = 32;
export const MAX_TEXTURE = 2048;

export type Sheet = "overworld" | "exotic" | "dungeon" | "tiles" | "house";

/** Pack sources, relative to the repo root (see content/src/notzelda/ReadMe.txt for the licence). */
export const SHEETS: Record<Sheet, string> = {
  overworld: "content/src/notzelda/Environments/Overworld.png",
  exotic: "content/src/notzelda/Environments/OverworldExotic.png",
  dungeon: "content/src/notzelda/Environments/Dungeon.png",
  tiles: "content/src/notzelda/Environments/Tiles.png",
  house: "content/src/notzelda/Environments/House.png",
};

/**
 * Pixel transforms of a 16x16 cell, named like Tiled's flags:
 * flipH (mirror left/right), flipV (upside down), transpose (Tiled "D": swap x and y),
 * antiTranspose (transpose + rot180), rot90/rot180/rot270 (clockwise).
 */
export type Transform = "none" | "flipH" | "flipV" | "rot90" | "rot180" | "rot270" | "transpose" | "antiTranspose";

/** Where a cell is on its sheet: a tile id on the sheet's 16 px grid, or the top-left pixel [x, y]. */
export type Cell = number | readonly [number, number];

export interface SourceLayer {
  sheet: Sheet;
  /** The cell (static), or the first frame when `frames` is set. */
  cell: Cell;
  /** Animation: one cell per frame (frame i of the entry uses frames[i % length]). */
  frames?: readonly Cell[];
  t?: Transform;
  /** Keep only this part of the (transformed) cell: [x, y, w, h], in cell pixels. */
  crop?: readonly [number, number, number, number];
  /** Move the pixels by [dx, dy] after cropping (what falls outside the cell is lost). */
  shift?: readonly [number, number];
  /** Swap colours: [from, to] as 0xRRGGBB (a shore piece baked for another ground, say). */
  recolor?: readonly (readonly [number, number])[];
}

/** Another catalogue entry, stacked as is (its own layers, animation included). */
export interface KeyLayer {
  key: string;
}

export type Layer = SourceLayer | KeyLayer;

export interface TileDef {
  /** Bottom → top. */
  layers: readonly Layer[];
  /** Solid for movement (core-maps: a cell is solid if ANY tile layer has a colliding tile there). */
  collides?: boolean;
  /** Something the sword breaks (tile layer "props"): whole or broken look. */
  prop?: { kind: PropKind; broken: boolean };
  /** For a whole prop: the entry drawn once it is broken. */
  breaksTo?: string;
  /** Milliseconds per animation frame (default 200). */
  ms?: number;
}

export type Catalogue = Record<string, TileDef>;

// ─── Pixels ─────────────────────────────────────────────────────────────────

type Pixels = Uint8Array; // 16x16 RGBA

const sheets = new Map<Sheet, PNG>();
let repoRoot = process.cwd();
export const setRepoRoot = (root: string) => {
  repoRoot = root;
};

export function loadSheet(sheet: Sheet): PNG {
  let png = sheets.get(sheet);
  if (!png) {
    png = PNG.sync.read(readFileSync(resolve(repoRoot, SHEETS[sheet])));
    sheets.set(sheet, png);
  }
  return png;
}

export function cellOrigin(sheet: Sheet, cell: Cell): [number, number] {
  if (typeof cell !== "number") return [cell[0], cell[1]];
  const columns = Math.floor(loadSheet(sheet).width / T);
  return [(cell % columns) * T, Math.floor(cell / columns) * T];
}

/** Source pixel (x, y) of destination pixel (x, y) under a transform. */
function sourceOf(t: Transform, x: number, y: number, n = T): [number, number] {
  const m = n - 1;
  switch (t) {
    case "none":
      return [x, y];
    case "flipH":
      return [m - x, y];
    case "flipV":
      return [x, m - y];
    case "rot180":
      return [m - x, m - y];
    case "transpose":
      return [y, x];
    case "antiTranspose":
      return [m - y, m - x];
    case "rot90":
      return [y, m - x];
    case "rot270":
      return [m - y, x];
  }
}

function readCell(sheet: Sheet, cell: Cell, t: Transform): Pixels {
  const png = loadSheet(sheet);
  const [ox, oy] = cellOrigin(sheet, cell);
  if (ox < 0 || oy < 0 || ox + T > png.width || oy + T > png.height)
    throw new Error(`cell ${JSON.stringify(cell)} is outside ${SHEETS[sheet]}`);
  const out = new Uint8Array(T * T * 4);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const [sx, sy] = sourceOf(t, x, y);
      const si = ((oy + sy) * png.width + ox + sx) * 4;
      out.set(png.data.subarray(si, si + 4), (y * T + x) * 4);
    }
  return out;
}

function sourcePixels(layer: SourceLayer, frame: number): Pixels {
  const cell = layer.frames ? (layer.frames[frame % layer.frames.length] as Cell) : layer.cell;
  let px = readCell(layer.sheet, cell, layer.t ?? "none");
  if (layer.recolor)
    for (let i = 0; i < px.length; i += 4) {
      const rgb = ((px[i] ?? 0) << 16) | ((px[i + 1] ?? 0) << 8) | (px[i + 2] ?? 0);
      const to = layer.recolor.find(([from]) => from === rgb)?.[1];
      if (to === undefined || px[i + 3] === 0) continue;
      px[i] = (to >> 16) & 255;
      px[i + 1] = (to >> 8) & 255;
      px[i + 2] = to & 255;
    }
  if (layer.crop) {
    const [cx, cy, cw, ch] = layer.crop;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) if (x < cx || y < cy || x >= cx + cw || y >= cy + ch) px[(y * T + x) * 4 + 3] = 0;
  }
  if (layer.shift) {
    const [dx, dy] = layer.shift;
    const moved = new Uint8Array(T * T * 4);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const sx = x - dx;
        const sy = y - dy;
        if (sx >= 0 && sy >= 0 && sx < T && sy < T)
          moved.set(px.subarray((sy * T + sx) * 4, (sy * T + sx) * 4 + 4), (y * T + x) * 4);
      }
    px = moved;
  }
  return px;
}

/** Alpha-composites `top` over `bottom` (in place). */
function over(bottom: Pixels, top: Pixels) {
  for (let i = 0; i < bottom.length; i += 4) {
    const a = (top[i + 3] ?? 0) / 255;
    if (a === 0) continue;
    const b = (bottom[i + 3] ?? 0) / 255;
    const outA = a + b * (1 - a);
    for (let c = 0; c < 3; c++)
      bottom[i + c] = Math.round(((top[i + c] ?? 0) * a + (bottom[i + c] ?? 0) * b * (1 - a)) / outA);
    bottom[i + 3] = Math.round(outA * 255);
  }
}

// ─── Entries ────────────────────────────────────────────────────────────────

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export class Atlas {
  constructor(readonly catalogue: Catalogue) {}

  def(key: string): TileDef {
    const def = this.catalogue[key];
    if (!def) throw new Error(`unknown tile "${key}" (add it to tools/world-gen/src/tiles.ts)`);
    return def;
  }

  /** Frames of an entry: the least common multiple of its animated layers' frame counts. */
  frameCount(key: string, seen: string[] = []): number {
    if (seen.includes(key)) throw new Error(`tile "${key}" contains itself (${seen.join(" → ")})`);
    let n = 1;
    for (const layer of this.def(key).layers) {
      const k = "key" in layer ? this.frameCount(layer.key, [...seen, key]) : (layer.frames?.length ?? 1);
      n = (n * k) / gcd(n, k);
    }
    if (n > 16) throw new Error(`tile "${key}" has ${n} frames (mixing frame counts); keep them equal`);
    return n;
  }

  ms(key: string): number {
    const def = this.def(key);
    if (def.ms) return def.ms;
    for (const layer of def.layers) if ("key" in layer && this.frameCount(layer.key) > 1) return this.ms(layer.key);
    return 200;
  }

  /** The 16x16 pixels of frame `frame` of an entry. */
  pixels(key: string, frame = 0): Pixels {
    const out = new Uint8Array(T * T * 4);
    for (const layer of this.def(key).layers)
      over(out, "key" in layer ? this.pixels(layer.key, frame) : sourcePixels(layer, frame));
    return out;
  }

  /** Whether the entry draws nothing (a mistake in the catalogue, usually a wrong cell). */
  isBlank(key: string): boolean {
    const px = this.pixels(key);
    for (let i = 3; i < px.length; i += 4) if (px[i] !== 0) return false;
    return true;
  }
}

export interface BakedTileset {
  png: PNG;
  /** Local tile id of each baked key (its frame 0). */
  ids: Map<string, number>;
  /** Embedded Tiled tileset fields (without firstgid/name/image). */
  tilecount: number;
  columns: number;
  tiles: unknown[];
}

function setPx(png: PNG, x: number, y: number, data: ArrayLike<number>, at: number) {
  const i = (png.width * y + x) << 2;
  for (let c = 0; c < 4; c++) png.data[i + c] = data[at + c] ?? 0;
}

/** Bakes the used keys (in catalogue order) into one extruded tileset. */
export function bake(atlas: Atlas, used: Set<string>): BakedTileset {
  for (const key of used) atlas.def(key);
  // A whole prop needs its broken look in the tileset too.
  for (const key of [...used]) {
    const to = atlas.def(key).breaksTo;
    if (to) used.add(to);
  }
  const keys = Object.keys(atlas.catalogue).filter((k) => used.has(k));
  const ids = new Map<string, number>();
  const cells: { key: string; frame: number }[] = [];
  for (const key of keys) {
    if (atlas.isBlank(key)) throw new Error(`tile "${key}" is blank: check its cells`);
    ids.set(key, cells.length);
    const n = atlas.frameCount(key);
    for (let f = 0; f < n; f++) cells.push({ key, frame: f });
  }
  const columns = Math.min(ATLAS_COLUMNS, Math.max(1, cells.length));
  const rows = Math.ceil(cells.length / columns);
  const width = MARGIN * 2 + columns * T + (columns - 1) * SPACING;
  const height = MARGIN * 2 + rows * T + (rows - 1) * SPACING;
  if (width > MAX_TEXTURE || height > MAX_TEXTURE)
    throw new Error(`tileset would be ${width}x${height} px (max ${MAX_TEXTURE}): too many tiles`);
  const png = new PNG({ width, height });
  png.data.fill(0);
  cells.forEach(({ key, frame }, i) => {
    const ox = MARGIN + (i % columns) * (T + SPACING);
    const oy = MARGIN + Math.floor(i / columns) * (T + SPACING);
    const px = atlas.pixels(key, frame);
    // Each pixel, plus the edge pixels copied 1 px outward (no seams while the camera pans).
    for (let y = -1; y <= T; y++)
      for (let x = -1; x <= T; x++) {
        const sx = Math.min(T - 1, Math.max(0, x));
        const sy = Math.min(T - 1, Math.max(0, y));
        setPx(png, ox + x, oy + y, px, (sy * T + sx) * 4);
      }
  });

  const tiles: unknown[] = [];
  for (const key of keys) {
    const def = atlas.def(key);
    const id = ids.get(key) as number;
    const properties: unknown[] = [];
    if (def.collides) properties.push({ name: "collides", type: "bool", value: true });
    if (def.prop) {
      properties.push(
        { name: "prop", type: "string", value: def.prop.kind },
        { name: "broken", type: "bool", value: def.prop.broken },
      );
      if (def.breaksTo) properties.push({ name: "brokenTile", type: "int", value: ids.get(def.breaksTo) });
    }
    const n = atlas.frameCount(key);
    const ms = atlas.ms(key);
    const animation = n > 1 ? Array.from({ length: n }, (_, f) => ({ tileid: id + f, duration: ms })) : undefined;
    if (properties.length > 0 || animation)
      tiles.push({ id, ...(properties.length > 0 ? { properties } : {}), ...(animation ? { animation } : {}) });
  }
  return { png, ids, tilecount: cells.length, columns, tiles };
}

// ─── Multi-cell pieces ──────────────────────────────────────────────────────

const swapsAxes = (t: Transform) => t === "transpose" || t === "antiTranspose" || t === "rot90" || t === "rot270";

/** Source pixel of destination pixel (x, y) of a w x h (destination size) rectangle under a transform. */
function sourceOfRect(t: Transform, x: number, y: number, w: number, h: number): [number, number] {
  switch (t) {
    case "none":
      return [x, y];
    case "flipH":
      return [w - 1 - x, y];
    case "flipV":
      return [x, h - 1 - y];
    case "rot180":
      return [w - 1 - x, h - 1 - y];
    case "transpose":
      return [y, x];
    case "antiTranspose":
      return [h - 1 - y, w - 1 - x];
    case "rot90":
      return [y, w - 1 - x];
    case "rot270":
      return [h - 1 - y, x];
  }
}

/**
 * A piece of w x h cells at pixel (x, y) of a sheet (a 16x32 statue, a 32x32 dungeon
 * corner...), transformed as a whole. Returns its cells in destination order:
 * rows[y][x], each a layer ready for a catalogue entry. Example: the left wall of a
 * dungeon room is the top wall strip transposed: `piece("dungeon", 208, 240, 1, 2, "transpose")`
 * gives one row of two cells.
 */
export function piece(
  sheet: Sheet,
  x: number,
  y: number,
  w: number,
  h: number,
  t: Transform = "none",
): SourceLayer[][] {
  const [dw, dh] = swapsAxes(t) ? [h, w] : [w, h];
  const rows: SourceLayer[][] = [];
  for (let j = 0; j < dh; j++) {
    const row: SourceLayer[] = [];
    for (let i = 0; i < dw; i++) {
      const [sx, sy] = sourceOfRect(t, i * T + T / 2, j * T + T / 2, dw * T, dh * T);
      row.push({ sheet, cell: [x + Math.floor(sx / T) * T, y + Math.floor(sy / T) * T], t });
    }
    rows.push(row);
  }
  return rows;
}
