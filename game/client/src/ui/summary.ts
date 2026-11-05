import { h, type Translate } from "@core/client";
import { type Career, PALETTES, type SummaryMessage } from "@game/shared";
import { hexColor } from "./palette";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** A career in one line: matches, wins and best place. */
export function careerLine(t: Translate, career: Career): string {
  if (career.matches === 0) return t("career.first");
  return t("career.line", { matches: career.matches, wins: career.wins, best: career.best });
}

/**
 * How the match went (DOM, centre of the screen): shown when the hero falls,
 * or to whoever is still standing when the match ends. Place, what the hero
 * did, the career so far and any hero colour it just unlocked.
 */
export class SummaryPanel {
  readonly el = h("section", { className: "sw-summary", hidden: true, role: "dialog" });

  constructor(private readonly t: Translate) {}

  show(m: SummaryMessage, career: Career, unlocked: number[]) {
    const { t } = this;
    const won = m.place === 1;
    const rows: [string, string][] = [
      [t("summary.kills"), String(m.kills)],
      [t("summary.monsters"), String(m.monsters)],
      [t("summary.bosses"), String(m.bosses)],
      [t("summary.chests"), String(m.chests)],
      [t("summary.level"), String(m.level)],
      [t("summary.relics"), String(m.relics)],
      [t("summary.time"), clock(m.seconds)],
    ];
    this.el.dataset.won = String(won);
    this.el.setAttribute(
      "aria-label",
      won ? t("summary.won") : t("summary.place", { place: m.place, total: m.heroes }),
    );
    this.el.replaceChildren(
      h(
        "h2",
        { className: "sw-summary-title" },
        won ? `🏆 ${t("summary.won")}` : t("summary.place", { place: m.place, total: m.heroes }),
      ),
      h(
        "dl",
        { className: "sw-summary-stats" },
        ...rows.flatMap(([label, value]) => [h("dt", {}, label), h("dd", {}, value)]),
      ),
      h("p", { className: "sw-summary-career" }, careerLine(t, career)),
      ...unlocked.map((i) =>
        h(
          "p",
          { className: "sw-summary-unlock" },
          h("span", { className: "sw-swatch", style: `--sw-swatch: ${hexColor(PALETTES[i]?.color ?? 0)}` }),
          t("summary.unlocked", { colour: t(`palette.${PALETTES[i]?.id}`) }),
        ),
      ),
      h("button", { type: "button", className: "ui-button primary", onclick: () => this.hide() }, t("summary.close")),
    );
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
