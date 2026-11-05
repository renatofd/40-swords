/**
 * Placeholder tileset drawn in code: flat colours and simple shapes, 16x16,
 * extruded (margin 1, spacing 2). Replace content/tilesets/overworld.png with
 * real art keeping the same tile order (or remap the map in Tiled).
 */
import { TILE_SIZE } from "@game/shared";
import { PNG } from "pngjs";

type RGBA = [number, number, number, number];
type Drawer = (x: number, y: number, r: () => number) => RGBA;

const hex = (h: string): RGBA => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
  255,
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const speckle =
  (base: string, a: string, b: string, pa = 0.08, pb = 0.06): Drawer =>
  (_x, _y, r) => {
    const v = r();
    return v < pa ? hex(a) : v < pa + pb ? hex(b) : hex(base);
  };

const grass = speckle("#4f9a3c", "#58a443", "#469036", 0.06, 0.05);
const darkGrass = speckle("#2f6b34", "#357238", "#2a6230", 0.06, 0.05);
const sand = speckle("#d9c27a", "#e6d394", "#c2a961");
const mud = speckle("#5b4a33", "#6d5a3f", "#4a3b28", 0.1, 0.1);
const path = speckle("#b08a57", "#c29c66", "#98744a");

const flowers: Drawer = (x, y, r) => {
  const spots = [
    [3, 3],
    [11, 5],
    [6, 11],
    [13, 13],
  ];
  if (spots.some(([fx, fy]) => fx === x && fy === y)) return hex("#f2d14b");
  if (spots.some(([fx = 0, fy = 0]) => Math.abs(fx - x) + Math.abs(fy - y) === 1)) return hex("#f0f0f8");
  return grass(x, y, r);
};

const stone: Drawer = (x, y, r) => {
  if (x % 8 === 0 || y % 8 === 0) return hex("#7c7c86");
  return r() < 0.1 ? hex("#a3a3ad") : hex("#93939d");
};

const bridge: Drawer = (x, y) => {
  if (x === 0 || x === 15) return hex("#5a3a1e");
  if (y % 4 === 3) return hex("#6b4523");
  return hex("#9a6a3a");
};

