/**
 * Skin of the interior band (below the overworld): dungeon rooms, caves
 * (shops and treasure), the 2x2 arena and the unused bedrock screens.
 *
 * Dungeon rooms and the arena use the pack's perspective room kit (kit.ts):
 * 2-tile walls with open arches on the openings; plaques on the wall mark the
 * doors into the boss room (horns) and around the mini-boss (suns).
 */
import {
  ARENA_THEME,
  BIG_BLOCKS,
  CARPETS,
  CLIFF,
  DUNGEON_DARK,
  DUNGEON_POTS,
  DUNGEON_THEMES,
  dfloor,
  dgTile,
  dungeonPot,
  FURNITURE,
  kit,
  OVERWORLD_POTS,
  plain,
  SMALL_BLOCKS,
  STATUE_KINDS,
  specks,
  stacked,
  statue,
  tiles,
} from "../tiles";
import {
  blob,
  cellsOf,
  E,
  mask4,
  mask8,
  N,
  noise,
  patch,
  type Rect,
  rectRole,
  S,
  type ScreenInfo,
  type SkinLayers,
  screensOf,
  variant,
  W,
  type WorldView,
} from "./common";
import { type DoorKind, roomRing } from "./kit";

/** Rock of the cave walls: the cliff band of the Exotic sheet, dark grey palette (column offset). */
const CAVE_ROCK = { sheet: "ex", offset: 45 } as const;
/** Statues in the alternate (stone) colour, which stands out on the theme's floor. */
/**
 * Statues in the alternate (stone) colour where it stands out on the theme's
 * floor; the tomb keeps its violet main colour (its alt colour is a lime green
 * that reads as a slime).
 */
const STATUE_ALT: Record<string, boolean> = { crypt: false, lair: true, tomb: false, hall: true };
/**
 * Carpets (Tiles.png): a 48x80 block whose rows 0, 1 and 4 make a 9-slice
 * (top, middle, bottom) and the line of the arena (a flat frame with no middle).
 */
const ARENA_LINE = { theme: 2, block: [64, 32] as [number, number] };
/** Pillars of the arena: the big block with the light top (it reads as raised on the sand). */
const ARENA_PILLAR: [number, number] = [256, 480];
/**
 * Floors of the arena: packed sand in the cream and tan of its walls (theme 5),
 * and stone inside the painted line (Tiles.png theme 2): plain flags with a
 * border of a second pattern and a star medallion in the middle.
 */
const ARENA_SAND = "arena:sand";
const ARENA_STONE = { theme: 2, plain: [0, 336], border: [16, 352], medallion: [128, 352] } as const;
/** Arena palette (theme 5): cream sand, tan specks, brown. */
const SAND_TAN = 0xc59782;
/** The spawn pads: Tiles.png's rune circle in the arena's colours. */
const ARENA_PAD: [number, number] = [32, 400];
const ARENA_PAD_RECOLOR: [number, number][] = [
  [0x7b7b7b, 0xc59782],
  [0xa8a8a8, 0xe2d7b5],
  [0xd7d7d7, 0xfff0a0],
];

/** Stone floor inside the painted line (local cell in the line's rectangle). */
function arenaStone(lx: number, ly: number, r: Rect): string {
  const { theme } = ARENA_STONE;
  const cx = (r.w - 1) / 2;
  const cy = (r.h - 1) / 2;
  if (Math.abs(lx - cx) < 1 && Math.abs(ly - cy) < 1) return tiles(theme, ...ARENA_STONE.medallion);
  // A closed ring of the second pattern one cell inside the line (it stops at its corners).
  const inset = lx >= 1 && ly >= 1 && lx <= r.w - 2 && ly <= r.h - 2;
  if (inset && (lx === 1 || ly === 1 || lx === r.w - 2 || ly === r.h - 2)) return tiles(theme, ...ARENA_STONE.border);
  return tiles(theme, ...ARENA_STONE.plain);
}

/**
 * Decals on the arena sand: rune pads under the spawn points, scuffed sand
 * along the walls and in the shadow of the pillars, raked patches and specks.
 */
