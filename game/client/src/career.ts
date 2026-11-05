import { addMatch, type Career, isUnlocked, type MatchSummary, newlyUnlocked, parseCareer } from "@game/shared";

type GameStorage = { get(key: string): string | null; set(key: string, value: string): void };

/**
 * Where the career is saved: the game's storage in this browser. The hero
 * select hands it over (it runs before every match); without it nothing is
 * saved and the game still works.
 */
let store: GameStorage | undefined;

export function useCareerStorage(storage: GameStorage) {
  store = storage;
}

export const loadCareer = (): Career => parseCareer(store?.get("career"));

/** Adds a match to the saved career; returns the new career and the colours it unlocked. */
export function recordMatch(summary: MatchSummary): { career: Career; unlocked: number[] } {
  const before = loadCareer();
  const career = addMatch(before, summary);
  store?.set("career", JSON.stringify(career));
  return { career, unlocked: newlyUnlocked(before, career) };
}

/** The hero colour picked last time, if the career still has it unlocked. */
export function savedPalette(career: Career): number {
  const saved = Number(store?.get("palette"));
  return Number.isInteger(saved) && isUnlocked(career, saved) ? saved : 0;
}

export function savePalette(palette: number) {
  store?.set("palette", String(palette));
}
