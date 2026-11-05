import { describe, expect, it } from "vitest";
import {
  addMatch,
  emptyCareer,
  isUnlocked,
  type MatchSummary,
  newlyUnlocked,
  PALETTES,
  parseCareer,
  sanitizePalette,
} from "./progress";

const match = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  place: 12,
  heroes: 40,
  kills: 1,
  monsters: 30,
  bosses: 0,
  chests: 2,
  level: 9,
  relics: 4,
  seconds: 600,
  ...over,
});

describe("progression between matches", () => {
  it("adds each match to the career: wins, best place, totals and the highest level", () => {
    let career = addMatch(emptyCareer(), match());
    expect(career).toEqual({
      matches: 1,
      wins: 0,
      best: 12,
      kills: 1,
      monsters: 30,
      bosses: 0,
      level: 9,
      seconds: 600,
    });
    career = addMatch(career, match({ place: 1, kills: 4, bosses: 1, level: 7 }));
    expect(career.wins).toBe(1);
    expect(career.best).toBe(1);
    expect(career.kills).toBe(5);
    expect(career.bosses).toBe(1);
    expect(career.level).toBe(9);
    career = addMatch(career, match({ place: 30 }));
    expect(career.best).toBe(1);
    expect(career.matches).toBe(3);
  });

  it("reads a saved career, counting anything broken as zero", () => {
    expect(parseCareer(null)).toEqual(emptyCareer());
    expect(parseCareer("not json")).toEqual(emptyCareer());
    expect(parseCareer("[1,2]")).toEqual(emptyCareer());
    const career = parseCareer(JSON.stringify({ matches: 5.7, wins: -2, kills: "9", level: 14, extra: 1 }));
    expect(career).toEqual({ ...emptyCareer(), matches: 5, level: 14 });
  });

  it("unlocks hero colours with the career; the class colour is always there", () => {
    const fresh = emptyCareer();
    expect(PALETTES.map((_, i) => isUnlocked(fresh, i))).toEqual(PALETTES.map((p) => p.unlock === undefined));
    for (const [i, palette] of PALETTES.entries()) {
      const { unlock } = palette;
      if (!unlock) continue;
      const career = { ...fresh };
      if (unlock.kind === "top") career.best = unlock.n;
      else career[unlock.kind] = unlock.n;
      expect(isUnlocked(career, i), palette.id).toBe(true);
      if (unlock.kind === "top") career.best = unlock.n + 1;
      else career[unlock.kind] = unlock.n - 1;
      expect(isUnlocked(career, i), palette.id).toBe(false);
    }
    expect(isUnlocked(fresh, PALETTES.length)).toBe(false);
  });

  it("tells which colours a match just unlocked", () => {
    const before = { ...emptyCareer(), matches: 2 };
    const after = addMatch(before, match({ place: 1 }));
    const ids = newlyUnlocked(before, after).map((i) => PALETTES[i]?.id);
    expect(ids).toContain("forest");
    expect(ids).toContain("gold");
    expect(ids).toContain("shadow");
    expect(newlyUnlocked(after, after)).toEqual([]);
  });

  it("accepts only known colour indexes from the network", () => {
    expect(sanitizePalette(2)).toBe(2);
    expect(sanitizePalette(PALETTES.length)).toBe(0);
    expect(sanitizePalette(-1)).toBe(0);
    expect(sanitizePalette(1.5)).toBe(0);
    expect(sanitizePalette("3")).toBe(0);
  });
});