function arenaDecal(view: WorldView, x: number, y: number, pillar: (x: number, y: number) => boolean): string {
  const { seed } = view;
  const g = view.glyph(x, y);
  // One pad per spawn, but two spawns one above the other share the upper pad (two would read as one rug).
  if (g === "x" && view.glyph(x, y - 1) !== "x") return tiles(2, ...ARENA_PAD, ARENA_PAD_RECOLOR);
  const wall = (xx: number, yy: number) => view.glyph(xx, yy) === "N";
  if (pillar(x, y - 1) || mask4(x, y, wall) !== 0) return specks(SAND_TAN, variant([2, 3], seed, x, y, 50) as 2 | 3);
  if (blob(seed, x, y, 4, 51) > 0.66) return specks(SAND_TAN, variant([1, 2], seed, x, y, 52) as 1 | 2);
  if (noise(seed, x, y, 53) < 0.25) return specks(SAND_TAN, 1);
  return "";
}
/** Statue kind of the arena (STATUE_KINDS: 5 is an open hand). */
const ARENA_STATUE = 5;
/** Floor of the caves: mud (the Exotic sheet), speckled here and there. */
const CAVE_FLOOR = "mud";
/** Colours of the cave floor decals: the darkest brown of the mud tiles (damp patches), light gravel by the walls. */
const DAMP = 0x231712;
const GRAVEL = 0x7b7b7b;
/** Pebbles (rows 25-28, variant A ids) and the grey palette used in the caves. */
const PEBBLES = [1605, 1669, 1733, 1797] as const;
const CAVE_PEBBLES = 36;

/** Some cell 2 steps away (straight) passes `test`. */
const near2 = (x: number, y: number, test: (x: number, y: number) => boolean) =>
  test(x + 2, y) || test(x - 2, y) || test(x, y + 2) || test(x, y - 2);

export function skinInterior(view: WorldView, out: SkinLayers) {
  skinDungeons(view, out);
  skinCaves(view, out);
  skinArena(view, out);
  // Bedrock (interior screens nobody can reach): plain dark rock.
  for (const { bounds } of screensOf(view, "bedrock"))
    for (const [x, y] of cellsOf(bounds)) {
      out.set("ground", x, y, "black");
      out.set("walls", x, y, plain(199, true));
    }
}

// ─── Dungeons ─────────────────────────────────────────────────────────────

/** Door art between two rooms: the boss door into (and out of) the boss room, the emblem door around the mini-boss. */
function doorKind(a: ScreenInfo, b: ScreenInfo | undefined): DoorKind {
  if (a.room === "boss" || b?.room === "boss") return "boss";
  if (a.room === "miniboss" || b?.room === "miniboss") return "emblem";
  return "open";
}

type Borders = Partial<Record<"n" | "s" | "w" | "e", boolean>>;
const ALL_BORDERS: Borders = { n: true, s: true, w: true, e: true };
/** 9-slice of a carpet block (Tiles.png) over a rectangle; a side without its border runs on (a runner). */
function carpet(out: SkinLayers, theme: number, [bx, by]: [number, number], r: Rect, borders = ALL_BORDERS) {
  for (const [x, y] of cellsOf(r)) {
    const role = rectRole(r, x, y);
    const v = borders.n && role.startsWith("n") ? 0 : borders.s && role.startsWith("s") ? 64 : 16;
    const h = borders.w && role.endsWith("w") ? 0 : borders.e && role.endsWith("e") ? 32 : 16;
    out.set("ground2", x, y, tiles(theme, bx + h, by + v));
  }
}
/** Rune circle under the mini-boss (Tiles.png theme 2: a light stone with an orange star, it shows on every floor). */
const RUNE = { theme: 2, cell: [128, 352] as [number, number] };
/** Single floor tiles of Tiles.png that tile a whole room (some side rooms). */
const ROOM_FLOORS: [number, number][] = [
  [0, 336],
  [16, 336],
];
/** Tiles.png theme of those floors in each dungeon: dark tones close to its own (not the carpets'). */
const ROOM_FLOOR_THEME: Record<string, number> = { crypt: 0, lair: 1, tomb: 8, hall: 3 };

