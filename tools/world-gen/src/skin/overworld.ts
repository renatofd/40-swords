/**
 * Skin of the overworld screens (16x8).
 *
 * - Ground per biome (light or dark grass with swaying tufts, sand, mud),
 *   sand paths with dithered edges, flowers and leaf litter.
 * - Water with rims on the water cells and speckled halos on the land around
 *   (grass, sand or mud palette), bridges, jetties, islands and waterfalls.
 * - Wall rectangles from the layout (overworld.ts shapes): the cliff band for
 *   rocks, the dense forest checkerboard, rows of pines. They are drawn in
 *   order from north to south, each one over the ones behind it, so piles of
 *   rectangles read as one rock mass or forest.
 * - Loose solids (small trees, boulders, bushes, tombstones) and multi-cell
 *   landmarks (entrances, houses, statues...) on top.
 *
 * Palettes per biome come from the pack's colour variants (see PALETTES).
 */

import type { Landmark, Shape } from "../overworld";
import {
  BOULDERS,
  CLIFF,
  FLOWERS,
  GRASS_TONES,
  HALO,
  HEADSTONES,
  plain,
  recolored,
  type Shore,
  SMALL_TREES,
  specks,
  stacked,
  TALL_GRASS,
  tiles,
} from "../tiles";
import { blob, E, mask4, mask8, N, noise, patch, S, type SkinLayers, variant, W, type WorldView } from "./common";

/** Column offsets of the colour variants of the tree/rock rows (10-34): A green, B birch, C orange, D red, E dark, F blue. */
const V = { A: 0, B: 9, C: 18, D: 27, E: 36, F: 45 } as const;

interface Palette {
  ground: "grass" | "darkGrass" | "forest" | "swamp" | "sand" | "mud" | "gloom";
  /** Variant of the trees, forests and pines. */
  tree: number;
  /** Variant of the cliff band and boulders. */
  rock: number;
  /** Variant of the graves and temples (rows 36-47: A green/cream, +18 red/grey, +36 teal/dark). */
  stone: number;
  /** Variant of the houses (rows 49-56, every 9 columns). */
  roof: number[];
  shore: Shore;
  /** Leaf litter on the ground (dead forest rows 19-20) and its share of the ground cells. */
  litter?: number;
  litterRate?: number;
  /** Share of ground cells with swaying tufts (specks on mud and gloom). */
  tufts: number;
  /** Look of the tall grass (tiles.ts TALL_GRASS_LOOKS), green by default. */
  tallGrass?: "olive";
}

const PALETTES: Record<string, Palette> = {
  M: { ground: "mud", tree: V.C, rock: V.C, stone: 18, roof: [0], shore: "mud", tufts: 0.1 },
  G: { ground: "grass", tree: V.A, rock: V.A, stone: 0, roof: [V.A, V.C, V.E], shore: "grass", tufts: 0.12 },
  L: { ground: "grass", tree: V.A, rock: V.A, stone: 0, roof: [V.A, V.E], shore: "grass", tufts: 0.12 },
  C: { ground: "grass", tree: V.A, rock: V.A, stone: 0, roof: [V.A], shore: "grass", tufts: 0.08 },
  H: { ground: "grass", tree: V.C, rock: V.C, stone: 0, roof: [V.B, V.C], shore: "grass", tufts: 0.08 },
  F: { ground: "forest", tree: V.A, rock: V.E, stone: 0, roof: [V.A], shore: "forest", tufts: 0.22 },
  R: { ground: "grass", tree: V.D, rock: V.D, stone: 18, roof: [V.D], shore: "grass", litter: V.D, tufts: 0.04 },
  W: { ground: "swamp", tree: V.E, rock: V.E, stone: 36, roof: [V.E], shore: "swamp", tufts: 0.18 },
  Y: {
    ground: "gloom",
    tree: V.E,
    rock: V.E,
    stone: 18,
    roof: [V.D],
    shore: "grass",
    litterRate: 0.04,
    tufts: 0.08,
    tallGrass: "olive",
  },
  B: { ground: "sand", tree: V.A, rock: V.E, stone: 18, roof: [V.F], shore: "sand", tufts: 0 },
};

/** Ground key of each palette ground. */
const GROUND: Record<Palette["ground"], string> = {
  grass: "grass",
  darkGrass: "darkGrass",
  forest: "forest",
  swamp: "swamp",
  sand: "sand",
  mud: "mud",
  gloom: "gloom",
};
/** Grounds with a ":tufts" twin (tiles.ts). */
const TUFTED = new Set(["grass", "darkGrass", "forest", "swamp", "mud", "gloom"]);
/** Main colour of each ground (0xRRGGBB), for the specks that soften the edges between grounds. */
const GROUND_COLOR: Record<Palette["ground"] | "path", number> = {
  grass: 0xbeeb71,
  darkGrass: 0x8cd612,
  forest: GRASS_TONES.forest.base,
  swamp: GRASS_TONES.swamp.base,
  sand: 0xfff0a0,
  path: 0xfff0a0,
  mud: 0x5c3c0d,
  gloom: 0x71a6a1,
};

