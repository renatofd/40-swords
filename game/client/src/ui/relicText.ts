import type { Translate } from "@core/client";
import {
  clampRarity,
  isWeaponId,
  type OfferItem,
  PASSIVES,
  passiveValue,
  RARITIES,
  RARITY_COLORS,
  RARITY_WEAPON_POWER,
  TICK_RATE,
  WEAPONS,
} from "@game/shared";

/**
 * PLACEHOLDER icons (emoji) for relics and items, used by the DOM HUD, the
 * shop cards and the "found" card. Swap for images later in one place.
 */
export const ITEM_ICONS: Record<OfferItem, string> = {
  heart: "❤️",
  power: "💪",
  boots: "👢",
  clover: "🍀",
  eye: "🎯",
  mark: "💥",
  fang: "🩸",
  shield: "🛡️",
  haste: "⏳",
  dagger: "🗡️",
  fireball: "🔥",
  arrow: "🏹",
  nova: "❄️",
  potion: "🧪",
};

export const rarityColor = (rarity: number) =>
  `#${(RARITY_COLORS[clampRarity(rarity)] ?? 0xffffff).toString(16).padStart(6, "0")}`;

export const itemName = (t: Translate, kind: OfferItem) => t(`item.${kind}`);
export const rarityName = (t: Translate, rarity: number) => t(`rarity.${RARITIES[clampRarity(rarity)]}`);

/** Label key of each attribute a passive relic improves. */
const STAT_LABEL: Record<string, string> = {
  maxHp: "stat.hp",
  damage: "stat.damage",
  speed: "stat.speed",
  luck: "stat.luck",
  critChance: "stat.critChance",
  critDamage: "stat.critDamage",
  lifesteal: "stat.lifesteal",
  defense: "stat.defense",
  haste: "stat.cooldown",
};

const trim = (v: number) => String(Math.round(v * 10) / 10);

/** One line saying what an item does: "Health +12", "Cooldown −4%", "Damage 7 · every 1.1 s". */
export function itemEffect(t: Translate, kind: OfferItem, rarity: number): string {
  if (kind === "potion") return t("effect.potion");
  if (isWeaponId(kind)) {
    const def = WEAPONS[kind];
    return t("effect.weapon", {
      damage: Math.round(def.damage * (RARITY_WEAPON_POWER[clampRarity(rarity)] ?? 1)),
      seconds: (def.cooldownTicks / TICK_RATE).toFixed(1),
    });
  }
  const { stat } = PASSIVES[kind];
  const value = passiveValue(kind, rarity);
  const label = t(STAT_LABEL[stat] ?? stat);
  if (stat === "haste") return t("effect.less", { stat: label, value: `${trim(value)}%` });
  const percent = stat === "critChance" || stat === "critDamage" || stat === "lifesteal";
  return t("effect.more", { stat: label, value: percent ? `${trim(value * 100)}%` : trim(value) });
}
