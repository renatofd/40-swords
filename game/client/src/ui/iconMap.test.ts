import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type OfferItem, RELIC_IDS } from "@game/shared";
import { describe, expect, it } from "vitest";
import iconFrames from "./iconFrames.json";
import { cooldownRows, heartIcon, heartQuarter, ITEM_ICON, isIconName, STAT_ICON, SUMMARY_ICON } from "./iconMap";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const SPRITES = fileURLToPath(new URL("../../../../content/sprites/", import.meta.url));

const tagsOf = (key: string): string[] => {
  const data = JSON.parse(readFileSync(join(SPRITES, `${key}.json`), "utf8")) as {
    meta: { frameTags: { name: string }[] };
  };
  return data.meta.frameTags.map((t) => t.name);
};

function* tsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* tsFiles(path);
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) yield path;
  }
}

const OFFER_ITEMS: OfferItem[] = [...RELIC_IDS, "potion"];

describe("icon map", () => {
  it("has an icon in iconFrames.json for every item, stat, summary row and HUD mark", () => {
    const names = [
      ...OFFER_ITEMS.map((k) => ITEM_ICON[k]),
      ...Object.values(STAT_ICON),
      ...Object.values(SUMMARY_ICON).filter((v) => v !== undefined),
      ...[0, 1, 2, 3, 4].map(heartIcon),
      "rupee-green",
      "lock",
      "heroes",
      "champion",
      "mark-boss",
      "mark-mini",
      "mark-danger",
    ];
    for (const name of names) expect(isIconName(name), name).toBe(true);
    for (const kind of OFFER_ITEMS) expect(ITEM_ICON[kind], kind).toBe(kind);
  });

  it("only names existing icons in icon(…), setIcon(…) and `alt:` literals of the client sources", () => {
    const used = new Set<string>();
    for (const file of tsFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\b(?:icon|setIcon)\(\s*(?:[\w.]+\s*,\s*)?"([^"]+)"/g))
        used.add(`${m[1]} (${file})`);
      for (const m of text.matchAll(/\balt:\s*"([^"]+)"/g)) used.add(`${m[1]} (${file})`);
    }
    for (const entry of used) expect(isIconName(entry.split(" ")[0]), entry).toBe(true);
  });

  it("frames lie inside the sheet", () => {
    for (const [name, f] of Object.entries(iconFrames.icons)) {
      expect(f.x + 16, name).toBeLessThanOrEqual(iconFrames.w);
      expect(f.y + 16, name).toBeLessThanOrEqual(iconFrames.h);
    }
  });

  it("matches the world sprites: items, pickups and chests have every tag the game plays", () => {
    const items = tagsOf("items");
    for (const kind of OFFER_ITEMS) expect(items, kind).toContain(kind);
    expect(tagsOf("pickups")).toEqual(
      expect.arrayContaining(["rupee-green", "rupee-blue", "rupee-pink", "rupee-gold", "heart", "heart-vanish"]),
    );
    for (const key of ["chest", "chest-gold"])
      expect(tagsOf(key)).toEqual(expect.arrayContaining(["closed", "open", "empty"]));
  });
});

describe("heartQuarter", () => {
  it("fills the HUD heart in quarters, empty only when down", () => {
    const cases: [number, number, number][] = [
      [0, 100, 0],
      [1, 100, 1],
      [25, 100, 1],
      [26, 100, 2],
      [51, 100, 3],
      [76, 100, 4],
      [100, 100, 4],
      [5, 0, 4],
      [-3, 100, 0],
      [150, 100, 4],
    ];
    for (const [hp, max, q] of cases) expect(heartQuarter(hp, max), `${hp}/${max}`).toBe(q);
  });

  it("names the matching icon", () => {
    expect([0, 1, 2, 3, 4].map(heartIcon)).toEqual(["hp-0", "hp-1", "hp-2", "hp-3", "hp-4"]);
  });
});

describe("cooldownRows", () => {
  it("shades 0..16 rows of a weapon slot, clamped", () => {
    const cases: [number, number, number][] = [
      [0, 24, 0],
      [1, 24, 1],
      [12, 24, 8],
      [24, 24, 16],
      [30, 24, 16],
      [-2, 24, 0],
      [5, 0, 16],
    ];
    for (const [cd, max, rows] of cases) expect(cooldownRows(cd, max), `${cd}/${max}`).toBe(rows);
  });
});
