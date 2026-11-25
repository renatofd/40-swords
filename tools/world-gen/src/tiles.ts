/**
 * The tile catalogue: every tile the skin can place, by key, built from the
 * pack "Super Overhead Adventure 3" (#NotZelda Overhead Adventure Tiles by
 * Raphael Azcueta, CC BY-SA 4.0; sources in content/src/notzelda/).
 *
 * Ids are the pack's own (see the catalogue notes): Overworld/OverworldExotic
 * `id = row*64 + col`; Dungeon/Tiles/House cells are given as pixels inside a
 * colour theme block (`dg(theme, x, y)`, `tl(theme, x, y)`, `hs(theme, x, y)`).
 *
 * Add a tile:        add("myKey", tile([ow(1234)], { collides: true }))  (in this file)
 * A composite:       tile([{ key: "water" }, ow(12)])  (stacked bottom → top, baked into one cell)
 * An animation:      tile([owAnim(397, 4)], { ms: 200 })  (frames id..id+3; composites inherit it)
 * Transforms/crops:  ow(130, { t: "flipV" }), ow(3788, { crop: [0, 10, 16, 6] })
 *
 * Only the keys the map uses end up in content/tilesets/world.png.
 */
import type { Catalogue, Cell, SourceLayer, TileDef, Transform } from "./atlas";
import { E, N, S, W } from "./skin/common";

// ─── Source helpers ─────────────────────────────────────────────────────────

type More = Partial<Omit<SourceLayer, "sheet" | "cell">>;
export const ow = (cell: Cell, more: More = {}): SourceLayer => ({ sheet: "overworld", cell, ...more });
export const ex = (cell: Cell, more: More = {}): SourceLayer => ({ sheet: "exotic", cell, ...more });
/** Overworld animation: `n` frames id, id+1... (or the given ids). */
export const owAnim = (first: number, n: number, ids?: number[]): SourceLayer => {
  const frames = ids ?? Array.from({ length: n }, (_, i) => first + i);
  return { sheet: "overworld", cell: frames[0] ?? first, frames };
};
/** Dungeon.png: 11 colour themes of 512x512; (x, y) inside the theme block. */
export const dg = (theme: number, x: number, y: number, more: More = {}): SourceLayer => ({
  sheet: "dungeon",
  cell: [theme * 512 + x, y],
  ...more,
});
/** Tiles.png: 10 floor themes of 512x512. */
export const tl = (theme: number, x: number, y: number, more: More = {}): SourceLayer => ({
  sheet: "tiles",
  cell: [theme * 512 + x, y],
  ...more,
});
/** House.png: 5 themes of 128 px wide. */
export const hs = (theme: number, x: number, y: number, more: More = {}): SourceLayer => ({
  sheet: "house",
  cell: [theme * 128 + x, y],
  ...more,
});
export const tile = (layers: TileDef["layers"], more: Omit<TileDef, "layers"> = {}): TileDef => ({ layers, ...more });
const solid = (layers: TileDef["layers"], more: Omit<TileDef, "layers"> = {}) =>
  tile(layers, { collides: true, ...more });

export const TILES: Catalogue = {};
const add = (key: string, def: TileDef) => {
  if (TILES[key]) throw new Error(`duplicate tile key ${key}`);
  TILES[key] = def;
};

/**
 * A plain tile of the Overworld (or OverworldExotic) sheet by id, added to the
 * catalogue the first time it is asked for: `ow!:id` is solid, `ow:id` is not.
 */
export const plain = (id: number, solid: boolean, sheet: "ow" | "ex" = "ow"): string => {
  const k = `${sheet}${solid ? "!" : ""}:${id}`;
  if (!TILES[k]) add(k, tile([sheet === "ow" ? ow(id) : ex(id)], solid ? { collides: true } : {}));
  return k;
};
/**
 * An Overworld tile with some colours swapped (pairs of 0xRRGGBB), added on
 * first use: the same art in another palette (reeds as cattails, a stone pile
 * in the mountains' rock colours).
 */
