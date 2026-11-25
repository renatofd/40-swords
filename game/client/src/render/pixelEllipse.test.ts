import { describe, expect, it } from "vitest";
import { ellipseHalfWidths, ellipseRing, ellipseRuns } from "./pixelEllipse";

describe("pixel ellipses", () => {
  it("fills whole-pixel rows, widest in the middle and symmetric", () => {
    expect(ellipseHalfWidths(12, 4)).toEqual([4, 6, 6, 4]);
    const rows = ellipseHalfWidths(28, 8);
    expect(rows).toEqual([...rows].reverse());
    expect(Math.max(...rows)).toBe(14);
    for (const r of ellipseRuns(28, 8)) {
      expect(Number.isInteger(r.x0) && Number.isInteger(r.x1)).toBe(true);
      expect(r.x0 + r.x1).toBe(28);
    }
  });

  it("splits a ring into a band and an inside that never overlap", () => {
    const { band, inside } = ellipseRing(20, 10);
    const painted = new Set<string>();
    for (const r of [...band, ...inside])
      for (let x = r.x0; x < r.x1; x++) {
        const id = `${x},${r.y}`;
        expect(painted.has(id), id).toBe(false);
        painted.add(id);
      }
    // Together they cover exactly the filled ellipse.
    const filled = ellipseRuns(20, 10).reduce((n, r) => n + r.x1 - r.x0, 0);
    expect(painted.size).toBe(filled);
    expect(band.some((r) => r.y === 0) && band.some((r) => r.y === 9)).toBe(true);
  });
});
