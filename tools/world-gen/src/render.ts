/**
 * Renders the generated map (content/maps/<map>.tmj + its tilesets) to PNGs,
 * for reviewing the world without running the game. Tile layers are drawn in
 * map order with "above" last, animated tiles at frame 0, flips honoured.
 *
 *   pnpm --filter @tools/world-gen render -- [--out <dir>] [--grid] [--map overworld]
 *       [--screen c,r]... [--scale 3] [--no-above]
 *
 * Writes into <dir> (default: <os temp dir>/40-swords-render; a relative --out is taken from
 * tools/world-gen, the directory pnpm runs the script in):
 *   overworld.png       the overworld screens at 1x (--grid: a thin line between screens)
 *   interior.png        the whole interior band at 1x
 *   area-<id>.png       each dungeon, cave and the arena at 1x
 *   screen-<c>-<r>.png  each --screen at --scale (default 3)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCREEN_W = 20;
const SCREEN_H = 11;
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;

interface Args {
  out: string;
  map: string;
  grid: boolean;
  above: boolean;
  screens: [number, number][];
  scale: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    // Outside the repo by default, so renders never end up in a commit.
    out: resolve(tmpdir(), "40-swords-render"),
    map: "overworld",
    grid: false,
    above: true,
    screens: [],
    scale: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? "";
    if (a === "--out") args.out = resolve(process.cwd(), next());
    else if (a === "--map") args.map = next();
    else if (a === "--grid") args.grid = true;
    else if (a === "--no-above") args.above = false;
    else if (a === "--scale") args.scale = Math.max(1, Number(next()) || 1);
    else if (a === "--screen") {
      const [c, r] = next().split(",").map(Number);
      if (Number.isInteger(c) && Number.isInteger(r)) args.screens.push([c as number, r as number]);
      else throw new Error("--screen takes c,r (screen column and row)");
    } else if (a === "--help" || a === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else if (a !== "--") throw new Error(`unknown argument ${a}`);
  }
  return args;
}

interface Tileset {
  firstgid: number;
  columns: number;
  margin: number;
  spacing: number;
  tilewidth: number;
  tileheight: number;
  png: PNG;
}

interface Map {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  properties?: { name: string; value: unknown }[];
  layers: { type: string; name: string; data?: number[]; visible?: boolean }[];
  tilesets: {
    firstgid: number;
    image: string;
    columns: number;
    margin?: number;
    spacing?: number;
    tilewidth: number;
    tileheight: number;
  }[];
}

/** Composes the map once at 1x; crops come out of it. */
function compose(map: Map, mapPath: string, above: boolean): PNG {
  const tilesets: Tileset[] = map.tilesets
    .map((ts) => ({
      firstgid: ts.firstgid,
      columns: ts.columns,
      margin: ts.margin ?? 0,
      spacing: ts.spacing ?? 0,
      tilewidth: ts.tilewidth,
      tileheight: ts.tileheight,
      png: PNG.sync.read(readFileSync(resolve(dirname(mapPath), ts.image))),
    }))
    .sort((a, b) => b.firstgid - a.firstgid);
  const tw = map.tilewidth;
  const th = map.tileheight;
  const out = new PNG({ width: map.width * tw, height: map.height * th });
  out.data.fill(0);
  const layers = map.layers.filter((l) => l.type === "tilelayer" && l.visible !== false && Array.isArray(l.data));
  const ordered = [
    ...layers.filter((l) => l.name !== "above"),
    ...(above ? layers.filter((l) => l.name === "above") : []),
  ];
  for (const layer of ordered)
    (layer.data ?? []).forEach((raw, i) => {
      if (!raw) return;
      const gid = raw & 0x1fffffff;
      const ts = tilesets.find((t) => gid >= t.firstgid);
      if (!ts) return;
      const id = gid - ts.firstgid;
      const sx0 = ts.margin + (id % ts.columns) * (ts.tilewidth + ts.spacing);
      const sy0 = ts.margin + Math.floor(id / ts.columns) * (ts.tileheight + ts.spacing);
      const dx0 = (i % map.width) * tw;
      const dy0 = Math.floor(i / map.width) * th;
      for (let y = 0; y < th; y++)
        for (let x = 0; x < tw; x++) {
          let u = x;
          let v = y;
          if (raw & FLIP_D) [u, v] = [v, u];
          if (raw & FLIP_H) u = tw - 1 - u;
          if (raw & FLIP_V) v = th - 1 - v;
          const si = ((sy0 + v) * ts.png.width + sx0 + u) * 4;
          const a = (ts.png.data[si + 3] ?? 0) / 255;
          if (a === 0) continue;
          const di = ((dy0 + y) * out.width + dx0 + x) * 4;
          const b = (out.data[di + 3] ?? 0) / 255;
          const oa = a + b * (1 - a);
          for (let c = 0; c < 3; c++)
            out.data[di + c] = Math.round(
              ((ts.png.data[si + c] ?? 0) * a + (out.data[di + c] ?? 0) * b * (1 - a)) / oa,
            );
          out.data[di + 3] = Math.round(oa * 255);
        }
    });
  return out;
}