export const recolored = (id: number, recolor: [number, number][], solid: boolean): string => {
  const k = `ow${solid ? "!" : ""}:${id}~${recolor.map(([a, b]) => `${a.toString(16)}>${b.toString(16)}`).join(",")}`;
  if (!TILES[k]) add(k, tile([ow(id, { recolor })], solid ? { collides: true } : {}));
  return k;
};
/**
 * Several entries drawn in one cell, bottom → top (a tree in front of a rock,
 * a crypt in front of the forest...), added on first use. Solid if any part is.
 */
export const stacked = (keys: readonly string[]): string => {
  const parts = keys.filter((k, i) => k && k !== keys[i - 1]);
  if (parts.length === 1) return parts[0] as string;
  const k = parts.join("+");
  if (!TILES[k])
    add(
      k,
      tile(
        parts.map((key) => ({ key })),
        { collides: parts.some((p) => TILES[p]?.collides) },
      ),
    );
  return k;
};

// ─── Overworld ground ───────────────────────────────────────────────────────
// Rows 0-9: terrain, palette variants every 18 columns (A green, B desert, C snow).

add("grass", tile([ow(7)]));
/** Tufts sway slowly (frames 576/577 and 580/581 of the sheet). */
const TUFT_MS = 650;
add("grass:tufts", tile([owAnim(8, 2, [576, 577])], { ms: TUFT_MS }));
add("darkGrass", tile([ow(10)]));
add("darkGrass:tufts", tile([owAnim(11, 2, [580, 581])], { ms: TUFT_MS }));
add("path", tile([ow(0)]));
add("sand", tile([ow(25)]));
add("whiteSand", tile([ow(18)]));
add("rockyGround", tile([ow(28)]));
add("mud", tile([ex(7)]));
add("darkMud", tile([ex(10)]));
/** Dark mud with darker specks (Exotic 11): wet patches of the swamp, dark patches of the mountains. */
add("darkMud:tufts", tile([ex(11)]));
/** Speckled mud (Exotic 8: mud with dark specks). */
add("mud:tufts", tile([ex(8)]));
/** Plain mud, solid: where a cave's merchant stands behind the counter (the merchant is a sprite). */
add("mud!", solid([ex(7)]));
/** Grey-teal ground of the graveyard (the Exotic sheet's frost terrain) and its speckled twin. */
add("gloom", tile([ex(46)]));
add("gloom:tufts", tile([ex(47)]));
add("black", tile([ow(199)]));
/**
 * Grass recoloured to other greens of the pack's palette (the dark grass and
 * its swaying tufts): the forest floor one step darker than the dark grass,
 * a calmer green, and the swamp's olive. Each has water rims to match
 * (SHORES) but no halo pieces.
 */
export const GRASS_TONES = {
  forest: { base: 0x6ab417, tuft: 0x139d08 },
  swamp: { base: 0x939717, tuft: 0x376d03 },
} as const;
for (const [name, { base, tuft }] of Object.entries(GRASS_TONES)) {
  const recolor: [number, number][] = [
    [0x8cd612, base],
    [0x6ab417, tuft],
  ];
  add(name, tile([ow(10, { recolor })]));
  add(`${name}:tufts`, tile([{ ...owAnim(11, 2, [580, 581]), recolor }], { ms: TUFT_MS }));
}
/** Water with a cluster of rocks (animated with the water's 4 frames). */
add("water:rocks", tile([owAnim(397, 4), owAnim(139, 4, [139, 140, 139, 140])], { collides: true, ms: 220 }));
/** Plaza flagstones: a light floor of Tiles.png. */
add("plaza", tile([tl(2, 0, 336)]));

/**
 * Specks of a ground colour over another ground (walkable, transparent): the
 * Exotic sheet's mud dither (1-2 sparse, 3-4 half, 5-6 dense) recoloured to
 * `color` (0xRRGGBB). Softens the edges between grounds and along the paths.
 */
export const specks = (color: number, id: 1 | 2 | 3 | 4 | 5 | 6, t: Transform = "none"): string => {
  const k = `specks:${color.toString(16).padStart(6, "0")}:${id}${t === "none" ? "" : `:${t}`}`;
  if (!TILES[k]) add(k, tile([ex(id, { recolor: [[0x5c3c0d, color]], ...(t === "none" ? {} : { t }) })]));
  return k;
};

