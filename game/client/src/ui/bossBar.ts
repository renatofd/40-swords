import { h } from "@core/client";

/** Name and health of the boss or mini-boss on the hero's screen, at the top of the HUD. */
export class BossBar {
  readonly el = h("div", { className: "sw-bossbar", hidden: true, role: "status" });
  private name = h("div", { className: "sw-bossbar-name" });
  private fill = h("div", { className: "sw-bar-fill" });
  private last = "";

  constructor() {
    this.el.append(this.name, h("div", { className: "sw-bar" }, this.fill));
  }

  update(boss?: { name: string; hp: number; maxHp: number; mini: boolean }) {
    const key = boss ? `${boss.name}/${Math.ceil(boss.hp)}/${boss.maxHp}` : "";
    if (key === this.last) return;
    this.last = key;
    this.el.hidden = !boss;
    if (!boss) return;
    this.el.classList.toggle("sw-bossbar-mini", boss.mini);
    this.name.textContent = boss.name;
    this.fill.style.inlineSize = `${Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100))}%`;
  }
}
