import type { CoreJoinOptions } from "@core/shared";
import type { ClassId } from "../classes";
import type { MapId } from "../world";

/** Room type name of each map, registered on the server and joined by the client. */
export const ROOM_BY_MAP: Record<MapId, string> = {
  overworld: "world",
};

/** Default room (the first map). */
export const ROOM_WORLD = ROOM_BY_MAP.overworld;

/** Options a client sends when joining a world (picked on the hero select). Validate everything server-side. */
export interface WorldJoinOptions extends CoreJoinOptions {
  classId?: ClassId;
  /** Hero colour (index into PALETTES, unlocked by the player's career; cosmetic). */
  palette?: number;
}
