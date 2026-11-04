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
 *   G meadow   F forest   H hills   M mountains   L lake   D desert
 *   W swamp    Y graveyard   B beach   C the start square (centre)
 */
export const BIOMES = [
  "MMMHHFFFFFHHMMMM",
  "MMHHFFFFFFHHHMMM",
  "YYHGGFFGGFFHDDDM",
  "YYGGGGLLGGGGDDDD",
  "WWGGGLLLCGGGDDDD",
  "WWWGGLLGGGGHDDDD",
  "WWWFFGGGGHHHHDDB",
  "WWFFFFGGHHHMMBBB",
];
export type Biome = "G" | "F" | "H" | "M" | "L" | "D" | "W" | "Y" | "B" | "C";

export const OVERWORLD_COLUMNS = 16;
export const OVERWORLD_ROWS = 8;
/** Rows of interior screens (dungeons, caves and the arena) below the overworld. */
export const INTERIOR_ROWS = 4;

export interface DungeonDef {
  id: string;
  /** Overworld screen with the dungeon door. */
  door: [number, number];
  /** Top-left screen of its 3x3 rooms in the interior band (column, row inside the band). */
  at: [number, number];
  /** 1 (easiest) to 4. */
  depth: number;
  miniboss: string;
  boss: string;
  /** Enemy glyphs of its rooms. */
  enemies: string;
  /** Mirror the room layout left/right. */
  mirror: boolean;
}

export const DUNGEONS: DungeonDef[] = [
  { id: "crypt", door: [1, 3], at: [0, 0], depth: 1, miniboss: "brute", boss: "warden", enemies: "kkb", mirror: false },
  { id: "lair", door: [1, 6], at: [3, 0], depth: 2, miniboss: "hexer", boss: "witch", enemies: "fefb", mirror: true },
  {
    id: "tomb",
    door: [14, 5],
    at: [6, 0],
    depth: 3,
    miniboss: "brute",
    boss: "matriarch",
    enemies: "zzk",
    mirror: false,
  },
  {
    id: "hall",
    door: [14, 1],
    at: [9, 0],
    depth: 4,
    miniboss: "hexer",
    boss: "colossus",
    enemies: "gkb",
    mirror: true,
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
  { door: [11, 2], type: "shop" },
  { door: [5, 3], type: "shop" },
  { door: [6, 5], type: "shop" },
  { door: [3, 6], type: "shop" },
  { door: [10, 6], type: "shop" },
  { door: [12, 7], type: "treasure" },
];
export const CAVES_AT_COLUMN = 12;

/** The start square, hand-made (all four sides open). */
export const START_SCREEN = [
  "TTTTTTTT....TTTTTTTT",
  "T.......::::.......T",
  "T..B...oooooo...B..T",
  "T.....oooooooo.....T",
  "......ooSoPoSoo.....",
  "::::::ooooSSoooo::::",
  "......ooSoooSoo.....",
  "T.....oooooooo.....T",
  "T..B...oooooo...B..T",
  "T.......::::.......T",
  "TTTTTTTT....TTTTTTTT",
];

export const SHOP_CAVES = [
  [
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
    "KKKHH__________HHKKK",
    "KK_____QQVQQ______KK",
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
    "KKK______HH______KKK",
    "KK_____QQVQQ______KK",
    "KK________________KK",
    "KK__H__________H__KK",
    "KK________________KK",
    "KKK______________KKK",
    "KKKKKKK______KKKKKKK",
    "KKKKKKKKKXKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKK",
  ],
];

export const TREASURE_CAVE = [
  "KKKKKKKKKKKKKKKKKKKK",
  "KKKKKKKKKKKKKKKKKKKK",
  "KKK__$________$__KKK",
  "KK________________KK",
  "KK____KK____KK____KK",
  "KK________________KK",
  "KK____KK_$__KK____KK",
  "KKK______________KKK",
  "KKKKKKK______KKKKKKK",
  "KKKKKKKKKXKKKKKKKKKK",
  "KKKKKKKKKKKKKKKKKKKK",
];

/**
 * The battle royale arena (2x2 screens, top-left screen ARENA_AT inside the
 * interior band). Nothing leads in or out: at 30 minutes the server teleports
 * every hero to the "x" spawns.
 *   N wall   n sand   l painted line (decoration)   u pillar   x arena spawn
 */
export const ARENA_AT: [number, number] = [12, 2];
export const ARENA_SCREENS: [number, number] = [2, 2];
export const ARENA = [
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
  "NnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnN",
  "NnnnnnnnnnnnnnnnnnnuunnnnnnnnnnnnnnnnnnN",
  "NnnnunnnnnnnnnnnnnnnnnnnnnnnnnnnnnnunnnN",
  "NnnnnnnnnnnnnnnnnxnnnnxnnnnnnnnnnnnnnnnN",
  "NnnnnnnnnnnnxnnnnnnnnnnnnnnxnnnnnnnnnnnN",
  "NnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnN",
  "NnnnnnnnxnnnnnnnnnllllnnnnnnnnnxnnnnnnnN",
  "NnnnnnnnnnnnnnnunlnnnnlnunnnnnnnnnnnnnnN",
  "NnnnnnxnnnnnnnnnlnnnnnnlnnnnnnnnnxnnnnnN",
  "NnnnnnnnnnnunnnnlnnllnnlnnnnunnnnnnnnnnN",
  "NnnnnnxnnnnnnnnnlnnnnnnlnnnnnnnnnxnnnnnN",
  "NnnnnnnnnnnnnnnunlnnnnlnunnnnnnnnnnnnnnN",
  "NnnnnnnnxnnnnnnnnnllllnnnnnnnnnxnnnnnnnN",
  "NnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnN",
  "NnnnnnnnnnnnxnnnnnnnnnnnnnnxnnnnnnnnnnnN",
  "NnnnnnnnnnnnnnnnnxnnnnxnnnnnnnnnnnnnnnnN",
  "NnnnunnnnnnnnnnnnnnnnnnnnnnnnnnnnnnunnnN",
  "NnnnnnnnnnnnnnnnnnnuunnnnnnnnnnnnnnnnnnN",
  "NnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnN",
  "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
];
