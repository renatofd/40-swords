/**
 * The world of 40 Swords: an ORIGINAL layout. Only the structure follows
 * classic top-down adventures (a grid of screens, caves with vendors,
 * dungeons with a mini-boss and a boss); every region, room and placement
 * here is our own, and most screens are generated from a seed.
 *
 * Change BIOMES, the placements or SEED and regenerate:
 *   pnpm --filter @tools/world-gen generate
 */

/** Seed of every random choice (connections, obstacles, enemies). */
export const SEED = 4040;

/**
 * One letter per overworld screen (16 columns x 8 rows):
 *   M mountains   G meadow   H hills   F forest   R red forest   L lake
 *   W swamp   Y graveyard   B coast (the sea along the east edge)   C the start square (centre)
 *
 * The rough geography: mountains across most of the north (caves, two
 * waterfalls) that stop short of the west edge, where a forest stands over the
 * swamp; the red forest west of the start with the graveyard in the south-west
 * corner, meadows and lakes around the start, green forests in the east and
 * the coast on the east edge, hills in the south.
 */
export const BIOMES = [
  "FFMMMMMMMMMMMMMB",
  "WWMMMMMGMMMFFFFB",
  "WWRRGGGLGHMFFFFB",
  "WWRRGGGGGGFFLFBB",
  "WRRRGGGLCGGFFFBB",
  "YYRRGGGGGGHFFFFB",
  "YYWRGHGGHHHHFFBB",
  "YYWRHHHGGHHHHBBB",
];
export type Biome = "M" | "G" | "H" | "F" | "R" | "L" | "W" | "Y" | "B" | "C";

/**
 * Rivers, as columns of screens from north to south (they only cross the
 * top/bottom edges of screens). The first screen holds the waterfall that feeds
 * it; the river ends in a lake screen (L) or at the south edge of the world.
 */
export const RIVERS: [number, number][][] = [
  [
    [7, 0],
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
    [7, 7],
  ],
  [
    [12, 0],
    [12, 1],
    [12, 2],
    [12, 3],
  ],
];

export const OVERWORLD_COLUMNS = 16;
export const OVERWORLD_ROWS = 8;
/** Rows of interior screens (dungeons, caves and the arena) below the overworld. */
export const INTERIOR_ROWS = 4;

export interface DungeonDef {
  id: string;
  /** Overworld screen with the dungeon door. */
  door: [number, number];
  /** Look of the entrance: a crypt (eye or skull), a small shrine or a wide temple. */
  entrance: "crypt" | "skull" | "shrine" | "temple";
  /** Top-left screen of its 3x3 rooms in the interior band (column, row inside the band). */
  at: [number, number];
  /** 1 (easiest) to 4. */
  depth: number;
  miniboss: string;
  boss: string;
  /** Enemy glyphs of its rooms. */
  enemies: string;
  /** Graph of its rooms (build.ts dungeonLayout). */
  layout: number;
}

export const DUNGEONS: DungeonDef[] = [
  {
    id: "crypt",
    door: [1, 6],
    entrance: "crypt",
    at: [0, 0],
    depth: 1,
    miniboss: "brute",
    boss: "warden",
    enemies: "kkb",
    layout: 0,
  },
  {
    id: "lair",
    door: [1, 2],
    entrance: "skull",
    at: [3, 0],
    depth: 2,
    miniboss: "hexer",
    boss: "witch",
    enemies: "fefb",
    layout: 1,
  },
  {
    id: "tomb",
    door: [13, 5],
    entrance: "shrine",
    at: [6, 0],
    depth: 3,
    miniboss: "brute",
    boss: "matriarch",
    enemies: "zzk",
    layout: 2,
  },
  {
    id: "hall",
    door: [13, 0],
    entrance: "temple",
    at: [9, 0],
    depth: 4,
    miniboss: "hexer",
    boss: "colossus",
    enemies: "gkb",
    layout: 3,
  },
];

export interface CaveDef {
  /** Overworld screen with the cave entrance. */
  door: [number, number];
  type: "shop" | "treasure";
}

/** Caves fill the interior band from column 12, two rows of four. */
export const CAVES: CaveDef[] = [
  { door: [4, 0], type: "treasure" },
  { door: [9, 1], type: "shop" },
  { door: [2, 1], type: "shop" },
  { door: [3, 3], type: "shop" },
  { door: [10, 2], type: "shop" },
  { door: [5, 6], type: "shop" },
  { door: [11, 5], type: "shop" },
  { door: [14, 7], type: "treasure" },
];
export const CAVES_AT_COLUMN = 12;

/**
 * The start square, hand-made (all four sides open): a paved plaza with two
 * statues to the north, a well among flowers to the south-west and a sign to the south-east.
 */
