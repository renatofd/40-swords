import { describe, expect, it } from "vitest";
import { foundAtBottom } from "./foundPlace";

const box = { left: 440, top: 56, right: 840, bottom: 166 };
const hero = (x: number, y: number) => ({ left: x - 32, right: x + 32, top: y - 80, bottom: y });

describe("foundAtBottom", () => {
  it("keeps the box at the top while the hero is clear of it", () => {
    expect(foundAtBottom(box, hero(640, 400), 12)).toBe(false);
    // Up high but beside the box.
    expect(foundAtBottom(box, hero(200, 120), 12)).toBe(false);
  });

  it("moves it to the bottom when the box would cover the hero", () => {
    expect(foundAtBottom(box, hero(640, 150), 12)).toBe(true);
    // Only the hero's head under the box.
    expect(foundAtBottom(box, hero(640, 240), 12)).toBe(true);
    // Just past the box's edge, within the margin.
    expect(foundAtBottom(box, hero(870, 150), 12)).toBe(true);
  });

  it("leaves a hero just below the margin alone", () => {
    expect(foundAtBottom(box, hero(640, 166 + 80 + 13), 12)).toBe(false);
  });
});