// ─── Shapes ─────────────────────────────────────────────────────────────────

/** Interior of a cliff mass: the plain pieces only (2113-2115 hold darker recesses). */
const CLIFF_INSIDE = [2049, 2050, 2051] as const;

/**
 * Cliff band id of a rock cell from the band around it (`m`: N/E/S/W bits of
 * the neighbours that are band too): edges and corners only where the mass ends.
 */
function rockId(m: number, seed: number, x: number, y: number): number {
  const open = (bit: number) => (m & bit) === 0;
  const v = open(N) ? "n" : open(S) ? "s" : "";
  const h = open(W) ? "w" : open(E) ? "e" : "";
  const role = (v + h || "mid") as keyof typeof CLIFF;
  const ids = role === "mid" ? CLIFF_INSIDE : CLIFF[role];
  return typeof ids === "number" ? ids : variant(ids as readonly number[], seed, x, y, 11);
}

/** Dense forest: canopy row (642/643), checkerboard (709/773), trunks and shadow at the bottom (706/707). */
function forestId(r: Shape, x: number, y: number): number {
  const dx = x - r.x;
  const dy = y - r.y;
  const top = (d: number) => (d % 2 === 0 ? 642 : 643);
  const mid = (d: number, row: number) => ((d + row) % 2 === 1 ? 709 : 773);
  if (dy === 0) return top(dx);
  if (dy < r.h - 1) return mid(dx, dy);
  // Bottom: the trunk under the tree above.
  const above = r.h === 2 ? top(dx) : mid(dx, r.h - 2);
  return above === 642 || above === 773 ? 706 : 707;
}

// ─── Landmarks ──────────────────────────────────────────────────────────────

const rowsFrom = (first: number[], w: number) => first.map((id) => Array.from({ length: w }, (_, i) => id + i));
/** The same art with one id swapped (a window where the pack draws a door). */
const swap = (rows: number[][], from: number, to: number) => rows.map((r) => r.map((id) => (id === from ? to : id)));
/**
 * Art of each landmark, row by row (ids before the palette offset), the door id
 * (walkable) and, for some, a second look picked per landmark.
 */
const ART: Record<
  string,
  {
    rows: number[][];
    alt?: number[][];
    door?: number;
    offset: (p: Palette, seed: number) => number;
    /** Colour swaps of the art (the offset is not used then). */
    recolor?: (p: Palette) => [number, number][] | undefined;
  }
> = {
  hollowTree: { rows: rowsFrom([1221, 1285], 3), door: 1286, offset: (p) => (p.tree === V.D ? V.D : V.B) },
  crypt: { rows: rowsFrom([2890, 2954], 3), door: 2955, offset: (p) => p.stone },
  skull: { rows: rowsFrom([2887, 2951], 3), door: 2952, offset: (p) => p.stone },
  shrine: { rows: rowsFrom([2304, 2368, 2432, 2496], 3), door: 2497, offset: () => 36 },
  temple: { rows: rowsFrom([2307, 2371], 7), door: 2374, offset: () => 18 },
  // Houses and huts cannot be entered: a window where the pack draws their door.
  house: {
    rows: swap(rowsFrom([3139, 3203, 3267, 3331, 3395], 5), 3397, 3396),
    offset: (p, s) => variant(p.roof, s, 0, 0, 40),
  },
  hut: {
    rows: swap(rowsFrom([3392, 3456, 3520, 3584], 3), 3585, 3584),
    offset: (p, s) => variant(p.roof, s, 0, 0, 41),
  },
  statue: { rows: rowsFrom([2319, 2383], 2), offset: () => 0 },
  well: { rows: [[2315]], offset: () => 0 },
  reeds: { rows: [[1732], [1796], [1860]], offset: () => 0, recolor: () => CATTAIL },
  // Mountain features: a crag (two looks), a bit of ruined brick wall, a pile of stones.
  crag: {
    rows: [
      [1990, 1991],
      [2054, 2055],
    ],
    alt: [
      [2118, 2119],
      [2182, 2183],
    ],
    offset: (p) => p.rock,
  },
  // A stub of wall: slab cap over brick on top, the shaded brick foot below (one top cell may be rubble).
  ruin: {
    rows: [
      [1670, 1670],
      [1862, 1862],
    ],
    offset: (p) => p.rock,
  },
  stones: { rows: [[3715]], offset: () => 0, recolor: (p) => (p.rock === V.C ? STONE_PILE_ROCK : undefined) },
};
/** Ground ranks for the specks between biomes: the lower one gets the specks of the other. */
const RECEIVES: Palette["ground"][] = ["grass", "sand", "darkGrass", "forest", "swamp", "gloom", "mud"];

