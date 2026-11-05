/**
 * Writes content/tilesets/overworld.png and content/maps/overworld.tmj from
 * world.ts (layout) and build.ts (procedural screens), after checking the
 * result: screen edges match their connections and everything is reachable
 * from the start (walking and through portals).
 *
 *   pnpm --filter @tools/world-gen generate
 *
 * Glyphs:
 *   .  ground of the screen   ,  flowers   :  path   s  sand   o  stone   m  mud   =  bridge
 *   T  tree   R  rock   W  water   B  bush   +  tombstone   P  pillar   a  cactus
 *   S  player spawn   $  chest   C  cave entrance   D  dungeon door   X  way out (caves, dungeons)
 *   _  cave floor   K  cave wall   H  shelf   Q  counter   V  vendor (behind the counter)
 *   ;  dungeon floor   #  dungeon wall   I  statue
 *   n  arena sand   l  arena line   N  arena wall   u  arena pillar   x  arena spawn
 *   enemies: e slime  g goblin  b bat  k skeleton  z scorpion  w wolf  f lurker
 *            1 the dungeon's mini-boss   2 the dungeon's boss
 *
 * Props (tile layer "props", placed after the layout with their own random
 * stream, so they never change the rest of the world): clumps of tall grass on
 * the grassy overworld screens, pots in the corners of caves and dungeon rooms.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFER_SLOTS,
  offerPosition,
  PROPS_LAYER,
  type PropKind,
  SCREEN_TILES_X,
  SCREEN_TILES_Y,
  TILE_SIZE,
} from "@game/shared";
import { PNG } from "pngjs";
import { buildDungeonRoom, buildOverworld, dungeonLayout, type Openings, rngFor } from "./build";
import { buildTileset, COLUMNS, MARGIN, SPACING, TILES, tileId } from "./tiles";
import {
  ARENA,
  ARENA_AT,
  ARENA_SCREENS,
  BIOMES,
  type Biome,
  CAVES,
  CAVES_AT_COLUMN,
  DUNGEONS,
  type DungeonDef,
  INTERIOR_ROWS,
  OVERWORLD_COLUMNS,
  OVERWORLD_ROWS,
  SEED,
  SHOP_CAVES,
  START_SCREEN,
  TREASURE_CAVE,
} from "./world";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAP_ID = "overworld";

interface Glyph {
  ground?: string;
  wall?: string;
  enemy?: string;
  object?: string;
  portal?: "entrance" | "exit";
}

const GLYPHS: Record<string, Glyph> = {
  ".": {},
  ",": { ground: "flowers" },
  ":": { ground: "path" },
  s: { ground: "sand" },
  o: { ground: "stone" },
  m: { ground: "mud" },
  "=": { ground: "bridge" },
  T: { wall: "tree" },
  R: { wall: "rock" },
  W: { wall: "water" },
  B: { wall: "bush" },
  "+": { wall: "tomb" },
  P: { ground: "stone", wall: "pillar" },
  a: { ground: "sand", wall: "cactus" },
  S: { ground: "stone", object: "spawn" },
  $: { object: "chest" },
  C: { ground: "cave", portal: "entrance" },
  D: { ground: "door", portal: "entrance" },
  X: { ground: "caveExit", portal: "exit" },
  _: { ground: "caveFloor" },
  K: { wall: "caveWall" },
  H: { wall: "shelf" },
  Q: { ground: "caveFloor", wall: "counter" },
  V: { ground: "caveFloor", wall: "counter", object: "vendor" },
  ";": { ground: "dungeonFloor" },
  "#": { wall: "dungeonWall" },
  I: { ground: "dungeonFloor", wall: "statue" },
  n: { ground: "arenaSand" },
  l: { ground: "arenaLine" },
  N: { wall: "arenaWall" },
  u: { ground: "arenaSand", wall: "arenaPillar" },
  x: { ground: "arenaSand", object: "arenaSpawn" },
  e: { enemy: "slime" },
  g: { enemy: "goblin" },
  b: { enemy: "bat" },
  k: { enemy: "skeleton" },
  z: { enemy: "scorpion" },
  w: { enemy: "wolf" },
  f: { enemy: "lurker" },
  "1": { enemy: "miniboss" },
  "2": { enemy: "boss" },
};

const GROUND: Record<string, string> = {
  G: "grass",
  F: "darkGrass",
  H: "grass",
  M: "path",
  L: "grass",
  D: "sand",
  W: "darkGrass",
  Y: "darkGrass",
  B: "sand",
  C: "grass",
};

interface Plan {
  name: string;
  ground: string;
  /** Enemy difficulty of the screen. */
  tier: number;
  dungeon?: DungeonDef;
  rows: string[];
}

