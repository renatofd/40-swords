/**
 * Progression between matches. Cosmetic only: every match starts everyone at
 * level 1 with nothing, so PvP stays fair.
 *  - when a hero falls (or the match ends with it standing) the server sends
 *    its player a summary of the match (SummaryMessage)
 *  - the client adds it to the player's career, saved in the browser
 *  - career milestones unlock hero colours, which everyone in the match sees
 *
 * Pure data + pure functions, shared by the server (colours) and the client.
 */

/** A player's match, as the server sends it (see Msg.summary). */
export interface MatchSummary {
  /** Final place (1 = winner) out of `heroes` in the match. */
  place: number;
  heroes: number;
  /** Heroes defeated, monsters slain (bosses included), bosses and mini-bosses, chests opened. */
  kills: number;
  monsters: number;
  bosses: number;
  chests: number;
  /** Level and relics at the end (or when falling). */
  level: number;
  relics: number;
  /** Seconds in the match until falling, or until the end. */
  seconds: number;
}

/** Everything a player did across matches (saved in their browser). */
export interface Career {
  matches: number;
  wins: number;
  /** Best place so far; 0 before the first match. */
  best: number;
  kills: number;
  monsters: number;
  bosses: number;
  /** Highest level reached in a match. */
  level: number;
  seconds: number;
}

const CAREER_KEYS = ["matches", "wins", "best", "kills", "monsters", "bosses", "level", "seconds"] as const;

export const emptyCareer = (): Career => ({
  matches: 0,
  wins: 0,
  best: 0,
  kills: 0,
  monsters: 0,
  bosses: 0,
  level: 0,
  seconds: 0,
});

/** A saved career; anything missing or invalid counts as zero. */
export function parseCareer(raw: string | null | undefined): Career {
  const career = emptyCareer();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : undefined;
  } catch {
    data = undefined;
  }
  if (!data || typeof data !== "object") return career;
  for (const key of CAREER_KEYS) {
    const v = (data as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) career[key] = Math.floor(v);
  }
  return career;
}

/** The career after one more match. */
export function addMatch(career: Career, m: MatchSummary): Career {
  return {
    matches: career.matches + 1,
    wins: career.wins + (m.place === 1 ? 1 : 0),
    best: career.best === 0 ? m.place : Math.min(career.best, m.place),
    kills: career.kills + m.kills,
    monsters: career.monsters + m.monsters,
    bosses: career.bosses + m.bosses,
    level: Math.max(career.level, m.level),
    seconds: career.seconds + m.seconds,
  };
}

/** What unlocks a colour: so many matches, heroes defeated, wins, a level reached, or finishing in the top N. */
export interface Unlock {
  kind: "matches" | "kills" | "wins" | "level" | "top";
  n: number;
}

export interface Palette {
  id: string;
  /** Body colour; undefined keeps the class colour. */
  color?: number;
  unlock?: Unlock;
}

/**
 * Hero colours. The index is on the wire (Player.palette): append new ones at
 * the end and bump PROTOCOL_VERSION.
 */
export const PALETTES: readonly Palette[] = [
  { id: "classic" },
  { id: "forest", color: 0x3f9d4a, unlock: { kind: "matches", n: 3 } },
  { id: "ember", color: 0xd9542c, unlock: { kind: "kills", n: 10 } },
  { id: "shadow", color: 0x6a55a8, unlock: { kind: "top", n: 3 } },
  { id: "frost", color: 0x7cc8f0, unlock: { kind: "level", n: 20 } },
  { id: "gold", color: 0xe0b23a, unlock: { kind: "wins", n: 1 } },
];

/** Whether a career unlocked a colour (the class colour always is). */
export function isUnlocked(career: Career, palette: number): boolean {
  const unlock = PALETTES[palette]?.unlock;
  if (!PALETTES[palette]) return false;
  if (!unlock) return true;
  switch (unlock.kind) {
    case "matches":
      return career.matches >= unlock.n;
    case "kills":
      return career.kills >= unlock.n;
    case "wins":
      return career.wins >= unlock.n;
    case "level":
      return career.level >= unlock.n;
    case "top":
      return career.best > 0 && career.best <= unlock.n;
  }
}

/** Colours the career unlocked that the one before didn't. */
export const newlyUnlocked = (before: Career, after: Career): number[] =>
  PALETTES.flatMap((_, i) => (!isUnlocked(before, i) && isUnlocked(after, i) ? [i] : []));

/** A colour index from join options (anything else is the class colour). */
export const sanitizePalette = (v: unknown): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < PALETTES.length ? v : 0;
