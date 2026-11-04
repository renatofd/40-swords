import { h, type Translate } from "@core/client";
import { xpToNext } from "@game/shared";

export interface StatusValues {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  rupees: number;
}

/** Health, level, XP and rupees of the own hero. Only touches the DOM when a value changes. */
export class StatusHud {
  readonly el: HTMLElement;
  private level = h("span", { className: "sw-level" });
  private hpFill = h("div", { className: "sw-bar-fill" });
  private hpText = h("span", { className: "sw-bar-text" });
  private xpFill = h("div", { className: "sw-bar-fill" });
  private rupees = h("span", { className: "sw-rupees" });
  private last = "";

  constructor(private readonly t: Translate) {
    this.el = h(
      "div",
      { className: "sw-status", hidden: true },
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
      ),
    );
  }

  update(v: StatusValues) {
    const hp = Math.ceil(v.hp);
    const key = `${hp}/${v.maxHp}/${v.level}/${v.xp}/${v.rupees}`;
    if (key === this.last) return;
    this.last = key;
    this.el.hidden = false;
    this.level.textContent = this.t("hud.level", { level: v.level });
    this.hpFill.style.inlineSize = `${Math.max(0, Math.min(100, (hp / Math.max(1, v.maxHp)) * 100))}%`;
    this.hpText.textContent = `${hp}/${v.maxHp}`;
    this.xpFill.style.inlineSize = `${Math.min(100, (v.xp / xpToNext(v.level)) * 100)}%`;
    this.rupees.textContent = String(v.rupees);
  }
}