const COLS = OVERWORLD_COLUMNS;
const ROWS = OVERWORLD_ROWS + INTERIOR_ROWS;
const width = COLS * SCREEN_TILES_X;
const height = ROWS * SCREEN_TILES_Y;
const startRow = Math.max(
  0,
  BIOMES.findIndex((r) => r.includes("C")),
);
const START: [number, number] = [Math.max(0, BIOMES[startRow]?.indexOf("C") ?? 0), startRow];
const errors: string[] = [];
const rng = rngFor(SEED);

// ─── Connections between screens ────────────────────────────────────────────
const conn = new Set<string>();
const edge = (a: [number, number], b: [number, number]) =>
  a[1] < b[1] || (a[1] === b[1] && a[0] < b[0]) ? `${a}|${b}` : `${b}|${a}`;
const connect = (a: [number, number], b: [number, number]) => conn.add(edge(a, b));
const isConnected = (a: [number, number], b: [number, number]) => conn.has(edge(a, b));

// Overworld: a random spanning tree from the start, plus extra links for loops.
{
  const seen = new Set<string>([`${START}`]);
  const stack: [number, number][] = [START];
  while (stack.length > 0) {
    const [c, r] = stack[stack.length - 1] as [number, number];
    const next = (
      [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ] as [number, number][]
    ).filter(([nc, nr]) => nc >= 0 && nr >= 0 && nc < COLS && nr < OVERWORLD_ROWS && !seen.has(`${nc},${nr}`));
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const n = next[Math.floor(rng() * next.length)] as [number, number];
    connect([c, r], n);
    seen.add(`${n}`);
    stack.push(n);
  }
  for (let r = 0; r < OVERWORLD_ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && rng() < 0.3) connect([c, r], [c + 1, r]);
      if (r + 1 < OVERWORLD_ROWS && rng() < 0.3) connect([c, r], [c, r + 1]);
    }
  const [sc, sr] = START;
  for (const n of [
    [sc + 1, sr],
    [sc - 1, sr],
    [sc, sr + 1],
    [sc, sr - 1],
  ] as [number, number][])
    connect(START, n);
}
// Dungeons: their rooms link only among themselves.
for (const d of DUNGEONS) {
  for (const [c1, r1, c2, r2] of dungeonLayout(d.mirror).links)
    connect([d.at[0] + c1, OVERWORLD_ROWS + d.at[1] + r1], [d.at[0] + c2, OVERWORLD_ROWS + d.at[1] + r2]);
}
const openingsOf = (c: number, r: number): Openings => ({
  n: r > 0 && isConnected([c, r], [c, r - 1]),
  s: r + 1 < ROWS && isConnected([c, r], [c, r + 1]),
  w: c > 0 && isConnected([c, r], [c - 1, r]),
  e: c + 1 < COLS && isConnected([c, r], [c + 1, r]),
});

// ─── Screens ────────────────────────────────────────────────────────────────
const plans: Plan[][] = Array.from({ length: ROWS }, () => []);
const solid = Array.from({ length: SCREEN_TILES_Y }, () => "K".repeat(SCREEN_TILES_X));

