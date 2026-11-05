/**
 * Writes content/tilesets/overworld.png and content/maps/overworld.tmj from
 * screens.ts, after checking the layout (edges line up, everything reachable).
 *
 *   pnpm --filter @tools/world-gen generate
 *
 * After generating, the map can be edited directly in Tiled; regenerate only
 * if you keep editing the ASCII screens instead.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFER_SLOTS, offerPosition, SCREEN_TILES_X, SCREEN_TILES_Y, TILE_SIZE } from "@game/shared";
import { PNG } from "pngjs";
import { SCREENS, type ScreenDef } from "./screens";
import { buildTileset, COLUMNS, MARGIN, SPACING, TILES, tileId } from "./tiles";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAP_ID = "overworld";

interface Glyph {
  ground?: string;
  wall?: string;
  object?: { type: string; kind?: string };
  /** Portal glyph: its screen's `links` names where it leads. */
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
  D: { ground: "stone", wall: "door" },
  S: { ground: "stone", object: { type: "spawn" } },
  e: { object: { type: "enemy", kind: "slime" } },
  g: { object: { type: "enemy", kind: "goblin" } },
  $: { object: { type: "chest" } },
  C: { ground: "cave", portal: "entrance" },
  _: { ground: "caveFloor" },
  K: { wall: "caveWall" },
  H: { wall: "shelf" },
  Q: { ground: "caveFloor", wall: "counter" },
  V: { ground: "caveFloor", wall: "counter", object: { type: "vendor" } },
  X: { ground: "caveExit", portal: "exit" },
};

const rowsN = SCREENS.length;
const colsN = SCREENS[0]?.length ?? 0;
const width = colsN * SCREEN_TILES_X;
const height = rowsN * SCREEN_TILES_Y;
const errors: string[] = [];

// ─── Parse the screens ──────────────────────────────────────────────────────
const glyphAt: string[][] = Array.from({ length: height }, () => Array(width).fill("R"));
const screenAt = (x: number, y: number): ScreenDef | undefined =>
  SCREENS[Math.floor(y / SCREEN_TILES_Y)]?.[Math.floor(x / SCREEN_TILES_X)];

SCREENS.forEach((row, sr) => {
  if (row.length !== colsN) errors.push(`screen row ${sr} has ${row.length} screens, expected ${colsN}`);
  row.forEach((screen, sc) => {
    if (screen.rows.length !== SCREEN_TILES_Y) errors.push(`${screen.name}: ${screen.rows.length} rows`);
    screen.rows.forEach((line, y) => {
      if (line.length !== SCREEN_TILES_X) errors.push(`${screen.name} row ${y}: ${line.length} columns`);
      [...line].forEach((g, x) => {
        if (!GLYPHS[g]) errors.push(`${screen.name} row ${y}: unknown glyph "${g}"`);
        const row = glyphAt[sr * SCREEN_TILES_Y + y];
        if (row) row[sc * SCREEN_TILES_X + x] = g;
      });
    });
  });
});

const glyph = (x: number, y: number) => GLYPHS[glyphAt[y]?.[x] ?? "R"] ?? {};
const solid = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height || Boolean(glyph(x, y).wall);

// ─── Edge rules ─────────────────────────────────────────────────────────────
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const lx = x % SCREEN_TILES_X;
    const ly = y % SCREEN_TILES_Y;
    const outer = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (outer && !solid(x, y)) errors.push(`world border open at tile (${x}, ${y})`);
    if (outer) continue;
    const here = screenAt(x, y);
    if (lx === SCREEN_TILES_X - 1) {
      const both = !here?.interior && !screenAt(x + 1, y)?.interior;
      const open = both && ly >= 4 && ly <= 6;
      if (solid(x, y) === open || solid(x + 1, y) === open)
        errors.push(`vertical screen edge at tile (${x}|${x + 1}, ${y}) must be ${open ? "open" : "closed"}`);
    }
    if (ly === SCREEN_TILES_Y - 1) {
      const both = !here?.interior && !screenAt(x, y + 1)?.interior;
      const open = both && lx >= 8 && lx <= 11;
      if (solid(x, y) === open || solid(x, y + 1) === open)
        errors.push(`horizontal screen edge at tile (${x}, ${y}|${y + 1}) must be ${open ? "open" : "closed"}`);
    }
  }
}

