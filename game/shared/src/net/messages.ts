import type { EnemyKind, ShotStyle } from "../enemies";
import type { OfferItem, RelicKind } from "../relics";

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
  /** server → nearby clients: an enemy fired projectiles. */
  enemyShot: "eshot",
  /** server → everyone: a boss or mini-boss was defeated. */
  bossDown: "boss",
  /** server → everyone: a hero is out of the match (kill feed). */
  kill: "kill",
  /** client → server: ready (or not) in the waiting room. */
  ready: "ready",
  /** client → server: while out, watch the next hero still in the match. */
  watchNext: "watch",
  /** client → server: waiting room, whether bots fill the next match. */
  bots: "bots",
  /** server → one client: you picked up a rupee or a heart. */
  picked: "pick",
} as const;

/** What monsters drop: rupees (`value` = how many) and hearts (heal HEART_HEAL of max health). */
export type PickupKind = "rupee" | "heart";

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
  /** "loot": taken from a hero you defeated. */
  source: "chest" | "shop" | "loot";
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

/** Enemy projectiles fired together; projectile i has key `${key}:${i}` (see ProjectileEndMessage). */
export interface EnemyShotMessage {
  key: string;
  x: number;
  y: number;
  /** Direction of each projectile, radians. */
  angles: number[];
  speed: number;
  range: number;
  style: ShotStyle;
}

export interface BossDownMessage {
  kind: EnemyKind;
  /** Name of the hero who landed the final blow. */
  by: string;
}

/** A hero fell and is out of the match. */
export interface KillMessage {
  cause: "hero" | "monster" | "storm";
  /** Session id and name of the hero who won the fight (cause "hero"). */
  killer: string;
  killerName: string;
  victim: string;
  victimName: string;
  /** The relic the winner took (none when the loser had none, or no hero did it). */
  relic?: { kind: RelicKind; rarity: number };
  /** Rupees the winner took. */
  rupees: number;
  /** Final place of the loser (2 = runner-up). */
  place: number;
}

export interface ReadyMessage {
  ready: boolean;
}

export interface BotsMessage {
  on: boolean;
}

export interface PickedMessage {
  kind: PickupKind;
  /** Rupees gained, or health restored. */
  value: number;
}