for (let r = 0; r < OVERWORLD_ROWS; r++)
  for (let c = 0; c < COLS; c++) {
    const biome = (BIOMES[r]?.[c] ?? "G") as Biome;
    const ring = Math.max(Math.abs(c - START[0]), Math.abs(r - START[1]));
    const plan: Plan = { name: `${biome}${c},${r}`, ground: GROUND[biome] ?? "grass", tier: ring, rows: [] };
    if (biome === "C") plan.rows = START_SCREEN;
    else {
      const door = DUNGEONS.some((d) => d.door[0] === c && d.door[1] === r);
      const cave = CAVES.some((k) => k.door[0] === c && k.door[1] === r);
      plan.rows = buildOverworld(rng, {
        biome,
        open: openingsOf(c, r),
        feature: door ? "D" : cave ? "C" : undefined,
        ring,
        chest: rng() < 0.22,
      });
    }
    (plans[r] as Plan[])[c] = plan;
  }
for (let r = OVERWORLD_ROWS; r < ROWS; r++)
  for (let c = 0; c < COLS; c++)
    (plans[r] as Plan[])[c] = { name: "bedrock", ground: "caveFloor", tier: 0, rows: solid };
for (const d of DUNGEONS) {
  const { roles } = dungeonLayout(d.mirror);
  for (const [at, role] of Object.entries(roles)) {
    const [lc, lr] = at.split(",").map(Number) as [number, number];
    const c = d.at[0] + lc;
    const r = OVERWORLD_ROWS + d.at[1] + lr;
    (plans[r] as Plan[])[c] = {
      name: `${d.id} ${role}`,
      ground: "dungeonFloor",
      tier: 3 + d.depth,
      dungeon: d,
      rows: buildDungeonRoom(rng, role, openingsOf(c, r), d),
    };
  }
}
CAVES.forEach((cave, i) => {
  const c = CAVES_AT_COLUMN + (i % 4);
  const r = OVERWORLD_ROWS + Math.floor(i / 4);
  const rows = cave.type === "shop" ? (SHOP_CAVES[i % SHOP_CAVES.length] as string[]) : TREASURE_CAVE;
  (plans[r] as Plan[])[c] = { name: `cave${i}`, ground: "caveFloor", tier: 0, rows };
});

// The arena: one big room split into screens (its inner edges are open, see the edge rules).
const [arenaCols, arenaRows] = ARENA_SCREENS;
const arenaCol = ARENA_AT[0];
const arenaRow = OVERWORLD_ROWS + ARENA_AT[1];
if (ARENA.length !== arenaRows * SCREEN_TILES_Y) errors.push(`arena: ${ARENA.length} rows`);
for (let sr = 0; sr < arenaRows; sr++)
  for (let sc = 0; sc < arenaCols; sc++)
    (plans[arenaRow + sr] as Plan[])[arenaCol + sc] = {
      name: `arena ${sc},${sr}`,
      ground: "arenaSand",
      tier: 0,
      rows: ARENA.slice(sr * SCREEN_TILES_Y, (sr + 1) * SCREEN_TILES_Y).map((line) =>
        line.slice(sc * SCREEN_TILES_X, (sc + 1) * SCREEN_TILES_X),
      ),
    };
const inArena = (x: number, y: number) => {
  const sc = Math.floor(x / SCREEN_TILES_X) - arenaCol;
  const sr = Math.floor(y / SCREEN_TILES_Y) - arenaRow;
  return sc >= 0 && sr >= 0 && sc < arenaCols && sr < arenaRows;
};

