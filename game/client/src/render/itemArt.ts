/**
 * Which pack sprite and tag show a pickup, a chest or a burst (tools/art makes
 * the sheets: `pickups`, `chest`, `chest-gold`, `fx-burst-*`). Pure, so the
 * rules are unit-tested without a browser.
 */

export type RupeeTag = "rupee-green" | "rupee-blue" | "rupee-pink" | "rupee-gold";

/** 1–4 green, 5–19 blue, 20–49 pink, 50+ spinning gold coin (boss drops 80–150). */
export const rupeeTag = (v: number): RupeeTag =>
  v >= 50 ? "rupee-gold" : v >= 20 ? "rupee-pink" : v >= 5 ? "rupee-blue" : "rupee-green";

/** Sheet of a chest: gold ones (dungeons, mini-boss and boss drops) hold at least an uncommon relic. */
export const chestKey = (gold: boolean) => (gold ? "chest-gold" : "chest");

/**
 * Tag a chest shows when its `open` flag becomes `open`; `prev` is the flag it
 * had (undefined: just added, or it entered the area of interest). Only a
 * chest seen closed plays the opening; one already open is shown empty.
 */
export function chestAnim(prev: boolean | undefined, open: boolean): "closed" | "open" | "empty" {
  if (!open) return "closed";
  return prev === false ? "open" : "empty";
}

/** Epic and legendary burst purple, the rest gold. */
export const burstFx = (rarity: number) => (rarity >= 3 ? "fx-burst-purple" : "fx-burst-gold");

/** A pickup's shadow: this wide, its centre this far below the pickup's. */
export const PICKUP_SHADOW = { width: 8, dy: 7 } as const;

/**
 * Where the pieces of a shop offer stand, relative to its spot
 * (`offerPosition`): the pedestal's bottom, the rarity ring's centre, and the
 * price card's bottom. The goods stand with their bottom on the spot itself.
 */
export const OFFER_LAYOUT = { pedestalDy: 8, ringDy: -1, cardDy: -17 } as const;