/** Flower overlays (walkable, transparent): patches 3776-3779, sparse 3840-3843. */
export const FLOWERS = [3776, 3777, 3778, 3779, 3840, 3841, 3842, 3843] as const;
for (const id of FLOWERS) add(`flowers:${id}`, tile([ow(id)]));

// ─── Water and shores ───────────────────────────────────────────────────────
// Water 397 (4 frames, 100 ms in the pack; slowed down). Rims are overlays on
// water cells (solid like the water); halos are opaque light-grass land pieces.

const WATER_MS = 220;
add("water", solid([owAnim(397, 4)], { ms: WATER_MS }));
/** The same water without collision: under bridges and docks. */
add("water:under", tile([owAnim(397, 4)], { ms: WATER_MS }));

/** Rim pieces on a water cell, by land side; corners cover both sides. */
export const RIM = { n: 130, s: 258, w: 193, e: 195, nw: 129, ne: 131, sw: 257, se: 259 } as const;
/** Rim overlays for a water cell whose land sides are `mask` (N, E, S, W bits of skin/common.ts). */
export const rimPieces = (mask: number): number[] => {
  const out: number[] = [];
  const covered = new Set<string>();
  for (const [v, vb] of [
    ["n", N],
    ["s", S],
  ] as const)
    for (const [h, hb] of [
      ["w", W],
      ["e", E],
    ] as const)
      if (mask & vb && mask & hb) {
        out.push(RIM[`${v}${h}`]);
        covered.add(v).add(h);
      }
  for (const [side, bit] of [
    ["n", N],
    ["s", S],
    ["w", W],
    ["e", E],
  ] as const)
    if (mask & bit && !covered.has(side)) out.push(RIM[side]);
  return out;
};
/**
 * Shore palettes: grass (variant A), sand (variant B, +18), mud (the Exotic
 * sheet's variant A) and dark grass (the grass rims with their light-grass
 * corners recoloured to the dark grass of tile 10; it has no halo pieces).
 */
export const SHORES = { grass: 0, sand: 18, mud: 0, darkGrass: 0, forest: 0, swamp: 0 } as const;
export type Shore = keyof typeof SHORES;
/** Grounds whose rims are the grass rims with their light-grass corners recoloured (no halo pieces). */
const RIM_RECOLOR: Partial<Record<Shore, [number, number][]>> = {
  darkGrass: [[0xbeeb71, 0x8cd612]],
  forest: [[0xbeeb71, GRASS_TONES.forest.base]],
  swamp: [[0xbeeb71, GRASS_TONES.swamp.base]],
};
const rimLayer = (shore: string, id: number): SourceLayer => {
  const recolor = RIM_RECOLOR[shore as Shore];
  if (recolor) return ow(id, { recolor });
  return shore === "mud" ? ex(id) : ow(id + (SHORES[shore as Shore] ?? 0));
};
for (const shore of Object.keys(SHORES))
  for (let mask = 1; mask < 16; mask++)
    add(`water:${shore}:${mask}`, solid([{ key: "water" }, ...rimPieces(mask).map((id) => rimLayer(shore, id))]));

/** Halo pieces (land next to water: light grass or sand, see SHORES): water to the S/N/E/W, with their end pieces. */
export const HALO = {
  s: { mid: 66, endW: 65, endE: 67 },
  n: { mid: 322, endW: 321, endE: 323 },
  e: { mid: 192, endN: 128, endS: 256 },
  w: { mid: 196, endN: 132, endS: 260 },
} as const;
for (const [shore, off] of Object.entries(SHORES))
  if (!RIM_RECOLOR[shore as Shore])
    for (const id of [65, 66, 67, 321, 322, 323, 128, 192, 256, 132, 196, 260])
      add(`halo:${shore}:${id}`, tile([shore === "mud" ? ex(id) : ow(id + off)]));