// ─── Glyph grid ─────────────────────────────────────────────────────────────
const glyphAt: string[][] = Array.from({ length: height }, () => Array(width).fill("K"));
const planAt = (x: number, y: number) => plans[Math.floor(y / SCREEN_TILES_Y)]?.[Math.floor(x / SCREEN_TILES_X)];
plans.forEach((row, sr) => {
  row.forEach((plan, sc) => {
    if (plan.rows.length !== SCREEN_TILES_Y) errors.push(`${plan.name}: ${plan.rows.length} rows`);
    plan.rows.forEach((line, y) => {
      if (line.length !== SCREEN_TILES_X) errors.push(`${plan.name} row ${y}: ${line.length} columns`);
      [...line].forEach((g, x) => {
        if (!GLYPHS[g]) errors.push(`${plan.name} row ${y}: unknown glyph "${g}"`);
        const out = glyphAt[sr * SCREEN_TILES_Y + y];
        if (out) out[sc * SCREEN_TILES_X + x] = g;
      });
    });
  });
});
const glyph = (x: number, y: number) => GLYPHS[glyphAt[y]?.[x] ?? "K"] ?? {};
const centreOf = (t: number) => t * TILE_SIZE + TILE_SIZE / 2;
const isSolid = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height || Boolean(glyph(x, y).wall);

// ─── Edge rules ─────────────────────────────────────────────────────────────
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const lx = x % SCREEN_TILES_X;
    const ly = y % SCREEN_TILES_Y;
    const outer = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (outer) {
      if (!isSolid(x, y)) errors.push(`world border open at tile (${x}, ${y})`);
      continue;
    }
    const sc = Math.floor(x / SCREEN_TILES_X);
    const sr = Math.floor(y / SCREEN_TILES_Y);
    if (lx === SCREEN_TILES_X - 1 && !(inArena(x, y) && inArena(x + 1, y))) {
      const open = isConnected([sc, sr], [sc + 1, sr]) && ly >= 4 && ly <= 6;
      if (isSolid(x, y) === open || isSolid(x + 1, y) === open)
        errors.push(`edge at tile (${x}|${x + 1}, ${y}) must be ${open ? "open" : "closed"}`);
    }
    if (ly === SCREEN_TILES_Y - 1 && !(inArena(x, y) && inArena(x, y + 1))) {
      const open = isConnected([sc, sr], [sc, sr + 1]) && lx >= 8 && lx <= 11;
      if (isSolid(x, y) === open || isSolid(x, y + 1) === open)
        errors.push(`edge at tile (${x}, ${y}|${y + 1}) must be ${open ? "open" : "closed"}`);
    }
  }

// ─── Portals ────────────────────────────────────────────────────────────────
const findIn = (sc: number, sr: number, g: string): [number, number] | undefined => {
  const rows = plans[sr]?.[sc]?.rows ?? [];
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y]?.indexOf(g) ?? -1;
    if (x >= 0) return [sc * SCREEN_TILES_X + x, sr * SCREEN_TILES_Y + y];
  }
  return undefined;
};
const links: { name: string; entrance?: [number, number]; exit?: [number, number] }[] = [
  ...DUNGEONS.map((d) => {
    const { roles } = dungeonLayout(d.mirror);
    const [lc, lr] = (Object.entries(roles).find(([, role]) => role === "entrance")?.[0] ?? "1,2")
      .split(",")
      .map(Number) as [number, number];
    return {
      name: d.id,
      entrance: findIn(d.door[0], d.door[1], "D"),
      exit: findIn(d.at[0] + lc, OVERWORLD_ROWS + d.at[1] + lr, "X"),
    };
  }),
  ...CAVES.map((cave, i) => ({
    name: `cave${i}`,
    entrance: findIn(cave.door[0], cave.door[1], "C"),
    exit: findIn(CAVES_AT_COLUMN + (i % 4), OVERWORLD_ROWS + Math.floor(i / 4), "X"),
  })),
];
const jumps = new Map<number, [number, number]>();
const dests: { name: string; x: number; y: number }[] = [];
const portals: { name: string; x: number; y: number; target: string }[] = [];
for (const { name, entrance, exit } of links) {
  if (!entrance || !exit) {
    errors.push(`link "${name}" needs an entrance and an exit`);
    continue;
  }
  const inside: [number, number] = [exit[0], exit[1] - 1];
  const outside: [number, number] = [entrance[0], entrance[1] + 1];
  for (const [label, [dx, dy]] of [
    ["inside", inside],
    ["outside", outside],
  ] as const)
    if (isSolid(dx, dy) || glyph(dx, dy).portal)
      errors.push(`link "${name}": ${label} arrival (${dx}, ${dy}) is not floor`);
  jumps.set(entrance[1] * width + entrance[0], inside);
  jumps.set(exit[1] * width + exit[0], outside);
  dests.push({ name: `${name}-in`, x: inside[0], y: inside[1] }, { name: `${name}-out`, x: outside[0], y: outside[1] });
  portals.push(
    { name: `${name}-enter`, x: entrance[0], y: entrance[1], target: `${name}-in` },
    { name: `${name}-leave`, x: exit[0], y: exit[1], target: `${name}-out` },
  );
}
// Every portal glyph must belong to a link.
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++)
    if (glyph(x, y).portal && !jumps.has(y * width + x)) errors.push(`portal at (${x}, ${y}) leads nowhere`);

