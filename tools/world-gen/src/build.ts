/**
 * Procedural screens, as 11 rows of 20 glyphs (legend in generate.ts), and
 * the helpers they share. The overworld screens are built in overworld.ts.
 * Every screen is checked for connectivity before it is accepted.
 */
import type { DungeonDef } from "./world";

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

export const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;

export const SCREEN_W = 20;
export const SCREEN_H = 11;

export interface Openings {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

/** Glyphs a hero can walk on (everything else in these builders is solid). */
export const WALKABLE = new Set([".", ",", ":", "s", "o", "m", "=", "_", ";", "C", "D", "X", "S"]);
export const isWalkable = (g: string) => WALKABLE.has(g) || /[a-z$12]/.test(g);

export type Grid = string[][];
export const blank = (fill: string): Grid => Array.from({ length: SCREEN_H }, () => Array(SCREEN_W).fill(fill));
export const rowsOf = (g: Grid) => g.map((r) => r.join(""));
export const put = (g: Grid, x: number, y: number, glyph: string) => {
  const row = g[y];
  if (row && x >= 0 && x < SCREEN_W) row[x] = glyph;
};
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SCREEN_W && y < SCREEN_H;

/** Rows of the openings on the west/east sides of every screen. */
export const SIDE_OPENING_ROWS = [4, 6] as const;
/** Columns of the openings on the north/south sides: 4 wide outside, 2 wide (the door art) between dungeon rooms. */
export const OPENING_COLUMNS = [8, 11] as const;
export const ROOM_DOOR_COLUMNS = [9, 10] as const;

/** Opening cells on each side (the generator checks the same positions between screens). */
export function openingCells(open: Openings, room = false): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = SIDE_OPENING_ROWS[0]; y <= SIDE_OPENING_ROWS[1]; y++) {
    if (open.w) cells.push([0, y], [1, y]);
    if (open.e) cells.push([SCREEN_W - 1, y], [SCREEN_W - 2, y]);
  }
  const [x0, x1] = room ? ROOM_DOOR_COLUMNS : OPENING_COLUMNS;
  for (let x = x0; x <= x1; x++) {
    if (open.n) cells.push([x, 0], [x, 1]);
    if (open.s) cells.push([x, SCREEN_H - 1], [x, SCREEN_H - 2]);
  }
  return cells;
}

/** Cells reachable from `from` (4-way). */
export function flood(g: Grid, from: [number, number]): Set<number> {
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
export function connected(g: Grid, required: [number, number][]): boolean {
  const first = required[0];
  if (!first) return true;
  const seen = flood(g, first);
  return required.every(([x, y]) => seen.has(y * SCREEN_W + x));
}

export const near = (cells: [number, number][], x: number, y: number, d: number) =>
  cells.some(([cx, cy]) => Math.abs(cx - x) <= d && Math.abs(cy - y) <= d);

/** Random reachable floor cells, far enough from the openings. */
export function freeCells(g: Grid, from: [number, number], avoid: [number, number][], ground: string) {
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

export function takeRandom<T>(rng: Rng, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items.splice(Math.floor(rng() * items.length), 1)[0];
}

// ─── Dungeons ───────────────────────────────────────────────────────────────

export type RoomRole = "entrance" | "normal" | "side" | "treasure" | "miniboss" | "boss";

/** Walls of a dungeon room are 2 tiles thick (the pack's perspective room kit): the floor is x 2..17, y 2..8. */
export const ROOM_WALL = 2;

/**
 * Decorations over the 16x7 floor of a room (x 2..17, y 2..8): I statue
 * (16x32, its head drawn over the tile above), J block (2x2 J = one big block).
 * The door corridors stay clear (doors at x 9..10 and y 4..6).
 */
const ROOM_PATTERNS: string[][] = [
  [
    "................",
    "..I..........I..",
    "................",
    "................",
    "................",
    "..I..........I..",
    "................",
  ],
  [
    "................",
    "..I..I....I..I..",
    "................",
    "................",
    "................",
    "..I..I....I..I..",
    "................",
  ],
  [
    ".JJ..........JJ.",
    ".JJ..........JJ.",
    "................",
    "................",
    "................",
    ".JJ..........JJ.",
    ".JJ..........JJ.",
  ],
  [
    "................",
    "....J......J....",
    "....J......J....",
    "................",
    "....J......J....",
    "....J......J....",
    "................",
  ],
  [
    "................",
    "...I........I...",
    "................",
    ".......JJ.......",
    ".......JJ.......",
    "...I........I...",
    "................",
  ],
  [
    "................",
    "...J........J...",
    "................",
    "......J..J......",
    "................",
    "...J........J...",
    "................",
  ],
  // Asymmetric rooms (flipped left/right at random): an L of blocks, a line of
  // statues along the north wall, a partition with a gap, a corner cluster.
  [
    "................",
    "..J.............",
    "..J.............",
    "..JJJJ..........",
    "................",
    "...........I..I.",
    "................",
  ],
  [
    "................",
    "..I...I...I.....",
    "................",
    "................",
    "................",
    "...........JJ...",
    "...........JJ...",
  ],
  [
    "....J...........",
    "....J...........",
    "....J...........",
    "................",
    "....J......I....",
    "....J...........",
    "....J...........",
  ],
  [
    ".JJ.............",
    ".JJJ............",
    "..J.............",
    "................",
    ".............I..",
    "................",
    "................",
  ],
];
const ROLE_PATTERNS: Partial<Record<RoomRole, string[]>> = {
  entrance: [
    "................",
    "...I........I...",
    "................",
    "................",
    "................",
    "...I........I...",
    "................",
  ],
  boss: [
    "................",
    ".I............I.",
    "................",
    "................",
    "................",
    ".I............I.",
    "................",
  ],
  miniboss: ROOM_PATTERNS[2] as string[],
  treasure: [
    "................",
    "................",
    ".....I....I.....",
    "................",
    ".....I....I.....",
    "................",
    "................",
  ],
};
/** Where the boss, the mini-boss and the treasure chest stand. */
export const ROOM_CENTRE: [number, number] = [9, 5];

/**
 * The room patterns of one dungeon, shuffled: its rooms draw from this deck
 * without replacement, so no two rooms of a dungeon share a layout.
 */
export function patternDeck(rng: Rng): string[][] {
  // The mini-boss room has its own pattern (one of these): the other rooms leave it to it.
  const deck = ROOM_PATTERNS.filter((p) => p !== ROLE_PATTERNS.miniboss);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as string[], deck[i] as string[]];
  }
  return deck;
}

