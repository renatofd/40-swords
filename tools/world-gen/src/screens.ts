/**
 * The overworld, one ASCII block per screen (20x11 tiles each), laid out in a
 * 3x3 grid. An ORIGINAL layout: the structure (screens, regions, entrances)
 * follows classic top-down adventures, the content is our own.
 *
 * Legend (see tiles.ts for the tile behind each glyph):
 *   .  ground of the screen   ,  flowers     :  path       s  sand      o  stone floor
 *   m  mud                     =  bridge      T  tree       R  rock      W  water
 *   B  bush                    +  tombstone   P  pillar     C  cave      D  dungeon door
 *   S  player spawn (stone)    e  slime       g  goblin
 *
 * Edge rules (checked by the generator): screens touching left/right are open
 * on rows 4-6; screens touching top/bottom are open on columns 8-11; the outer
 * border of the world is closed.
 */

export interface ScreenDef {
  /** Region name, for Tiled and future HUD use. */
  name: string;
  /** Tile drawn under "." and under every obstacle. */
  ground: "grass" | "darkGrass" | "sand" | "mud";
  rows: string[];
}

export const SCREENS: ScreenDef[][] = [
  [
    {
      name: "Grey Crags",
      ground: "grass",
      rows: [
        "RRRRRRRRRRRRRRRRRRRR",
        "RRRRRRRPPDPPRRRRRRRR",
        "RRRR.....ooo.....RRR",
        "RR..........::.....R",
        "R....RR.....::......",
        "R...RRR....::....e..",
        "R....R....::........",
        "R.......::.....RR..R",
        "RR..g..::.....RRR.RR",
        "RRR....::......R..RR",
        "RRRRRRRR::..RRRRRRRR",
      ],
    },
    {
      name: "Whisperwood",
      ground: "darkGrass",
      rows: [
        "TTTTTTTTTTTTTTTTTTTT",
        "TT..T....TT....T..TT",
        "T..e...T.....e....TT",
        "T...TT.....TT......T",
        ".......T.......e....",
        "....e.......T.......",
        "..T.....TT..........",
        "T....T.......T..T..T",
        "TT.e....T...e.....TT",
        "TTT..T.........T.TTT",
        "TTTTTTTT....TTTTTTTT",
      ],
    },
    {
      name: "Stone Hills",
      ground: "grass",
      rows: [
        "RRRRRRRRRRRRRRRRRRRR",
        "RRRRCRRRRRRRRRRRRRRR",
        "RRR....RRR....RRRRRR",
        "R.........g......RRR",
        "...RR.........B...RR",
        ".....B...g...BB...RR",
        "..........RR.......R",
        "R...g....RRR....RRRR",
        "RR.......R.....g...R",
        "RRR...........RRRRRR",
        "RRRRRRRR....RRRRRRRR",
      ],
    },
  ],
  [
    {
      name: "Bloom Meadow",
      ground: "grass",
      rows: [
        "RRRRRRRR....RRRRRRRR",
        "T,,.....,,......,,.T",
        "T.,,..e.....,,.....T",
        "T......,,.....e..,.T",
        "T..B.........,,.....",
        "T.,,....e...........",
        "T.......,,..B.......",
        "T..,,.........,,...T",
        "T.e....,,......e...T",
        "T,,.........,,....,T",
        "TTTTTTTT....TTTTTTTT",
      ],
    },
    {
      name: "Sword Square",
      ground: "grass",
      rows: [
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
      ],
    },
    {
      name: "Mirror Lake",
      ground: "grass",
      rows: [
        "RRRRRRRR....RRRRRRRR",
        "R.........:........R",
        "R..WWWWWWW=WWWWW...R",
        "R.WWWWWWWW=WWWWWW..R",
        "...WWWWWWW=WWWWWW.gR",
        "......e...:......e.R",
        "...WWWWWWWWWWWW....R",
        "R.WWWWWWWWWWWWWW...R",
        "R..WWWWWWWWWWWW..e.R",
        "R....g.............R",
        "RRRRRRRR....RRRRRRRR",
      ],
    },
  ],
  [
    {
      name: "Murk Fen",
      ground: "darkGrass",
      rows: [
        "TTTTTTTT....TTTTTTTT",
        "Tmm....mmm.....mm..T",
        "T..mm.e....mmm.....T",
        "T.mmmm...WW....e...T",
        "T...mm..WWWW...mm...",
        "T.e.....WW.....mm...",
        "T..mmm.......g......",
        "T....mm..e....mmm..T",
        "Tmm.....mmm.......mT",
        "TTmm..+...mm..+..TTT",
        "TTTTTTTTTTTTTTTTTTTT",
      ],
    },
    {
      name: "Old Graves",
      ground: "darkGrass",
      rows: [
        "TTTTTTTT....TTTTTTTT",
        "T..+..+.......+..+.T",
        "T...........g......T",
        "T.+..+..PoooP..+...T",
        ".......oooooooo.....",
        "...g...oo+..+oo..g..",
        ".......oooooooo.....",
        "T.+..+..PoooP..+...T",
        "T.........g........T",
        "T..+..+.......+..+.T",
        "TTTTTTTTTTTTTTTTTTTT",
      ],
    },
    {
      name: "Amber Dunes",
      ground: "sand",
      rows: [
        "RRRRRRRR....RRRRRRRR",
        "R....ss.......ss...R",
        "R..RR..ss..g.......R",
        "R....s......RR...RRR",
        ".......ss.......g..R",
        "...g......ss.......R",
        "..........C.....s.RR",
        "R..RR...........s..R",
        "R.....g.....RR.....R",
        "RR................RR",
        "RRRRRRRRRRRRRRRRRRRR",
      ],
    },
  ],
];