// ─── Reachability from the spawns (walking and through portals) ─────────────
const seen = new Set<number>();
const queue: [number, number][] = [];
const visit = (x: number, y: number) => {
  const k = y * width + x;
  if (isSolid(x, y) || seen.has(k)) return;
  seen.add(k);
  queue.push([x, y]);
};
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (glyph(x, y).object === "spawn") visit(x, y);
if (queue.length === 0) errors.push("no player spawn (S)");
while (queue.length > 0) {
  const [x, y] = queue.pop() as [number, number];
  const jump = jumps.get(y * width + x);
  if (jump) {
    visit(jump[0], jump[1]);
    continue;
  }
  visit(x + 1, y);
  visit(x - 1, y);
  visit(x, y + 1);
  visit(x, y - 1);
}
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const g = glyph(x, y);
    if (g.object === "vendor") {
      for (let slot = 0; slot < OFFER_SLOTS; slot++) {
        const at = offerPosition({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 }, slot);
        if (!seen.has(Math.floor(at.y / TILE_SIZE) * width + Math.floor(at.x / TILE_SIZE)))
          errors.push(`offer ${slot} of the vendor at (${x}, ${y}) is not reachable`);
      }
    } else if (g.object === "arenaSpawn") {
      if (seen.has(y * width + x)) errors.push(`arena spawn at (${x}, ${y}) can be walked to from the world`);
    } else if ((g.object || g.enemy) && !seen.has(y * width + x))
      errors.push(`"${glyphAt[y]?.[x]}" at tile (${x}, ${y}) is unreachable`);
  }

// ─── The arena: closed off, every spawn reachable from the others ───────────
{
  const spawns: [number, number][] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (glyph(x, y).object === "arenaSpawn") spawns.push([x, y]);
  if (spawns.length < 8) errors.push(`the arena needs at least 8 spawns (x), found ${spawns.length}`);
  for (const [x, y] of spawns) if (!inArena(x, y)) errors.push(`arena spawn at (${x}, ${y}) is outside the arena`);
  const inside = new Set<number>();
  const todo = spawns.slice(0, 1);
  for (const [x, y] of todo) inside.add(y * width + x);
  while (todo.length > 0) {
    const [x, y] = todo.pop() as [number, number];
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as [number, number][]) {
      const k = ny * width + nx;
      if (isSolid(nx, ny) || inside.has(k)) continue;
      if (!inArena(nx, ny)) errors.push(`the arena leaks at tile (${nx}, ${ny})`);
      inside.add(k);
      todo.push([nx, ny]);
    }
  }
  for (const [x, y] of spawns) if (!inside.has(y * width + x)) errors.push(`arena spawn at (${x}, ${y}) is cut off`);
}

