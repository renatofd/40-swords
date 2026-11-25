import { h, type Translate } from "@core/client";
import { clampRarity, type GainMessage, isWeaponId } from "@game/shared";
import { ITEM_ICON } from "./iconMap";
import { icon } from "./icons";
import { itemEffect, itemName, rarityColor, rarityName } from "./relicText";

const SHOW_MS = 3000;

/**
 * Cards announcing what the hero just got (chest, shop or taken in battle);
 * they stack and fade out. Framed in the item's rarity (`data-rarity`,
 * skin.css); the potion has no rarity line.
 */
export class GainCards {
  readonly el = h("div", { className: "sw-gains", role: "status", "aria-live": "polite" });

  constructor(private readonly t: Translate) {}

  show(m: GainMessage) {
    const { t } = this;
    const potion = m.kind === "potion";
    const rarity = clampRarity(m.rarity);
    const rarityLine = isWeaponId(m.kind) ? `${t("item.weapon")} · ${rarityName(t, rarity)}` : rarityName(t, rarity);
    const card = h(
      "div",
      { className: "sw-gain", style: `--sw-rarity: ${rarityColor(rarity)}` },
      icon(ITEM_ICON[m.kind], { big: true }),
      h(
        "div",
        {},
        h("div", { className: "sw-muted sw-gain-source" }, t(`gain.${m.source}`)),
        h("strong", { className: "sw-gain-name" }, itemName(t, m.kind)),
        !potion && h("div", { className: "sw-rarity" }, rarityLine),
        h("div", {}, itemEffect(t, m.kind, rarity)),
      ),
    );
    card.dataset.rarity = String(potion ? 0 : rarity);
    this.el.prepend(card);
    while (this.el.childElementCount > 3) this.el.lastElementChild?.remove();
    setTimeout(() => card.classList.add("sw-gain-out"), SHOW_MS);
    setTimeout(() => card.remove(), SHOW_MS + 400);
  }
}