/** Dice plaques (1 to 6) and emblem plaques (sun, moon, horns) of the wall face, 16x16. */
const DICE = (n: number): [number, number] => [240 + 16 * n, 160];
const SUN: [number, number] = [208, 160];
const MOON: [number, number] = [224, 160];
const HORNS: [number, number] = [240, 160];
/** Banners: 3 cells wide (pole, cloth, pole) by 2 tall; the cloth shows a sun, a moon or a skull. */
const BANNER_CLOTHS = [192, 224, 240] as const;

/**
 * Things hung on the top wall of a room (screen cell "x,y" → Dungeon.png cell):
 * the dungeon's number on dice plaques by the entrance's north door, banners
 * in the boss room, sometimes a pair of emblems elsewhere. Only on plain
 * straight wall cells.
 */
function wallDecor(
  info: ScreenInfo,
  ring: ReturnType<typeof roomRing>,
  doors: Partial<Record<"n" | "s" | "w" | "e", DoorKind>>,
  seed: number,
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const straight = (x: number, y: number) => ring[y]?.[x]?.x === 208;
  const put = (x: number, y: number, cell: [number, number]) => {
    if (straight(x, y)) out.set(`${x},${y}`, cell);
  };
  // Plaques on the top wall mark the way into the boss room (horns) and around the mini-boss (suns).
  const marks: [DoorKind, [number, number]][] =
    info.room === "boss"
      ? []
      : [
          ["boss", HORNS],
          ["emblem", SUN],
        ];
  for (const [kind, plaque] of marks) {
    if (doors.n === kind) {
      put(7, 1, plaque);
      put(12, 1, plaque);
    }
    if (doors.w === kind) put(3, 1, plaque);
    if (doors.e === kind) put(16, 1, plaque);
  }
  if (out.size > 0) return out;
  if (info.room === "entrance") {
    const dice = DICE(info.dungeon?.depth ?? 1);
    put(5, 1, dice);
    put(14, 1, dice);
  } else if (info.room === "boss" || info.room === "miniboss") {
    const cloth = variant(BANNER_CLOTHS, seed, info.col, info.row, 25);
    for (const x0 of [3, 14]) {
      if (![0, 1, 2].every((i) => straight(x0 + i, 0) && straight(x0 + i, 1))) continue;
      [176, cloth, 208].forEach((bx, i) => {
        put(x0 + i, 0, [bx, 416]);
        put(x0 + i, 1, [bx, 432]);
      });
    }
  } else if (noise(seed, info.col, info.row, 26) < 0.5) {
    put(5, 1, MOON);
    put(14, 1, MOON);
  }
  return out;
}

