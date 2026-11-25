/**
 * The pack's perspective room kit (Dungeon.png): a ring of 2-tile walls built
 * from ONE top-wall strip, transformed for each side:
 *   top     as is                    bottom  flipped V (its door turned 180°)
 *   left    transposed (Tiled D)     right   transposed + flipped H
 * The strip is a row of 16x32 columns: corner (32 px), straight walls
 * (mirrored on the first half), studs beside the door and the door segment
 * (or plain wall). Each column is two cells: the outer one (y) and the inner
 * one (y + 16).
 *
 * Positions follow the 20x11 screen: top/bottom doors on columns 9..10 (a
 * 64 px door takes 8..11), side doors on rows 4..6 (a 48 px piece whose
 * 32 px opening is centred on row 5). Longer walls (the arena) have no door,
 * just a pair of studs in the middle.
 */

export type DoorKind = "open" | "boss" | "emblem";

/** A strip column: the pixel of its outer cell in the theme block, and whether it is mirrored. */
type Column = [number, number, boolean];

const CORNER: [number, number] = [16, 240];
const STRAIGHT: [number, number] = [208, 240];
const PLAIN: [number, number] = [112, 240];
const STUD_TB: [number, number] = [144, 240];
const STUD_LR: [number, number] = [160, 240];
/** Door segments: top/bottom piece [x, y, width] (a 64 px one takes columns 8..11) and side piece. */
const DOORS: Record<DoorKind, { tb: [number, number, number]; lr: [number, number, number] }> = {
  open: { tb: [0, 288, 32], lr: [32, 288, 48] },
  // Nothing locks the boss room: an open arch (the wide one on the sides), marked by horned plaques beside it.
  boss: { tb: [0, 288, 32], lr: [80, 288, 48] },
  // The pack's emblem door is a closed panel: the way to the mini-boss is an open arch too,
  // marked by plaques on the wall beside it (interior.ts wallDecor).
  emblem: { tb: [0, 288, 32], lr: [32, 288, 48] },
};

/** Columns of a piece `w` px wide at (x, y), mirrored as a whole when `flip`. */
function pieceCols(x: number, y: number, w: number, flip: boolean): Column[] {
  const cols: Column[] = [];
  for (let i = 0; i < w / 16; i++) cols.push([x + 16 * i, y, false]);
  return flip ? cols.reverse().map(([a, b, f]) => [a, b, !f]) : cols;
}

/**
 * The strip of one wall, `n` cells long: 20 (top/bottom of a room), 11 (its
 * sides) or any other length (no door: corners and straight walls only).
 */
function strip(n: number, side: "tb" | "lr", door: DoorKind | undefined, mirrorDoor: boolean): Column[] {
  const cols: Column[] = Array.from({ length: n }, (_, i) => [STRAIGHT[0], STRAIGHT[1], i < n / 2] as Column);
  const put = (i: number, cs: Column[]) => {
    cs.forEach((c, k) => {
      cols[i + k] = c;
    });
  };
  put(0, pieceCols(CORNER[0], CORNER[1], 32, false));
  put(n - 2, pieceCols(CORNER[0], CORNER[1], 32, true));
  const room = (side === "tb" && n === 20) || (side === "lr" && n === 11);
  const stud = side === "tb" ? STUD_TB : STUD_LR;
  if (!room) {
    // A long wall with no door: a pair of studs hides the seam where the mirrored half meets the other.
    if (n % 2 === 0) {
      put(n / 2 - 1, pieceCols(stud[0], stud[1], 16, false));
      put(n / 2, pieceCols(stud[0], stud[1], 16, true));
    }
    return cols;
  }
  // Studs either side of the door slot, then the door (or plain wall) in it.
  let at: number;
  let width: number;
  if (side === "tb") {
    put(8, pieceCols(STUD_TB[0], STUD_TB[1], 16, false));
    put(11, pieceCols(STUD_TB[0], STUD_TB[1], 16, true));
    [at, width] = [9, 32];
  } else {
    put(3, pieceCols(STUD_LR[0], STUD_LR[1], 16, false));
    put(7, pieceCols(STUD_LR[0], STUD_LR[1], 16, true));
    [at, width] = [4, 48];
  }
  let seg: Column[];
  if (!door) seg = Array.from({ length: width / 16 }, () => [PLAIN[0], PLAIN[1], false] as Column);
  else {
    const [dx, dy, dw] = DOORS[door][side];
    seg = pieceCols(dx, dy, dw, false);
    if (dw === 64) at = 8;
  }
  if (mirrorDoor) seg = seg.reverse().map(([a, b, f]) => [a, b, !f]);
  put(at, seg);
  return cols;
}

/** One cell of the ring: pixel (x, y) in the theme block and Tiled flags ("", "H", "DV"...). */
export interface KitCell {
  x: number;
  y: number;
  flags: string;
}

/**
 * The wall ring of a W x H room (cells: [y][x], undefined inside). `doors`
 * gives the door of each side (none = plain wall).
 */
export function roomRing(
  w: number,
  h: number,
  doors: Partial<Record<"n" | "s" | "w" | "e", DoorKind>>,
): (KitCell | undefined)[][] {
  const g: (KitCell | undefined)[][] = Array.from({ length: h }, () => Array(w).fill(undefined));
  const set = (x: number, y: number, c: KitCell) => {
    const row = g[y];
    if (row) row[x] = c;
  };
  const left = strip(h, "lr", doors.w, true);
  const right = strip(h, "lr", doors.e, false);
  const top = strip(w, "tb", doors.n, false);
  const bottom = strip(w, "tb", doors.s, true);
  left.forEach(([sx, sy, f], i) => {
    for (let r = 0; r < 2; r++) set(r, i, { x: sx, y: sy + 16 * r, flags: `D${f ? "V" : ""}` });
  });
  right.forEach(([sx, sy, f], i) => {
    for (let r = 0; r < 2; r++) set(w - 1 - r, i, { x: sx, y: sy + 16 * r, flags: `DH${f ? "V" : ""}` });
  });
  top.forEach(([sx, sy, f], i) => {
    for (let r = 0; r < 2; r++) set(i, r, { x: sx, y: sy + 16 * r, flags: f ? "H" : "" });
  });
  bottom.forEach(([sx, sy, f], i) => {
    for (let r = 0; r < 2; r++) set(i, h - 1 - r, { x: sx, y: sy + 16 * r, flags: `${f ? "H" : ""}V` });
  });
  return g;
}
