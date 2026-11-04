import { DEFAULT_MATCH_TIMES } from "@game/shared";
import { describe, expect, it } from "vitest";
import { parseMatchTimes } from "../src/config";

describe("parseMatchTimes", () => {
  it("defaults to 5 minutes of PvE and the arena at 30 minutes", () => {
    expect(parseMatchTimes({})).toEqual(DEFAULT_MATCH_TIMES);
    expect(DEFAULT_MATCH_TIMES).toEqual({ pvpAfter: 300, arenaAfter: 1800 });
  });

  it("reads shorter matches for testing", () => {
    expect(parseMatchTimes({ MATCH_PVP_SECONDS: "30", MATCH_ARENA_SECONDS: " 120 " })).toEqual({
      pvpAfter: 30,
      arenaAfter: 120,
    });
  });

  it("stops at boot with every problem listed", () => {
    expect(() => parseMatchTimes({ MATCH_PVP_SECONDS: "soon", MATCH_ARENA_SECONDS: "5" })).toThrow(
      /MATCH_PVP_SECONDS must be a whole number[\s\S]*MATCH_ARENA_SECONDS must be at least 10/,
    );
    expect(() => parseMatchTimes({ MATCH_PVP_SECONDS: "200", MATCH_ARENA_SECONDS: "100" })).toThrow(
      /must not be later/,
    );
    expect(() => parseMatchTimes({ MATCH_ARENA_SECONDS: "1.5" })).toThrow(/whole number/);
  });
});