function skinDungeons(view: WorldView, out: SkinLayers) {
  const { seed } = view;
  for (const { info, bounds } of screensOf(view, "dungeon")) {
    const id = info.dungeon?.id ?? "";
    const theme = DUNGEON_THEMES[id] ?? 0;
    const { x: x0, y: y0, w, h } = bounds;
    const open = (lx: number, ly: number) => view.glyph(x0 + lx, y0 + ly) !== "#";
    const next = (dx: number, dy: number) => view.screen(x0 + dx * w, y0 + dy * h);
    const doors: Partial<Record<"n" | "s" | "w" | "e", DoorKind>> = {};
    if (open(9, 1)) doors.n = doorKind(info, next(0, -1));
    if (open(9, h - 2)) doors.s = info.room === "entrance" ? "open" : doorKind(info, next(0, 1));
    if (open(1, 5)) doors.w = doorKind(info, next(-1, 0));
    if (open(w - 2, 5)) doors.e = doorKind(info, next(1, 0));
    const ring = roomRing(w, h, doors);
    const decor = wallDecor(info, ring, doors, view.seed);

    // Some side rooms get a tiled floor; it also shows through the open arches of their doors.
    const roll = noise(seed, info.col, info.row, 28);
    const roomFloor =
      info.room === "side" && roll < 0.4
        ? tiles(ROOM_FLOOR_THEME[id] ?? 0, ...variant(ROOM_FLOORS, seed, info.col, info.row, 29))
        : undefined;
    const dark = DUNGEON_DARK[theme] ?? 0;
    const wallCell = (x: number, y: number) => ring[y - y0]?.[x - x0] !== undefined && view.solid(x, y);

    // One statue kind and one block look per room.
    const kind = variant(STATUE_KINDS, seed, info.col, info.row, 20);
    const block = variant(SMALL_BLOCKS, seed, info.col, info.row, 22);
    const big = variant(BIG_BLOCKS, seed, info.col, info.row, 23);
    const isBlock = (x: number, y: number) => view.glyph(x, y) === "J";
    const bigDone = new Set<number>();
    for (const [x, y] of cellsOf(bounds)) {
      const g = view.glyph(x, y);
      out.set("ground", x, y, dfloor(theme));
      const c = ring[y - y0]?.[x - x0];
      if (c) {
        const solid = view.solid(x, y);
        const wall = kit(theme, c.x, c.y, c.flags, solid, !solid && roomFloor ? roomFloor : dfloor(theme));
        const over = decor.get(`${x - x0},${y - y0}`);
        out.set("walls", x, y, over ? stacked([wall, dgTile(theme, over[0], over[1])]) : wall);
      } else if (g === "I") {
        const s = statue(theme, kind, STATUE_ALT[id] ?? false);
        out.set("walls", x, y, s.bottom);
        out.set("above", x, y - 1, s.top);
      } else if (g === "J" && !bigDone.has(y * view.width + x)) {
        if (isBlock(x + 1, y) && isBlock(x, y + 1) && isBlock(x + 1, y + 1)) {
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ] as const) {
            bigDone.add((y + dy) * view.width + x + dx);
            out.set("walls", x + dx, y + dy, kit(theme, big[0] + 16 * dx, big[1] + 16 * dy));
          }
        } else out.set("walls", x, y, kit(theme, block[0], block[1]));
      } else if (!view.solid(x, y)) {
        // Worn floor: a darker dither along the foot of the walls, a few scuffed tiles elsewhere.
        const foot = mask4(x, y, wallCell) !== 0;
        if (foot ? noise(seed, x, y, 90) < 0.6 : noise(seed, x, y, 91) < 0.07)
          out.set("ground2", x, y, specks(dark, variant(foot ? [1, 2] : [1, 1, 2], seed, x, y, 92) as 1 | 2));
      }
      if (view.prop(x, y) === "pot") {
        const [px, py] = variant(DUNGEON_POTS, seed, x, y, 21);
        out.set("props", x, y, dungeonPot(theme, px, py));
      }
    }
    // Floors: runners between the doors, a rug under the boss and the chest,
    // a rune circle under the mini-boss, a tiled floor in some side rooms.
    const rug = CARPETS[id] ?? { theme: 0, block: [128, 32] };
    const clear = (r: Rect) => [...cellsOf(r)].every(([x, y]) => !view.solid(x0 + x, y0 + y));
    const lay = (r: Rect, borders = ALL_BORDERS) => {
      if (clear(r)) carpet(out, rug.theme, rug.block, { ...r, x: x0 + r.x, y: y0 + r.y }, borders);
    };
    const vertical = { x: 8, y: 2, w: 4, h: 7 };
    const horizontal = { x: 2, y: 4, w: 16, h: 3 };
    if (info.room === "entrance") {
      if (doors.n) lay(vertical, { w: true, e: true });
      else lay({ x: 8, y: 4, w: 4, h: 5 }, { n: true, w: true, e: true });
    } else if (info.room === "boss") lay({ x: 5, y: 3, w: 10, h: 5 });
    else if (info.room === "treasure") lay({ x: 8, y: 4, w: 4, h: 3 });
    else if (info.room === "miniboss") out.set("ground2", x0 + 9, y0 + 5, tiles(RUNE.theme, ...RUNE.cell));
    else if (roomFloor) {
      for (let y = 2; y < h - 2; y++)
        for (let x = 2; x < w - 2; x++) if (!view.solid(x0 + x, y0 + y)) out.set("ground2", x0 + x, y0 + y, roomFloor);
    } else if (roll < 0.7) {
      if (doors.n && doors.s) lay(vertical, { w: true, e: true });
      else if (doors.w && doors.e) lay(horizontal, { n: true, s: true });
    }
  }
}

