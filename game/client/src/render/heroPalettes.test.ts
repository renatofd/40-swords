import { CLASS_IDS, PALETTES } from "@game/shared";
import { describe, expect, it } from "vitest";
import { heroRecolor, heroSheetKey, RAMPS } from "./heroPalettes";

/** Colours of the hurt, burn and stun frames: never swapped, so they read the same in every colour. */
const EFFECT_COLOURS = [0xff0460, 0xffe737, 0xeeffa9, 0xffffff];

describe("hero palettes", () => {
  it("has a ramp for every unlockable colour", () => {
    for (const p of PALETTES) if (p.color !== undefined) expect(RAMPS[p.id], p.id).toBeDefined();
  });

  it("never swaps the effect frames' colours", () => {
    for (const id of CLASS_IDS)
      for (const [i] of PALETTES.entries()) {
        const spec = heroRecolor(id, i);
        const sources = [...(spec?.map.keys() ?? []), ...(spec?.interior?.keys() ?? [])];
        for (const c of EFFECT_COLOURS) expect(sources, `${id} ${i}`).not.toContain(c);
      }
  });

  it("gives each colour of a class its own look", () => {
    for (const id of CLASS_IDS) {
      const looks = PALETTES.map((_, i) => {
        const spec = heroRecolor(id, i);
        return JSON.stringify([[...(spec?.map ?? [])], [...(spec?.interior ?? [])]]);
      });
      expect(new Set(looks).size, id).toBe(PALETTES.length);
    }
  });

  it("names a texture per recoloured sheet and keeps the sheet for the rogue's own colours", () => {
    expect(heroSheetKey("rogue", 0)).toBe("rogue");
    expect(heroSheetKey("knight", 0)).toBe("knight~0");
    expect(heroSheetKey("barbarian", 5)).toBe("barbarian~5");
    expect(heroSheetKey("knight", 99)).toBe("knight~0");
  });
});
