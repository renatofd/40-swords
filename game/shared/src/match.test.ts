import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_TIMES,
  isArenaPhase,
  isPvpPhase,
  joinLockAt,
  MatchPhase,
  sanitizeMatchTimes,
  ZONE_SHRINK_SECONDS,
  zoneRadius,
} from "./match";

describe("match rules", () => {
  it("PvP is on in the open world after the calm phase and during the arena fight", () => {
    expect(isPvpPhase(MatchPhase.calm)).toBe(false);
    expect(isPvpPhase(MatchPhase.pvp)).toBe(true);
    expect(isPvpPhase(MatchPhase.prep)).toBe(false);
    expect(isPvpPhase(MatchPhase.arena)).toBe(true);
    expect(isPvpPhase(MatchPhase.ended)).toBe(false);
    expect([0, 1, 2, 3, 4].filter(isArenaPhase)).toEqual([MatchPhase.prep, MatchPhase.arena, MatchPhase.ended]);
  });

  it("the safe zone closes linearly to nothing", () => {
    expect(zoneRadius(300, 0)).toBe(300);
    expect(zoneRadius(300, -5)).toBe(300);
    expect(zoneRadius(300, ZONE_SHRINK_SECONDS / 2)).toBe(150);
    expect(zoneRadius(300, ZONE_SHRINK_SECONDS)).toBe(0);
    expect(zoneRadius(300, ZONE_SHRINK_SECONDS * 2)).toBe(0);
  });

  it("newcomers are turned away during the last sixth before the arena", () => {
    expect(joinLockAt(DEFAULT_MATCH_TIMES)).toBe(25 * 60);
    expect(joinLockAt({ pvpAfter: 30, arenaAfter: 120 })).toBe(100);
  });

  it("clamps match times from config", () => {
    expect(sanitizeMatchTimes(undefined)).toEqual(DEFAULT_MATCH_TIMES);
    expect(sanitizeMatchTimes({ pvpAfter: 50.7, arenaAfter: 3 })).toEqual({ pvpAfter: 10, arenaAfter: 10 });
    expect(sanitizeMatchTimes({ pvpAfter: -1, arenaAfter: Number.NaN })).toEqual({
      pvpAfter: 0,
      arenaAfter: DEFAULT_MATCH_TIMES.arenaAfter,
    });
    expect(sanitizeMatchTimes({ pvpAfter: "1" as unknown as number })).toEqual(DEFAULT_MATCH_TIMES);
  });
});
