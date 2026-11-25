import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RELIC_IDS } from "@game/shared";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { ICON_SHEETS, type IconDef, ITEM_ICONS, UI_ICONS } from "./icons";
import { iconFrames, SPRITES } from "./manifest";
import { buildSprite, type Rgba, type SpriteDef, spriteSources } from "./sheet";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SOURCE_DIR = resolve(ROOT, "content/src/notzelda");

const sheets = new Map<string, Rgba>();
const sheet = (path: string): Rgba => {
  let img = sheets.get(path);
  if (!img) {
    const png = PNG.sync.read(readFileSync(resolve(SOURCE_DIR, path)));
    img = { width: png.width, height: png.height, data: new Uint8Array(png.data) };
    sheets.set(path, img);
  }
  return img;
};
const sprite = (key: string): SpriteDef => {
  const def = SPRITES.find((s) => s.key === key);
  if (!def) throw new Error(`no sprite ${key}`);
  return def;
};
const tagFrames = (key: string, tag: string) => sprite(key).tags.find((t) => t.name === tag)?.frames;

const ALL: [string, IconDef][] = [...Object.entries(ITEM_ICONS), ...Object.entries(UI_ICONS)];

describe("icons", () => {
  it("has one icon per offer item (every relic and the potion)", () => {
    expect(Object.keys(ITEM_ICONS).sort()).toEqual([...RELIC_IDS, "potion"].sort());
  });

  it("has unique tag names (a UI icon never shadows an item)", () => {
    const names = ALL.map(([n]) => n);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(ALL)("%s: every frame lies inside its sheet, in one row, and is not empty", (_name, d) => {
    const img = sheet(ICON_SHEETS[d.src]);
    const columns = img.width / 16;
    const frames = d.frames ?? 1;
    expect(Number.isInteger(columns)).toBe(true);
    expect((d.i % columns) + frames).toBeLessThanOrEqual(columns);
    for (let f = 0; f < frames; f++) {
      const i = d.i + f;
      const x0 = (i % columns) * 16;
      const y0 = Math.floor(i / columns) * 16;
      expect(y0 + 16).toBeLessThanOrEqual(img.height);
      let opaque = 0;
      for (let y = y0; y < y0 + 16; y++)
        for (let x = x0; x < x0 + 16; x++) if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0) opaque++;
      expect(opaque).toBeGreaterThan(0);
    }
  });

  it("animates the compass over Tools 60..63 and keeps the champion apart from the Lucky Star", () => {
    expect(ITEM_ICONS.haste).toEqual({ src: "tools", i: 60, frames: 4, ms: 150 });
    expect(tagFrames("items", "haste")).toEqual([60, 61, 62, 63]);
    const { champion } = UI_ICONS;
    const { clover } = ITEM_ICONS;
    expect(`${champion.src}:${champion.i}`).not.toBe(`${clover.src}:${clover.i}`);
  });

  it("builds the loot effects and the gold coin from frames no icon uses", () => {
    expect(tagFrames("fx-burst-gold", "play")).toEqual([27, 28, 29, 30, 31]);
    expect(tagFrames("fx-burst-purple", "play")).toEqual([40, 41, 42, 43, 44]);
    expect(tagFrames("fx-glint", "play")).toEqual([30, 31]);
    expect(tagFrames("pickups", "rupee-gold")).toEqual([91, 92, 93, 94, 95]);
    const iconPickups = new Set(
      ALL.filter(([, d]) => d.src === "pickups").flatMap(([, d]) =>
        Array.from({ length: d.frames ?? 1 }, (_, f) => d.i + f),
      ),
    );
    for (const [key, tag] of [
      ["fx-burst-gold", "play"],
      ["fx-burst-purple", "play"],
      ["fx-glint", "play"],
      ["pickups", "rupee-gold"],
    ] as const)
      for (const f of tagFrames(key, tag) ?? []) expect(iconPickups.has(f as number), `${key} frame ${f}`).toBe(false);
  });

  it("builds an items sprite with a tag per icon, and iconFrames.json points at each first frame", () => {
    const def = sprite("items");
    const loaded = new Map(spriteSources(def).map((p) => [p, sheet(p)]));
    const { json, image } = buildSprite(def, loaded);
    const frames = iconFrames(json);
    expect(frames.w).toBe(image.width);
    expect(frames.h).toBe(image.height);
    for (const [name, d] of ALL) {
      const tag = json.meta.frameTags.find((t) => t.name === name);
      expect(tag?.to).toBe((tag?.from ?? 0) + (d.frames ?? 1) - 1);
      expect(tag?.repeat).toBeUndefined();
      const first = json.frames[tag?.from ?? -1]?.frame;
      expect(frames.icons[name]).toEqual({ x: first?.x, y: first?.y, frames: d.frames ?? 1 });
    }
    expect(Object.keys(frames.icons)).toEqual(ALL.map(([n]) => n));
    const written = JSON.parse(readFileSync(resolve(ROOT, "game/client/src/ui/iconFrames.json"), "utf8"));
    expect(written).toEqual(frames);
  });
});
