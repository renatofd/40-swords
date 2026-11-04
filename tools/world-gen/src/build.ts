/**
 * Procedural screens, as 11 rows of 20 glyphs (legend in generate.ts).
 * Every screen is checked for connectivity before it is accepted.
 */
import type { Biome, DungeonDef } from "./world";

export type Rng = () => number;

export function rngFor(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;

export const SCREEN_W = 20;
export const SCREEN_H = 11;

export interface Openings {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

/** Glyphs a hero can walk on (everything else in these builders is solid). */
const WALKABLE = new Set([".", ",", ":", "s", "o", "m", "=", "_", ";", "C", "D", "X", "S"]);
const isWalkable = (g: string) => WALKABLE.has(g) || (/[a-z$12]/.test(g) && g !== "a");

type Grid = string[][];
const blank = (fill: string): Grid => Array.from({ length: SCREEN_H }, () => Array(SCREEN_W).fill(fill));
const rowsOf = (g: Grid) => g.map((r) => r.join(""));
const put = (g: Grid, x: number, y: number, glyph: string) => {
  const row = g[y];
  if (row && x >= 0 && x < SCREEN_W) row[x] = glyph;
};
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SCREEN_W && y < SCREEN_H;

/** Opening cells on each side (the generator checks the same positions between screens). */
function openingCells(open: Openings): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = 4; y <= 6; y++) {
    if (open.w) cells.push([0, y], [1, y]);
    if (open.e) cells.push([SCREEN_W - 1, y], [SCREEN_W - 2, y]);
  }
  for (let x = 8; x <= 11; x++) {
    if (open.n) cells.push([x, 0], [x, 1]);
    if (open.s) cells.push([x, SCREEN_H - 1], [x, SCREEN_H - 2]);
  }
  return cells;
}

