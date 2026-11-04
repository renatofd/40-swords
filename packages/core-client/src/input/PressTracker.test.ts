import { describe, expect, it } from "vitest";
import { PressTracker } from "./PressTracker";

describe("PressTracker", () => {
  it("reports a press during exactly one frame", () => {
    const presses = new PressTracker();
    presses.press("attack");
    expect(presses.wasPressed("attack")).toBe(false); // not before the frame starts
    presses.update();
    expect(presses.wasPressed("attack")).toBe(true);
    expect(presses.wasPressed("dash")).toBe(false);
    presses.update();
    expect(presses.wasPressed("attack")).toBe(false);
  });

  it("keeps a tap that started and ended between two frames", () => {
    const presses = new PressTracker();
    presses.update();
    // key down + key up both happen here, before the next frame looks at the state
    presses.press("attack");
    presses.update();
    expect(presses.wasPressed("attack")).toBe(true);
  });

  it("counts a press made during a frame in the next frame", () => {
    const presses = new PressTracker();
    presses.press("a");
    presses.update();
    presses.press("b"); // while frame 1 is being processed
    expect(presses.wasPressed("b")).toBe(false);
    presses.update();
    expect(presses.wasPressed("a")).toBe(false);
    expect(presses.wasPressed("b")).toBe(true);
  });

  it("forgets everything on clear", () => {
    const presses = new PressTracker();
    presses.press("a");
    presses.update();
    presses.press("b");
    presses.clear();
    expect(presses.wasPressed("a")).toBe(false);
    presses.update();
    expect(presses.wasPressed("b")).toBe(false);
  });
});
