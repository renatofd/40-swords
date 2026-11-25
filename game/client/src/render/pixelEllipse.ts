/**
 * Hard-edged ellipses for the pixel art (shadows, the elite glow): whole-pixel
 * rows at one alpha, instead of the anti-aliased ellipses of Phaser's Graphics.
 * Pure (tested without a browser); proceduralArt.ts draws the rows.
 */

/** One filled run of pixels: x from `x0` to `x1` (exclusive) on row `y`. */
export interface PixelRun {
  y: number;
  x0: number;
  x1: number;
}

/** Half-width of each row of a `w` x `h` ellipse (whole pixels, symmetric around w / 2). */
export function ellipseHalfWidths(w: number, h: number): number[] {
  const rows: number[] = [];
  for (let j = 0; j < h; j++) {
    const t = (j + 0.5 - h / 2) / (h / 2);
    rows.push(Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - t * t))));
  }
  return rows;
}

/** Rows of a filled `w` x `h` ellipse (`w` even, so it is centred on a pixel edge). */
export function ellipseRuns(w: number, h: number): PixelRun[] {
  const cx = w / 2;
  return ellipseHalfWidths(w, h)
    .map((hw, y) => ({ y, x0: cx - hw, x1: cx + hw }))
    .filter((r) => r.x1 > r.x0);
}

/**
 * A `w` x `h` ellipse split into its 1 px outline band and its inside, as runs
 * (they never overlap, so each pixel is painted once at its own alpha).
 */
export function ellipseRing(w: number, h: number): { band: PixelRun[]; inside: PixelRun[] } {
  const cx = w / 2;
  const outer = ellipseHalfWidths(w, h);
  const inner = ellipseHalfWidths(w - 2, h - 2);
  const band: PixelRun[] = [];
  const inside: PixelRun[] = [];
  outer.forEach((hw, y) => {
    if (hw <= 0) return;
    const hi = inner[y - 1];
    if (hi === undefined || hi <= 0) {
      band.push({ y, x0: cx - hw, x1: cx + hw });
      return;
    }
    band.push({ y, x0: cx - hw, x1: cx - hi }, { y, x0: cx + hi, x1: cx + hw });
    inside.push({ y, x0: cx - hi, x1: cx + hi });
  });
  return { band: band.filter((r) => r.x1 > r.x0), inside };
}
