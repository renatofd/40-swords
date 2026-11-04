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
 *   enemies: e slime  g goblin  b bat  k skeleton  z scorpion  w wolf  f lurker
 *            1 the dungeon's mini-boss   2 the dungeon's boss
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFER_SLOTS, offerPosition, SCREEN_TILES_X, SCREEN_TILES_Y, TILE_SIZE } from "@game/shared";
import { PNG } from "pngjs";
import { buildDungeonRoom, buildOverworld, dungeonLayout, type Openings, rngFor } from "./build";
import { buildTileset, COLUMNS, MARGIN, SPACING, TILES, tileId } from "./tiles";
import {
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
    if (lx === SCREEN_TILES_X - 1) {
      const open = isConnected([sc, sr], [sc + 1, sr]) && ly >= 4 && ly <= 6;
      if (isSolid(x, y) === open || isSolid(x + 1, y) === open)
        errors.push(`edge at tile (${x}|${x + 1}, ${y}) must be ${open ? "open" : "closed"}`);
    }
    if (ly === SCREEN_TILES_Y - 1) {
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
    } else if ((g.object || g.enemy) && !seen.has(y * width + x))
      errors.push(`"${glyphAt[y]?.[x]}" at tile (${x}, ${y}) is unreachable`);
  }

if (errors.length > 0) {
  console.error(`✗ world layout:\n  - ${errors.slice(0, 40).join("\n  - ")}`);
  process.exit(1);
}

// ─── Layers and objects ─────────────────────────────────────────────────────
const gid = (key: string) => tileId(key) + 1;
const ground: number[] = [];
const walls: number[] = [];
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
  nextlayerid: 4,
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
      tiles: TILES.flatMap((t, id) =>
        t.collides ? [{ id, properties: [{ name: "collides", type: "bool", value: true }] }] : [],
      ),
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
    `${count("chest")} chests, ${count("vendor")} vendors, ${count("portal")} portals)`,
);