const circle = (cx: number, cy: number, rad: number) => (x: number, y: number) =>
  (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad;

const tree: Drawer = (x, y, r) => {
  if (x >= 6 && x <= 9 && y >= 11) return hex("#6b4523");
  if (circle(8, 7, 7)(x, y)) return (x + y) % 5 === 0 ? hex("#2a7a2e") : hex("#1f5e25");
  return darkGrass(x, y, r);
};

const rock: Drawer = (x, y, r) => {
  if (y < 2 || x === 0 || x === 15 || y === 15) return hex("#4a4038");
  return r() < 0.15 ? hex("#8a7a68") : y < 6 ? hex("#7a6a58") : hex("#665848");
};

const water: Drawer = (x, y) => {
  if ((x + y * 2) % 11 === 0 && y % 4 === 1) return hex("#8cc8f0");
  return hex("#2f6fb8");
};

const bush: Drawer = (x, y, r) => {
  if (circle(8, 8.5, 5.5)(x, y)) return (x * y) % 7 === 0 ? hex("#6cc052") : hex("#2f7a2c");
  if (circle(8, 8.5, 7)(x, y)) return hex("#1c4a1c");
  return grass(x, y, r);
};

const tomb: Drawer = (x, y, r) => {
  if (x >= 4 && x <= 11 && y >= 3 && y <= 14) {
    if (y === 3 && (x === 4 || x === 11)) return darkGrass(x, y, r);
    if (x === 7 || x === 8) if (y >= 5 && y <= 10) return hex("#55555f");
    if (y === 7 && x >= 6 && x <= 9) return hex("#55555f");
    return hex("#9a9aa6");
  }
  return darkGrass(x, y, r);
};

const pillar: Drawer = (x, y, r) => {
  if (x >= 4 && x <= 11)
    return x === 4 || x === 11 ? hex("#6e6e78") : y < 3 || y > 12 ? hex("#c8c8d2") : hex("#b0b0bc");
  return stone(x, y, r);
};

const cave: Drawer = (x, y, r) => {
  if (circle(8, 12, 7)(x, y) && y >= 4) return hex("#0d0b0a");
  return rock(x, y, r);
};

const caveFloor: Drawer = speckle("#3a2f28", "#45382f", "#30261f", 0.1, 0.08);

const caveWall: Drawer = (_x, y, r) => {
  if (y > 12) return hex("#1a1412");
  return r() < 0.12 ? hex("#4a3d35") : y < 3 ? hex("#3d322b") : hex("#2e2520");
};

const counter: Drawer = (x, y, r) => {
  if (y < 5) return caveFloor(x, y, r);
  if (y === 5) return hex("#c08a50");
  if (y > 13) return hex("#3a2412");
  return x % 8 === 0 ? hex("#5a3a1e") : hex("#8a5a2e");
};

const caveExit: Drawer = (x, y) => {
  if (x >= 3 && x <= 12) return y < 4 ? hex("#2a201a") : hex("#0a0807");
  return hex("#2e2520");
};

const shelf: Drawer = (x, y, r) => {
  if (x === 1 || x === 14) return hex("#4a2e16");
  if (y === 5 || y === 10 || y === 15) return hex("#6b4523");
  if (x > 1 && x < 14 && y > 1) {
    const jar = (x + Math.floor(y / 5) * 3) % 5;
    if (jar < 2 && y % 5 > 1) return [hex("#7fb0d0"), hex("#d07f7f")][jar] ?? hex("#2e2520");
  }
  return caveWall(x, y, r);
};

const dungeonFloor: Drawer = (x, y, r) => {
  if (x % 8 === 0 || y % 8 === 0) return hex("#2a2733");
  return r() < 0.08 ? hex("#3d3948") : hex("#35313f");
};

const dungeonWall: Drawer = (x, y) => {
  const row = Math.floor(y / 4);
  const offset = row % 2 === 0 ? 0 : 4;
  if (y % 4 === 3 || (x + offset) % 8 === 7) return hex("#14121a");
  return y < 4 ? hex("#4a4558") : hex("#3a3546");
};

const statue: Drawer = (x, y, r) => {
  if (x >= 3 && x <= 12 && y >= 1) {
    if (y > 12) return hex("#5a5566");
    if (x === 3 || x === 12) return hex("#4a4558");
    return y < 6 ? hex("#8a8598") : hex("#6e6a7c");
  }
  return dungeonFloor(x, y, r);
};

const cactus: Drawer = (x, y, r) => {
  const trunk = x >= 6 && x <= 9 && y >= 2;
  const leftArm = x >= 2 && x <= 4 && y >= 5 && y <= 9;
  const rightArm = x >= 11 && x <= 13 && y >= 3 && y <= 7;
  const joints = (y === 9 && x >= 2 && x <= 6) || (y === 7 && x >= 9 && x <= 13);
  if (trunk || leftArm || rightArm || joints) return (x + y) % 4 === 0 ? hex("#3e8a3a") : hex("#2f6e2c");
  return sand(x, y, r);
};

const door: Drawer = (x, y) => {
  if (x >= 3 && x <= 12 && y >= 4) return x === 3 || x === 12 || y === 4 ? hex("#3a2a1a") : hex("#120e0c");
  return hex("#77777f");
};

const arenaSand = speckle("#d8b07a", "#e2bd88", "#c79f69", 0.1, 0.08);
const arenaLine = speckle("#ecd9ae", "#f4e4c0", "#dcc394", 0.1, 0.08);

const arenaPillar: Drawer = (x, y, r) => (x >= 4 && x <= 11 ? pillar(x, y, r) : arenaSand(x, y, r));

const arenaWall: Drawer = (x, y) => {
  const row = Math.floor(y / 4);
  const offset = row % 2 === 0 ? 0 : 5;
  if (y % 4 === 3 || (x + offset) % 10 === 9) return hex("#3a2a20");
  return y < 4 ? hex("#a07a5a") : hex("#86644a");
};

export interface TileInfo {
  key: string;
  draw: Drawer;
  collides: boolean;
}

/** Tile order in the tileset image (tile id = index). Append new tiles at the end. */
export const TILES: TileInfo[] = [
  { key: "grass", draw: grass, collides: false },
  { key: "flowers", draw: flowers, collides: false },
  { key: "path", draw: path, collides: false },
  { key: "sand", draw: sand, collides: false },
  { key: "stone", draw: stone, collides: false },
  { key: "mud", draw: mud, collides: false },
  { key: "darkGrass", draw: darkGrass, collides: false },
  { key: "bridge", draw: bridge, collides: false },
  { key: "tree", draw: tree, collides: true },
  { key: "rock", draw: rock, collides: true },
  { key: "water", draw: water, collides: true },
  { key: "bush", draw: bush, collides: true },
  { key: "tomb", draw: tomb, collides: true },
  { key: "pillar", draw: pillar, collides: true },
  // Cave entrances and dungeon doors are portals: walk in.
  { key: "cave", draw: cave, collides: false },
  { key: "door", draw: door, collides: false },
  { key: "caveFloor", draw: caveFloor, collides: false },
  { key: "caveWall", draw: caveWall, collides: true },
  { key: "counter", draw: counter, collides: true },
  { key: "caveExit", draw: caveExit, collides: false },
  { key: "shelf", draw: shelf, collides: true },
  { key: "dungeonFloor", draw: dungeonFloor, collides: false },
  { key: "dungeonWall", draw: dungeonWall, collides: true },
  { key: "statue", draw: statue, collides: true },
  { key: "cactus", draw: cactus, collides: true },
  { key: "arenaSand", draw: arenaSand, collides: false },
  { key: "arenaLine", draw: arenaLine, collides: false },
  { key: "arenaWall", draw: arenaWall, collides: true },
  { key: "arenaPillar", draw: arenaPillar, collides: true },
];

export const tileId = (key: string): number => {
  const i = TILES.findIndex((t) => t.key === key);
  if (i < 0) throw new Error(`unknown tile ${key}`);
  return i;
};

export const COLUMNS = 8;
export const MARGIN = 1;
export const SPACING = 2;

function setPx(png: PNG, x: number, y: number, c: RGBA) {
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function getPx(png: PNG, x: number, y: number): RGBA {
  const i = (png.width * y + x) << 2;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0, png.data[i + 3] ?? 0];
}

export function buildTileset(): PNG {
  const rows = Math.ceil(TILES.length / COLUMNS);
  const width = MARGIN * 2 + COLUMNS * TILE_SIZE + (COLUMNS - 1) * SPACING;
  const height = MARGIN * 2 + rows * TILE_SIZE + (rows - 1) * SPACING;
  const png = new PNG({ width, height });
  TILES.forEach((tile, i) => {
    const ox = MARGIN + (i % COLUMNS) * (TILE_SIZE + SPACING);
    const oy = MARGIN + Math.floor(i / COLUMNS) * (TILE_SIZE + SPACING);
    const r = rng(1000 + i);
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) setPx(png, ox + x, oy + y, tile.draw(x, y, r));
    // Extrude each edge 1px outward to avoid seams between tiles.
    for (let k = -1; k <= TILE_SIZE; k++) {
      const kk = Math.min(TILE_SIZE - 1, Math.max(0, k));
      setPx(png, ox + k, oy - 1, getPx(png, ox + kk, oy));
      setPx(png, ox + k, oy + TILE_SIZE, getPx(png, ox + kk, oy + TILE_SIZE - 1));
      setPx(png, ox - 1, oy + k, getPx(png, ox, oy + kk));
      setPx(png, ox + TILE_SIZE, oy + k, getPx(png, ox + TILE_SIZE - 1, oy + kk));
    }
  });
  return png;
}
