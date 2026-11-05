import type { CoreJoinOptions } from "@core/shared";
import type { MapId } from "../world";

/** Room type name of each map, registered on the server and joined by the client. */
export const ROOM_BY_MAP: Record<MapId, string> = {
  overworld: "world",
};

/** Room joined when the player presses Play (stage 1 has a single map). */
export const ROOM_WORLD = ROOM_BY_MAP.overworld;

/** Options a client sends when joining a world. Validate everything server-side. */
export interface WorldJoinOptions extends CoreJoinOptions {}
