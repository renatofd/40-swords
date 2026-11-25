/**
 * Overworld screens (20x11 glyphs), built in shapes the pack art can draw:
 *
 * - Walls are rectangles of at least 2x2 ("shapes"): rock masses for the cliff
 *   band, blocks of dense forest, rows of pines. They may overlap; the skin
 *   draws the southern one in front (the art has no concave pieces, but a
 *   rectangle drawn over another reads as a pile of rocks or trees).
 * - Single solids (small trees, boulders, bushes, tombstones) fill the rest.
 * - Water is a union of rectangles (rivers 2 wide, lakes, the sea), with square
 *   corners; paths cross it on bridges.
 * - Landmarks are multi-cell pieces of art: entrances, houses, statues...
 *
 * Every screen: a border with the openings of its connections, an optional
 * entrance (cave or dungeon) set into the top border, rivers and lakes, paths
 * that join the openings and the entrance (A*, bridges over the water), then
 * the biome's decoration on what is left, never on a path. Pockets that cannot
 * be reached are filled, and the screen is checked for connectivity.
 */
import {
  flood,
  type Grid,
  int,
  isWalkable,
  type Openings,
  openingCells,
  pick,
  type Rng,
  rowsOf,
  SCREEN_H,
  SCREEN_W,
  takeRandom,
} from "./build";
import type { Biome, DungeonDef } from "./world";

export type ShapeKind = "rock" | "forest" | "pines";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Shape extends Rect {
  kind: ShapeKind;
}

export type EntranceKind = "rockCave" | "hollowTree" | DungeonDef["entrance"];
export type LandmarkKind =
  | EntranceKind
  | "waterfall"
  | "house"
  | "hut"
  | "statue"
  | "well"
  | "sign"
  | "reeds"
  | "dock"
  | "island"
  | "stump"
  | "crag"
  | "ruin"
  | "stones"
  | "ringStone";
export interface Landmark extends Rect {
  kind: LandmarkKind;
}

export interface OverworldScreen {
  rows: string[];
  shapes: Shape[];
  landmarks: Landmark[];
  /**
   * Cells of the paths that are not drawn as ":" (biomes without sand paths):
   * cosmetic only, the skin may show them as a worn trail. [x, y] in the screen.
   */
  trail: [number, number][];
}

/** Glyph rows of each multi-cell landmark: Z solid, C/D door, W water, = walkable deck. */
const FOOTPRINTS: Partial<Record<LandmarkKind, string[]>> = {
  hollowTree: ["ZZZ", "ZCZ"],
  crypt: ["ZZZ", "ZDZ"],
  skull: ["ZZZ", "ZDZ"],
  shrine: ["ZZZ", "ZZZ", "ZZZ", "ZDZ"],
  temple: ["ZZZZZZZ", "ZZZDZZZ"],
  house: ["ZZZZZ", "ZZZZZ", "ZZZZZ", "ZZZZZ", "ZZZZZ"],
  hut: ["ZZZ", "ZZZ", "ZZZ", "ZZZ"],
  statue: ["ZZ", "ZZ"],
  well: ["Z"],
  sign: ["Z"],
  stump: ["Z"],
  reeds: ["Z", "Z", "Z"],
  crag: ["ZZ", "ZZ"],
  ruin: ["ZZ", "ZZ"],
  stones: ["Z"],
  ringStone: ["Z"],
};
/** Buildings: their front (the cell below the middle of the bottom row) must be open ground. */
const BUILDINGS: readonly LandmarkKind[] = ["house", "hut"];

type BorderKind = ShapeKind | "trees" | "bushes";

interface BiomeSpec {
  /** Border of each side, picked at random. */
  borders: BorderKind[];
  /** Depth of the border rectangles (and of the top border, if different). */
  depth: [number, number];
  depthN?: [number, number];
  /** Glyph of the single solids that fill pockets. */
  filler: "T" | "R" | "B";
  /** Paths are drawn as sand (":"); otherwise they are kept clear but look like the ground. */
  paths: boolean;
  /**
   * Enemy glyphs by distance from the start (repeated letters are weights): `near` up to ring 2,
   * `mid` at rings 3-4, `far` from ring 5. Near pools hold only the easy kinds, mid adds the first
   * telegraphed attacks (skeleton, scorpion, axeman), far everything (spec 8B §3.2).
   */
  enemies: EnemyPools;
}

export interface EnemyPools {
  near: string;
  mid: string;
  far: string;
}

/** The enemy pool of a biome at a ring (screens from the start). */
export const poolFor = (spec: { enemies: EnemyPools }, ring: number): string =>
  ring <= 2 ? spec.enemies.near : ring <= 4 ? spec.enemies.mid : spec.enemies.far;

/** One pool for every band (biomes that only lie far from the start). */
const all = (pool: string): EnemyPools => ({ near: pool, mid: pool, far: pool });

/**
 * Biomes. Enemy pools (letters: see generate.ts; repeats are weights) follow the stage 8B
 * ladder, tuned with bot balance runs (docs/JOGO.md): the mid band (rings 3-4) teaches the
 * first tells with skeletons and scorpions only (axemen start at ring 5), and every far pool
 * keeps easy fodder (slime, bat, goblin) between its ranged and tricky kinds, so heroes can
 * still level out there.
 */
