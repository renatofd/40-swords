import { describe, expect, it } from "vitest";
import { slotGroups } from "./relicText";

describe("slotGroups", () => {
  it("groups by kind in the fixed HUD order: weapons first, then passives", () => {
    const groups = slotGroups([
      { kind: "boots", rarity: 0 },
      { kind: "nova", rarity: 2 },
      { kind: "heart", rarity: 1 },
      { kind: "boots", rarity: 3 },
      { kind: "dagger", rarity: 0 },
      { kind: "boots", rarity: 1 },
    ]);
    expect(groups).toEqual([
      { kind: "dagger", best: 0, count: 1 },
      { kind: "nova", best: 2, count: 1 },
      { kind: "heart", best: 1, count: 1 },
      { kind: "boots", best: 3, count: 3 },
    ]);
  });

  it("skips unknown kinds and clamps rarities from the wire", () => {
    expect(
      slotGroups([
        { kind: "banana", rarity: 2 },
        { kind: "eye", rarity: 9 },
      ]),
    ).toEqual([{ kind: "eye", best: 4, count: 1 }]);
    expect(slotGroups([])).toEqual([]);
  });
});