/** Bridges baked over walkable water: 12 walks north-south, 76 east-west. */
add("bridge:ns", tile([{ key: "water:under" }, ow(12)]));
add("bridge:ew", tile([{ key: "water:under" }, ow(76)]));
/** Jetties into the sea (planks on posts). */
add("dock:ns", tile([{ key: "water:under" }, ow(13)]));
add("dock:ew", tile([{ key: "water:under" }, ow(77)]));
/** Waterfall body and foot (6 frames each). */
add("waterfall", solid([owAnim(14, 6, [14, 15, 16, 78, 79, 80])], { ms: 120 }));
add("waterfall:foot", solid([owAnim(206, 6, [206, 207, 208, 270, 271, 272])], { ms: 120 }));
/** Islands: 2x2 of land on the water plus the shadow row below (grass and sand palettes). */
export const ISLAND = [
  [385, 386],
  [449, 450],
  [513, 514],
] as const;
for (const [shore, off] of Object.entries(SHORES))
  if (shore === "grass" || shore === "sand")
    for (const row of ISLAND)
      for (const id of row) add(`island:${shore}:${id}`, solid([{ key: "water" }, ow(id + off)]));

// ─── Trees, rocks, graves ───────────────────────────────────────────────────
// Rows 10-34: palette variants every 9 columns (A green, B birch/yellow-green,
// C orange, D red, E dark green/grey rocks, F blue). The overworld skin takes
// them by id with `plain(id + variant offset)`; only the interiors use named keys.

/** Small 1x1 trees (variant A ids). */
export const SMALL_TREES = [640, 641, 704, 705, 768, 769] as const;
/** Boulders (variant A ids; the variant-B ones are yellow-green bushes). */
export const BOULDERS = [1600, 1601, 1664, 1665, 1666] as const;

/** Cliff band 3x3 roles (variant A): corners, edges, interior. */
export const CLIFF = {
  nw: 1984,
  n: [1985, 1986],
  ne: 1988,
  w: 2112,
  e: 2116,
  sw: 2176,
  s: [2177, 2178],
  se: 2180,
  mid: [2049, 2050, 2051, 2113, 2114, 2115],
  /** Dark recess in the south face: a cave mouth (walkable when used as one). */
  mouth: 2179,
} as const;
/** Single headstones (rows 42-43, variant A; +18 grey stone, +36 dark stone). */
export const HEADSTONES = [2688, 2689, 2690, 2691, 2692, 2693, 2696, 2697, 2698, 2699, 2700, 2701, 2702, 2703] as const;

// ─── Props: tall grass and pots ─────────────────────────────────────────────
// The pack has no cut-grass nor broken-pot tile: the broken looks are baked.

/** Tall grass looks and the specks left once cut. */
export const TALL_GRASS: [number, number][] = [
  [1603, 3716],
  [1604, 3717],
  [1667, 3718],
  [1795, 3719],
  [1859, 3716],
];
/**
 * Colour looks of the tall grass: the pack's green and a dull olive for the
 * graveyard (the pack's grey-blue variant reads as ice or bone shards there).
 */
export const TALL_GRASS_LOOKS: Record<string, [number, number][]> = {
  green: [],
  olive: [
    [0xe2d7b5, 0x939717],
    [0xc59782, 0x376d03],
    [0x376d03, 0x172808],
  ],
};
for (const [id, cut] of TALL_GRASS) {
  if (!TILES[`tuftCut:${cut}`]) add(`tuftCut:${cut}`, tile([ow(cut)], { prop: { kind: "bush", broken: true } }));
  for (const [look, recolor] of Object.entries(TALL_GRASS_LOOKS))
    add(
      `tuft:${id}${look === "green" ? "" : `:${look}`}`,
      tile([ow(id, recolor.length ? { recolor } : {})], {
        prop: { kind: "bush", broken: false },
        breaksTo: `tuftCut:${cut}`,
      }),
    );
}

/** A pot whose top is gone: its bottom part stays, with a shard or two beside it. */
const shards = (pot: SourceLayer): TileDef["layers"] => [
  // The base, with a jagged edge: two columns of the wall stand a little higher.
  { ...pot, crop: [0, 11, 16, 5] },
  { ...pot, crop: [4, 9, 3, 2] },
  { ...pot, crop: [10, 10, 2, 1] },
  // Bits of the rim fallen beside it.
  { ...pot, crop: [1, 1, 4, 2], shift: [-1, 12] },
  { ...pot, crop: [11, 2, 3, 2], shift: [2, 10] },
];
export const OVERWORLD_POTS = [3788, 3789, 3790] as const;
for (const id of OVERWORLD_POTS) {
  add(`potShards:${id}`, tile(shards(ow(id)), { prop: { kind: "pot", broken: true } }));
  add(`pot:${id}`, tile([ow(id)], { prop: { kind: "pot", broken: false }, breaksTo: `potShards:${id}` }));
}