export function buildDungeonRoom(
  rng: Rng,
  role: RoomRole,
  open: Openings,
  dungeon: DungeonDef,
  deck?: string[][],
): string[] {
  const g = blank("#");
  for (let y = ROOM_WALL; y < SCREEN_H - ROOM_WALL; y++)
    for (let x = ROOM_WALL; x < SCREEN_W - ROOM_WALL; x++) put(g, x, y, ";");
  const openings = openingCells(open, true);
  for (const [x, y] of openings) put(g, x, y, ";");

  if (role === "entrance") {
    // The way out: a doorway in the south wall (2 tiles wide, one portal).
    for (const x of ROOM_DOOR_COLUMNS) put(g, x, SCREEN_H - ROOM_WALL, "X");
  }

  const pattern = ROLE_PATTERNS[role] ?? deck?.pop() ?? pick(rng, ROOM_PATTERNS);
  const flip = !ROLE_PATTERNS[role] && rng() < 0.5;
  pattern.forEach((line, py) => {
    [...(flip ? [...line].reverse().join("") : line)].forEach((c, px) => {
      const x = px + ROOM_WALL;
      const y = py + ROOM_WALL;
      if (c !== "." && !near(openings, x, y, 1)) put(g, x, y, c);
    });
  });

  const from = openings[0] ?? [9, 8];
  const [cx, cy] = ROOM_CENTRE;
  if (role === "miniboss") put(g, cx, cy, "1");
  if (role === "boss") put(g, cx, cy, "2");
  if (role === "treasure") put(g, cx, cy, "$");
  const exits = role === "entrance" ? [...openings, [9, SCREEN_H - ROOM_WALL] as [number, number]] : openings;
  const cells = freeCells(g, from, exits, ";");
  const count = { entrance: 1, normal: int(rng, 3, 4), side: int(rng, 2, 3), treasure: 2, miniboss: 0, boss: 0 }[role];
  for (let i = 0; i < count; i++) {
    const cell = takeRandom(rng, cells);
    if (cell) put(g, cell[0], cell[1], pick(rng, [...dungeon.enemies]));
  }
  if (!connected(g, exits)) throw new Error(`dungeon room of ${dungeon.id} is not connected`);
  return rowsOf(g);
}

/** A dungeon's 3x3 rooms: role of each room ("col,row") and the doors between them. */
export interface DungeonLayout {
  roles: Record<string, RoomRole>;
  links: [number, number, number, number][];
}

/**
 * Hand-made graphs of the 3x3 rooms (columns 0-2, rows 0-2 from the top). The
 * entrance is on the bottom row (its way out is in the south wall), and the
 * boss room opens only onto the mini-boss room.
 */
const LAYOUTS: { rooms: string[]; links: string[] }[] = [
  // Entrance in the middle, the mini-boss up the west side.
  {
    rooms: ["normal boss treasure", "miniboss normal normal", "side entrance side"],
    links: ["12-02", "12-22", "12-11", "11-01", "11-21", "21-20", "01-00", "00-10"],
  },
  // Entrance in the west corner, the boss up the east side.
  {
    rooms: ["treasure normal boss", "side normal miniboss", "entrance normal side"],
    links: ["02-12", "12-22", "02-01", "01-00", "12-11", "11-10", "11-21", "21-20"],
  },
  // Entrance in the east corner, a loop round the middle, the boss in the north-west.
  {
    rooms: ["boss miniboss side", "treasure normal normal", "side normal entrance"],
    links: ["22-21", "22-12", "12-02", "02-01", "12-11", "11-21", "21-20", "11-10", "10-00"],
  },
  // Entrance in the middle, a long way round the west to the boss in the north-east.
  {
    rooms: ["treasure miniboss boss", "normal normal side", "normal entrance side"],
    links: ["12-02", "12-22", "02-01", "01-00", "01-11", "11-21", "11-10", "10-20"],
  },
];

/** Rooms and doors of dungeon layout `n` (see LAYOUTS). */
export function dungeonLayout(n: number): DungeonLayout {
  const layout = LAYOUTS[n % LAYOUTS.length] as (typeof LAYOUTS)[number];
  const roles: Record<string, RoomRole> = {};
  layout.rooms.forEach((line, r) => {
    line.split(" ").forEach((role, c) => {
      roles[`${c},${r}`] = role as RoomRole;
    });
  });
  const links = layout.links.map((l) => {
    const [a = 0, b = 0, c = 0, d = 0] = [...l.replace("-", "")].map(Number);
    return [a, b, c, d] as [number, number, number, number];
  });
  return { roles, links };
}
