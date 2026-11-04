import { h, type Translate } from "@core/client";
import {
  type ClassId,
  computeStats,
  isClassId,
  isRelicKind,
  type RelicKind,
  type RelicLike,
  TICK_RATE,
  xpToNext,
} from "@game/shared";
import { ITEM_ICONS, itemEffect, itemName, rarityColor, rarityName } from "./relicText";

export interface StatusValues {
  classId: string;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  rupees: number;
  relics: Iterable<RelicLike>;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Health, level, XP, rupees and relics of the own hero, plus a details panel
 * (attributes and every relic) toggled with the "stats" action or a click/tap.
 * Only touches the DOM when something changed.
 */
export class StatusHud {
  readonly el: HTMLElement;
  private level = h("span", { className: "sw-level" });
  private hpFill = h("div", { className: "sw-bar-fill" });
  private hpText = h("span", { className: "sw-bar-text" });
  private xpFill = h("div", { className: "sw-bar-fill" });
  private rupees = h("span", { className: "sw-rupees" });
  private relicBar = h("div", { className: "sw-relic-bar" });
  private details = h("div", { className: "sw-details", hidden: true });
  private last = "";
  private lastRelics = "";
  private values?: StatusValues;

  constructor(private readonly t: Translate) {
    this.el = h(
      "div",
      { className: "sw-status", hidden: true },
      h(
        "button",
        {
          type: "button",
          className: "sw-status-main",
          onclick: () => this.toggle(),
          "aria-label": t("hud.attributes"),
        },
        h(
          "div",
          { className: "sw-status-row" },
          this.level,
          h("div", { className: "sw-bar sw-hp" }, this.hpFill, this.hpText),
        ),
        h("div", { className: "sw-bar sw-xp" }, this.xpFill),
        h(
          "div",
          { className: "sw-status-row" },
          h("span", { className: "sw-rupee-icon", "aria-hidden": "true" }),
          this.rupees,
          this.relicBar,
        ),
      ),
      this.details,
    );
  }

  get open(): boolean {
    return !this.details.hidden;
  }

  toggle() {
    this.details.hidden = !this.details.hidden;
    this.lastRelics = ""; // re-render the details now
    if (this.values) this.update(this.values);
  }

  update(v: StatusValues) {
    this.values = v;
    const hp = Math.ceil(v.hp);
    const key = `${hp}/${v.maxHp}/${v.level}/${v.xp}/${v.rupees}`;
    if (key !== this.last) {
      this.last = key;
      this.el.hidden = false;
      this.level.textContent = this.t("hud.level", { level: v.level });
      this.hpFill.style.inlineSize = `${Math.max(0, Math.min(100, (hp / Math.max(1, v.maxHp)) * 100))}%`;
      this.hpText.textContent = `${hp}/${v.maxHp}`;
      this.xpFill.style.inlineSize = `${Math.min(100, (v.xp / xpToNext(v.level)) * 100)}%`;
      this.rupees.textContent = String(v.rupees);
    }
    const relics = [...v.relics];
    const relicsKey = `${v.level}|${relics.map((r) => `${r.kind}${r.rarity}`).join(",")}`;
    if (relicsKey === this.lastRelics) return;
    this.lastRelics = relicsKey;
    this.renderRelicBar(relics);
    if (this.open) this.renderDetails(isClassId(v.classId) ? v.classId : "knight", v.level, relics);
  }

  /** One icon per relic kind, with the count and the colour of the best copy. */
  private renderRelicBar(relics: RelicLike[]) {
    const groups = new Map<RelicKind, { count: number; best: number }>();
    for (const r of relics) {
      if (!isRelicKind(r.kind)) continue;
      const g = groups.get(r.kind) ?? { count: 0, best: 0 };
      g.count++;
      g.best = Math.max(g.best, r.rarity);
      groups.set(r.kind, g);
    }
    this.relicBar.replaceChildren(
      ...[...groups].map(([kind, g]) =>
        h(
          "span",
          { className: "sw-relic", style: `--sw-rarity: ${rarityColor(g.best)}`, title: itemName(this.t, kind) },
          ITEM_ICONS[kind],
          g.count > 1 && h("span", { className: "sw-relic-count" }, `${g.count}`),
        ),
      ),
    );
  }

  private renderDetails(classId: ClassId, level: number, relics: RelicLike[]) {
    const { t } = this;
    const s = computeStats(classId, level, relics);
    const rows: [string, string][] = [
      [t("stat.hp"), String(s.maxHp)],
      [t("stat.damage"), String(Math.round(s.damage * 10) / 10)],
      [t("stat.speed"), String(s.speed)],
      [t("stat.attackSpeed"), (TICK_RATE / s.attackCooldownTicks).toFixed(1)],
      [t("stat.cooldown"), `${s.cooldownPct}%`],
      [t("stat.defense"), String(Math.round(s.defense * 10) / 10)],
      [t("stat.critChance"), pct(s.critChance)],
      [t("stat.critDamage"), pct(s.critDamage)],
      [t("stat.lifesteal"), pct(s.lifesteal)],
      [t("stat.luck"), String(Math.round(s.luck * 10) / 10)],
    ];
    // Same relic and rarity on one line, "×N".
    const lines = new Map<string, { kind: RelicKind; rarity: number; count: number }>();
    for (const r of relics) {
      if (!isRelicKind(r.kind)) continue;
      const key = `${r.kind}:${r.rarity}`;
      const line = lines.get(key) ?? { kind: r.kind, rarity: r.rarity, count: 0 };
      line.count++;
      lines.set(key, line);
    }
    const sorted = [...lines.values()].sort((a, b) => b.rarity - a.rarity || b.count - a.count);
    this.details.replaceChildren(
      h("h3", {}, t("hud.attributes")),
      h("dl", { className: "sw-stats" }, ...rows.flatMap(([label, value]) => [h("dt", {}, label), h("dd", {}, value)])),
      h("h3", {}, t("hud.relics")),
      sorted.length === 0
        ? h("p", { className: "sw-muted" }, t("hud.noRelics"))
        : h(
            "ul",
            { className: "sw-relic-list" },
            ...sorted.map((r) =>
              h(
                "li",
                { style: `--sw-rarity: ${rarityColor(r.rarity)}` },
                h("span", { className: "sw-relic-icon" }, ITEM_ICONS[r.kind]),
                h(
                  "span",
                  {},
                  h("strong", {}, itemName(t, r.kind)),
                  r.count > 1 && ` ×${r.count}`,
                  " · ",
                  h("span", { className: "sw-rarity" }, rarityName(t, r.rarity)),
                  h("br", {}),
                  h("span", { className: "sw-muted" }, itemEffect(t, r.kind, r.rarity)),
                ),
              ),
            ),
          ),
    );
  }
}
