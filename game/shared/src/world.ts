import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./constants";

/** Maps a player can pick. Stage 1 has one; the room for each is registered by the server. */
export const MAP_IDS = ["overworld"] as const;
export type MapId = (typeof MAP_IDS)[number];

/** Screen (column, row) containing a world position. */
export function screenOf(x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / SCREEN_WIDTH), row: Math.floor(y / SCREEN_HEIGHT) };
}

/** Pixel rectangle of a screen. */
export function screenRect(col: number, row: number) {
  return { x: col * SCREEN_WIDTH, y: row * SCREEN_HEIGHT, width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
}
