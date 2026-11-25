import { describe, expect, it } from "vitest";
import { BIG_TREE, type ForestRect, layForest } from "./forest";

const W = 40;
const SCREEN = { w: 20, h: 11 };
const sameScreen = (ax: number, ay: number, bx: number, by: number) =>
  Math.floor(ax / SCREEN.w) === Math.floor(bx / SCREEN.w) && Math.floor(ay / SCREEN.h) === Math.floor(by / SCREEN.h);

/** Which halves each id shows: [top, bottom], "L"/"R" or undefined. */
const HALVES: Record<number, [string?, string?]> = {
  [BIG_TREE.topLeft]: ["L", undefined],
  [BIG_TREE.topRight]: ["R", undefined],
  [BIG_TREE.bottomLeft]: [undefined, "L"],
  [BIG_TREE.bottomRight]: [undefined, "R"],
  [BIG_TREE.topLeftOverBottomRight]: ["L", "R"],
  [BIG_TREE.topRightOverBottomLeft]: ["R", "L"],
};

function lay(rects: ForestRect[], blocked = new Set<number>()) {
  const cells = new Set<number>();
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (!blocked.has(y * W + x)) cells.add(y * W + x);
  const isForest = (x: number, y: number) => x >= 0 && x < W && cells.has(y * W + x);
  return { cells, out: layForest(rects, W, isForest, sameScreen) };
}

/** Every half shown belongs to a whole tree: its three other quarters are where they must be. */
function expectWholeTrees(out: Map<number, number | null>) {
  const half = (x: number, y: number, slot: 0 | 1) => {
    const id = out.get(y * W + x);
    return id == null ? undefined : HALVES[id]?.[slot];
  };
  for (const [i, id] of out) {
    if (id === null) continue;
    expect(HALVES[id], `id ${id}`).toBeDefined();
    const x = i % W;
    const y = Math.floor(i / W);
    // The tree's top-left corner, from each half this cell shows.
    const corners: [number, number][] = [];
    const [t, b] = HALVES[id] ?? [];
    if (t) corners.push([t === "L" ? x : x - 1, y]);
    if (b) corners.push([b === "L" ? x : x - 1, y - 1]);
    for (const [cx, cy] of corners) {
      expect(
        [half(cx, cy, 0), half(cx + 1, cy, 0), half(cx, cy + 1, 1), half(cx + 1, cy + 1, 1)],
        `tree at ${cx},${cy}`,
      ).toEqual(["L", "R", "L", "R"]);
      expect(sameScreen(cx, cy, cx + 1, cy + 1), `tree at ${cx},${cy} crosses a screen border`).toBe(true);
    }
  }
}

describe("layForest", () => {
  it("fills a 2-row band of even width with trees side by side", () => {
    const { out } = lay([{ x: 2, y: 2, w: 6, h: 2 }]);
    expect([...out.values()].filter((v) => v === null)).toEqual([]);
    expectWholeTrees(out);
  });

  it("never cuts a tree at an odd edge: the leftover cells get small trees", () => {
    const { out, cells } = lay([{ x: 1, y: 1, w: 5, h: 3 }]);
    expect(out.size).toBe(cells.size);
    expect([...out.values()].some((v) => v === null)).toBe(true);
    expectWholeTrees(out);
  });

  it("staggers trees in a deep forest (the merged halves of the pack)", () => {
    const { out } = lay([{ x: 0, y: 0, w: 8, h: 6 }]);
    const ids = new Set(out.values());
    expect(ids.has(BIG_TREE.topLeftOverBottomRight)).toBe(true);
    expect(ids.has(BIG_TREE.topRightOverBottomLeft)).toBe(true);
    expectWholeTrees(out);
  });

  it("never splits a tree across a screen border", () => {
    const { out } = lay([{ x: 17, y: 8, w: 6, h: 6 }]);
    expectWholeTrees(out);
  });

  it("keeps trees whole over overlapping rectangles and blocked cells", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const rects = Array.from({ length: 1 + rnd(4) }, () => ({
        x: rnd(W - 6),
        y: rnd(16),
        w: 1 + rnd(6),
        h: 1 + rnd(5),
      }));
      const blocked = new Set(Array.from({ length: rnd(6) }, () => rnd(W * 22)));
      const { out, cells } = lay(rects, blocked);
      expect(out.size).toBe(cells.size);
      expectWholeTrees(out);
    }
  });
});
