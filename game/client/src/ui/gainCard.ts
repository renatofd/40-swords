import { h, type Translate } from "@core/client";
import type { GainMessage } from "@game/shared";
import { ITEM_ICONS, itemEffect, itemName, rarityColor, rarityName } from "./relicText";

const SHOW_MS = 3000;

/** Cards announcing what the hero just got (chest or shop); they stack and fade out. */
export class GainCards {
  readonly el = h("div", { className: "sw-gains", role: "status", "aria-live": "polite" });

  constructor(private readonly t: Translate) {}

  show(m: GainMessage) {
    const { t } = this;
    const potion = m.kind === "potion";
    const card = h(
      "div",
      { className: "sw-gain", style: `--sw-rarity: ${rarityColor(m.rarity)}` },
      h("span", { className: "sw-gain-icon", "aria-hidden": "true" }, ITEM_ICONS[m.kind]),
      h(
        "div",
        {},
        h("div", { className: "sw-muted" }, t(m.source === "chest" ? "gain.chest" : "gain.shop")),
        h("strong", { className: "sw-gain-name" }, itemName(t, m.kind)),
        !potion && h("div", { className: "sw-rarity" }, rarityName(t, m.rarity)),
        h("div", {}, itemEffect(t, m.kind, m.rarity)),
      ),
    );
    this.el.prepend(card);
    while (this.el.childElementCount > 3) this.el.lastElementChild?.remove();
    setTimeout(() => card.classList.add("sw-gain-out"), SHOW_MS);
    setTimeout(() => card.remove(), SHOW_MS + 400);
  }
}