/** Cells reachable from `from` (4-way). */
function flood(g: Grid, from: [number, number]): Set<number> {
  const seen = new Set<number>();
  const stack = [from];
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    if (!inside(x, y) || seen.has(y * SCREEN_W + x) || !isWalkable(g[y]?.[x] ?? "#")) continue;
    seen.add(y * SCREEN_W + x);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

/** True when every required cell is reachable from the first one. */
function connected(g: Grid, required: [number, number][]): boolean {
  const first = required[0];
  if (!first) return true;
  const seen = flood(g, first);
  return required.every(([x, y]) => seen.has(y * SCREEN_W + x));
}

const near = (cells: [number, number][], x: number, y: number, d: number) =>
  cells.some(([cx, cy]) => Math.abs(cx - x) <= d && Math.abs(cy - y) <= d);

/** Random reachable floor cells, far enough from the openings. */
function freeCells(g: Grid, from: [number, number], avoid: [number, number][], ground: string) {
  const seen = flood(g, from);
  const cells: [number, number][] = [];
  for (const key of seen) {
    const x = key % SCREEN_W;
    const y = Math.floor(key / SCREEN_W);
    if (g[y]?.[x] === ground && x > 1 && y > 1 && x < SCREEN_W - 2 && y < SCREEN_H - 2 && !near(avoid, x, y, 2))
      cells.push([x, y]);
  }
  return cells;
}

function takeRandom<T>(rng: Rng, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items.splice(Math.floor(rng() * items.length), 1)[0];
}

// ─── Overworld ──────────────────────────────────────────────────────────────

interface Stamp {
  glyph: string;
  w: [number, number];
  h: [number, number];
  /** Ellipse instead of rectangle (lakes). */
  round?: boolean;
}

interface BiomeSpec {
  border: string;
  stamps: Stamp[];
  count: [number, number];
  /** A first, larger feature (the lake of a lake screen). */
  big?: Stamp;
  enemies: string;
}

export const BIOME_SPECS: Record<Exclude<Biome, "C">, BiomeSpec> = {
  G: {
    border: "T",
    stamps: [
      { glyph: "B", w: [1, 2], h: [1, 2] },
      { glyph: ",", w: [2, 3], h: [1, 2] },
      { glyph: "T", w: [1, 2], h: [1, 1] },
      { glyph: "R", w: [1, 1], h: [1, 1] },
    ],
    count: [4, 7],
    enemies: "eegw",
  },
  F: {
    border: "T",
    stamps: [
      { glyph: "T", w: [2, 3], h: [2, 3] },
      { glyph: "T", w: [1, 1], h: [1, 2] },
      { glyph: "B", w: [1, 1], h: [1, 1] },
    ],
    count: [6, 9],
    enemies: "wbge",
  },
  H: {
    border: "R",
    stamps: [
      { glyph: "R", w: [2, 3], h: [1, 2] },
      { glyph: "B", w: [1, 2], h: [1, 1] },
    ],
    count: [5, 8],
    enemies: "gwe",
  },
  M: {
    border: "R",
    stamps: [
      { glyph: "R", w: [2, 4], h: [2, 3] },
      { glyph: "R", w: [1, 1], h: [1, 1] },
    ],
    count: [6, 9],
    enemies: "gbk",
  },
  L: {
    border: "T",
    big: { glyph: "W", w: [6, 9], h: [3, 4], round: true },
    stamps: [
      { glyph: "B", w: [1, 1], h: [1, 1] },
      { glyph: ",", w: [2, 3], h: [1, 1] },
    ],
    count: [2, 4],
    enemies: "eff",
  },
  D: {
    border: "R",
    stamps: [
      { glyph: "a", w: [1, 1], h: [1, 1] },
      { glyph: "R", w: [1, 2], h: [1, 2] },
      { glyph: "s", w: [2, 3], h: [1, 2] },
    ],
    count: [7, 11],
    enemies: "zzg",
  },
  W: {
    border: "T",
    stamps: [
      { glyph: "m", w: [2, 4], h: [1, 3] },
      { glyph: "W", w: [1, 3], h: [1, 2] },
      { glyph: "T", w: [1, 1], h: [1, 2] },
    ],
    count: [6, 9],
    enemies: "ffeb",
  },
  Y: {
    border: "T",
    stamps: [
      { glyph: "+", w: [1, 1], h: [1, 1] },
      { glyph: "P", w: [1, 1], h: [1, 1] },
      { glyph: "T", w: [1, 1], h: [1, 1] },
    ],
    count: [9, 13],
    enemies: "kkb",
  },
  B: {
    border: "W",
    stamps: [
      { glyph: "R", w: [1, 2], h: [1, 1] },
      { glyph: "T", w: [1, 1], h: [1, 1] },
      { glyph: "W", w: [2, 3], h: [1, 2] },
    ],
    count: [3, 6],
    enemies: "efz",
  },
};

export interface OverworldOptions {
  biome: Exclude<Biome, "C">;
  open: Openings;
  /** Cave entrance "C" or dungeon door "D" in the top wall. */
  feature?: "C" | "D";
  /** Distance from the start, in screens: more enemies farther out. */
  ring: number;
  chest: boolean;
}

export function buildOverworld(rng: Rng, o: OverworldOptions): string[] {
  const spec = BIOME_SPECS[o.biome];
  const openings = openingCells(o.open);
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = blank(".");
    for (let x = 0; x < SCREEN_W; x++) {
      put(g, x, 0, spec.border);
      put(g, x, SCREEN_H - 1, spec.border);
    }
    for (let y = 0; y < SCREEN_H; y++) {
      put(g, 0, y, spec.border);
      put(g, SCREEN_W - 1, y, spec.border);
    }
    // Organic edges: some wall bumps one tile in.
    for (let x = 1; x < SCREEN_W - 1; x++) {
      if (rng() < 0.3) put(g, x, 1, spec.border);
      if (rng() < 0.3) put(g, x, SCREEN_H - 2, spec.border);
    }
    for (let y = 1; y < SCREEN_H - 1; y++) {
      if (rng() < 0.3) put(g, 1, y, spec.border);
      if (rng() < 0.3) put(g, SCREEN_W - 2, y, spec.border);
    }
    for (const [x, y] of openings) put(g, x, y, ".");

    const required: [number, number][] = [...openings];
    const protect: [number, number][] = [...openings];
    let featureAt: [number, number] | undefined;
    if (o.feature) {
      const fx = pick(rng, [3, 4, 5, 6, 13, 14, 15, 16]);
      put(g, fx, 0, spec.border);
      put(g, fx - 1, 1, o.feature === "D" ? "P" : spec.border);
      put(g, fx + 1, 1, o.feature === "D" ? "P" : spec.border);
      put(g, fx, 1, o.feature);
      for (const dx of [-1, 0, 1]) put(g, fx + dx, 2, ".");
      featureAt = [fx, 1];
      required.push([fx, 2]);
      protect.push([fx, 2], [fx, 3]);
    }

    const stamps = Math.max(0, int(rng, spec.count[0], spec.count[1]) - Math.floor(attempt / 8));
    const all = spec.big ? [spec.big, ...Array.from({ length: stamps }, () => pick(rng, spec.stamps))] : [];
    if (!spec.big) for (let i = 0; i < stamps; i++) all.push(pick(rng, spec.stamps));
    for (const stamp of all) {
      const w = int(rng, stamp.w[0], stamp.w[1]);
      const h = int(rng, stamp.h[0], stamp.h[1]);
      const x0 = int(rng, 2, SCREEN_W - 2 - w);
      const y0 = int(rng, 2, SCREEN_H - 2 - h);
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          if (stamp.round) {
            const nx = (x - x0 + 0.5) / w - 0.5;
            const ny = (y - y0 + 0.5) / h - 0.5;
            if (nx * nx + ny * ny > 0.25) continue;
          }
          if (near(protect, x, y, 1)) continue;
          put(g, x, y, stamp.glyph);
        }
    }

    if (required.length > 0 && !connected(g, required)) continue;
    const start = required[0] ?? [10, 5];
    const walkable = flood(g, start).size;
    if (walkable < SCREEN_W * SCREEN_H * 0.4) continue;

    // Enemies and the chest on reachable plain ground, away from the entrances.
    const avoid = featureAt ? [...openings, featureAt] : openings;
    const cells = freeCells(g, start, avoid, ".");
    const count = Math.min(5, 1 + Math.floor(o.ring / 2) + (rng() < 0.6 ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const cell = takeRandom(rng, cells);
      if (cell) put(g, cell[0], cell[1], pick(rng, [...spec.enemies]));
    }
    if (o.chest) {
      // Prefer a tucked-away spot (walls around).
      const tucked = cells.filter(
        ([x, y]) =>
          [g[y - 1]?.[x], g[y + 1]?.[x], g[y]?.[x - 1], g[y]?.[x + 1]].filter((c) => c && !isWalkable(c)).length >= 2,
      );
      const cell = takeRandom(rng, tucked.length > 0 ? tucked : cells);
      if (cell) put(g, cell[0], cell[1], "$");
    }
    return rowsOf(g);
  }
  throw new Error(`could not build a connected ${o.biome} screen`);
}