export function skinOverworld(view: WorldView, out: SkinLayers) {
  const { seed, width } = view;
  const height = view.overworldRows * view.screenH;
  const biomeAt = (x: number, y: number) => view.screen(x, y)?.biome ?? "G";
  const pal = (x: number, y: number) => PALETTES[biomeAt(x, y)] ?? (PALETTES.G as Palette);
  const g = (x: number, y: number) => view.glyph(x, y);
  const inWorld = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  // Outside the world copies the nearest cell: land at the edge gets no shore, the sea no rim.
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  const isWater = (x: number, y: number) => {
    const c = g(clamp(x, width), clamp(y, height));
    return c === "W" || c === "=";
  };
  const sameScreen = (ax: number, ay: number, bx: number, by: number) =>
    Math.floor(ax / view.screenW) === Math.floor(bx / view.screenW) &&
    Math.floor(ay / view.screenH) === Math.floor(by / view.screenH);

  /** What the walls layer of each cell stacks, bottom → top. */
  const stacks = new Map<number, string[]>();
  const push = (x: number, y: number, k: string) => {
    const i = y * width + x;
    const list = stacks.get(i) ?? [];
    list.push(k);
    stacks.set(i, list);
  };
  const covered = new Set<number>();
  const landmarkCells = new Map<number, Landmark>();
  for (const l of view.landmarks)
    for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) landmarkCells.set(y * width + x, l);

  // ─── Rock: one cliff band over the union of the rock cells ────────────
  // Rock rectangles may overlap or touch, and loose boulders may pile up: the
  // band is drawn over their union (edges only where the mass ends). Cells
  // that are in no 2x2 block of rock are boulders.
  const shapes = view.shapes.map((s, i) => ({ s, i })).sort((a, b) => a.s.y + a.s.h - (b.s.y + b.s.h) || a.i - b.i);
  const rockShape = new Set<number>();
  const otherShape = new Set<number>();
  for (const { s } of shapes)
    for (let y = s.y; y < s.y + s.h; y++)
      for (let x = s.x; x < s.x + s.w; x++)
        if (view.solid(x, y) && g(x, y) !== "W") (s.kind === "rock" ? rockShape : otherShape).add(y * width + x);
  const mouths = new Set(view.landmarks.filter((l) => l.kind === "rockCave").map((l) => l.y * width + l.x));
  const rocky = (x: number, y: number): boolean => {
    if (!inWorld(x, y)) return true;
    const i = y * width + x;
    if (mouths.has(i)) return true;
    if (!view.solid(x, y) || g(x, y) === "W") return false;
    return rockShape.has(i) || (g(x, y) === "R" && !otherShape.has(i) && !landmarkCells.has(i));
  };
  const sameRock = (ax: number, ay: number, bx: number, by: number) =>
    !inWorld(bx, by) || pal(ax, ay).rock === pal(bx, by).rock;
  const bandMemo = new Map<number, boolean>();
  const band = (x: number, y: number): boolean => {
    if (!inWorld(x, y)) return true;
    const i = y * width + x;
    let b = bandMemo.get(i);
    if (b === undefined) {
      const part = (xx: number, yy: number) => rocky(xx, yy) && sameRock(x, y, xx, yy);
      b =
        rocky(x, y) &&
        [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [0, 0],
        ].some(
          ([dx = 0, dy = 0]) =>
            part(x + dx, y + dy) &&
            part(x + dx + 1, y + dy) &&
            part(x + dx, y + dy + 1) &&
            part(x + dx + 1, y + dy + 1),
        );
      bandMemo.set(i, b);
    }
    return b;
  };
  const rockKey = (x: number, y: number): string => {
    const p = pal(x, y);
    if (!band(x, y)) return plain(variant(BOULDERS, seed, x, y, 6) + p.rock, true);
    const m = mask4(x, y, (xx, yy) => band(xx, yy) && sameRock(x, y, xx, yy));
    return plain(rockId(m, seed, x, y) + p.rock, true);
  };

  // ─── Wall rectangles, back to front ───────────────────────────────────
  const rockDone = new Set<number>();
  for (const { s } of shapes) {
    const p = pal(s.x, s.y);
    for (let y = s.y; y < s.y + s.h; y++)
      for (let x = s.x; x < s.x + s.w; x++) {
        if (!view.solid(x, y) || g(x, y) === "W") continue;
        const i = y * width + x;
        covered.add(i);
        if (s.kind === "rock") {
          if (!rockDone.has(i)) push(x, y, rockKey(x, y));
          rockDone.add(i);
        } else if (s.kind === "forest") push(x, y, plain(forestId(s, x, y) + p.tree, true));
        else if (y < s.y + s.h - 1) {
          // A pine (top over bottom) on every cell; the row below holds its foot.
          push(x, y, plain(896 + p.tree, true));
          push(x, y + 1, plain(960 + p.tree, true));
        }
      }
  }

  // ─── Landmarks ────────────────────────────────────────────────────────
  for (const l of view.landmarks) {
    const p = pal(l.x, l.y);
    const art = ART[l.kind];
    if (art) {
      const off = art.offset(p, seed + l.x * 31 + l.y);
      const recolor = art.recolor?.(p);
      const rows = art.alt && noise(seed, l.x, l.y, 44) < 0.5 ? art.alt : art.rows;
      // Two stone piles one above the other read as one odd stack: the lower one is a boulder.
      const stackedPile =
        l.kind === "stones" && view.landmarks.some((o) => o.kind === "stones" && o.x === l.x && o.y === l.y - 1);
      rows.forEach((row, dy) => {
        row.forEach((id, dx) => {
          const x = l.x + dx;
          const y = l.y + dy;
          covered.add(y * width + x);
          const rubble = l.kind === "ruin" && dy === 0 && dx === Math.floor(noise(seed, l.x, l.y, 46) * 4);
          if (stackedPile || rubble) push(x, y, plain(variant(BOULDERS, seed, x, y, 6) + p.rock, true));
          else push(x, y, recolor ? recolored(id, recolor, id !== art.door) : plain(id + off, id !== art.door));
        });
      });
    } else if (l.kind === "rockCave") push(l.x, l.y, plain(CLIFF.mouth + p.rock, false));
    else if (l.kind === "sign") {
      covered.add(l.y * width + l.x);
      push(l.x, l.y, plain(variant([451, 452, 453, 454, 515, 516, 518], seed, l.x, l.y, 42), true));
    } else if (l.kind === "stump") {
      covered.add(l.y * width + l.x);
      // A cut stump seen from above (the gnarled stumps 1794/1858 read as skulls, the ringed side views as eyes).
      push(l.x, l.y, plain(STUMP + p.tree, true));
    } else if (l.kind === "ringStone") {
      covered.add(l.y * width + l.x);
      push(l.x, l.y, plain(variant([STUMP, ...BOULDERS], seed, l.x, l.y, 45) + p.rock, true));
    }
  }

  /**
   * The ground of the overworld screen next door, if it differs, the cell is
   * within 2 of that edge and the ground runs on across it (a real passage,
   * not a wall between them).
   */
  const otherGround = (
    x: number,
    y: number,
    mine: Palette["ground"],
  ): { ground: Palette["ground"]; d: number } | undefined => {
    for (const d of [1, 2])
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        const xx = x + dx * d;
        const yy = y + dy * d;
        if (!inWorld(xx, yy) || sameScreen(x, y, xx, yy)) continue;
        if (view.solid(xx, yy) || (d === 2 && view.solid(x + dx, y + dy))) continue;
        const other = pal(xx, yy).ground;
        // Teal specks on the greens read as water: no blend between the graveyard and the grass.
        const gloomGreen = (a: string, b: string) => a === "gloom" && /grass|forest|Grass/.test(b);
        if (other !== mine && !gloomGreen(mine, other) && !gloomGreen(other, mine)) return { ground: other, d };
      }
    return undefined;
  };

  /**
   * A loose solid on the beach: grey boulders, worn grey domes and mossy
   * stones. No stumps (their knots read as faces) and no crates (they read as
   * the game's chests).
   */
  const beachSolid = (x: number, y: number, salt: number): string => {
    const r = noise(seed, x, y, salt);
    if (r < 0.55) return plain(variant(BOULDERS, seed, x, y, salt + 100) + V.E, true);
    if (r < 0.8) return plain(STUMP + V.E, true);
    return plain(1602 + V.E, true);
  };

  // ─── Textures (cosmetic: smooth noise and the cell hash, never the layout) ─
  /** Plain walkable ground of a screen (no path, sand, stone, mud, water or entrance; not by the water). */
  const floorAt = (x: number, y: number, mud = false) =>
    inWorld(x, y) &&
    !view.solid(x, y) &&
    !(mud ? /[W=:soSCD]/ : /[W=:smoSCD]/).test(g(x, y)) &&
    !isWater(x + 1, y) &&
    !isWater(x - 1, y) &&
    !isWater(x, y + 1) &&
    !isWater(x, y - 1);
  const memo = (f: (x: number, y: number) => boolean) => {
    const cache = new Map<number, boolean>();
    return (x: number, y: number) => {
      const i = y * width + x;
      let v = cache.get(i);
      if (v === undefined) {
        v = f(x, y);
        cache.set(i, v);
      }
      return v;
    };
  };
  /** Mountains: patches of dark mud, off the trails and away from the walls. */
  const mDarkRaw = memo(
    (x, y) =>
      biomeAt(x, y) === "M" &&
      floorAt(x, y) &&
      !view.trail(x, y) &&
      g(x, y) === "." &&
      patch(seed, x, y, 5, 60) > 0.615 &&
      !near4(x, y, (xx, yy) => view.trail(xx, yy) || view.solid(xx, yy)),
  );
  /** No 1-wide strips: a dark cell needs two dark neighbours. */
  const mDark = memo((x, y) => mDarkRaw(x, y) && count4(x, y, mDarkRaw) >= 2);
  /** Forest: sunny patches of lighter grass. */
  const fLight = memo((x, y) => biomeAt(x, y) === "F" && floorAt(x, y) && patch(seed, x, y, 5, 63) > 0.625);
  /** Graveyard: patches of darker ground. */
  const yDark = memo((x, y) => biomeAt(x, y) === "Y" && floorAt(x, y) && patch(seed, x, y, 5, 95) > 0.615);
  /** Beach: dunes of white sand. */
  const dune = memo((x, y) => biomeAt(x, y) === "B" && floorAt(x, y) && patch(seed, x, y, 4, 80) > 0.59);
  /**
   * Speck density of a patch (dark mud, sunny grass, dunes) at a cell: dense in
   * its core, thinner at its rim the fewer patch cells are around, and a fringe
   * of 1-2 cells outside it, so the patches fade out instead of ending square.
   */
  const patchLevel = (x: number, y: number, inside: (x: number, y: number) => boolean, core: number): number => {
    if (inside(x, y)) {
      const n = count8(x, y, inside);
      return n === 8 ? core : n === 7 ? Math.min(4, core) : n >= 4 ? 3 : 2;
    }
    if (near4(x, y, inside)) return 2;
    if (
      mask8(x, y, inside) !== 0 ||
      [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ].some(([dx = 0, dy = 0]) => inside(x + dx, y + dy))
    )
      return 1;
    return 0;
  };
  /** Mountains: the ruins' paving ('o'), where it is at least 2 cells across (single cells are worn trail). */
  const paving = memo(
    (x, y) => g(x, y) === "o" && biomeAt(x, y) === "M" && count4(x, y, (xx, yy) => g(xx, yy) === "o") >= 2,
  );
  /**
   * Swamp: where the mud shows. The layout's mud patches are rectangles; the
   * look rounds them off (their corners may stay grass, the grass next to them
   * may turn to mud), from the share of mud around each cell plus noise.
   */
  const mudLook = memo((x, y) => {
    if (biomeAt(x, y) !== "W" || !floorAt(x, y, true)) return false;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (g(x + dx, y + dy) === "m" && sameScreen(x, y, x + dx, y + dy)) n++;
    if (n === 0) return false;
    return n + (noise(seed, x, y, 70) - 0.5) * 2.4 + (blob(seed, x, y, 2, 71) - 0.5) * 4 >= 4.5;
  });
  const near4 = (x: number, y: number, test: (xx: number, yy: number) => boolean) => mask4(x, y, test) !== 0;
  const bits = (m: number) => {
    let n = 0;
    for (let v = m; v; v &= v - 1) n++;
    return n;
  };
  const count4 = (x: number, y: number, test: (xx: number, yy: number) => boolean) => bits(mask4(x, y, test));
  const count8 = (x: number, y: number, test: (xx: number, yy: number) => boolean) => bits(mask8(x, y, test));

  // ─── Cells ────────────────────────────────────────────────────────────
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const glyph = g(x, y);
      const p = pal(x, y);
      const biome = biomeAt(x, y);
      const lm = landmarkCells.get(y * width + x);
      const base = GROUND[p.ground];
      const walkable = !view.solid(x, y);
      const trail = walkable && view.trail(x, y);

      // Ground.
      let ground = base;
      if (glyph === "o" && biome === "M")
        // Ruins: tan flagstones (a plain floor of Tiles.png in the rock colours); stray cells are trail.
        ground = paving(x, y) ? PAVING : "mud";
      else if (glyph === "o" || glyph === "S")
        ground = plain(variant([1606, 1607], seed, x, y, 19) + (biome === "M" ? p.rock : 0), false);
      else if (glyph === ":") ground = p.ground === "grass" ? "path" : base;
      else if (glyph === "s") ground = p.ground === "sand" ? "whiteSand" : "sand";
      else if (mudLook(x, y)) {
        // Mud fades into the grass: dithered at its edge (Exotic 1-6 go from grass to mud),
        // with wet dark patches inside (see the decals).
        if (near4(x, y, (xx, yy) => !mudLook(xx, yy)))
          ground = stacked([base, plain(variant([5, 6], seed, x, y, 18), false, "ex")]);
        else ground = noise(seed, x, y, 74) < 0.25 ? "mud:tufts" : "mud";
      }
      if (glyph === "W") {
        if (lm?.kind === "waterfall") ground = y === lm.y + lm.h - 1 ? "waterfall:foot" : "waterfall";
        else if (lm?.kind === "island") {
          const shore = p.shore === "sand" ? "sand" : "grass";
          ground = `island:${shore}:${385 + 64 * (y - lm.y) + (x - lm.x)}`;
        } else {
          const m = mask4(x, y, (xx, yy) => !isWater(xx, yy));
          ground = m === 0 ? "water" : `water:${p.shore}:${m}`;
          if (
            m === 0 &&
            biome === "B" &&
            !near4(x, y, (xx, yy) => g(xx, yy) === "=") &&
            !landmarkCells.has(y * width + x) &&
            noise(seed, x, y, 81) < 0.035
          )
            // Rocks in the sea.
            ground = "water:rocks";
        }
      } else if (glyph === "=") {
        // A bridge walked north-south has water east and west.
        const ns = isWater(x - 1, y) && isWater(x + 1, y);
        if (lm?.kind === "dock") {
          // A jetty: continuous planks, and the end with its posts on the seaward cell.
          const ew = lm.h === 1;
          const end = ew
            ? (x === lm.x + lm.w - 1 && isWater(x + 1, y)) || (x === lm.x && isWater(x - 1, y))
            : (y === lm.y + lm.h - 1 && isWater(x, y + 1)) || (y === lm.y && isWater(x, y - 1));
          ground = end ? (ew ? "dock:ew" : "dock:ns") : ew ? "bridge:ew" : "bridge:ns";
        } else ground = ns ? "bridge:ns" : "bridge:ew";
      } else if (ground === base && (base === "grass" || base === "sand" || base === "mud")) {
        const halo = haloAt(x, y, isWater);
        if (halo) ground = `halo:${p.shore}:${halo}`;
      }
      const plainGround = ground === base;
      if (plainGround && walkable && biome === "M")
        // Dark patches: dark mud inside, dithered over the mud at their rim (see the decals).
        ground =
          mDark(x, y) && mask8(x, y, mDark) === 255
            ? "darkMud:tufts"
            : noise(seed, x, y, 3) < 0.16
              ? "mud:tufts"
              : "mud";
      else if (plainGround && walkable && biome === "F")
        ground = noise(seed, x, y, 3) < p.tufts ? "forest:tufts" : "forest";
      else if (plainGround && walkable && biome === "Y")
        // The graveyard's moss grows in clumps.
        ground = noise(seed, x, y, 3) < (patch(seed, x, y, 4, 96) > 0.6 ? 0.55 : p.tufts) ? "gloom:tufts" : "gloom";
      else if (plainGround && TUFTED.has(base) && noise(seed, x, y, 3) < p.tufts) ground = `${ground}:tufts`;
      out.set("ground", x, y, ground);

      // Decals.
      const near = (test: (xx: number, yy: number) => boolean) => near4(x, y, test);
      const swampEdge =
        biome === "W" &&
        !mudLook(x, y) &&
        !ground.startsWith("halo") &&
        glyph !== "W" &&
        walkable &&
        near((xx, yy) => mudLook(xx, yy) && sameScreen(x, y, xx, yy));
      const swampFar =
        biome === "W" &&
        !mudLook(x, y) &&
        floorAt(x, y) &&
        [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].some(([dx = 0, dy = 0]) => mudLook(x + dx, y + dy));
      const edge = plainGround && walkable ? otherGround(x, y, p.ground) : undefined;
      const receives = edge && RECEIVES.indexOf(p.ground) < RECEIVES.indexOf(edge.ground);
      const decal = (): string => {
        if (glyph === ",") return `flowers:${variant(FLOWERS, seed, x, y, 4)}`;
        if (glyph === "o" && biome === "M") {
          if (!paving(x, y)) return specks(TRAIL_TAN, variant([2, 3], seed, x, y, 56) as 2 | 3);
          // The paving's edge is broken: mud dithered over it, gaps here and there.
          const m = count8(x, y, paving);
          if (m < 8 && noise(seed, x, y, 58) < 0.7)
            return specks(GROUND_COLOR.mud, variant(m <= 4 ? [2, 3] : [1, 2], seed, x, y, 59) as 1 | 2 | 3);
          return noise(seed, x, y, 60) < 0.12 ? plain(variant(PEBBLES, seed, x, y, 17) + p.rock, false) : "";
        }
        if (swampEdge) return plain(variant([1, 2, 3], seed, x, y, 15), false, "ex");
        if (mudLook(x, y) && ground.startsWith("mud") && blob(seed, x, y, 3, 73) > 0.58)
          // Wet patches: dark mud dithered over the mud.
          return specks(DARK_MUD, variant([3, 4], seed, x, y, 79) as 3 | 4);
        if (swampFar && noise(seed, x, y, 77) < 0.45) return plain(1, false, "ex");
        if (edge && receives && (edge.d === 1 || noise(seed, x, y, 46) < 0.6))
          // Specks of the next screen's ground soften the line between two biomes.
          return specks(GROUND_COLOR[edge.ground], edge.d === 1 ? 2 : 1);
        const pathColor = PATH_COLOR[p.ground];
        if (glyph === ":" && pathColor !== undefined && walkable)
          // Paths on sand, mud and the graveyard's ground: packed earth specks (the sand paths are on grass).
          return specks(pathColor, variant([2, 3], seed, x, y, 54) as 2 | 3);
        if (
          plainGround &&
          walkable &&
          (p.ground === "grass" || pathColor !== undefined) &&
          near((xx, yy) => g(xx, yy) === ":" && sameScreen(x, y, xx, yy)) &&
          noise(seed, x, y, 48) < (pathColor === undefined ? 0.7 : 0.4)
        )
          // The paths spill a little onto the ground beside them.
          return pathColor === undefined
            ? specks(GROUND_COLOR.path, variant([1, 2], seed, x, y, 49) as 1 | 2)
            : specks(pathColor, 1);
        if (!plainGround || !walkable) return "";
        const above = landmarkCells.get((y - 1) * width + x);
        if (above?.kind === "ruin" && above.y + above.h === y)
          // The ruin's shadow on the ground.
          return specks(DARK_MUD, variant([3, 4], seed, x, y, 99) as 3 | 4);
        // Worn trails where the paths are not drawn (mountains, forests).
        if (biome === "W" && glyph !== ":" && near(isWater) && noise(seed, x, y, 75) < 0.3)
          // Reeds on the bank of the swamp's pools (walkable; the solid clumps are brown cattails).
          return plain(variant([1732, 1796], seed, x, y, 76), false);
        if (biome === "W")
          return glyph === "." && noise(seed, x, y, 13) < 0.06
            ? plain(variant(LITTER, seed, x, y, 14) + V.E, false)
            : "";
        const trailColor =
          biome === "M"
            ? TRAIL_TAN
            : biome === "F"
              ? GROUND_COLOR.darkGrass
              : biome === "Y"
                ? GRAVE_DIRT
                : GROUND_COLOR.path;
        if (trail) return specks(trailColor, variant([2, 3], seed, x, y, 56) as 2 | 3);
        if (near((xx, yy) => view.trail(xx, yy) && !view.solid(xx, yy)) && noise(seed, x, y, 57) < 0.4)
          return specks(trailColor, 1);
        if (biome === "M") {
          const level = patchLevel(x, y, mDark, variant([5, 6], seed, x, y, 59));
          if (mDark(x, y) && ground.startsWith("darkMud")) return "";
          if (level > 0 && !(level === 1 && noise(seed, x, y, 61) < 0.4))
            return specks(DARK_MUD, level as 1 | 2 | 3 | 4 | 5 | 6);
          // Scree: pebbles, thicker in some places.
          if (noise(seed, x, y, 16) < (blob(seed, x, y, 4, 62) > 0.66 ? 0.45 : 0.07))
            return plain(variant(PEBBLES, seed, x, y, 17) + p.rock, false);
          return "";
        }
        if (biome === "F") {
          // Shadow under the trees.
          if (/[TB]/.test(g(x, y - 1)) && sameScreen(x, y, x, y - 1))
            return specks(CANOPY_GREEN, variant([2, 3], seed, x, y, 66) as 2 | 3);
          // Sunny patches: light grass dithered over the forest floor, denser inside.
          const sun = patchLevel(x, y, fLight, variant([5, 6], seed, x, y, 67));
          if (sun > 0 && !(sun === 1 && noise(seed, x, y, 64) < 0.4))
            return specks(GROUND_COLOR.darkGrass, sun as 1 | 2 | 3 | 4 | 5 | 6);
          const r = noise(seed, x, y, 13);
          if (r < 0.1) return plain(variant(LITTER, seed, x, y, 14) + (noise(seed, x, y, 68) < 0.3 ? V.C : V.A), false);
          if (r < 0.13) return `flowers:${variant([3840, 3841, 3842, 3843], seed, x, y, 69)}`;
          if (r < 0.17) return plain(variant([3716, 3717], seed, x, y, 78), false);
          return "";
        }
        if (biome === "Y") {
          // Dug earth in front of the graves, patches of darker ground, grey leaves, bits of stone.
          if (g(x, y - 1) === "+" && sameScreen(x, y, x, y - 1))
            return specks(GRAVE_DIRT, variant([2, 3], seed, x, y, 97) as 2 | 3);
          const level = patchLevel(x, y, yDark, 3);
          if (level > 0 && !(level === 1 && noise(seed, x, y, 98) < 0.4)) return specks(GRAVE_DARK, level as 1 | 2 | 3);
          const r = noise(seed, x, y, 13);
          if (r < 0.06) return recolored(variant(LITTER, seed, x, y, 14), [[0x139d08, GRAVE_DARK]], false);
          if (r < 0.09) return plain(variant(PEBBLES, seed, x, y, 17) + 36, false);
          return "";
        }
        if (biome === "B" && floorAt(x, y) && ground === "sand") {
          const level = patchLevel(x, y, dune, 4);
          if (level > 0 && !(level === 1 && noise(seed, x, y, 83) < 0.4))
            return specks(0xffffff, level as 1 | 2 | 3 | 4);
        }
        if (biome === "B" && glyph === ".") {
          const r = noise(seed, x, y, 16);
          if (r < 0.05) return plain(variant(PEBBLES, seed, x, y, 17) + p.rock, false);
          if (r < 0.09) return plain(variant([3754, 3755], seed, x, y, 86), false);
          return "";
        }
        if (p.litter !== undefined && glyph === "." && noise(seed, x, y, 13) < (p.litterRate ?? 0.22))
          return plain(variant(LITTER, seed, x, y, 14) + p.litter, false);
        return "";
      };
      const d = decal();
      if (d) out.set("ground2", x, y, d);

      // Walls: shapes and landmarks, or a loose solid.
      const i = y * width + x;
      if (!covered.has(i) && view.solid(x, y) && glyph !== "W") {
        if (glyph === "T") {
          // Dead shrubs among the swamp's trees, inside the screen only (its border stays a tree line).
          const lx = x % view.screenW;
          const ly = y % view.screenH;
          const inner = lx > 0 && ly > 0 && lx < view.screenW - 1 && ly < view.screenH - 1;
          push(
            x,
            y,
            biome === "W" && inner && noise(seed, x, y, 87) < 0.2
              ? plain(variant(DEAD_SHRUBS, seed, x, y, 88) + V.E, true)
              : plain(variant(SMALL_TREES, seed, x, y, 5) + p.tree, true),
          );
        } else if (glyph === "R") push(x, y, biome === "B" && !band(x, y) ? beachSolid(x, y, 89) : rockKey(x, y));
        else if (glyph === "B")
          push(
            x,
            y,
            biome === "B" && noise(seed, x, y, 90) < 0.45
              ? beachSolid(x, y, 91)
              : plain(variant(BOULDERS, seed, x, y, 7) + V.B, true),
          );
        else if (glyph === "+") push(x, y, plain(variant(HEADSTONES, seed, x, y, 8) + p.stone, true));
        else if (glyph === "P") push(x, y, plain(2447 + p.stone, true));
      }
      const stack = stacks.get(i);
      if (stack) out.set("walls", x, y, stacked(stack));

      if (view.prop(x, y) === "bush")
        out.set("props", x, y, `tuft:${variant(TALL_GRASS, seed, x, y, 9)[0]}${p.tallGrass ? `:${p.tallGrass}` : ""}`);
    }
}