// ─── Props: tall grass outside, pots in caves and dungeons ──────────────────
const propRng = rngFor(SEED + 1);
const propAt = new Map<number, PropKind>();
/** Tiles kept clear: around portals, spawns and chests, and the vendors' offers. */
const keepClear = new Set<number>();
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const g = glyph(x, y);
    const around: [number, number][] = [];
    if (g.portal || g.object === "spawn") around.push([x, y]);
    if (g.object === "chest") around.push([x, y]);
    if (g.object === "vendor") {
      around.push([x, y]);
      for (let slot = 0; slot < OFFER_SLOTS; slot++) {
        const at = offerPosition({ x: centreOf(x), y: centreOf(y) }, slot);
        around.push([Math.floor(at.x / TILE_SIZE), Math.floor(at.y / TILE_SIZE)]);
      }
    }
    for (const [cx, cy] of around) {
      const r = g.portal ? 2 : 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) keepClear.add((cy + dy) * width + cx + dx);
    }
  }
/** Walkable, reachable, free tile inside a screen (not on its border nor in front of its openings). */
const propFree = (x: number, y: number) => {
  const k = y * width + x;
  const lx = x % SCREEN_TILES_X;
  const ly = y % SCREEN_TILES_Y;
  if (lx < 1 || ly < 1 || lx > SCREEN_TILES_X - 2 || ly > SCREEN_TILES_Y - 2) return false;
  if ((lx <= 1 || lx >= SCREEN_TILES_X - 2) && ly >= 3 && ly <= 7) return false;
  if ((ly <= 1 || ly >= SCREEN_TILES_Y - 2) && lx >= 7 && lx <= 12) return false;
  const g = glyph(x, y);
  return !isSolid(x, y) && seen.has(k) && !keepClear.has(k) && !propAt.has(k) && !g.enemy && !g.object;
};
const shuffle = <T>(list: T[]): T[] => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(propRng() * (i + 1));
    [list[i], list[j]] = [list[j] as T, list[i] as T];
  }
  return list;
};
const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
// Overworld: one to three clumps of two to four tufts on each grassy screen (not the start square).
for (let sr = 0; sr < OVERWORLD_ROWS; sr++)
  for (let sc = 0; sc < COLS; sc++) {
    const plan = plans[sr]?.[sc];
    if (!plan || plan.rows === START_SCREEN || (plan.ground !== "grass" && plan.ground !== "darkGrass")) continue;
    const open = (x: number, y: number) => {
      const lx = x % SCREEN_TILES_X;
      const ly = y % SCREEN_TILES_Y;
      const g = glyphAt[y]?.[x];
      return (
        lx >= 2 &&
        ly >= 2 &&
        lx <= SCREEN_TILES_X - 3 &&
        ly <= SCREEN_TILES_Y - 3 &&
        (g === "." || g === ",") &&
        propFree(x, y)
      );
    };
    const clumps = 1 + Math.floor(propRng() * 3);
    for (let i = 0; i < clumps; i++) {
      const spots: [number, number][] = [];
      for (let ly = 0; ly < SCREEN_TILES_Y; ly++)
        for (let lx = 0; lx < SCREEN_TILES_X; lx++) {
          const x = sc * SCREEN_TILES_X + lx;
          const y = sr * SCREEN_TILES_Y + ly;
          if (open(x, y)) spots.push([x, y]);
        }
      const centre = spots[Math.floor(propRng() * spots.length)];
      if (!centre) break;
      let left = 2 + Math.floor(propRng() * 3);
      for (const [dx, dy] of [[0, 0] as [number, number], ...shuffle([...NEIGHBOURS])]) {
        const x = centre[0] + dx;
        const y = centre[1] + dy;
        if (left === 0) break;
        if (!open(x, y)) continue;
        propAt.set(y * width + x, "bush");
        left--;
      }
    }
  }
