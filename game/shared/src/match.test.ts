import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_TIMES,
  isLobbyPhase,
  isPlayingPhase,
  isPvpPhase,
  MatchPhase,
  sanitizeMatchTimes,
  ZONE_SHRINK_SECONDS,
  zoneRadius,
} from "./match";

const ALL = Object.values(MatchPhase);

describe("match rules", () => {
  it("the waiting room comes first, then the match, then the results", () => {
    expect(ALL.filter(isLobbyPhase)).toEqual([MatchPhase.lobby, MatchPhase.starting]);
    expect(ALL.filter(isPlayingPhase)).toEqual([MatchPhase.calm, MatchPhase.pvp, MatchPhase.prep, MatchPhase.arena]);
    expect(isPlayingPhase(MatchPhase.ended)).toBe(false);
    expect(isLobbyPhase(MatchPhase.ended)).toBe(false);
  });

  it("PvP is on in the open world after the calm phase and during the arena fight", () => {
    expect(ALL.filter(isPvpPhase)).toEqual([MatchPhase.pvp, MatchPhase.arena]);
  });

  it("the safe zone closes linearly to nothing", () => {
    expect(zoneRadius(300, 0)).toBe(300);
    expect(zoneRadius(300, -5)).toBe(300);
    expect(zoneRadius(300, ZONE_SHRINK_SECONDS / 2)).toBe(150);
    expect(zoneRadius(300, ZONE_SHRINK_SECONDS)).toBe(0);
    expect(zoneRadius(300, ZONE_SHRINK_SECONDS * 2)).toBe(0);
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
