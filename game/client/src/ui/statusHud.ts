import { h, type Translate } from "@core/client";
import {
  type ClassId,
  computeStats,
  isClassId,
  isRelicKind,
  isWeaponId,
  type RelicKind,
  type RelicLike,
  scaledCooldown,
  TICK_RATE,
  WEAPON_IDS,
  WEAPONS,
  type WeaponId,
  weaponCooldownKey,
  xpToNext,
} from "@game/shared";
import { cooldownRows, heartIcon, heartQuarter, STAT_ICON, type StatRow } from "./iconMap";
import { icon, setIcon, setSlotCooldown, slot } from "./icons";
import { itemEffect, itemName, rarityColor, rarityName, slotGroups, slotTitle } from "./relicText";

export interface StatusValues {
  classId: string;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  rupees: number;
  relics: Iterable<RelicLike>;
  /** Cooldown percent of the hero (scales every weapon's recharge). */
  cdPct: number;
  /** Ticks left before each weapon fires again. */
  daggerCd: number;
  fireballCd: number;
  arrowCd: number;
  novaCd: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Slots per row of the slot grid (styles.css `.sw-slots`). */
const SLOTS_PER_ROW = 5;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The own hero's status (DOM, top corner): a heart container filled in
 * quarters plus the exact HP, the HP and XP bars, level and rupees, and one
 * slot per weapon (with its recharge shade) and passive relic; then the
 * minimap and a details panel (attributes, every weapon and relic) toggled
 * with the "stats" action or a click/tap. Only touches the DOM when
 * something changed (the cooldown shades: when a weapon's row count changes).
 */
export class StatusHud {
  readonly el: HTMLElement;
  private heart = icon("hp-4");
  private hpText = h("span", { className: "sw-num sw-hp-text" });
  private hpFill = h("div", { className: "sw-bar-fill" });
  private xpFill = h("div", { className: "sw-bar-fill" });
  private level = h("span", { className: "sw-level" });
  private rupees = h("span", { className: "sw-num" });
  private slots = h("div", { className: "sw-slots" });
  private details = h("div", { className: "sw-details", hidden: true });
  /** Slot of each weapon in the grid, and its shaded rows now. */
  private weaponSlots = new Map<WeaponId, { el: HTMLElement; rows: number }>();
  private last = "";
  private lastSlots = "";
  private lastDetails = "";
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
        h("div", { className: "sw-status-row" }, this.heart, this.hpText),
        h("div", { className: "sw-bar sw-hp" }, this.hpFill),
        h("div", { className: "sw-bar sw-xp" }, this.xpFill),
        h(
          "div",
          { className: "sw-status-row" },
          this.level,
          h("span", { className: "sw-rupees" }, icon("rupee-green"), this.rupees),
        ),
        this.slots,
      ),
      this.details,
    );
    this.el.dataset.slotRows = "0";
  }

  /** Adds a widget under the slots (above the details panel), e.g. the minimap. */
  addWidget(el: HTMLElement) {
    this.details.before(el);
  }

  get open(): boolean {
    return !this.details.hidden;
  }

  toggle() {
    this.details.hidden = !this.details.hidden;
    this.el.classList.toggle("sw-status-open", this.open);
    this.lastDetails = ""; // re-render the details now
    if (this.values) this.update(this.values);
  }

  update(v: StatusValues) {
    this.values = v;
    const hp = Math.max(0, Math.ceil(v.hp));
    const key = `${hp}/${v.maxHp}/${v.level}/${v.xp}/${v.rupees}`;
    if (key !== this.last) {
      this.last = key;
      this.el.hidden = false;
      const quarter = heartQuarter(hp, v.maxHp);
      // Low HP: the heart blinks between a quarter and empty (skin.css `sw-heart-low`), the number turns red.
      setIcon(this.heart, heartIcon(quarter), quarter === 1 ? "hp-0" : undefined);
      this.el.classList.toggle("sw-low", quarter <= 1);
      this.hpText.textContent = `${hp}/${v.maxHp}`;
      this.hpFill.style.setProperty("--p", String(clamp01(hp / Math.max(1, v.maxHp))));
      this.xpFill.style.setProperty("--p", String(clamp01(v.xp / Math.max(1, xpToNext(v.level)))));
      this.level.textContent = this.t("hud.level", { level: v.level });
      this.rupees.textContent = String(v.rupees);
    }
    const relics = [...v.relics];
    const relicsKey = relics.map((r) => `${r.kind}${r.rarity}`).join(",");
    if (relicsKey !== this.lastSlots) {
      this.lastSlots = relicsKey;
      this.renderSlots(relics, v);
    } else this.updateCooldowns(v);
    if (this.open) {
      const detailsKey = `${v.classId}|${v.level}|${relicsKey}`;
      if (detailsKey !== this.lastDetails) {
        this.lastDetails = detailsKey;
        this.renderDetails(isClassId(v.classId) ? v.classId : "knight", v.level, relics);
      }
    }
  }

  /** Recharge shade of a weapon: rows (0..16) of its icon still recharging. */
  private cooldown(weapon: WeaponId, v: StatusValues): number {
    return cooldownRows(v[weaponCooldownKey(weapon)], scaledCooldown(WEAPONS[weapon].cooldownTicks, v.cdPct));
  }

  /** At most one style write per weapon whose shaded row count changed. */
  private updateCooldowns(v: StatusValues) {
    for (const [weapon, s] of this.weaponSlots) {
      const rows = this.cooldown(weapon, v);
      if (rows === s.rows) continue;
      s.rows = rows;
      setSlotCooldown(s.el, rows);
    }
  }

  /** One slot per kind, weapons first, in a fixed order (slots never jump). */
  private renderSlots(relics: RelicLike[], v: StatusValues) {
    const groups = slotGroups(relics);
    this.weaponSlots.clear();
    this.slots.replaceChildren(
      ...groups.map((g) => {
        const rows = isWeaponId(g.kind) ? this.cooldown(g.kind, v) : undefined;
        const el = slot(g.kind, g.best, g.count, rows, slotTitle(this.t, g.kind, g.best));
        if (isWeaponId(g.kind)) this.weaponSlots.set(g.kind, { el, rows: rows ?? 0 });
        return el;
      }),
    );
    this.el.dataset.slotRows = String(Math.ceil(groups.length / SLOTS_PER_ROW));
  }

  private renderDetails(classId: ClassId, level: number, relics: RelicLike[]) {
    const { t } = this;
    const s = computeStats(classId, level, relics);
    const rows: [StatRow, string][] = [
      ["hp", String(s.maxHp)],
      ["damage", String(Math.round(s.damage * 10) / 10)],
      ["speed", String(s.speed)],
      ["attackSpeed", (TICK_RATE / s.attackCooldownTicks).toFixed(1)],
      ["cooldown", `${s.cooldownPct}%`],
      ["defense", String(Math.round(s.defense * 10) / 10)],
      ["critChance", pct(s.critChance)],
      ["critDamage", pct(s.critDamage)],
      ["lifesteal", pct(s.lifesteal)],
      ["luck", String(Math.round(s.luck * 10) / 10)],
    ];
    // Same kind and rarity on one line, "×N".
    const lines = new Map<string, { kind: RelicKind; rarity: number; count: number }>();
    for (const r of relics) {
      if (!isRelicKind(r.kind)) continue;
      const key = `${r.kind}:${r.rarity}`;
      const line = lines.get(key) ?? { kind: r.kind, rarity: r.rarity, count: 0 };
      line.count++;
      lines.set(key, line);
    }
    // Weapons in their slot order, then passives by rarity and count.
    const sorted = [...lines.values()].sort((a, b) => b.rarity - a.rarity || b.count - a.count);
    const weapons = WEAPON_IDS.flatMap((w) => sorted.filter((l) => l.kind === w));
    const passives = sorted.filter((l) => !isWeaponId(l.kind));
    const list = (items: typeof sorted) =>
      h(
        "ul",
        { className: "sw-relic-list" },
        ...items.map((r) => {
          // The line says ×N itself: the slot shows just the frame and the icon.
          const s = slot(r.kind, r.rarity, 1);
          s.querySelector(".sw-slot-badge")?.remove();
          return h(
            "li",
            { style: `--sw-rarity: ${rarityColor(r.rarity)}` },
            s,
            h(
              "span",
              {},
              h("strong", { style: "color: var(--sw-rarity)" }, itemName(t, r.kind)),
              r.count > 1 && " ",
              r.count > 1 && h("span", { className: "sw-num" }, `×${r.count}`),
              " · ",
              h("span", { className: "sw-rarity" }, rarityName(t, r.rarity)),
              h("br", {}),
              h("span", { className: "sw-muted" }, itemEffect(t, r.kind, r.rarity)),
            ),
          );
        }),
      );
    const children: (HTMLElement | false)[] = [
      h("h3", {}, t("hud.attributes")),
      h(
        "dl",
        { className: "sw-stats" },
        ...rows.flatMap(([row, value]) => [
          h("dt", {}, icon(STAT_ICON[row]), t(`stat.${row}`)),
          h("dd", {}, h("span", { className: "sw-num" }, value)),
        ]),
      ),
      weapons.length > 0 && h("h3", {}, t("hud.weapons")),
      weapons.length > 0 && list(weapons),
      (passives.length > 0 || weapons.length === 0) && h("h3", {}, t("hud.relics")),
      passives.length > 0 && list(passives),
      sorted.length === 0 && h("p", { className: "sw-muted" }, t("hud.noRelics")),
    ];
    this.details.replaceChildren(...children.filter((c) => c !== false));
  }
}