// ─── Portals: each link joins one cave entrance "C" and one cave exit "X" ────
interface Link {
  entrance?: [number, number];
  exit?: [number, number];
}
const links = new Map<string, Link>();
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const g = glyphAt[y]?.[x] ?? "";
    const kind = GLYPHS[g]?.portal;
    if (!kind) continue;
    const name = screenAt(x, y)?.links?.[g];
    if (!name) {
      errors.push(`"${g}" at tile (${x}, ${y}) has no link in its screen's \`links\``);
      continue;
    }
    const link = links.get(name) ?? {};
    if (link[kind]) errors.push(`link "${name}" has more than one ${kind}`);
    link[kind] = [x, y];
    links.set(name, link);
  }
/** Portal tile → where it puts the hero (below an entrance when leaving, above an exit when entering). */
const jumps = new Map<number, [number, number]>();
const dests: { name: string; x: number; y: number }[] = [];
const portals: { name: string; x: number; y: number; target: string }[] = [];
for (const [name, { entrance, exit }] of links) {
  if (!entrance || !exit) {
    errors.push(`link "${name}" needs both a "C" entrance and an "X" exit`);
    continue;
  }
  const inside: [number, number] = [exit[0], exit[1] - 1];
  const outside: [number, number] = [entrance[0], entrance[1] + 1];
  for (const [label, [dx, dy]] of [
    ["inside", inside],
    ["outside", outside],
  ] as const)
    if (solid(dx, dy) || GLYPHS[glyphAt[dy]?.[dx] ?? ""]?.portal)
      errors.push(`link "${name}": the ${label} arrival tile (${dx}, ${dy}) must be open floor`);
  jumps.set(entrance[1] * width + entrance[0], inside);
  jumps.set(exit[1] * width + exit[0], outside);
  dests.push({ name: `${name}-in`, x: inside[0], y: inside[1] }, { name: `${name}-out`, x: outside[0], y: outside[1] });
  portals.push(
    { name: `${name}-enter`, x: entrance[0], y: entrance[1], target: `${name}-in` },
    { name: `${name}-leave`, x: exit[0], y: exit[1], target: `${name}-out` },
  );
}

// ─── Reachability from the spawns (walking and through portals) ─────────────
const seen = new Set<number>();
const queue: [number, number][] = [];
const visit = (x: number, y: number) => {
  const key = y * width + x;
  if (solid(x, y) || seen.has(key)) return;
  seen.add(key);
  queue.push([x, y]);
};
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (glyphAt[y]?.[x] === "S") visit(x, y);
if (queue.length === 0) errors.push("no player spawn (S)");
while (queue.length > 0) {
  const [x, y] = queue.pop() as [number, number];
  const jump = jumps.get(y * width + x);
  if (jump) {
    visit(jump[0], jump[1]);
    continue; // stepping on a portal always moves you
  }
  visit(x + 1, y);
  visit(x - 1, y);
  visit(x, y + 1);
  visit(x, y - 1);
}
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const g = glyphAt[y]?.[x] ?? "";
    const object = GLYPHS[g]?.object;
    if (!object) continue;
    if (object.type === "vendor") {
      // The vendor stands behind a counter; its offers must be reachable floor.
      for (let slot = 0; slot < OFFER_SLOTS; slot++) {
        const at = offerPosition({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 }, slot);
        const tx = Math.floor(at.x / TILE_SIZE);
        const ty = Math.floor(at.y / TILE_SIZE);
        if (!seen.has(ty * width + tx)) errors.push(`offer ${slot} of the vendor at (${x}, ${y}) is not reachable`);
      }
    } else if (!seen.has(y * width + x)) errors.push(`"${g}" at tile (${x}, ${y}) is unreachable`);
  }

if (errors.length > 0) {
  console.error(`✗ overworld layout:\n  - ${errors.join("\n  - ")}`);
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

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const g = glyph(x, y);
    ground.push(gid(g.ground ?? screenAt(x, y)?.ground ?? "grass"));
    walls.push(g.wall ? gid(g.wall) : 0);
    if (!g.object) continue;
    const { type, kind } = g.object;
    point(type, kind ?? "", x, y, kind ? [{ name: "kind", type: "string", value: kind }] : undefined);
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
    { name: "screenColumns", type: "int", value: colsN },
    { name: "screenRows", type: "int", value: rowsN },
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
  `✓ content/maps/${MAP_ID}.tmj (${width}x${height} tiles: ${count("enemy")} enemies, ${count("chest")} chests, ` +
    `${count("vendor")} vendors, ${count("portal")} portals)`,
);
