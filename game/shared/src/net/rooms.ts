import type { CoreJoinOptions } from "@core/shared";

/** Room type names registered on the server and joined by the client. */
export const ROOM_ARENA = "arena";

/** Options a client sends when joining an arena. Validate everything server-side. */
export interface ArenaJoinOptions extends CoreJoinOptions {
  /** Index into PLAYER_COLORS, picked on the pre-join screen. */
  color?: number;
}
