import { describe, expect, it, vi } from "vitest";

// @core/client pulls in Phaser (needs a browser); the scale only needs computeZoom.
vi.mock("@core/client", () => ({
  computeZoom: (res: { width: number; height: number }) => {
    const scale = Math.min(globalThis.innerWidth / res.width, globalThis.innerHeight / res.height);
    return scale >= 1 ? Math.floor(scale) : scale;
  },
}));

const { applyUiScale, FONT_PX_PER_ART_PX, uiDevicePx } = await import("./scale");

describe("uiDevicePx", () => {
  it("matches the scale table (zoom, DPR → art pixel in device px)", () => {
    const rows: [number, number, number][] = [
      [1, 1, 1],
      [2, 2.625, 3],
      [4, 1, 1],
      [4, 1.5, 2],
      [4, 1.25, 2],
      [4, 2, 3],
      [5, 1, 2],
      [6, 1, 2],
      [8, 1, 3],
      [12, 1, 4],
      [0.6, 1, 1],
    ];
    for (const [zoom, dpr, u] of rows) expect(uiDevicePx(zoom, dpr), `zoom ${zoom} @${dpr}`).toBe(u);
  });

  it("is a whole number of device px, at least one CSS px and at most four", () => {
    for (const zoom of [0.6, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
        const u = uiDevicePx(zoom, dpr);
        expect(Number.isInteger(u), `zoom ${zoom} @${dpr}`).toBe(true);
        expect(u).toBeGreaterThanOrEqual(Math.ceil(dpr));
        expect(u).toBeLessThanOrEqual(4 * Math.ceil(dpr));
      }
  });

  it("treats a missing DPR as 1", () => {
    expect(uiDevicePx(6, 0)).toBe(2);
  });
});

describe("applyUiScale", () => {
  const fakeRoot = () => {
    const props = new Map<string, string>();
    const dataset: Record<string, string | undefined> = {};
    return { props, root: { style: { setProperty: (k: string, v: string) => props.set(k, v) }, dataset } };
  };

  it("writes --sw-u, --sw-fp = 2 × --sw-u and the device-px u", () => {
    for (const [w, h, dpr] of [
      [1280, 720, 1],
      [863, 360, 2.625],
      [1440, 900, 2],
      [1920, 1080, 1],
      [1536, 864, 1.25],
    ] as const) {
      vi.stubGlobal("innerWidth", w);
      vi.stubGlobal("innerHeight", h);
      vi.stubGlobal("devicePixelRatio", dpr);
      const { props, root } = fakeRoot();
      applyUiScale(root);
      const u = Number.parseFloat(props.get("--sw-u") ?? "");
      const fp = Number.parseFloat(props.get("--sw-fp") ?? "");
      expect(fp).toBeCloseTo(FONT_PX_PER_ART_PX * u, 9);
      const uDev = Number(root.dataset.swUi);
      expect(u * dpr).toBeCloseTo(uDev, 9);
      expect(Number.isInteger(uDev)).toBe(true);
    }
    vi.unstubAllGlobals();
  });

  it("gives u = 2 device px at 1920x1080 and 3 on a Pixel 7", () => {
    const { root } = fakeRoot();
    vi.stubGlobal("innerWidth", 1920);
    vi.stubGlobal("innerHeight", 1080);
    vi.stubGlobal("devicePixelRatio", 1);
    applyUiScale(root);
    expect(root.dataset).toMatchObject({ swUi: "2" });
    vi.stubGlobal("innerWidth", 863);
    vi.stubGlobal("innerHeight", 360);
    vi.stubGlobal("devicePixelRatio", 2.625);
    applyUiScale(root);
    expect(root.dataset).toMatchObject({ swUi: "3" });
    vi.unstubAllGlobals();
  });
});