// ─── Dungeons (Dungeon.png themes) ──────────────────────────────────────────
// Rooms use the pack's perspective room kit: 2-tile walls cut from one top-wall
// strip, flipped/transposed for the other sides (skin/kit.ts lays them out).

/** Colour theme of each dungeon (Dungeon.png blocks: 10 slate, 2 teal/lime, 4 plum, 1 red/cream). */
export const DUNGEON_THEMES: Record<string, number> = { crypt: 10, lair: 2, tomb: 4, hall: 1 };
/** Carpet of each dungeon's entrance and boss rooms: Tiles.png theme and its 48x80 block. */
export const CARPETS: Record<string, { theme: number; block: [number, number] }> = {
  crypt: { theme: 3, block: [384, 32] },
  lair: { theme: 3, block: [384, 224] },
  tomb: { theme: 8, block: [384, 32] },
  hall: { theme: 2, block: [384, 224] },
};
/** The arena ring uses the brown/sand theme. */
export const ARENA_THEME = 5;

/** Atlas transform of Tiled's flip flags D (transpose), H, V, applied in that order. */
export const FLAGS: Record<string, Transform> = {
  "": "none",
  H: "flipH",
  V: "flipV",
  HV: "rot180",
  D: "transpose",
  DH: "rot90",
  DV: "rot270",
  DHV: "antiTranspose",
};

/**
 * Floor colour swaps of a theme whose plain floor is too loud for a whole room
 * (red/cream: the bright red floor becomes the theme's rust).
 */
const FLOOR_RECOLOR: Record<number, [number, number][]> = { 1: [[0xe03c28, 0xad4e1a]] };
/** The plain floor of a theme (its base colour). */
export const dfloor = (theme: number): string => {
  const k = `dfloor:${theme}`;
  const recolor = FLOOR_RECOLOR[theme];
  if (!TILES[k]) add(k, tile([dg(theme, 336, 192, recolor ? { recolor } : {})]));
  return k;
};
/** Darkest colour of each Dungeon.png theme (its outlines): worn specks on its floor. */
export const DUNGEON_DARK: Record<number, number> = { 10: 0x0d2030, 2: 0x172808, 4: 0x231712, 1: 0x4f1507 };
/**
 * A cell of Dungeon.png (pixel x, y inside the theme block) with Tiled flags,
 * drawn over the theme's floor (or `base`); added on first use. `kit!:` keys are solid.
 */
export const kit = (
  theme: number,
  x: number,
  y: number,
  flags = "",
  solid = true,
  base = dfloor(theme),
  recolor?: [number, number][],
): string => {
  const k = `kit${solid ? "!" : ""}:${theme}:${x},${y}:${flags}${base === dfloor(theme) ? "" : `/${base}`}${recolor ? "~" : ""}`;
  if (!TILES[k]) {
    const t = FLAGS[flags];
    if (!t) throw new Error(`bad flags "${flags}"`);
    add(
      k,
      tile([{ key: base }, dg(theme, x, y, { t, ...(recolor ? { recolor } : {}) })], solid ? { collides: true } : {}),
    );
  }
  return k;
};
/** A Dungeon.png cell on its own (transparent where the sheet is): drawn on "ground2". Never solid. */
export const dgTile = (theme: number, x: number, y: number): string => {
  const k = `dgTile:${theme}:${x},${y}`;
  if (!TILES[k]) add(k, tile([dg(theme, x, y)]));
  return k;
};
/** A Tiles.png cell (carpets, floors) on its own: drawn on "ground2" over a floor. Never solid. */
export const tiles = (theme: number, x: number, y: number, recolor?: [number, number][]): string => {
  const k = `tiles:${theme}:${x},${y}${recolor ? `~${recolor.map(([a, b]) => `${a.toString(16)}>${b.toString(16)}`).join(",")}` : ""}`;
  if (!TILES[k]) add(k, tile([tl(theme, x, y, recolor ? { recolor } : {})]));
  return k;
};
/** Packed sand of the arena: the pack's sand in the cream of the arena walls (Dungeon.png theme 5). */
add("arena:sand", tile([ow(25, { recolor: [[0xfff0a0, 0xe2d7b5]] })]));

