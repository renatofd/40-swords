import type { Translate } from "@core/client";
import {
  clampRarity,
  isRelicKind,
  isWeaponId,
  type OfferItem,
  PASSIVE_IDS,
  PASSIVES,
  passiveValue,
  RARITIES,
  RARITY_COLORS,
  RARITY_WEAPON_POWER,
  type RelicKind,
  TICK_RATE,
  WEAPON_IDS,
  WEAPONS,
} from "@game/shared";

export const rarityColor = (rarity: number) =>
  `#${(RARITY_COLORS[clampRarity(rarity)] ?? 0xffffff).toString(16).padStart(6, "0")}`;

export const itemName = (t: Translate, kind: OfferItem) => t(`item.${kind}`);
export const rarityName = (t: Translate, rarity: number) => t(`rarity.${RARITIES[clampRarity(rarity)]}`);

/** Tooltip of a slot: "Boots · Rare". */
export const slotTitle = (t: Translate, kind: OfferItem, rarity: number) =>
  `${itemName(t, kind)} · ${rarityName(t, rarity)}`;

/** One slot per relic or weapon kind: how many copies, and the best rarity among them. */
export interface SlotGroup {
  kind: RelicKind;
  best: number;
  count: number;
}

/** Fixed slot order (HUD, summary): weapons in WEAPON_IDS order, then passives in PASSIVE_IDS order. */
const SLOT_ORDER: readonly RelicKind[] = [...WEAPON_IDS, ...PASSIVE_IDS];

/** Groups relics into slots in the fixed order, so slots never jump around. Unknown kinds are skipped. */
export function slotGroups(relics: Iterable<{ kind: string; rarity: number }>): SlotGroup[] {
  const groups = new Map<RelicKind, SlotGroup>();
  for (const r of relics) {
    if (!isRelicKind(r.kind)) continue;
    const g = groups.get(r.kind) ?? { kind: r.kind, best: 0, count: 0 };
    g.count++;
    g.best = Math.max(g.best, clampRarity(r.rarity));
    groups.set(r.kind, g);
  }
  return SLOT_ORDER.flatMap((kind) => groups.get(kind) ?? []);
}

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
