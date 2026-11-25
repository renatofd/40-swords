import { describe, expect, it } from "vitest";
import { blank, buildSprite, formatJson, GAP, type Rgba, type SpriteDef, transform } from "./sheet";

/** A 4x1 strip of 2x2 frames; frame i is filled with colour (i+1)*40 (frame 2 = a copy of frame 0). */
function strip(): Rgba {
  const img = blank(8, 2);
  const colour = [40, 80, 40, 160];
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 8; x++) img.data.set([colour[Math.floor(x / 2)] ?? 0, 0, 0, 255], (y * 8 + x) * 4);
  return img;
}
const pixel = (img: Rgba, x: number, y: number) => [
  ...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
];
const sheets = new Map([["a.png", strip()]]);

describe("buildSprite", () => {
  const def: SpriteDef = {
    key: "test",
    src: "a.png",
    frame: [2, 2],
    tags: [
      { name: "loop", frames: [3, 2, 0, 1, 0], duration: [10, 20, 30, 40, 50] },
      { name: "hit", frames: [1], duration: 100, repeat: 1, direction: "pingpong" },
    ],
    aliases: [["idle", "loop"]],
  };

  it("emits one json frame per step, named 0..N, with contiguous tag ranges and aliases", () => {
    const { json } = buildSprite(def, sheets);
    expect(json.frames.map((f) => f.filename)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(json.frames.map((f) => f.duration)).toEqual([10, 20, 30, 40, 50, 100]);
    expect(json.meta.frameTags).toEqual([
      { name: "loop", from: 0, to: 4, direction: "forward" },
      { name: "hit", from: 5, to: 5, direction: "pingpong", repeat: "1" },
      { name: "idle", from: 0, to: 4, direction: "forward" },
    ]);
  });

  it("packs identical pixels once, 1 px apart, and repeated steps share the rect", () => {
    const { json, image } = buildSprite(def, sheets);
    // Distinct cells: frame 3, frame 2 (= frame 0), frame 1 → 3 cells in a 2x2 grid.
    expect(image.width).toBe(2 * 2 + GAP);
    expect(image.height).toBe(2 * 2 + GAP);
    const rects = json.frames.map((f) => `${f.frame.x},${f.frame.y}`);
    expect(rects[1]).toBe(rects[2]); // frames 2 and 0 have the same pixels
    expect(rects[2]).toBe(rects[4]);
    expect(new Set(rects).size).toBe(3);
    expect(pixel(image, 2, 0)).toEqual([0, 0, 0, 0]); // the gap column is transparent
    expect(json.meta.size).toEqual({ w: image.width, h: image.height });
  });

  it("is deterministic and formats json like Biome", () => {
    const a = buildSprite(def, sheets);
    const b = buildSprite(def, sheets);
    expect(Buffer.from(a.image.data).equals(Buffer.from(b.image.data))).toBe(true);
    expect(formatJson(a.json)).toBe(formatJson(b.json));
    expect(formatJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
  });

  it("recolours, clears and outlines pixels, and measures the feet point of idle", () => {
    const { image, anchor } = buildSprite(
      {
        key: "test",
        src: "a.png",
        frame: [2, 2],
        recolor: [
          [0x280000, 0x00ff00],
          [0x500000, null],
        ],
        outline: 0x0000ff,
        tags: [
          { name: "idle", frames: [0], duration: 100 },
          { name: "gone", frames: [1], duration: 100 },
        ],
      },
      sheets,
    );
    expect(anchor).toEqual({ w: 4, h: 4, x: 2, y: 4 }); // feet under the outline
    expect(pixel(image, 1, 1)).toEqual([0, 255, 0, 255]); // recoloured body
    expect(pixel(image, 0, 1)).toEqual([0, 0, 255, 255]); // outline
    expect(pixel(image, 0, 0)).toEqual([0, 0, 0, 0]); // outline corners stay empty
    expect(pixel(image, 5 + 1, 1)).toEqual([0, 0, 0, 0]); // the cleared frame has no outline either
  });

  it("rejects sprites without an idle tag", () => {
    expect(() =>
      buildSprite({ key: "x", src: "a.png", frame: [2, 2], tags: [{ name: "a", frames: [0], duration: 1 }] }, sheets),
    ).toThrow(/idle/);
  });
});

describe("transform", () => {
  it("turns frames by exact quarter turns", () => {
    const img = blank(2, 1);
    img.data.set([255, 0, 0, 255], 0); // red at (0,0), clear at (1,0)
    const r = transform(img, "rot90");
    expect([r.width, r.height]).toEqual([1, 2]);
    expect(pixel(r, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(transform(img, "rot270"), 0, 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(transform(img, "flipH"), 1, 0)).toEqual([255, 0, 0, 255]);
  });
});