/** Statues 16x32 (x = 16 * kind; y 416 main colour, 448 alt): top half drawn over heroes, bottom half solid. */
export const STATUE_KINDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const statue = (
  theme: number,
  kind: number,
  alt: boolean,
  base = dfloor(theme),
): { top: string; bottom: string } => {
  const y = alt ? 448 : 416;
  const top = `statueTop:${theme}:${kind}:${y}`;
  const bottom = `statue:${theme}:${kind}:${y}/${base}`;
  if (!TILES[top]) add(top, tile([dg(theme, kind * 16, y)]));
  if (!TILES[bottom]) add(bottom, solid([{ key: base }, dg(theme, kind * 16, y + 16)]));
  return { top, bottom };
};
/** Small blocks (16x16, x 256 + 16i, rows 400..432) and big blocks (32x32) of a theme. */
export const SMALL_BLOCKS: [number, number][] = [
  [256, 400],
  [256, 416],
  [272, 400],
  [320, 416],
  [352, 416],
  [272, 432],
];
export const BIG_BLOCKS: [number, number][] = [
  [256, 448],
  [320, 448],
  [256, 480],
  [320, 480],
];
/** Dungeon pots (16x16, theme colours). */
export const DUNGEON_POTS: [number, number][] = [
  [128, 496],
  [144, 496],
  [160, 496],
  [144, 480],
];
export const dungeonPot = (theme: number, x: number, y: number): string => {
  const k = `pot:${theme}:${x},${y}`;
  if (!TILES[k]) {
    const pot = dg(theme, x, y);
    add(`potShards:${theme}:${x},${y}`, tile(shards(pot), { prop: { kind: "pot", broken: true } }));
    add(k, tile([pot], { prop: { kind: "pot", broken: false }, breaksTo: `potShards:${theme}:${x},${y}` }));
  }
  return k;
};

// ─── Caves and shops (House.png furniture) ──────────────────────────────────

const HOUSE = 0;
add("shelf:l", solid([hs(HOUSE, 80, 128)]));
add("shelf:r", solid([hs(HOUSE, 96, 128)]));
/**
 * Furniture standing alone against a cave wall (House.png): a cabinet and
 * wooden crates (open, slatted, wicker; with or without a lid). No potted
 * plants: their round green pot reads as a slime at a glance.
 */
export const FURNITURE = ["cabinet", "crate:0", "crate:1", "crate:2", "crate:3", "crate:4", "crate:5"] as const;
add("cabinet", solid([hs(HOUSE, 96, 144)]));
[32, 48, 64].forEach((x, i) => {
  add(`crate:${i}`, solid([hs(HOUSE, x, 160)]));
  add(`crate:${i + 3}`, solid([hs(HOUSE, x, 176)]));
});
/**
 * The way out of a cave: stone steps in a frame (Overworld 387, upside down)
 * running from the floor down into the dark of the passage, in the cave's grey.
 */
add(
  "caveExit",
  tile([
    { key: "black" },
    ow(387, {
      t: "flipV",
      recolor: [
        [0xe2d7b5, 0xa8a8a8],
        [0xa8a8a8, 0x7b7b7b],
        [0x172808, 0x231712],
      ],
    }),
  ]),
);
add("counter:l", solid([hs(HOUSE, 32, 128)]));
add("counter:r", solid([hs(HOUSE, 48, 128)]));
/** Middle of a long counter: the right half of its left end + the left half of its right end. */
add(
  "counter:m",
  solid([
    hs(HOUSE, 32, 128, { crop: [8, 0, 8, 16], shift: [-8, 0] }),
    hs(HOUSE, 48, 128, { crop: [0, 0, 8, 16], shift: [8, 0] }),
  ]),
);
