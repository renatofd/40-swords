import { describe, expect, it, vi } from "vitest";
import { recolorPixels } from "./recolor";

// @core/client pulls in Phaser (needs a browser); recolorPixels needs neither.
vi.mock("@core/client", () => ({ createSpriteAnimations: () => [] }));

/** A w×h RGBA image from 0xRRGGBB values (-1 = transparent). */
function image(w: number, h: number, pixels: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  pixels.forEach((c, i) => {
    if (c < 0) return;
    data.set([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255], i * 4);
  });
  return data;
}

const rgb = (data: Uint8ClampedArray, i: number) =>
  ((data[i * 4] ?? 0) << 16) | ((data[i * 4 + 1] ?? 0) << 8) | (data[i * 4 + 2] ?? 0);

describe("recolorPixels", () => {
  it("replaces exact colours only and keeps alpha and transparent pixels", () => {
    const data = image(3, 1, [0x112233, 0x112234, -1]);
    data[3] = 128;
    recolorPixels(data, 3, 1, { map: new Map([[0x112233, 0xabcdef]]) });
    expect(rgb(data, 0)).toBe(0xabcdef);
    expect(data[3]).toBe(128);
    expect(rgb(data, 1)).toBe(0x112234);
    expect(data[11]).toBe(0);
  });

  it("does not chain replacements", () => {
    const data = image(2, 1, [0x000001, 0x000002]);
    recolorPixels(data, 2, 1, {
      map: new Map([
        [0x000001, 0x000002],
        [0x000002, 0x000003],
      ]),
    });
    expect([rgb(data, 0), rgb(data, 1)]).toEqual([0x000002, 0x000003]);
  });

  it("recolours the inside of a shape and keeps its outline", () => {
    const o = 0x231712;
    // 3x3 block of one colour inside a transparent border: only the centre is inner.
    const data = image(5, 5, [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      o,
      o,
      o,
      -1,
      -1,
      o,
      o,
      o,
      -1,
      -1,
      o,
      o,
      o,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
    ]);
    recolorPixels(data, 5, 5, { map: new Map(), interior: new Map([[o, 0x0000ff]]) });
    const changed = [...Array(25).keys()].filter((i) => rgb(data, i) === 0x0000ff);
    expect(changed).toEqual([12]);
  });

  it("treats the image edge as outside", () => {
    const data = image(1, 1, [0x231712]);
    recolorPixels(data, 1, 1, { map: new Map(), interior: new Map([[0x231712, 0x0000ff]]) });
    expect(rgb(data, 0)).toBe(0x231712);
  });
});
