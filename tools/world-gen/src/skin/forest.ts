/**
 * Dense forest made of whole big trees.
 *
 * The pack's big tree is 2x2 cells, and in a dense forest each tree sits one
 * cell down and one cell aside from its neighbours, so most cells show the
 * bottom half of one tree under the top half of the next (709, 773). Tiling
 * that pattern over a rectangle cuts trees at its edges, at the screen border
 * and where two forests overlap. Instead, trees are placed one by one where
 * the whole tree fits (four forest cells on one screen) and every cell only
 * ever shows halves the pack draws together. Forest cells no big tree covers
 * get a small 1x1 tree.
 *
 * Every cell has two slots: the top half of a tree that starts on its row
 * (left or right half) and the bottom half of a tree that started on the row
 * above. The pack draws a top-left half only next to a bottom-right one (773)
 * and a top-right only next to a bottom-left (709); placing a tree checks
 * that, so no cell ever needs art the pack does not have.
 */

/** Overworld ids (variant A, before the palette offset) of the big tree halves. */
export const BIG_TREE = {
  /** Top-left half alone (642 = 645 = 708 in the pack). */
  topLeft: 642,
  /** Top-right half alone (643 = 646 = 774). */
  topRight: 643,
  /** Bottom-left half, the trunk (706 = 772 = 837). */
  bottomLeft: 706,
  /** Bottom-right half (707 = 710). */
  bottomRight: 707,
  /** Top-left of a tree over the bottom-right of the tree above and to the left. */
  topLeftOverBottomRight: 773,
  /** Top-right of a tree over the bottom-left of the tree above and to the right. */
  topRightOverBottomLeft: 709,
} as const;

export interface ForestRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Half = "L" | "R";

/**
 * Lays big trees over the forest cells.
 *
 * - `rects`: the forest rectangles, in drawing order. Each one first gets the
 *   staggered pattern anchored at its own corner (a 2-row band becomes a row
 *   of trees side by side), then any gap where a tree still fits is filled.
 * - `isForest(x, y)`: whether the cell may hold part of a big tree.
 * - `together(ax, ay, bx, by)`: whether two cells may hold the same tree
 *   (the same screen: a tree is never split by the screen border).
 *
 * Returns, for every forest cell of the rectangles, the tree id (variant A) or
 * `null` where no big tree fits (a small tree goes there).
 */
export function layForest(
  rects: readonly ForestRect[],
  width: number,
  isForest: (x: number, y: number) => boolean,
  together: (ax: number, ay: number, bx: number, by: number) => boolean,
): Map<number, number | null> {
  const top = new Map<number, Half>();
  const bottom = new Map<number, Half>();
  const at = (x: number, y: number) => y * width + x;

  const tryTree = (x: number, y: number) => {
    if (!(isForest(x, y) && isForest(x + 1, y) && isForest(x, y + 1) && isForest(x + 1, y + 1))) return;
    if (!together(x, y, x + 1, y + 1)) return;
    const tl = at(x, y);
    const tr = at(x + 1, y);
    const bl = at(x, y + 1);
    const br = at(x + 1, y + 1);
    if (top.has(tl) || top.has(tr) || bottom.has(bl) || bottom.has(br)) return;
    // Only pairs the pack draws: top-left over bottom-right, top-right over bottom-left.
    if (bottom.get(tl) === "L" || bottom.get(tr) === "R" || top.get(bl) === "L" || top.get(br) === "R") return;
    top.set(tl, "L");
    top.set(tr, "R");
    bottom.set(bl, "L");
    bottom.set(br, "R");
  };

  for (const r of rects)
    for (let y = r.y; y < r.y + r.h - 1; y++)
      for (let x = r.x; x < r.x + r.w - 1; x++) if ((x - r.x + y - r.y) % 2 === 0) tryTree(x, y);
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h - 1; y++) for (let x = r.x; x < r.x + r.w - 1; x++) tryTree(x, y);

  const out = new Map<number, number | null>();
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = at(x, y);
        if (out.has(i) || !isForest(x, y)) continue;
        const t = top.get(i);
        const b = bottom.get(i);
        out.set(
          i,
          t === "L"
            ? b
              ? BIG_TREE.topLeftOverBottomRight
              : BIG_TREE.topLeft
            : t === "R"
              ? b
                ? BIG_TREE.topRightOverBottomLeft
                : BIG_TREE.topRight
              : b === "L"
                ? BIG_TREE.bottomLeft
                : b === "R"
                  ? BIG_TREE.bottomRight
                  : null,
        );
      }
  return out;
}
