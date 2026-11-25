/**
 * Item and HUD icons (data only). One `items` sprite is built from these lists
 * (manifest.ts `iconSprite`): Phaser draws it in the world (pickup reveal, shop goods)
 * and the DOM draws the same sheet as a CSS sprite through
 * game/client/src/ui/iconFrames.json, so the world and the HUD never disagree.
 *
 * Cells are 16x16 indices on the pack sheets: `i = row * columns + col`
 * (columns: Pickups 13, Equipment 19, Weapons 8, Tools 15, Books and Treasures 7, Menu 8).
 */
import type { OfferItem } from "@game/shared";

/** Pack sheets the icons come from (relative to content/src/notzelda). The keys are the `items` sprite sources. */
export const ICON_SHEETS = {
  pickups: "Items/Pickups.png",
  equipment: "Items/Equipment.png",
  weapons: "Items/Weapons.png",
  tools: "Items/Tools.png",
  treasures: "Items/Books and Treasures.png",
  menu: "Menu/Menu.png",
} as const;
export type IconSheet = keyof typeof ICON_SHEETS;

/** `frames` consecutive indices from `i` (same row), `ms` per frame, looping. */
export interface IconDef {
  readonly src: IconSheet;
  readonly i: number;
  readonly frames?: number;
  readonly ms?: number;
}

/**
 * Exhaustive by type: a relic, weapon or item without an icon is a compile error.
 * Passives look worn or carried, weapons look like things that shoot.
 */
export const ITEM_ICONS: Readonly<Record<OfferItem, IconDef>> = {
  heart: { src: "pickups", i: 0 }, // heart container, white rim
  power: { src: "equipment", i: 25 }, // gold gauntlet
  boots: { src: "equipment", i: 28 }, // winged boot
  clover: { src: "pickups", i: 26 }, // gold star ("Lucky Star")
  eye: { src: "equipment", i: 74 }, // purple domino mask ("Duelist's Mask")
  mark: { src: "equipment", i: 62 }, // blue horned helm ("Berserker's Helm")
  fang: { src: "equipment", i: 75 }, // gold fanged demon mask ("Vampire Mask")
  shield: { src: "equipment", i: 43 }, // iron heater shield
  haste: { src: "tools", i: 60, frames: 4, ms: 150 }, // compass, the needle turns ("Time Compass")
  dagger: { src: "weapons", i: 32 }, // blue knife (= shot-dagger)
  fireball: { src: "weapons", i: 55 }, // red-orb staff
  arrow: { src: "weapons", i: 43 }, // drawn silver bow (the wooden one, 41, vanishes on the tan plinth)
  nova: { src: "pickups", i: 59 }, // blue crystal (= shot-nova)
  potion: { src: "tools", i: 46 }, // pink round flask
};

/** HUD-only icons (same sheet, after the items). */
export const UI_ICONS = {
  "rupee-green": { src: "pickups", i: 56 }, // rupee counter, prices
  // HUD heart container filled in quarters: full, ¾ (no top-right), ½ (left), ¼ (top-left), empty.
  "hp-4": { src: "pickups", i: 0 },
  "hp-3": { src: "pickups", i: 9 },
  "hp-2": { src: "pickups", i: 2 },
  "hp-1": { src: "pickups", i: 4 },
  "hp-0": { src: "pickups", i: 12 },
  lock: { src: "menu", i: 100 }, // locked hero colours
  "mark-boss": { src: "menu", i: 101 }, // boss bar, summary "bosses"
  "mark-mini": { src: "menu", i: 98 }, // mini-boss bar
  "mark-danger": { src: "menu", i: 99 }, // danger banner
  heroes: { src: "equipment", i: 59 }, // grey knight helm: heroes standing
  champion: { src: "equipment", i: 60 }, // gold knight helm: wins, victory
  sword: { src: "weapons", i: 1 }, // attack speed, heroes defeated
  chest: { src: "treasures", i: 63 }, // chests opened
  "sum-monsters": { src: "weapons", i: 25 }, // club: monsters slain
  "sum-level": { src: "pickups", i: 39 }, // purple star: level reached
  "sum-relics": { src: "pickups", i: 52 }, // gold ring: relics
} as const satisfies Record<string, IconDef>;
export type UiIcon = keyof typeof UI_ICONS;
