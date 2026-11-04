/**
 * Eight facings, clockwise from east (screen y points down):
 * 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE.
 */
export const FACING_COUNT = 8;

const D = Math.SQRT1_2;
const VECTORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [D, D],
  [0, 1],
  [-D, D],
  [-1, 0],
  [-D, -D],
  [0, -1],
  [D, -D],
];

/** Indexed by (dirY + 1) * 3 + (dirX + 1); -1 = no direction. Table lookup keeps it exact (no trig). */
const FROM_DIR = [5, 6, 7, 4, -1, 0, 3, 2, 1];

/** Unit vector of a facing. */
export function facingVector(facing: number): readonly [number, number] {
  return VECTORS[((facing % FACING_COUNT) + FACING_COUNT) % FACING_COUNT] ?? [0, 1];
}

/** Facing of an input direction (-1|0|1 per axis), or -1 for no direction. */
export function facingFromDir(dirX: number, dirY: number): number {
  return FROM_DIR[(Math.sign(dirY) + 1) * 3 + (Math.sign(dirX) + 1)] ?? -1;
}