// ─── Caves ────────────────────────────────────────────────────────────────

/**
 * Rock piece of a cave wall cell, by the open cells around it (inside its
 * screen). Open is anything but rock: shelves, counters and crates stand in
 * front of the wall, so its face goes on behind them.
 */
function rockPiece(view: WorldView, bounds: Rect, x: number, y: number): number {
  const floor = (xx: number, yy: number) =>
    xx >= bounds.x &&
    yy >= bounds.y &&
    xx < bounds.x + bounds.w &&
    yy < bounds.y + bounds.h &&
    view.glyph(xx, yy) !== "K";
  const m = mask4(x, y, floor);
  const pickOf = (ids: number | readonly number[], salt: number) =>
    typeof ids === "number" ? ids : variant(ids, view.seed, x, y, salt);
  const corners: [number, number | readonly number[]][] = [
    [N | W, CLIFF.nw],
    [N | E, CLIFF.ne],
    [S | W, CLIFF.sw],
    [S | E, CLIFF.se],
    [N, CLIFF.n],
    [S, CLIFF.s],
    [W, CLIFF.w],
    [E, CLIFF.e],
    [0, CLIFF.mid],
  ];
  for (const [bits, ids] of corners) if (m === bits) return pickOf(ids, 30);
  // Floor on opposite sides (a rock 1 tile thick): a loose boulder.
  return variant([1600, 1601, 1664, 1665, 1666], view.seed, x, y, 31);
}

function skinCaves(view: WorldView, out: SkinLayers) {
  const { seed } = view;
  const floor = (x: number, y: number) => /[_V$]/.test(view.glyph(x, y));
  for (const { bounds } of screensOf(view, "cave"))
    for (const [x, y] of cellsOf(bounds)) {
      const g = view.glyph(x, y);
      // The floor: mud with patches of dark mud (dithered at their edge),
      // specks, grey pebbles and gravel against the walls.
      const dark = (xx: number, yy: number) => floor(xx, yy) && patch(seed, xx, yy, 5, 34) > 0.64;
      const wall = (xx: number, yy: number) => view.glyph(xx, yy) === "K";
      let ground: string = CAVE_FLOOR;
      if (g === "X") ground = "caveExit";
      else if (g === "V") ground = `${CAVE_FLOOR}!`;
      else if (noise(seed, x, y, 33) < 0.18) ground = `${CAVE_FLOOR}:tufts`;
      out.set("ground", x, y, ground);
      if (floor(x, y) && g !== "V") {
        // Damp patches: dark specks over the mud, denser inside and mixed cell by cell
        // (levels, flips, a few bare cells) so they do not make a lattice; a 2-cell rim fades them out.
        const flip = variant(["none", "flipH", "flipV", "rot180"] as const, seed, x, y, 41);
        const rim = mask4(x, y, dark) !== 0 ? 2 : mask8(x, y, dark) !== 0 || near2(x, y, dark) ? 1 : 0;
        const decal =
          view.glyph(x, y + 1) === "X"
            ? // Worn ground in front of the way out.
              specks(GRAVEL, 3)
            : dark(x, y)
              ? noise(seed, x, y, 42) < 0.15
                ? ""
                : specks(
                    DAMP,
                    variant(mask8(x, y, dark) === 255 ? [2, 3, 4] : [2, 2, 3], seed, x, y, 35) as 2 | 3 | 4,
                    flip,
                  )
              : rim > 0 && noise(seed, x, y, 43) < 0.75
                ? specks(DAMP, rim as 1 | 2, flip)
                : mask4(x, y, wall) !== 0 && noise(seed, x, y, 36) < 0.5
                  ? specks(GRAVEL, variant([1, 2], seed, x, y, 37) as 1 | 2)
                  : noise(seed, x, y, 38) < 0.08
                    ? plain(variant(PEBBLES, seed, x, y, 39) + CAVE_PEBBLES, false)
                    : "";
        if (decal) out.set("ground2", x, y, decal);
      }
      const at = (dx: number, dy = 0) => view.glyph(x + dx, y + dy);
      if (g === "K")
        out.set("walls", x, y, plain(rockPiece(view, bounds, x, y) + CAVE_ROCK.offset, true, CAVE_ROCK.sheet));
      else if (g === "H")
        out.set(
          "walls",
          x,
          y,
          at(-1) === "H" ? "shelf:r" : at(1) === "H" ? "shelf:l" : variant(FURNITURE, seed, x, y, 40),
        );
      else if (g === "Q")
        out.set("walls", x, y, at(-1) !== "Q" ? "counter:l" : at(1) !== "Q" ? "counter:r" : "counter:m");
      if (view.prop(x, y) === "pot") out.set("props", x, y, `pot:${variant(OVERWORLD_POTS, seed, x, y, 32)}`);
    }
}

