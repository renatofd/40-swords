import { describe, expect, it } from "vitest";
import { burstFx, chestAnim, chestKey, rupeeTag } from "./itemArt";

describe("itemArt", () => {
  it("picks the rupee tier by value", () => {
    expect([1, 4].map(rupeeTag)).toEqual(["rupee-green", "rupee-green"]);
    expect([5, 19].map(rupeeTag)).toEqual(["rupee-blue", "rupee-blue"]);
    expect([20, 49].map(rupeeTag)).toEqual(["rupee-pink", "rupee-pink"]);
    expect([50, 150].map(rupeeTag)).toEqual(["rupee-gold", "rupee-gold"]);
  });

  it("plays the opening only for a chest seen closed", () => {
    expect(chestAnim(undefined, false)).toBe("closed");
    expect(chestAnim(undefined, true)).toBe("empty");
    expect(chestAnim(false, false)).toBe("closed");
    expect(chestAnim(false, true)).toBe("open");
    expect(chestAnim(true, true)).toBe("empty");
    expect(chestAnim(true, false)).toBe("closed");
  });

  it("names the chest sheet by material", () => {
    expect(chestKey(false)).toBe("chest");
    expect(chestKey(true)).toBe("chest-gold");
  });

  it("bursts purple for epic and legendary only", () => {
    expect([0, 1, 2].map(burstFx)).toEqual(["fx-burst-gold", "fx-burst-gold", "fx-burst-gold"]);
    expect([3, 4].map(burstFx)).toEqual(["fx-burst-purple", "fx-burst-purple"]);
  });
});