export const BIOME_SPECS: Record<Exclude<Biome, "C">, BiomeSpec> = {
  M: {
    borders: ["rock"],
    depth: [2, 2],
    depthN: [2, 3],
    filler: "R",
    paths: false,
    enemies: { near: "gbe", mid: "gbkke", far: "bbgekhjjav" },
  },
  G: {
    borders: ["forest", "forest", "trees"],
    depth: [2, 2],
    filler: "T",
    paths: true,
    enemies: { near: "eeegwt", mid: "egwtzb", far: "egwtzb" },
  },
  H: {
    borders: ["rock", "rock", "trees"],
    depth: [2, 2],
    filler: "R",
    paths: true,
    enemies: { near: "eegw", mid: "gzwke", far: "gzwke" },
  },
  F: {
    borders: ["forest", "forest", "pines"],
    depth: [2, 3],
    filler: "T",
    paths: false,
    enemies: { near: "gbte", mid: "wbgtf", far: "wpbbgetar" },
  },
  R: { borders: ["forest"], depth: [2, 3], filler: "T", paths: false, enemies: all("wwpfrbbte") },
  L: {
    borders: ["forest", "trees"],
    depth: [2, 2],
    filler: "T",
    paths: true,
    enemies: { near: "eeff", mid: "efft", far: "efft" },
  },
  W: { borders: ["forest", "trees"], depth: [2, 2], filler: "T", paths: false, enemies: all("fffecpibb") },
  Y: { borders: ["trees", "forest"], depth: [2, 2], filler: "T", paths: true, enemies: all("kkayyibbe") },
  B: { borders: ["rock", "bushes"], depth: [2, 2], filler: "B", paths: true, enemies: all("eezzcrab") },
};

export interface OverworldOptions {
  biome: Exclude<Biome, "C">;
  open: Openings;
  /** Cave entrance or dungeon door, set into the top border. */
  feature?: { glyph: "C" | "D"; kind: EntranceKind };
  /** A river 2 tiles wide crossing the top (n) and/or bottom (s) edge at these columns; `source`: it falls from the top. */
  river?: { n?: number; s?: number; source?: boolean };
  /** The sea along the east edge: its first column on the top and bottom edges. */
  sea?: { n: number; s: number };
  /** Column (9 or 10) where the paths leave through the top and bottom openings, shared with the neighbours. */
  pathX: { n: number; s: number };
  /** Distance from the start, in screens: more enemies farther out. */
  ring: number;
  chest: boolean;
}

const SOLID_SHAPE: Record<ShapeKind, string> = { rock: "R", forest: "T", pines: "T" };
const key = (x: number, y: number) => y * SCREEN_W + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SCREEN_W && y < SCREEN_H;

class ScreenGrid {
  readonly g: Grid = Array.from({ length: SCREEN_H }, () => Array(SCREEN_W).fill("."));
  readonly shapes: Shape[] = [];
  readonly landmarks: Landmark[] = [];
  /** Cells that must stay walkable (openings, paths, entrance fronts). */
  readonly reserved = new Set<number>();
  /** Water that paths may not bridge (the sea, waterfalls). */
  readonly deep = new Set<number>();

  constructor(readonly rng: Rng) {}

  get(x: number, y: number) {
    return inside(x, y) ? (this.g[y]?.[x] ?? "#") : "#";
  }
  set(x: number, y: number, glyph: string) {
    const row = this.g[y];
    if (row && inside(x, y)) row[x] = glyph;
  }
  /** Plain ground nobody needs. */
  free(x: number, y: number) {
    return this.get(x, y) === "." && !this.reserved.has(key(x, y));
  }
  /** No reserved cell within `margin` of the rectangle. */
  clearOfReserved(r: Rect, margin: number) {
    for (let y = r.y - margin; y < r.y + r.h + margin; y++)
      for (let x = r.x - margin; x < r.x + r.w + margin; x++) if (this.reserved.has(key(x, y))) return false;
    return true;
  }
  inScreen(r: Rect) {
    return r.x >= 0 && r.y >= 0 && r.x + r.w <= SCREEN_W && r.y + r.h <= SCREEN_H;
  }

