/**
 * Depth bands of the world (Phaser draws higher depths on top). Actors (heroes,
 * enemies, the merchant, chests and pickups) share one band and sort by their feet, so whoever
 * stands lower on the screen is drawn in front.
 */
export const DEPTH = {
  /** Tile layers (Tiled order) except `above`. */
  ground: 0,
  /** The storm zone overlay. */
  zone: 5,
  /** Vendor pedestals. */
  pedestal: 6,
  /** Shadows of actors that never move (the merchants); the others carry theirs. Chests and pickups sort with the actors. */
  groundShadow: 8,
  /** Heroes, enemies and the merchant: [actors, actors + 1), see actorDepth. */
  actors: 10,
  /** Effects over the actors (hits, smoke, bits of grass and pots). */
  fx: 30,
  /** Projectiles. */
  shots: 40,
  /** The `above` tile layer (statue heads, roofs) covers everything in the world. */
  above: 50,
} as const;

/** Feet positions are below this many px (the world is far smaller), so actors never leave their band. */
const MAX_FEET = 9999;

/**
 * Depth of an actor whose box centre is at `y` with half-extent `half`: it sorts
 * by the feet (y + half). The local hero wins exact ties.
 */
export function actorDepth(y: number, half: number, self = false): number {
  const feet = Math.min(MAX_FEET, Math.max(0, y + half));
  return DEPTH.actors + feet * 1e-4 + (self ? 5e-5 : 0);
}