// Caves and dungeon rooms: two to four pots, in the corners first, then along the walls.
for (let sr = OVERWORLD_ROWS; sr < ROWS; sr++)
  for (let sc = 0; sc < COLS; sc++) {
    const plan = plans[sr]?.[sc];
    if (!plan || plan.name === "bedrock" || inArena(sc * SCREEN_TILES_X, sr * SCREEN_TILES_Y)) continue;
    const corners: [number, number][] = [];
    const sides: [number, number][] = [];
    for (let ly = 0; ly < SCREEN_TILES_Y; ly++)
      for (let lx = 0; lx < SCREEN_TILES_X; lx++) {
        const x = sc * SCREEN_TILES_X + lx;
        const y = sr * SCREEN_TILES_Y + ly;
        if (!propFree(x, y)) continue;
        const across = isSolid(x - 1, y) || isSolid(x + 1, y);
        const along = isSolid(x, y - 1) || isSolid(x, y + 1);
        if (across && along) corners.push([x, y]);
        else if (across || along) sides.push([x, y]);
      }
    let left = 2 + Math.floor(propRng() * 3);
    for (const [x, y] of [...shuffle(corners), ...shuffle(sides)]) {
      if (left === 0) break;
      if (!propFree(x, y)) continue;
      propAt.set(y * width + x, "pot");
      left--;
    }
  }
for (const k of propAt.keys()) {
  const x = k % width;
  const y = Math.floor(k / width);
  if (isSolid(x, y) || !seen.has(k) || glyph(x, y).portal)
    errors.push(`prop at tile (${x}, ${y}) is not on free floor`);
}

if (errors.length > 0) {
  console.error(`✗ world layout:\n  - ${errors.slice(0, 40).join("\n  - ")}`);
  process.exit(1);
}

// ─── Layers and objects ─────────────────────────────────────────────────────
const gid = (key: string) => tileId(key) + 1;
const ground: number[] = [];
const walls: number[] = [];
const props: number[] = [];
const objects: unknown[] = [];
let nextObjectId = 1;
const centre = (t: number) => t * TILE_SIZE + TILE_SIZE / 2;
const point = (type: string, name: string, x: number, y: number, properties?: unknown[]) =>
  objects.push({
    id: nextObjectId++,
    name,
    type,
    x: centre(x),
    y: centre(y),
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
    ...(properties ? { properties } : {}),
  });

for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const g = glyph(x, y);
    const plan = planAt(x, y);
    ground.push(gid(g.ground ?? plan?.ground ?? "grass"));
    walls.push(g.wall ? gid(g.wall) : 0);
    const prop = propAt.get(y * width + x);
    props.push(prop === "bush" ? gid("tuft") : prop === "pot" ? gid("pot") : 0);
    if (g.object) point(g.object, "", x, y);
    if (g.enemy) {
      const d = plan?.dungeon;
      const boss = g.enemy === "boss" || g.enemy === "miniboss";
      const kind = g.enemy === "boss" ? d?.boss : g.enemy === "miniboss" ? d?.miniboss : g.enemy;
      const tier = boss && d ? d.depth - 1 : (plan?.tier ?? 0);
      point("enemy", kind ?? "slime", x, y, [
        { name: "kind", type: "string", value: kind ?? "slime" },
        { name: "tier", type: "int", value: tier },
        { name: "dungeon", type: "bool", value: Boolean(d) },
      ]);
    }
  }
for (const d of dests) point("dest", d.name, d.x, d.y);
for (const p of portals)
  objects.push({
    id: nextObjectId++,
    name: p.name,
    type: "portal",
    x: p.x * TILE_SIZE,
    y: p.y * TILE_SIZE,
    width: TILE_SIZE,
    height: TILE_SIZE,
    rotation: 0,
    visible: true,
    properties: [{ name: "target", type: "string", value: p.target }],
  });