  /**
   * A wall rectangle. Cells must be ground or other walls (never water, paths
   * or landmarks); `fresh` is the share of them that must be plain ground.
   */
  addShape(kind: ShapeKind, r: Rect, opts: { margin?: number; fresh?: number } = {}): boolean {
    if (!this.inScreen(r) || r.w < 1 || r.h < 1) return false;
    let ground = 0;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const g = this.get(x, y);
        if (this.reserved.has(key(x, y))) return false;
        if (g === ".") ground++;
        else if (g !== "R" && g !== "T" && g !== "B") return false;
      }
    if (ground < (opts.fresh ?? 0.5) * r.w * r.h) return false;
    if (opts.margin && !this.clearOfReserved(r, opts.margin)) return false;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (this.get(x, y) === ".") this.set(x, y, SOLID_SHAPE[kind]);
    // Too thin for the art: single trees or boulders instead (the skin draws loose solids).
    if (r.w >= 2 && r.h >= 2) this.shapes.push({ kind, ...r });
    return true;
  }

  /** A landmark with its footprint glyphs (cells must be free ground unless `over` allows walls). */
  addLandmark(kind: LandmarkKind, x: number, y: number, opts: { over?: boolean; margin?: number } = {}): boolean {
    const rows = FOOTPRINTS[kind];
    if (!rows) throw new Error(`no footprint for ${kind}`);
    const r = { x, y, w: rows[0]?.length ?? 1, h: rows.length };
    if (!this.inScreen(r)) return false;
    for (let yy = y; yy < y + r.h; yy++)
      for (let xx = x; xx < x + r.w; xx++) {
        const g = this.get(xx, yy);
        if (this.reserved.has(key(xx, yy))) return false;
        if (!(g === "." || (opts.over && (g === "R" || g === "T")))) return false;
      }
    if (opts.margin && !this.clearOfReserved(r, opts.margin)) return false;
    rows.forEach((line, dy) => {
      [...line].forEach((glyph, dx) => {
        this.set(x + dx, y + dy, glyph);
      });
    });
    this.landmarks.push({ kind, ...r });
    return true;
  }

  water(r: Rect, deep = false) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (inside(x, y)) {
          this.set(x, y, "W");
          if (deep) this.deep.add(key(x, y));
        }
  }

  reserve(cells: Iterable<[number, number]>) {
    for (const [x, y] of cells) if (inside(x, y)) this.reserved.add(key(x, y));
  }

  /** A random rectangle of w x h inside [x0..x1] x [y0..y1] (top-left range). */
  spot(w: number, h: number, x0 = 2, y0 = 2, x1 = SCREEN_W - 2 - w, y1 = SCREEN_H - 2 - h): Rect {
    return { x: int(this.rng, x0, Math.max(x0, x1)), y: int(this.rng, y0, Math.max(y0, y1)), w, h };
  }

  /** Tries to place a wall rectangle of random size somewhere inside. */
  scatterShape(kind: ShapeKind, w: [number, number], h: [number, number], tries = 12, fresh = 0.6): boolean {
    for (let i = 0; i < tries; i++) {
      const r = this.spot(int(this.rng, w[0], w[1]), int(this.rng, h[0], h[1]));
      if (this.addShape(kind, r, { margin: 1, fresh })) return true;
    }
    return false;
  }

  /**
   * An L-shaped mass: a vertical rectangle and a horizontal one sharing its
   * top or bottom end (the skin draws the union as one cliff).
   */
  scatterL(kind: ShapeKind, tries = 12, fresh = 0.6): boolean {
    for (let i = 0; i < tries; i++) {
      const v = this.spot(int(this.rng, 2, 3), int(this.rng, 3, 5));
      const w = int(this.rng, 3, 5);
      const h = 2;
      const left = this.rng() < 0.5;
      const top = this.rng() < 0.5;
      const arm = { x: left ? v.x - w + v.w : v.x, y: top ? v.y : v.y + v.h - h, w, h };
      if (!this.inScreen(arm) || arm.x < 2 || arm.x + arm.w > SCREEN_W - 2) continue;
      if (!this.clearOfReserved(v, 1) || !this.clearOfReserved(arm, 1)) continue;
      if (!this.addShape(kind, v, { margin: 1, fresh })) continue;
      this.addShape(kind, arm, { margin: 1, fresh: 0 });
      return true;
    }
    return false;
  }

  /** A clump of single solids grown from a random free cell. */
  clump(glyph: string, n: number, tries = 10) {
    for (let t = 0; t < tries; t++) {
      const [x, y] = [int(this.rng, 2, SCREEN_W - 3), int(this.rng, 2, SCREEN_H - 3)];
      if (!this.loose(x, y)) continue;
      const cells: [number, number][] = [[x, y]];
      this.set(x, y, glyph);
      for (let i = 1; i < n; i++) {
        const [cx, cy] = pick(this.rng, cells);
        const [dx, dy] = pick(this.rng, [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const);
        if (!this.loose(cx + dx, cy + dy)) continue;
        this.set(cx + dx, cy + dy, glyph);
        cells.push([cx + dx, cy + dy]);
      }
      return;
    }
  }
  /** A free cell for a loose solid: nothing reserved next to it. */
  loose(x: number, y: number) {
    return (
      x >= 1 &&
      y >= 1 &&
      x < SCREEN_W - 1 &&
      y < SCREEN_H - 1 &&
      this.free(x, y) &&
      this.clearOfReserved({ x, y, w: 1, h: 1 }, 1)
    );
  }

  /** A patch of walkable decoration (flowers, mud...) on plain ground. */
  patch(glyph: string, w: [number, number], h: [number, number], tries = 8) {
    for (let t = 0; t < tries; t++) {
      const r = this.spot(int(this.rng, w[0], w[1]), int(this.rng, h[0], h[1]));
      let ok = true;
      for (let y = r.y; y < r.y + r.h && ok; y++)
        for (let x = r.x; x < r.x + r.w && ok; x++) if (this.get(x, y) !== ".") ok = false;
      if (!ok) continue;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) if (this.rng() < 0.85 || r.w * r.h <= 2) this.set(x, y, glyph);
      return;
    }
  }
}

/** Rows of the sea: its first column on each row (a straight coast that steps once, maybe with a bay). */
function seaColumns(rng: Rng, sea: { n: number; s: number }, open: Openings): number[] {
  const step = int(rng, 3, 7);
  const cols = Array.from({ length: SCREEN_H }, (_, y) => (y < step ? sea.n : sea.s));
  if (rng() < 0.6) {
    const by = int(rng, 3, 5);
    const bh = int(rng, 2, 3);
    const bx = int(rng, open.w ? 10 : 9, 12);
    for (let y = by; y < by + bh && y < SCREEN_H - 1; y++) cols[y] = Math.min(cols[y] ?? bx, bx);
  }
  return cols;
}

/** Cells of a 2-wide channel through the given waypoints (axis-aligned legs). */
function channel(points: [number, number][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i] as [number, number];
    const [bx, by] = points[i + 1] as [number, number];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let s = 0; s <= steps; s++) {
      const x = ax + Math.sign(bx - ax) * s;
      const y = ay + Math.sign(by - ay) * s;
      cells.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
    }
  }
  return cells;
}

