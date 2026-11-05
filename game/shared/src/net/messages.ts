import type { OfferItem } from "../relics";

/** Message types between client and server (besides per-tick inputs and the state). */
export const Msg = {
  /** server → nearby clients: a damage number to show. */
  damage: "dmg",
  /** server → one client: you reached a new level. */
  levelUp: "lvl",
  /** server → nearby clients (not the shooter, who predicts it): a volley was fired. */
  shot: "shot",
  /** server → nearby clients: projectiles that stopped early (they hit an enemy). */
  projectileEnd: "pend",
  /** server → one client: you got a relic or item. */
  gain: "gain",
  /** server → one client: the offers of the vendor on your screen. */
  shop: "shop",
  /** server → one client: a purchase failed. */
  shopFail: "nobuy",
} as const;

export interface DamageMessage {
  x: number;
  y: number;
  amount: number;
  crit: boolean;
  /** True when a player was hurt (shown in another colour). */
  player: boolean;
}

export interface LevelUpMessage {
  level: number;
}

/** One volley: every weapon in `mask` fired from (x, y) facing `facing`. */
export interface ShotMessage {
  /** Shooter's session id. */
  owner: string;
  /** Volley counter (the shooter's `vseq`). */
  volley: number;
  mask: number;
  x: number;
  y: number;
  facing: number;
  /** Projectiles per weapon (indexed like WEAPON_IDS). */
  counts: number[];
}

export interface ProjectileEndMessage {
  /** Keys made with projectileKey(). */
  keys: string[];
}

export interface GainMessage {
  kind: OfferItem;
  rarity: number;
  source: "chest" | "shop";
}

export interface OfferMessage {
  kind: OfferItem;
  rarity: number;
  price: number;
  sold: boolean;
}

export interface ShopMessage {
  vendor: string;
  offers: OfferMessage[];
}

export interface ShopFailMessage {
  reason: "rupees";
}
