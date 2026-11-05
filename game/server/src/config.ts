import { DEFAULT_MATCH_TIMES, type MatchTimes } from "@game/shared";

/**
 * Game settings from the environment, validated at boot like the core's env
 * (a bad value stops the server with a clear message):
 *
 *   MATCH_PVP_SECONDS    seconds from the start of a match until PvP turns on (default 300)
 *   MATCH_ARENA_SECONDS  seconds until everyone goes to the battle royale arena (default 1800)
 *
 * Shorter matches help testing: MATCH_PVP_SECONDS=30 MATCH_ARENA_SECONDS=120 pnpm dev
 */
export function parseMatchTimes(source: Record<string, string | undefined> = process.env): MatchTimes {
  const errors: string[] = [];
  const read = (name: string, fallback: number) => {
    const raw = source[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (Number.isInteger(value) && value >= 0) return value;
    errors.push(`${name} must be a whole number of seconds (got "${raw}")`);
    return fallback;
  };
  const pvpAfter = read("MATCH_PVP_SECONDS", DEFAULT_MATCH_TIMES.pvpAfter);
  const arenaAfter = read("MATCH_ARENA_SECONDS", DEFAULT_MATCH_TIMES.arenaAfter);
  if (arenaAfter < 10) errors.push("MATCH_ARENA_SECONDS must be at least 10");
  if (arenaAfter > 6 * 60 * 60) errors.push("MATCH_ARENA_SECONDS must be at most 21600 (6 hours)");
  if (pvpAfter > arenaAfter) errors.push("MATCH_PVP_SECONDS must not be later than MATCH_ARENA_SECONDS");
  if (errors.length > 0) throw new Error(`Invalid game environment:\n- ${errors.join("\n- ")}`);
  return { pvpAfter, arenaAfter };
}