/** Cheapest path (Dijkstra with a turn penalty) from `from` to `to`; undefined if blocked. */
function route(sg: ScreenGrid, from: [number, number], to: [number, number]): [number, number][] | undefined {
  const cost = (x: number, y: number): number => {
    const g = sg.get(x, y);
    if (g === "W") return sg.deep.has(key(x, y)) ? Number.POSITIVE_INFINITY : 14;
    if (g === "=") return 1;
    if (!isWalkable(g) || g === "C" || g === "D") return Number.POSITIVE_INFINITY;
    return sg.reserved.has(key(x, y)) ? 0.6 : 1;
  };
  const DIRS: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const n = SCREEN_W * SCREEN_H * 4;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const state = (x: number, y: number, d: number) => key(x, y) * 4 + d;
  for (let d = 0; d < 4; d++) dist[state(from[0], from[1], d)] = 0;
  for (;;) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) if (!done[i] && (dist[i] ?? Infinity) < bestD) [best, bestD] = [i, dist[i] ?? 0];
    if (best < 0) return undefined;
    done[best] = 1;
    const cell = Math.floor(best / 4);
    const dir = best % 4;
    const x = cell % SCREEN_W;
    const y = Math.floor(cell / SCREEN_W);
    if (x === to[0] && y === to[1]) {
      const out: [number, number][] = [];
      for (let s = best; s >= 0; s = prev[s] ?? -1) {
        const c = Math.floor(s / 4);
        out.push([c % SCREEN_W, Math.floor(c / SCREEN_W)]);
      }
      return out.reverse();
    }
    DIRS.forEach(([dx, dy], nd) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny)) return;
      const c = cost(nx, ny) + (nd === dir ? 0 : 1.5);
      const s = state(nx, ny, nd);
      if (bestD + c < (dist[s] ?? Infinity)) {
        dist[s] = bestD + c;
        prev[s] = best;
      }
    });
  }
}

export function buildOverworld(rng: Rng, o: OverworldOptions): OverworldScreen {
  failures.length = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const screen = tryScreen(rng, o, attempt);
    if (screen) return screen;
  }
  throw new Error(`could not build a connected ${o.biome} screen (${JSON.stringify(o)}): ${failures.join(" ")}`);
}

/** Why the attempts of the last screen failed (for the error message). */
const failures: string[] = [];
const fail = (why: string): undefined => {
  failures.push(why);
  return undefined;
};