/** Leaf litter overlays (dead forest rows 19-20, variant A ids). */
const LITTER = [1216, 1217, 1218, 1219, 1220, 1280, 1281, 1282, 1283, 1284] as const;
/** A cut stump seen from above (variant A id; also a worn dome stone in the rock palettes). */
const STUMP = 1856;
/** Small dead shrubs (the dead forest's root fragments, variant A ids). */
const DEAD_SHRUBS = [1348, 1349] as const;
/** Solid clumps of reeds (1732/1796/1860) as brown cattails, so they differ from the walkable green reeds and tall grass. */
const CATTAIL: [number, number][] = [
  [0xe2d7b5, 0xc59782],
  [0xc59782, 0x823c3d],
  [0x376d03, 0x4f1507],
];
/** The cream stone pile (3715) in the mountains' rock colours. */
const STONE_PILE_ROCK: [number, number][] = [
  [0xe2d7b5, 0xc59782],
  [0xc59782, 0x823c3d],
  [0x172808, 0x211640],
];
/** Pebbles (rows 25-28, variant A ids). */
const PEBBLES = [1605, 1669, 1733, 1797] as const;
/** Pack colours of the decals: the tan of the mountain rocks, dark mud, the canopy green. */
const TRAIL_TAN = 0xc59782;
/** The graveyard: dug earth (graves, trails) and its darker ground. */
const GRAVE_DIRT = 0x5c3c0d;
const GRAVE_DARK = 0x415d66;
/** Specks of the ':' paths on grounds other than grass (where the path is drawn as sand). */
const PATH_COLOR: Partial<Record<Palette["ground"], number>> = {
  sand: 0xf5b784,
  gloom: 0x5c3c0d,
  swamp: 0x5c3c0d,
};
/** Flagstones of the mountain ruins: the plaza's stone floor (Tiles.png theme 2) in the tan and brown of the rocks. */
const PAVING = tiles(2, 0, 336, [
  [0xa8a8a8, 0xc59782],
  [0x7b7b7b, 0x823c3d],
]);
const DARK_MUD = 0x4f1507;
const CANOPY_GREEN = 0x139d08;

/** Halo piece of a land cell next to water (catalogue: overworld-tiles.md "Shore"), or none. */
function haloAt(x: number, y: number, isWater: (x: number, y: number) => boolean): number | undefined {
  if (isWater(x, y + 1)) {
    // The end pieces go where the water cell's own side meets land.
    if (!isWater(x - 1, y + 1)) return HALO.s.endW;
    if (!isWater(x + 1, y + 1)) return HALO.s.endE;
    return HALO.s.mid;
  }
  if (isWater(x, y - 1)) {
    if (!isWater(x - 1, y - 1)) return HALO.n.endW;
    if (!isWater(x + 1, y - 1)) return HALO.n.endE;
    return HALO.n.mid;
  }
  if (isWater(x + 1, y)) {
    if (!isWater(x + 1, y - 1)) return HALO.e.endN;
    if (!isWater(x + 1, y + 1)) return HALO.e.endS;
    return HALO.e.mid;
  }
  if (isWater(x - 1, y)) {
    if (!isWater(x - 1, y - 1)) return HALO.w.endN;
    if (!isWater(x - 1, y + 1)) return HALO.w.endS;
    return HALO.w.mid;
  }
  return undefined;
}
