import { TICK_RATE } from "./constants";

/**
 * A match, start to finish:
 *  - calm   (0 to 5 min)   PvE only: farm, explore, buy
 *  - pvp    (5 to 30 min)  heroes can hurt each other; the winner of a fight
 *                          takes one random relic and every rupee of the loser
 *  - prep   (30 min)       everyone is moved to the arena; a short countdown
 *  - arena                 battle royale: no respawn, a closing storm, the
 *                          last hero standing wins
 *  - ended                 results for a few seconds, then a new match starts
 *                          (everyone back to level 1 at the centre)
 */
export const MatchPhase = { calm: 0, pvp: 1, prep: 2, arena: 3, ended: 4 } as const;
export type MatchPhase = (typeof MatchPhase)[keyof typeof MatchPhase];

/** When the phases start, in seconds from the start of the match. */
export interface MatchTimes {
  pvpAfter: number;
  arenaAfter: number;
}

export const DEFAULT_MATCH_TIMES: MatchTimes = { pvpAfter: 5 * 60, arenaAfter: 30 * 60 };

/** The arena map needs at least this many spawns (more heroes share them). */
export const ARENA_SPAWN_MIN = 8;

/** Countdown in the arena before the fight starts (no damage meanwhile). */
export const ARENA_PREP_SECONDS = 5;

/** The safe zone closes from the arena corners to nothing in this many seconds. */
export const ZONE_SHRINK_SECONDS = 150;

/** Share of max HP lost each second outside the safe zone (ignores defense). */
export const ZONE_DAMAGE_PER_SECOND = 0.1;

/** Results stay on screen this long before the next match. */
export const RESULTS_SECONDS = 15;

/** Invulnerability after (re)appearing at the centre, so nobody gets caught at the spawn. */
export const SPAWN_PROTECTION_TICKS = 3 * TICK_RATE;

/** Heroes can hurt each other in these phases. */
export const isPvpPhase = (phase: number): boolean => phase === MatchPhase.pvp || phase === MatchPhase.arena;

/** The arena (and its storm) is on screen in these phases. */
export const isArenaPhase = (phase: number): boolean =>
  phase === MatchPhase.prep || phase === MatchPhase.arena || phase === MatchPhase.ended;

/** Safe zone radius `seconds` after the fight started, from `start` (the arena half-diagonal). */
export const zoneRadius = (start: number, seconds: number): number =>
  Math.max(0, start * (1 - Math.max(0, seconds) / ZONE_SHRINK_SECONDS));

/**
 * The room stops taking new heroes at this second (the last sixth before the
 * arena: 25 min of 30). Newcomers get a fresh match in another room instead of
 * arriving at level 1 just before the battle royale.
 */
export const joinLockAt = (times: MatchTimes): number => Math.round((times.arenaAfter * 5) / 6);

/** Clamps match times from config (whole seconds, PvP no later than the arena, arena at least 10 s in). */
export function sanitizeMatchTimes(times: Partial<MatchTimes> | undefined): MatchTimes {
  const whole = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
  const arenaAfter = Math.min(60 * 60 * 6, Math.max(10, whole(times?.arenaAfter, DEFAULT_MATCH_TIMES.arenaAfter)));
  const pvpAfter = Math.min(arenaAfter, whole(times?.pvpAfter, DEFAULT_MATCH_TIMES.pvpAfter));
  return { pvpAfter, arenaAfter };
}