export const START_SCREEN = [
  "TTTTTTTT::::TTTTTTTT",
  "TTTTTTTT::::TTTTTTTT",
  "TT.ZZ.oooooooo.ZZ.TT",
  "TT.ZZ.oooooooo.ZZ.TT",
  "......ooSoPoSo......",
  "::::::ooooSSoo::::::",
  "......ooSoooSo......",
  "TT,,,.oooooooo..,.TT",
  "TT,Z,.oooooooo.,Z.TT",
  "TTTTTTTT::::TTTTTTTT",
  "TTTTTTTT::::TTTTTTTT",
];
/** Forest blocks and statues of the start square (see START_SCREEN). */
export const START_SHAPES = [
  [0, 0, 8, 2],
  [12, 0, 8, 2],
  [0, 9, 8, 2],
  [12, 9, 8, 2],
  [0, 2, 2, 2],
  [18, 2, 2, 2],
  [0, 7, 2, 2],
  [18, 7, 2, 2],
].map(([x, y, w, h]) => ({ kind: "forest" as const, x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 }));
export const START_LANDMARKS = [
  { kind: "statue" as const, x: 3, y: 2, w: 2, h: 2 },
  { kind: "statue" as const, x: 15, y: 2, w: 2, h: 2 },
  { kind: "well" as const, x: 3, y: 8, w: 1, h: 1 },
  { kind: "sign" as const, x: 16, y: 8, w: 1, h: 1 },
];

/**
 * Shop caves (one per shop, in turn): the merchant (V) stands behind a counter
 * (Q) against the back wall, its offers lie two tiles in front of it; shelves
 * and crates (H) on the sides; the way out (X) in the south wall.
 */
export const SHOP_CAVES = [
  [
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKHH____V_____HHKKK",
    "KK_____QQQQQ______KK",
    "KK________________KK",
    "KK________________KK",
    "KK________________KK",
    "KKK______________KKK",
    "KKKKKKK______KKKKKKK",
    "KKKKKKKKKXKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
  ],
  [
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKKHH___V___KKKKKKK",
    "KKK____QQQQQ___KKKKK",
    "KK_______________KKK",
    "KKH_______________KK",
    "KKH_______________KK",
    "KKKK_____________KKK",
    "KKKKKKKK_____KKKKKKK",
    "KKKKKKKKKXKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
  ],
  [
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKKKK___V____HHKKKK",
    "KKKKK__QQQQQ______KK",
    "KKK_______________KK",
    "KK________________KK",
    "KK_______________HKK",
    "KKK_____________KKKK",
    "KKKKKK______KKKKKKKK",
    "KKKKKKKKKXKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
  ],
];

/** Treasure caves: chests between two small crags. */
export const TREASURE_CAVE = [
  "KKKKKKKKKKKKKKKKKKKK",
  "KKKKKKKKKKKKKKKKKKKK",
  "KKK__$________$__KKK",
  "KK________________KK",
  "KK____KK____KK____KK",
  "KK____KK____KK____KK",
  "KK_______$________KK",
  "KKK______________KKK",
  "KKKKKKK______KKKKKKK",
  "KKKKKKKKKXKKKKKKKKKK",
  "KKKKKKKKKKKKKKKKKKKK",
];

/**
 * The battle royale arena (2x2 screens, top-left screen ARENA_AT inside the
 * interior band), walled like a dungeon room (2 tiles thick). Nothing leads in
 * or out: at 30 minutes the server teleports every hero to the "x" spawns.
 *   N wall   n sand   l painted line (decoration)   u pillar (2x2: a big block; alone: a statue)   x arena spawn
 */
export const ARENA_AT: [number, number] = [12, 2];
export const ARENA_SCREENS: [number, number] = [2, 2];
export const ARENA = [
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
  "NNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNN",
  "NNnnnnnnnnnnnnnnnunnnnunnnnnnnnnnnnnnnNN",
  "NNnnnnnnnnnnxnnnnnnnnnnnnnnxnnnnnnnnnnNN",
  "NNnnnnnnuunnnnnnnxnnnnxnnnnnnnuunnnnnnNN",
  "NNnnnnxnuunnnnnnnnnnnnnnnnnnnnuunxnnnnNN",
  "NNnnnnnnnnnnnnnllllllllllnnnnnnnnnnnnnNN",
  "NNnnunnnnnnnnnnlnnnnnnnnlnnnnnnnnnnunnNN",
  "NNnnnnnnnnnnnnnlnnnnnnnnlnnnnnnnnnnnnnNN",
  "NNnnnnnnnnxnnnnlnnnnnnnnlnnnnxnnnnnnnnNN",
  "NNnnnnnnnnxnnnnlnnnnnnnnlnnnnxnnnnnnnnNN",
  "NNnnnnnnnnnnnnnlnnnnnnnnlnnnnnnnnnnnnnNN",
  "NNnnunnnnnnnnnnlnnnnnnnnlnnnnnnnnnnunnNN",
  "NNnnnnnnnnnnnnnllllllllllnnnnnnnnnnnnnNN",
  "NNnnnnxnuunnnnnnnnnnnnnnnnnnnnuunxnnnnNN",
  "NNnnnnnnuunnnnnnnxnnnnxnnnnnnnuunnnnnnNN",
  "NNnnnnnnnnnnxnnnnnnnnnnnnnnxnnnnnnnnnnNN",
  "NNnnnnnnnnnnnnnnnunnnnunnnnnnnnnnnnnnnNN",
  "NNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNN",
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
];
