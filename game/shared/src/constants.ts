/**
 * Bump whenever schemas, inputs or messages in this game change in a way old
 * clients can't handle. Mismatched clients are told to reload.
 */
export const PROTOCOL_VERSION = 4;

/** Simulation rate in Hz. One input advances exactly one fixed step. */
export const TICK_RATE = 30;

/** Fixed step duration in seconds. */
export const TICK_DT = 1 / TICK_RATE;

/** Size of a map tile in pixels. Every map and tileset uses this. */
export const TILE_SIZE = 16;

/**
 * The world is a grid of screens, like classic top-down adventures: the camera
 * shows exactly one screen and slides to the next when the player walks off an edge.
 */
export const SCREEN_TILES_X = 20;
export const SCREEN_TILES_Y = 11;
export const SCREEN_WIDTH = SCREEN_TILES_X * TILE_SIZE;
export const SCREEN_HEIGHT = SCREEN_TILES_Y * TILE_SIZE;

/** Player collision box half-extent in pixels (box is 2 * PLAYER_HALF wide). */
export const PLAYER_HALF = 5;

/** Ticks a sword swing roots the player in place. */
export const SWING_LOCK_TICKS = 5;

/** Ticks of invulnerability after taking a hit (the sprite blinks). */
export const HIT_INVULN_TICKS = 24;

/** Knockback applied to a player that gets hit: speed (px/s) and duration (ticks). */
export const PLAYER_KNOCK_SPEED = 180;
export const PLAYER_KNOCK_TICKS = 5;

/** Knockback applied to an enemy hit by a sword. */
export const ENEMY_KNOCK_SPEED = 200;
export const ENEMY_KNOCK_TICKS = 6;

/** Seconds dead before respawning at the world centre. */
export const RESPAWN_SECONDS = 3;

/** Seconds before a dropped rupee disappears. */
export const PICKUP_LIFETIME_SECONDS = 30;

/** Distance (px) at which a player collects a pickup. */
export const PICKUP_RADIUS = 10;

/**
 * Area of interest radius in pixels: entities farther than this are not sent to a client.
 * The camera shows a whole screen while the player may stand at its edge, so this
 * covers a full screen width from the player.
 */
export const INTEREST_RADIUS = 360;

/** Area of interest is recomputed every N ticks (30 Hz / 3 = 10 times per second). */
export const INTEREST_EVERY_TICKS = 3;

/** Maximum players in one world room. */
export const MAX_PLAYERS_PER_ROOM = 40;
