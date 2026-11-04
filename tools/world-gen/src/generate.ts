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
import { SCREEN_TILES_X, SCREEN_TILES_Y, TILE_SIZE } from "@game/shared";
import { PNG } from "pngjs";
import { SCREENS } from "./screens";
import { buildTileset, COLUMNS, MARGIN, SPACING, TILES, tileId } from "./tiles";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAP_ID = "overworld";

const GLYPHS: Record<string, { ground?: string; wall?: string; object?: { type: string; kind?: string } }> = {
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
  C: { wall: "cave" },
  D: { ground: "stone", wall: "door" },
  S: { ground: "stone", object: { type: "spawn" } },
  e: { object: { type: "enemy", kind: "slime" } },
  g: { object: { type: "enemy", kind: "goblin" } },
};

const rowsN = SCREENS.length;
const colsN = SCREENS[0]?.length ?? 0;
const width = colsN * SCREEN_TILES_X;
const height = rowsN * SCREEN_TILES_Y;
const errors: string[] = [];

// ─── Parse the screens ──────────────────────────────────────────────────────
const glyphAt: string[][] = Array.from({ length: height }, () => Array(width).fill("R"));
SCREENS.forEach((row, sr) => {
  row.forEach((screen, sc) => {
    if (screen.rows.length !== SCREEN_TILES_Y) errors.push(`${screen.name}: ${screen.rows.length} rows`);
    screen.rows.forEach((line, y) => {
      if (line.length !== SCREEN_TILES_X) errors.push(`${screen.name} row ${y}: ${line.length} columns`);
      [...line].forEach((g, x) => {
        if (!GLYPHS[g]) errors.push(`${screen.name} row ${y}: unknown glyph "${g}"`);
        const gy = sr * SCREEN_TILES_Y + y;
        const gx = sc * SCREEN_TILES_X + x;
        if (glyphAt[gy]) glyphAt[gy][gx] = g;
      });
    });
  });
});

const solid = (x: number, y: number) =>
  x < 0 || y < 0 || x >= width || y >= height || Boolean(GLYPHS[glyphAt[y]?.[x] ?? "R"]?.wall);

// ─── Edge rules ─────────────────────────────────────────────────────────────
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const lx = x % SCREEN_TILES_X;
    const ly = y % SCREEN_TILES_Y;
    const outer = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (outer && !solid(x, y)) errors.push(`world border open at tile (${x}, ${y})`);
    if (!outer && lx === SCREEN_TILES_X - 1) {
      const open = ly >= 4 && ly <= 6;
      if (solid(x, y) === open || solid(x + 1, y) === open)
        errors.push(`vertical screen edge at tile (${x}|${x + 1}, ${y}) must be ${open ? "open" : "closed"}`);
    }
    if (!outer && ly === SCREEN_TILES_Y - 1) {
      const open = lx >= 8 && lx <= 11;
      if (solid(x, y) === open || solid(x, y + 1) === open)
        errors.push(`horizontal screen edge at tile (${x}, ${y}|${y + 1}) must be ${open ? "open" : "closed"}`);
    }
  }
}

// ─── Reachability from the spawns ───────────────────────────────────────────
const seen = new Set<number>();
const queue: [number, number][] = [];
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++)
    if (glyphAt[y]?.[x] === "S") {
      queue.push([x, y]);
      seen.add(y * width + x);
    }
if (queue.length === 0) errors.push("no player spawn (S)");
while (queue.length > 0) {
  const [x, y] = queue.pop() as [number, number];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (solid(nx, ny) || seen.has(ny * width + nx)) continue;
    seen.add(ny * width + nx);
    queue.push([nx, ny]);
  }
}
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const g = glyphAt[y]?.[x] ?? "";
    if (GLYPHS[g]?.object && !seen.has(y * width + x)) errors.push(`"${g}" at tile (${x}, ${y}) is unreachable`);
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
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const screen = SCREENS[Math.floor(y / SCREEN_TILES_Y)]?.[Math.floor(x / SCREEN_TILES_X)];
    const glyph = GLYPHS[glyphAt[y]?.[x] ?? "R"] ?? {};
    ground.push(gid(glyph.ground ?? screen?.ground ?? "grass"));
    walls.push(glyph.wall ? gid(glyph.wall) : 0);
    if (glyph.object) {
      const { type, kind } = glyph.object;
      objects.push({
        id: nextObjectId++,
        name: kind ?? "",
        type,
        x: x * TILE_SIZE + TILE_SIZE / 2,
        y: y * TILE_SIZE + TILE_SIZE / 2,
        width: 0,
        height: 0,
        point: true,
        rotation: 0,
        visible: true,
        ...(kind ? { properties: [{ name: "kind", type: "string", value: kind }] } : {}),
      });
    }
  }
}

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
console.log(`✓ content/maps/${MAP_ID}.tmj (${width}x${height} tiles, ${objects.length} objects)`);