/** A pixel rectangle of `src`, scaled up (nearest) and with optional screen grid lines. */
function crop(src: PNG, x0: number, y0: number, w: number, h: number, scale: number, grid?: [number, number]): PNG {
  const out = new PNG({ width: w * scale, height: h * scale });
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const sx = x0 + Math.floor(x / scale);
      const sy = y0 + Math.floor(y / scale);
      const si = (sy * src.width + sx) * 4;
      const di = (y * out.width + x) * 4;
      const lineX = grid && (sx - x0) % grid[0] === 0 && sx > x0 && x % scale === 0;
      const lineY = grid && (sy - y0) % grid[1] === 0 && sy > y0 && y % scale === 0;
      if (lineX || lineY) {
        out.data[di] = 20;
        out.data[di + 1] = 20;
        out.data[di + 2] = 28;
        out.data[di + 3] = 255;
        continue;
      }
      const a = src.data[si + 3] ?? 0;
      // Holes (no ground) show magenta: they would be black in the game.
      out.data[di] = a ? (src.data[si] ?? 0) : 255;
      out.data[di + 1] = a ? (src.data[si + 1] ?? 0) : 0;
      out.data[di + 2] = a ? (src.data[si + 2] ?? 0) : 255;
      out.data[di + 3] = 255;
    }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const mapPath = resolve(ROOT, `content/maps/${args.map}.tmj`);
const map = JSON.parse(readFileSync(mapPath, "utf8")) as Map;
const prop = (name: string) => map.properties?.find((p) => p.name === name)?.value;
const owCols = Number(prop("overworldColumns") ?? map.width / SCREEN_W);
const owRows = Number(prop("overworldRows") ?? map.height / SCREEN_H);
const sw = SCREEN_W * map.tilewidth;
const sh = SCREEN_H * map.tileheight;
const world = compose(map, mapPath, args.above);
mkdirSync(args.out, { recursive: true });
const grid: [number, number] | undefined = args.grid ? [sw, sh] : undefined;
const write = (name: string, png: PNG) => {
  writeFileSync(resolve(args.out, name), PNG.sync.write(png));
  console.log(`✓ ${resolve(args.out, name)} (${png.width}x${png.height})`);
};

write("overworld.png", crop(world, 0, 0, owCols * sw, owRows * sh, 1, grid));
if (map.height > owRows * SCREEN_H)
  write("interior.png", crop(world, 0, owRows * sh, map.width * map.tilewidth, world.height - owRows * sh, 1, grid));
const areas = JSON.parse(String(prop("areas") ?? "[]")) as {
  id: string;
  col: number;
  row: number;
  width: number;
  height: number;
}[];
for (const a of areas)
  write(`area-${a.id}.png`, crop(world, a.col * sw, a.row * sh, a.width * sw, a.height * sh, 1, grid));
for (const [c, r] of args.screens) {
  if (c < 0 || r < 0 || (c + 1) * sw > world.width || (r + 1) * sh > world.height)
    throw new Error(`--screen ${c},${r} is outside the map (${world.width / sw}x${world.height / sh} screens)`);
  write(`screen-${c}-${r}.png`, crop(world, c * sw, r * sh, sw, sh, args.scale));
}