function tryScreen(rng: Rng, o: OverworldOptions, attempt: number): OverworldScreen | undefined {
  const spec = BIOME_SPECS[o.biome];
  const sg = new ScreenGrid(rng);
  const openings = openingCells(o.open);
  // The corridors of the openings, a little deeper than the border.
  const corridors: [number, number][] = [];
  for (let y = 4; y <= 6; y++)
    for (let x = 0; x <= 2; x++) {
      if (o.open.w) corridors.push([x, y]);
      if (o.open.e) corridors.push([SCREEN_W - 1 - x, y]);
    }
  for (let x = 8; x <= 11; x++)
    for (let y = 0; y <= 2; y++) {
      if (o.open.n) corridors.push([x, y]);
      if (o.open.s) corridors.push([x, SCREEN_H - 1 - y]);
    }
  sg.reserve(corridors);

  // ─── Water: the sea, rivers and lakes ─────────────────────────────────
  const seaCols = o.sea ? seaColumns(rng, o.sea, o.open) : undefined;
  if (seaCols)
    seaCols.forEach((x0, y) => {
      sg.water({ x: x0, y, w: SCREEN_W - x0, h: 1 }, true);
    });
  let lake: Rect[] = [];
  if (o.biome === "L") {
    const w = int(rng, 7, 11);
    const h = int(rng, 3, 5);
    const main = sg.spot(w, h, 4, 3, 16 - w, 8 - h);
    lake = [main];
    for (let i = int(rng, 1, 2); i > 0; i--) {
      const ew = int(rng, 2, 4);
      const eh = int(rng, 2, 3);
      lake.push({
        x: int(rng, Math.max(3, main.x - 2), Math.min(16 - ew, main.x + main.w)),
        y: int(rng, Math.max(3, main.y - 1), Math.min(8 - eh, main.y + main.h - 1)),
        w: ew,
        h: eh,
      });
    }
    for (const r of lake) sg.water(r);
  }
  if (o.river) {
    const { n, s, source } = o.river;
    const mid: [number, number] | undefined = lake[0]
      ? [lake[0].x + int(rng, 0, lake[0].w - 2), lake[0].y + Math.floor(lake[0].h / 2) - 1]
      : undefined;
    const turn = () => int(rng, 3, 6);
    const legs: [number, number][][] = [];
    if (n !== undefined && s !== undefined && !mid) {
      const ty = turn();
      legs.push([
        [n, 0],
        [n, ty],
        [s, ty],
        [s, SCREEN_H - 2],
      ]);
    } else {
      if (n !== undefined) {
        const end = mid ?? [n, 4];
        legs.push([
          [n, 0],
          [n, end[1]],
          [end[0], end[1]],
        ]);
      }
      if (s !== undefined) {
        const start = mid ?? [s, 4];
        legs.push([
          [start[0], start[1]],
          [s, start[1]],
          [s, SCREEN_H - 2],
        ]);
      }
    }
    for (const leg of legs) for (const [x, y] of channel(leg)) if (inside(x, y)) sg.water({ x, y, w: 1, h: 1 });
    if (source && n !== undefined) {
      // A waterfall out of the rocks of the top border, its foot on row 2.
      sg.water({ x: n, y: 0, w: 2, h: 3 }, true);
      sg.landmarks.push({ kind: "waterfall", x: n, y: 0, w: 2, h: 3 });
      sg.addShape("rock", { x: n - 3, y: 0, w: 3, h: 3 }, { fresh: 0 });
      sg.addShape("rock", { x: n + 2, y: 0, w: 3, h: 3 }, { fresh: 0 });
    }
  }

  // ─── Border ───────────────────────────────────────────────────────────
  const sideKinds = {
    n: pick(rng, spec.borders),
    s: pick(rng, spec.borders),
    w: pick(rng, spec.borders),
    e: pick(rng, spec.borders),
  };
  const border = (side: "n" | "s" | "w" | "e") => {
    const horizontal = side === "n" || side === "s";
    const len = horizontal ? SCREEN_W : SCREEN_H;
    const edgeCell = (i: number): [number, number] =>
      side === "n" ? [i, 0] : side === "s" ? [i, SCREEN_H - 1] : side === "w" ? [0, i] : [SCREEN_W - 1, i];
    const blocked = (i: number) => {
      const [x, y] = edgeCell(i);
      return sg.reserved.has(key(x, y)) || sg.get(x, y) === "W";
    };
    const kind = sideKinds[side];
    let i = 0;
    while (i < len) {
      if (blocked(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j < len && !blocked(j)) j++;
      // Segment [i, j): chunks of 2 to 6 cells with their own depth.
      let a = i;
      while (a < j) {
        let l = Math.min(j - a, int(rng, 2, 6));
        if (j - (a + l) === 1) l++;
        const range = side === "n" ? (spec.depthN ?? spec.depth) : spec.depth;
        const d = kind === "trees" || kind === "bushes" ? int(rng, 1, 2) : int(rng, range[0], range[1]);
        let depth = d;
        // Shallower where the chunk would cover water or a reserved cell.
        const rectOf = (dd: number): Rect =>
          side === "n"
            ? { x: a, y: 0, w: l, h: dd }
            : side === "s"
              ? { x: a, y: SCREEN_H - dd, w: l, h: dd }
              : side === "w"
                ? { x: 0, y: a, w: dd, h: l }
                : { x: SCREEN_W - dd, y: a, w: dd, h: l };
        const ok = (r: Rect) => {
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++) {
              const g = sg.get(x, y);
              if (sg.reserved.has(key(x, y)) || !(g === "." || g === "R" || g === "T" || g === "B")) return false;
            }
          return true;
        };
        while (depth > 1 && !ok(rectOf(depth))) depth--;
        const r = rectOf(depth);
        if (kind === "trees" || kind === "bushes") {
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++) {
              const g = sg.get(x, y);
              // Depth 2: a ragged second row.
              const outer = horizontal
                ? y === (side === "n" ? 0 : SCREEN_H - 1)
                : x === (side === "w" ? 0 : SCREEN_W - 1);
              if (g === "." && !sg.reserved.has(key(x, y)) && (outer || rng() < 0.6))
                sg.set(x, y, kind === "trees" ? "T" : "B");
            }
        } else if (!(ok(r) && sg.addShape(kind, r, { fresh: 0 }))) {
          // Cannot fit at all: the edge cells alone, as loose solids.
          for (let k = a; k < a + l; k++) {
            const [x, y] = edgeCell(k);
            if (sg.get(x, y) === ".") sg.set(x, y, SOLID_SHAPE[kind as ShapeKind] ?? spec.filler);
          }
        }
        a += l;
      }
      i = j;
    }
  };
  // Top and bottom first (their chunks cover the corners).
  for (const side of ["n", "s", "w", "e"] as const) border(side);

  // ─── Entrance ─────────────────────────────────────────────────────────
  const required: [number, number][] = [...openings];
  let front: [number, number] | undefined;
  if (o.feature) {
    const { kind, glyph } = o.feature;
    const fp = FOOTPRINTS[kind];
    const w = kind === "rockCave" ? 1 : (fp?.[0]?.length ?? 3);
    const h = kind === "rockCave" ? 1 : (fp?.length ?? 2);
    const half = Math.floor(w / 2);
    const xs = [];
    for (let fx = 2 + half; fx <= SCREEN_W - 3 - (w - 1 - half); fx++) {
      const x0 = fx - half;
      if (x0 + w - 1 >= 6 && x0 <= 13 && o.open.n) continue; // keep clear of the north corridor
      xs.push(fx);
    }
    for (let t = 0; t < 30 && !front; t++) {
      const fx = pick(rng, xs);
      const x0 = fx - half;
      let depth = 0;
      for (let x = x0 - 1; x <= x0 + w; x++) {
        let d = 0;
        while (d < SCREEN_H && !isWalkable(sg.get(x, d))) d++;
        depth = Math.max(depth, d);
      }
      if (kind === "rockCave") {
        // The mouth in the south face of a rock mass grown down from the border.
        const my = Math.min(4, Math.max(2, depth + int(rng, 0, 1)));
        const rw = int(rng, 3, 6);
        const rx = fx - int(rng, 1, rw - 2);
        const r = { x: rx, y: 0, w: rw, h: my + 1 };
        if (!sg.addShape("rock", r, { fresh: 0, margin: 1 })) continue;
        sg.set(fx, my, glyph);
        sg.landmarks.push({ kind, x: fx, y: my, w: 1, h: 1 });
        front = [fx, my + 1];
      } else {
        const y0 = Math.max(1, Math.min(3, depth - h + 1));
        if (!sg.addLandmark(kind, x0, y0, { over: true, margin: 1 })) continue;
        front = [fx, y0 + h];
      }
      if (!isWalkable(sg.get(front[0], front[1])) || sg.get(front[0], front[1]) === "W") front = undefined;
    }
    if (!front) return fail("no-entrance");
    required.push(front);
    sg.reserve([front, [front[0], front[1] + 1], [front[0] - 1, front[1]], [front[0] + 1, front[1]]]);
  }

  // ─── Paths: every opening and the entrance to a hub ──────────────────
  let hub: [number, number] | undefined;
  for (let t = 0; t < 30 && !hub; t++) {
    const c: [number, number] = [int(rng, 6, 13), int(rng, 4, 6)];
    if (sg.get(c[0], c[1]) === ".") hub = c;
  }
  if (!hub) return fail("no-hub");
  const starts: [number, number][] = [];
  if (o.open.n) starts.push([o.pathX.n, 0]);
  if (o.open.s) starts.push([o.pathX.s, SCREEN_H - 1]);
  if (o.open.w) starts.push([0, 5]);
  if (o.open.e) starts.push([SCREEN_W - 1, 5]);
  if (front) starts.push(front);
  const pathCells = new Set<number>();
  for (const s of starts) {
    const way = route(sg, s, hub);
    if (!way) return fail("no-path");
    for (const [x, y] of way) {
      if (sg.get(x, y) === "W") sg.set(x, y, "=");
      pathCells.add(key(x, y));
      sg.reserved.add(key(x, y));
    }
  }
  // Ground cut off by the water (the far bank of a river) gets its own path and bridge.
  for (let guard = 0; guard < 4; guard++) {
    const reached = flood(sg.g, hub);
    let target: [number, number] | undefined;
    let best = Number.POSITIVE_INFINITY;
    const seen = new Set<number>();
    for (let y = 1; y < SCREEN_H - 1; y++)
      for (let x = 1; x < SCREEN_W - 1; x++) {
        if (sg.get(x, y) !== "." || reached.has(key(x, y)) || seen.has(key(x, y))) continue;
        const part = flood(sg.g, [x, y]);
        for (const k of part) seen.add(k);
        if (part.size < 10) continue;
        for (const k of part) {
          const px = k % SCREEN_W;
          const py = Math.floor(k / SCREEN_W);
          const d = Math.abs(px - hub[0]) + Math.abs(py - hub[1]);
          if (sg.get(px, py) === "." && d < best) [best, target] = [d, [px, py]];
        }
      }
    if (!target) break;
    const way = route(sg, hub, target);
    if (!way) return fail("no-bridge");
    for (const [x, y] of way) {
      if (sg.get(x, y) === "W") sg.set(x, y, "=");
      pathCells.add(key(x, y));
      sg.reserved.add(key(x, y));
    }
  }
  // Bridges must have water on both sides (a bridge along a bank is a jetty to nowhere).
  for (const k of pathCells) {
    const x = k % SCREEN_W;
    const y = Math.floor(k / SCREEN_W);
    if (sg.get(x, y) !== "=") continue;
    const ew = sg.get(x - 1, y) === "W" && sg.get(x + 1, y) === "W";
    const ns = sg.get(x, y - 1) === "W" && sg.get(x, y + 1) === "W";
    if (!ew && !ns) return fail("bad-bridge");
  }
  if (spec.paths)
    for (const k of pathCells) {
      const x = k % SCREEN_W;
      const y = Math.floor(k / SCREEN_W);
      if (sg.get(x, y) === ".") sg.set(x, y, ":");
    }

  // ─── Decoration ───────────────────────────────────────────────────────
  decorate(sg, o, attempt, hub, required);

  // ─── Pockets nobody can reach become solid ────────────────────────────
  const start = starts[0] ?? hub;
  const reach = flood(sg.g, start);
  for (let y = 0; y < SCREEN_H; y++)
    for (let x = 0; x < SCREEN_W; x++)
      if (isWalkable(sg.get(x, y)) && !reach.has(key(x, y))) {
        if (sg.get(x, y) === "=" || sg.get(x, y) === "C" || sg.get(x, y) === "D") return fail("cut-off-portal");
        sg.set(x, y, spec.filler);
      }
  if (!required.every(([x, y]) => reach.has(key(x, y)))) return fail("unreachable");
  if (reach.size < SCREEN_W * SCREEN_H * 0.33) return fail("cramped");

  // ─── Enemies and the chest, on reachable plain ground away from the entrances ──
  const avoid = front ? [...openings, front] : openings;
  const cells: [number, number][] = [];
  for (const k of reach) {
    const x = k % SCREEN_W;
    const y = Math.floor(k / SCREEN_W);
    if (
      sg.get(x, y) === "." &&
      x > 1 &&
      y > 1 &&
      x < SCREEN_W - 2 &&
      y < SCREEN_H - 2 &&
      !avoid.some(([ax, ay]) => Math.abs(ax - x) <= 2 && Math.abs(ay - y) <= 2)
    )
      cells.push([x, y]);
  }
  const count = Math.min(5, 1 + Math.floor(o.ring / 2) + (rng() < 0.6 ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const cell = takeRandom(rng, cells);
    if (cell) sg.set(cell[0], cell[1], pick(rng, [...poolFor(spec, o.ring)]));
  }
  if (o.chest) {
    const tucked = cells.filter(
      ([x, y]) =>
        [sg.get(x, y - 1), sg.get(x, y + 1), sg.get(x - 1, y), sg.get(x + 1, y)].filter((c) => !isWalkable(c)).length >=
        2,
    );
    const cell = takeRandom(rng, tucked.length > 0 ? tucked : cells);
    if (cell) sg.set(cell[0], cell[1], "$");
  }
  const trail: [number, number][] = spec.paths
    ? []
    : [...pathCells].map((k) => [k % SCREEN_W, Math.floor(k / SCREEN_W)] as [number, number]);
  return { rows: rowsOf(sg.g), shapes: sg.shapes, landmarks: sg.landmarks, trail };
}

