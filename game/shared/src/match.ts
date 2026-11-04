/**
 * A match, start to finish:
 *  - lobby     the waiting room: heroes walk around, but nothing hurts and
 *              nothing can be taken; each player presses Ready
 *  - starting  everyone is ready: a short countdown (cancelled if someone
 *              un-readies or a new player arrives), then the room closes
 *  - calm      (0 to 5 min) PvE only
 *  - pvp       (5 to 30 min) heroes can hurt each other; the winner of a
 *              fight takes one random relic and every rupee of the loser
 *  - prep      (30 min) the heroes still standing go to the arena; countdown
 *  - arena     battle royale with a closing storm
 *  - ended     results for a few seconds, then back to the lobby
 *
 * One life per match: whoever falls (to a monster, a hero or the storm) is out
 * and watches the others. The last hero standing wins, at any moment.
 */
export const MatchPhase = { lobby: 0, starting: 1, calm: 2, pvp: 3, prep: 4, arena: 5, ended: 6 } as const;
export type MatchPhase = (typeof MatchPhase)[keyof typeof MatchPhase];

/** When the phases start, in seconds from the start of the match. */
export interface MatchTimes {
  pvpAfter: number;
  arenaAfter: number;
}

export const DEFAULT_MATCH_TIMES: MatchTimes = { pvpAfter: 5 * 60, arenaAfter: 30 * 60 };

/** Countdown once everyone in the waiting room is ready. */
export const START_COUNTDOWN_SECONDS = 5;

/** The arena map needs at least this many spawns (more heroes share them). */
export const ARENA_SPAWN_MIN = 8;

/** Countdown in the arena before the fight starts (no damage meanwhile). */
export const ARENA_PREP_SECONDS = 5;

/** The safe zone closes from the arena corners to nothing in this many seconds. */
export const ZONE_SHRINK_SECONDS = 150;

/** Share of max HP lost each second outside the safe zone (ignores defense). */
export const ZONE_DAMAGE_PER_SECOND = 0.1;

/** Results stay on screen this long before the waiting room. */
export const RESULTS_SECONDS = 15;

/** Waiting room (before the match and between matches). */
export const isLobbyPhase = (phase: number): boolean => phase === MatchPhase.lobby || phase === MatchPhase.starting;

/** The match is on: monsters act, chests and vendors work, and whoever falls is out. */
export const isPlayingPhase = (phase: number): boolean => phase >= MatchPhase.calm && phase <= MatchPhase.arena;

/** Heroes can hurt each other in these phases. */
export const isPvpPhase = (phase: number): boolean => phase === MatchPhase.pvp || phase === MatchPhase.arena;

/** Safe zone radius `seconds` after the fight started, from `start` (the arena half-diagonal). */
export const zoneRadius = (start: number, seconds: number): number =>
  Math.max(0, start * (1 - Math.max(0, seconds) / ZONE_SHRINK_SECONDS));

/** Clamps match times from config (whole seconds, PvP no later than the arena, arena at least 10 s in). */
export function sanitizeMatchTimes(times: Partial<MatchTimes> | undefined): MatchTimes {
  const whole = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
  const arenaAfter = Math.min(60 * 60 * 6, Math.max(10, whole(times?.arenaAfter, DEFAULT_MATCH_TIMES.arenaAfter)));
  const pvpAfter = Math.min(arenaAfter, whole(times?.pvpAfter, DEFAULT_MATCH_TIMES.pvpAfter));
  return { pvpAfter, arenaAfter };
}
