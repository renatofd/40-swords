import { defineRoom } from "@colyseus/core";
import { ROOM_BY_MAP } from "@game/shared";
import { WorldRoom } from "./rooms/WorldRoom";

export { WorldRoom } from "./rooms/WorldRoom";

/** Every room this game exposes. apps/server registers exactly these. */
export const rooms = {
  // Options given here override the ones a client sends when it creates the room,
  // so players can't pick an arbitrary map file.
  [ROOM_BY_MAP.overworld]: defineRoom(WorldRoom, { mapId: "overworld" }),
};