/** The biome's own things, on the ground left free. Fewer on later attempts. */
function decorate(
  sg: ScreenGrid,
  o: OverworldOptions,
  attempt: number,
  hub: [number, number],
  required: [number, number][],
) {
  const { rng } = sg;
  const less = Math.floor(attempt / 10);
  const n = (min: number, max: number) => Math.max(0, int(rng, min, max) - less);
  const times = (k: number, f: () => void) => {
    for (let i = 0; i < k; i++) f();
  };
  const open = (x: number, y: number) => inside(x, y) && isWalkable(sg.get(x, y));
  const solidAt = (x: number, y: number) => inside(x, y) && !isWalkable(sg.get(x, y)) && sg.get(x, y) !== "W";
  /**
   * A building must face open ground: its bottom row on plain ground, the row
   * below it walkable, its front (below the middle) reachable from the hub, and
   * solids (the border, rocks, trees) against one side at most.
   */
  const buildingFits = (r: Rect) => {
    const fx = r.x + Math.floor(r.w / 2);
    const fy = r.y + r.h;
    for (let x = r.x; x < r.x + r.w; x++) if (sg.get(x, r.y + r.h - 1) !== "." || !open(x, fy)) return false;
    if (!open(fx, fy + 1) || !open(fx - 1, fy) || !open(fx + 1, fy)) return false;
    let sides = 0;
    const touches = (cells: [number, number][]) => cells.some(([x, y]) => solidAt(x, y));
    const col = (x: number, y0: number, y1: number) =>
      Array.from({ length: y1 - y0 }, (_, i) => [x, y0 + i] as [number, number]);
    const row = (y: number, x0: number, x1: number) =>
      Array.from({ length: x1 - x0 }, (_, i) => [x0 + i, y] as [number, number]);
    if (touches([...row(r.y - 1, r.x, r.x + r.w), ...row(r.y, r.x, r.x + r.w)])) sides++;
    if (touches([...col(r.x - 1, r.y, r.y + r.h), ...col(r.x, r.y, r.y + r.h)])) sides++;
    if (touches([...col(r.x + r.w, r.y, r.y + r.h), ...col(r.x + r.w - 1, r.y, r.y + r.h)])) sides++;
    return sides <= 1 && flood(sg.g, hub).has(key(fx, fy));
  };
  /** A landmark somewhere free, next to a path if possible. */
  const landmark = (kind: LandmarkKind, tries = BUILDINGS.includes(kind) ? 60 : 30) => {
    const fp = FOOTPRINTS[kind] ?? ["Z"];
    // Buildings may stand against the border (in front of its trees or rocks).
    const big = fp.length >= 4;
    const building = BUILDINGS.includes(kind);
    for (let t = 0; t < tries; t++) {
      const r = sg.spot(fp[0]?.length ?? 1, fp.length, 2, big ? 1 : 2);
      if (building && !buildingFits(r)) continue;
      if (!sg.addLandmark(kind, r.x, r.y, { margin: 1, over: big })) continue;
      if (building) {
        const front: [number, number] = [r.x + Math.floor(r.w / 2), r.y + r.h];
        required.push(front);
        sg.reserve([front, [front[0], front[1] + 1], [front[0] - 1, front[1]], [front[0] + 1, front[1]]]);
      }
      return true;
    }
    return false;
  };
  /** A signpost beside a path. */
  const signpost = () => {
    for (let t = 0; t < 30; t++) {
      const [x, y] = [int(rng, 3, SCREEN_W - 4), int(rng, 3, SCREEN_H - 4)];
      const beside = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => sg.get(x + dx, y + dy) === ":");
      if (beside && sg.free(x, y) && sg.addLandmark("sign", x, y)) return;
    }
  };
  switch (o.biome) {
    case "M": {
      // Each mountain screen gets a look of its own: crags, ruins, a pine grove or cliffs.
      const look = pick(rng, ["crags", "ruins", "grove", "cliffs"] as const);
      times(n(look === "cliffs" ? 3 : 1, look === "cliffs" ? 5 : 3), () =>
        sg.scatterShape("rock", [2, 5], [2, 3], 12, 0.4),
      );
      times(n(0, look === "cliffs" ? 2 : 1), () => sg.scatterShape("rock", [2, 3], [3, 5], 12, 0.4));
      if (look === "cliffs" || rng() < 0.3) sg.scatterL("rock", 12, 0.4);
      times(n(look === "grove" ? 2 : 0, look === "grove" ? 4 : 1), () => sg.scatterShape("pines", [2, 4], [2, 2]));
      times(n(look === "crags" ? 2 : 0, look === "crags" ? 4 : 1), () => landmark("crag"));
      if (look === "ruins") {
        times(n(1, 2), () => sg.patch("o", [2, 4], [2, 3]));
        times(n(1, 3), () => landmark("ruin"));
        times(n(1, 2), () => landmark("stones"));
      }
      times(n(0, 2), () => landmark(pick(rng, ["stones", "ringStone"] as const)));
      times(n(1, 2), () => sg.clump("R", int(rng, 1, 2)));
      break;
    }
    case "G":
    case "L":
      // Landmarks first: a building needs open ground in front of it.
      if (rng() < 0.6) landmark(pick(rng, ["house", "house", "hut", "statue", "well"] as const));
      times(n(o.biome === "L" ? 0 : 1, 2), () => sg.scatterShape("forest", [2, 4], [2, 3]));
      times(n(1, 3), () => sg.clump("T", int(rng, 1, 3)));
      times(n(0, 2), () => sg.clump("B", int(rng, 1, 3)));
      times(n(2, 4), () => sg.patch(",", [2, 3], [1, 2]));
      if (rng() < 0.4) signpost();
      break;
    case "H":
      if (rng() < 0.5) landmark(pick(rng, ["statue", "hut", "house", "stump"] as const));
      times(n(2, 4), () => sg.scatterShape("rock", [2, 4], [2, 3]));
      times(n(1, 2), () => sg.clump("R", int(rng, 1, 2)));
      times(n(0, 2), () => sg.clump("B", int(rng, 1, 3)));
      times(n(0, 2), () => sg.clump("T", int(rng, 1, 2)));
      times(n(1, 2), () => sg.patch(",", [2, 3], [1, 2]));
      if (rng() < 0.3) signpost();
      break;
    case "F":
      times(n(3, 5), () => sg.scatterShape("forest", [2, 5], [2, 3]));
      times(n(0, 2), () => sg.scatterShape("pines", [2, 4], [2, 3]));
      times(n(1, 3), () => sg.clump("T", int(rng, 1, 3)));
      times(n(0, 1), () => sg.clump("B", int(rng, 1, 2)));
      break;
    case "R":
      times(n(3, 5), () => sg.scatterShape("forest", [2, 5], [2, 3]));
      times(n(1, 3), () => sg.clump("T", int(rng, 1, 2)));
      times(n(0, 2), () => landmark("stump"));
      break;
    case "W":
      times(n(2, 3), () => {
        // Mud: a few overlapping patches.
        const first = sg.spot(int(rng, 2, 4), int(rng, 2, 3), 2, 2);
        for (let i = int(rng, 1, 3); i >= 0; i--) {
          const w = int(rng, 2, 4);
          const h = int(rng, 2, 3);
          const r = { x: first.x + int(rng, -2, 2), y: first.y + int(rng, -1, 1), w, h };
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++)
              if (x >= 2 && y >= 2 && x < SCREEN_W - 2 && y < SCREEN_H - 2 && sg.get(x, y) === ".") sg.set(x, y, "m");
        }
      });
      times(n(1, 2), () => {
        for (let t = 0; t < 10; t++) {
          const r = sg.spot(int(rng, 2, 4), int(rng, 2, 3));
          let ok = sg.clearOfReserved(r, 1);
          for (let y = r.y - 1; y <= r.y + r.h && ok; y++)
            for (let x = r.x - 1; x <= r.x + r.w && ok; x++) if (!/[.,m]/.test(sg.get(x, y))) ok = false;
          if (ok) {
            sg.water(r);
            return;
          }
        }
      });
      times(n(2, 4), () => landmark("reeds"));
      times(n(1, 3), () => sg.clump("T", int(rng, 1, 2)));
      times(n(0, 2), () => landmark("stump"));
      times(n(0, 1), () => sg.scatterShape("forest", [2, 3], [2, 2]));
      break;
    case "Y": {
      // Graves in rows, every other column, with room to walk between the rows.
      times(n(2, 3), () => {
        for (let t = 0; t < 12; t++) {
          const cols = int(rng, 2, 4);
          const rows = int(rng, 1, 2);
          const r = sg.spot(cols * 2 - 1, rows * 2 - 1, 2, 2);
          const graves: [number, number][] = [];
          for (let y = r.y; y < r.y + r.h; y += 2)
            for (let x = r.x; x < r.x + r.w; x += 2) if (sg.loose(x, y)) graves.push([x, y]);
          if (graves.length < 3) continue;
          for (const [x, y] of graves) sg.set(x, y, "+");
          return;
        }
      });
      times(n(1, 3), () => sg.clump("T", 1));
      times(n(0, 2), () => sg.clump("P", 1));
      times(n(0, 1), () => sg.patch(",", [1, 2], [1, 1]));
      break;
    }
    case "B":
      if (o.sea) {
        // Sometimes a jetty into the sea, from a reachable bit of coast.
        for (let t = rng() < 0.65 ? 0 : 20; t < 20; t++) {
          const y = int(rng, 2, SCREEN_H - 3);
          let x = SCREEN_W - 1;
          while (x > 0 && sg.get(x - 1, y) === "W") x--;
          const len = int(rng, 2, 3);
          if (x >= SCREEN_W - len || sg.get(x - 1, y) !== "." || !sg.deep.has(key(x, y))) continue;
          let ok = true;
          for (let i = 0; i < len && ok; i++)
            if (sg.get(x + i, y - 1) !== "W" || sg.get(x + i, y + 1) !== "W") ok = false;
          if (!ok) continue;
          for (let i = 0; i < len; i++) sg.set(x + i, y, "=");
          sg.reserve([[x - 1, y]]);
          sg.landmarks.push({ kind: "dock", x, y, w: len, h: 1 });
          break;
        }
        // Sometimes an island, where the sea is wide enough.
        for (let t = rng() < 0.6 ? 0 : 10; t < 10; t++) {
          const x = int(rng, 14, SCREEN_W - 3);
          const y = int(rng, 1, SCREEN_H - 5);
          let ok = true;
          for (let yy = y - 1; yy <= y + 3 && ok; yy++)
            for (let xx = x - 1; xx <= x + 2 && ok; xx++) if (sg.get(xx, yy) !== "W") ok = false;
          if (!ok) continue;
          sg.landmarks.push({ kind: "island", x, y, w: 2, h: 3 });
          break;
        }
      }
      times(n(1, 2), () => sg.scatterShape("rock", [2, 3], [2, 2]));
      times(n(1, 2), () => sg.clump("B", int(rng, 1, 3)));
      break;
  }
}