// ─── Arena ────────────────────────────────────────────────────────────────

function skinArena(view: WorldView, out: SkinLayers) {
  const screens = screensOf(view, "arena");
  if (screens.length === 0) return;
  const x0 = Math.min(...screens.map((s) => s.bounds.x));
  const y0 = Math.min(...screens.map((s) => s.bounds.y));
  const x1 = Math.max(...screens.map((s) => s.bounds.x + s.bounds.w));
  const y1 = Math.max(...screens.map((s) => s.bounds.y + s.bounds.h));
  const area: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const ring = roomRing(area.w, area.h, {});
  // The painted line: the frame around the "l" cells.
  const line = [...cellsOf(area)].filter(([x, y]) => view.glyph(x, y) === "l");
  const lx = Math.min(...line.map(([x]) => x));
  const ly = Math.min(...line.map(([, y]) => y));
  const lineRect: Rect = {
    x: lx,
    y: ly,
    w: Math.max(...line.map(([x]) => x)) - lx + 1,
    h: Math.max(...line.map(([, y]) => y)) - ly + 1,
  };
  const pillar = (x: number, y: number) => view.glyph(x, y) === "u";
  const bigDone = new Set<number>();
  // A hand statue: the orb statues read as bombs on the sand.
  const kind = ARENA_STATUE;
  for (const [x, y] of cellsOf(area)) {
    const g = view.glyph(x, y);
    const inLine = x >= lineRect.x && y >= lineRect.y && x < lineRect.x + lineRect.w && y < lineRect.y + lineRect.h;
    out.set("ground", x, y, inLine ? arenaStone(x - lineRect.x, y - lineRect.y, lineRect) : ARENA_SAND);
    if (!inLine && !view.solid(x, y)) {
      const decal = arenaDecal(view, x, y, pillar);
      if (decal) out.set("ground2", x, y, decal);
    }
    const c = ring[y - y0]?.[x - x0];
    if (c) out.set("walls", x, y, kit(ARENA_THEME, c.x, c.y, c.flags, view.solid(x, y)));
    else if (g === "l") {
      const [bx, by] = ARENA_LINE.block;
      const role = rectRole(lineRect, x, y);
      const v = role.startsWith("n") ? 0 : role.startsWith("s") ? 64 : 16;
      const h = role.endsWith("w") ? 0 : role.endsWith("e") ? 32 : 16;
      out.set("ground2", x, y, tiles(ARENA_LINE.theme, bx + h, by + v));
    } else if (g === "u" && !bigDone.has(y * view.width + x)) {
      if (pillar(x + 1, y) && pillar(x, y + 1) && pillar(x + 1, y + 1)) {
        const [bx, by] = ARENA_PILLAR;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          bigDone.add((y + dy) * view.width + x + dx);
          out.set("walls", x + dx, y + dy, kit(ARENA_THEME, bx + 16 * dx, by + 16 * dy, "", true, ARENA_SAND));
        }
      } else {
        const s = statue(ARENA_THEME, kind, false, ARENA_SAND);
        out.set("walls", x, y, s.bottom);
        out.set("above", x, y - 1, s.top);
      }
    }
  }
}
