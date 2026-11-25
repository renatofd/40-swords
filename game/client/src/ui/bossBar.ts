import { h } from "@core/client";
import { icon, setIcon } from "./icons";

/**
 * Name and health of the boss or mini-boss on the hero's screen, at the top of
 * the HUD: the pack's boss mark (claws) or mini-boss mark ("!") before the name.
 */
export class BossBar {
  readonly el = h("div", { className: "sw-bossbar", hidden: true, role: "status" });
  private mark = icon("mark-boss");
  private label = h("span", {});
  private name = h("div", { className: "sw-bossbar-name" }, this.mark, this.label);
  private fill = h("div", { className: "sw-bar-fill" });
  private last = "";

  constructor() {
    this.el.append(this.name, h("div", { className: "sw-bar" }, this.fill));
  }

  update(boss?: { name: string; hp: number; maxHp: number; mini: boolean }) {
    const key = boss ? `${boss.name}/${Math.ceil(boss.hp)}/${boss.maxHp}/${boss.mini}` : "";
    if (key === this.last) return;
    this.last = key;
    this.el.hidden = !boss;
    if (!boss) return;
    this.el.classList.toggle("sw-bossbar-mini", boss.mini);
    setIcon(this.mark, boss.mini ? "mark-mini" : "mark-boss");
    this.label.textContent = boss.name;
    this.fill.style.setProperty("--p", String(Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)))));
  }
}