const areas = [
  ...DUNGEONS.map((d) => ({
    id: d.id,
    kind: "dungeon",
    col: d.at[0],
    row: OVERWORLD_ROWS + d.at[1],
    width: 3,
    height: 3,
  })),
  ...CAVES.map((_, i) => ({
    id: `cave${i}`,
    kind: "cave",
    col: CAVES_AT_COLUMN + (i % 4),
    row: OVERWORLD_ROWS + Math.floor(i / 4),
    width: 1,
    height: 1,
  })),
  { id: "arena", kind: "arena", col: arenaCol, row: arenaRow, width: arenaCols, height: arenaRows },
];

const tileset = buildTileset();
const tileLayer = (id: number, name: string, data: number[]) => ({
  id,
  name,
  type: "tilelayer",
  x: 0,
  y: 0,
  width,
  height,
  opacity: 1,
  visible: true,
  data,
});

const map = {
  type: "map",
  version: "1.10",
  tiledversion: "1.11.2",
  orientation: "orthogonal",
  renderorder: "right-down",
  infinite: false,
  width,
  height,
  tilewidth: TILE_SIZE,
  tileheight: TILE_SIZE,
  nextlayerid: 5,
  nextobjectid: nextObjectId,
  properties: [
    { name: "overworldColumns", type: "int", value: OVERWORLD_COLUMNS },
    { name: "overworldRows", type: "int", value: OVERWORLD_ROWS },
    { name: "biomes", type: "string", value: BIOMES.join("") },
    { name: "areas", type: "string", value: JSON.stringify(areas) },
  ],
  layers: [
    tileLayer(1, "ground", ground),
    tileLayer(2, "walls", walls),
    tileLayer(4, PROPS_LAYER, props),
    {
      id: 3,
      name: "objects",
      type: "objectgroup",
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      draworder: "topdown",
      objects,
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: "overworld",
      image: "../tilesets/overworld.png",
      imagewidth: tileset.width,
      imageheight: tileset.height,
      tilewidth: TILE_SIZE,
      tileheight: TILE_SIZE,
      margin: MARGIN,
      spacing: SPACING,
      tilecount: TILES.length,
      columns: COLUMNS,
      tiles: TILES.flatMap((t, id) => {
        const properties = [
          ...(t.collides ? [{ name: "collides", type: "bool", value: true }] : []),
          ...(t.prop
            ? [
                { name: "prop", type: "string", value: t.prop.kind },
                { name: "broken", type: "bool", value: t.prop.broken },
              ]
            : []),
        ];
        return properties.length > 0 ? [{ id, properties }] : [];
      }),
    },
  ],
};

writeFileSync(resolve(ROOT, "content/tilesets/overworld.png"), PNG.sync.write(tileset));
// One row of tiles per line keeps diffs readable.
const json = JSON.stringify(map, null, 2).replace(/"data": \[([\d,\s]+)\]/g, (_m, data: string) => {
  const values = data.split(",").map((v) => v.trim());
  const lines: string[] = [];
  for (let i = 0; i < values.length; i += width) lines.push(values.slice(i, i + width).join(","));
  return `"data": [\n${lines.join(",\n")}\n]`;
});
writeFileSync(resolve(ROOT, `content/maps/${MAP_ID}.tmj`), `${json}\n`);
const count = (type: string) => objects.filter((o) => (o as { type: string }).type === type).length;
console.log(
  `✓ content/maps/${MAP_ID}.tmj (${width}x${height} tiles, ${COLS}x${ROWS} screens: ${count("enemy")} enemies, ` +
    `${count("chest")} chests, ${count("vendor")} vendors, ${count("portal")} portals, ${count("arenaSpawn")} arena spawns, ` +
    `${[...propAt.values()].filter((k) => k === "bush").length} tall grass, ${[...propAt.values()].filter((k) => k === "pot").length} pots)`,
);