// ─── Dungeons ───────────────────────────────────────────────────────────────

export type RoomRole = "entrance" | "normal" | "side" | "treasure" | "miniboss" | "boss";

const STATUE_PATTERNS: [number, number][][] = [
  [
    [5, 3],
    [14, 3],
    [5, 7],
    [14, 7],
  ],
  [
    [4, 3],
    [7, 3],
    [12, 3],
    [15, 3],
    [4, 7],
    [7, 7],
    [12, 7],
    [15, 7],
  ],
  [
    [6, 4],
    [6, 6],
    [13, 4],
    [13, 6],
  ],
  [
    [9, 3],
    [10, 3],
    [9, 7],
    [10, 7],
    [4, 5],
    [15, 5],
  ],
];

export function buildDungeonRoom(rng: Rng, role: RoomRole, open: Openings, dungeon: DungeonDef): string[] {
  const g = blank(";");
  for (let x = 0; x < SCREEN_W; x++) {
    put(g, x, 0, "#");
    put(g, x, SCREEN_H - 1, "#");
  }
  for (let y = 0; y < SCREEN_H; y++) {
    put(g, 0, y, "#");
    put(g, SCREEN_W - 1, y, "#");
  }
  const openings = openingCells(open);
  for (const [x, y] of openings) put(g, x, y, ";");

  if (role === "entrance") {
    // The way out: a corridor to the exit stairs at the bottom.
    for (let x = 1; x < SCREEN_W - 1; x++) {
      put(g, x, 8, x >= 7 && x <= 12 ? ";" : "#");
      put(g, x, 9, x === 9 ? "X" : "#");
    }
  }

  const corners: [number, number][] = [
    [3, 2],
    [16, 2],
    [3, 8],
    [16, 8],
  ];
  const statues =
    role === "miniboss" || role === "boss"
      ? corners
      : role === "entrance"
        ? [
            [5, 3],
            [14, 3],
          ]
        : pick(rng, STATUE_PATTERNS);
  for (const [x, y] of statues as [number, number][]) if (!near(openings, x, y, 1)) put(g, x, y, "I");

  const from = openings[0] ?? [9, 8];
  if (role === "miniboss") put(g, 9, 5, "1");
  if (role === "boss") put(g, 9, 4, "2");
  if (role === "treasure") put(g, 9, 3, "$");
  const cells = freeCells(g, from, openings, ";");
  const count = { entrance: 1, normal: int(rng, 3, 4), side: int(rng, 2, 3), treasure: 2, miniboss: 0, boss: 0 }[role];
  for (let i = 0; i < count; i++) {
    const cell = takeRandom(rng, cells);
    if (cell) put(g, cell[0], cell[1], pick(rng, [...dungeon.enemies]));
  }
  if (!connected(g, openings)) throw new Error(`dungeon room of ${dungeon.id} is not connected`);
  return rowsOf(g);
}

/**
 * Rooms of a dungeon in its 3x3 block: the entrance at the bottom middle, the
 * mini-boss on the only way to the boss at the top. Mirrored for some dungeons.
 */
export function dungeonLayout(mirror: boolean) {
  const m = (c: number) => (mirror ? 2 - c : c);
  const roles: Record<string, RoomRole> = {};
  const set = (c: number, r: number, role: RoomRole) => {
    roles[`${m(c)},${r}`] = role;
  };
  set(1, 2, "entrance");
  set(0, 2, "side");
  set(2, 2, "side");
  set(1, 1, "normal");
  set(2, 1, "normal");
  set(2, 0, "treasure");
  set(0, 1, "miniboss");
  set(0, 0, "normal");
  set(1, 0, "boss");
  const links: [number, number, number, number][] = [
    [1, 2, 0, 2],
    [1, 2, 2, 2],
    [1, 2, 1, 1],
    [1, 1, 0, 1],
    [1, 1, 2, 1],
    [2, 1, 2, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ];
  return {
    roles,
    links: links.map(([a, b, c, d]) => [m(a), b, m(c), d] as [number, number, number, number]),
  };
}
