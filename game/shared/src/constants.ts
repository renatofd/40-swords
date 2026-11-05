/**
 * Bump whenever schemas, inputs or messages in this game change in a way old
 * clients can't handle. Mismatched clients are told to reload.
 */
export const PROTOCOL_VERSION = 12;

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

/** Ticks a sword swing lasts: the hero keeps facing the same way and moves slower meanwhile. */
export const SWING_LOCK_TICKS = 5;

/** Share of the walking speed left while swinging (the swing slows the hero down instead of rooting it). */
export const SWING_MOVE_FACTOR = 0.5;

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

/** Chance a monster drops a heart (elites more often; bosses and mini-bosses always). */
export const HEART_DROP_CHANCE = 0.1;
export const HEART_DROP_CHANCE_ELITE = 0.5;

/** Share of max health a heart restores. Only a hurt hero picks one up. */
export const HEART_HEAL = 0.25;

/** Hits between heroes (PvP) deal this share of their damage: fights last long enough to run away. */
export const PVP_DAMAGE_FACTOR = 0.5;

/** Out of combat (this long without taking damage), heroes slowly heal: a share of max health per second. Not in the arena. */
export const REGEN_DELAY_SECONDS = 6;
export const REGEN_PER_SECOND = 0.01;

/** Distance (px) at which a player opens a chest or buys an offer by walking onto it. */
export const TOUCH_RADIUS = 10;

/** Seconds before an emptied chest fills up again. */
export const CHEST_RESPAWN_SECONDS = 120;

/** A chest dropped by a boss or an elite disappears this long after being opened, or after a while unopened. */
export const DROPPED_CHEST_OPEN_SECONDS = 8;
export const DROPPED_CHEST_LIFETIME_SECONDS = 180;

/** Seconds before a vendor offers a player new items. */
export const SHOP_RESTOCK_SECONDS = 180;

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
