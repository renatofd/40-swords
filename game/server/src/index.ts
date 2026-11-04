import { defineRoom } from "@colyseus/core";
import { log } from "@core/server";
import { DEFAULT_MATCH_TIMES, ROOM_BY_MAP } from "@game/shared";
import { parseMatchTimes } from "./config";
import { WorldRoom } from "./rooms/WorldRoom";

export { WorldRoom } from "./rooms/WorldRoom";

const match = parseMatchTimes();
if (match.pvpAfter !== DEFAULT_MATCH_TIMES.pvpAfter || match.arenaAfter !== DEFAULT_MATCH_TIMES.arenaAfter)
  log.info("match timings from the environment", {
    pvpAfterSeconds: match.pvpAfter,
    arenaAfterSeconds: match.arenaAfter,
  });

/** Every room this game exposes. apps/server registers exactly these. */
export const rooms = {
  // Options given here override the ones a client sends when it creates the room,
  // so players can't pick an arbitrary map file or shorten the match.
  [ROOM_BY_MAP.overworld]: defineRoom(WorldRoom, { mapId: "overworld", match }),
};
