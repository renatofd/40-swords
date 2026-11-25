import { h, type Translate } from "@core/client";
import { type Career, type ClassId, PALETTES, type SummaryMessage } from "@game/shared";
import { heroPortrait } from "./heroPortrait";
import { SUMMARY_ICON, type SummaryRow } from "./iconMap";
import { icon, slot } from "./icons";
import { hexColor } from "./palette";
import { slotGroups, slotTitle } from "./relicText";

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

  /** `classId`: the hero played, shown in each colour just unlocked. */
  show(m: SummaryMessage, career: Career, unlocked: number[], classId?: ClassId) {
    const { t } = this;
    const won = m.place === 1;
    const rows: [SummaryRow, string][] = [
      ["kills", String(m.kills)],
      ["monsters", String(m.monsters)],
      ["bosses", String(m.bosses)],
      ["chests", String(m.chests)],
      ["level", String(m.level)],
      ["relics", String(m.relics)],
      ["time", clock(m.seconds)],
    ];
    const title = won ? t("summary.won") : t("summary.place", { place: m.place, total: m.heroes });
    // The relics the hero ended with (sent with the summary: the room state may already have lost the stolen one).
    const groups = slotGroups(m.relicList ?? []);
    this.el.dataset.won = String(won);
    this.el.setAttribute("aria-label", title);
    this.el.replaceChildren(
      h("h2", { className: "sw-summary-title" }, won && icon("champion", { big: true }), title),
      h(
        "dl",
        { className: "sw-summary-stats" },
        ...rows.flatMap(([row, value]) => {
          const mark = SUMMARY_ICON[row];
          return [
            // A row without an icon keeps an empty icon-sized space, so the labels line up.
            h(
              "dt",
              {},
              mark ? icon(mark) : h("span", { className: "sw-icon", style: "visibility: hidden" }),
              t(`summary.${row}`),
            ),
            h("dd", {}, h("span", { className: "sw-num" }, value)),
          ];
        }),
      ),
      ...(groups.length > 0
        ? [
            h(
              "div",
              { className: "sw-summary-relics" },
              ...groups.map((g) => slot(g.kind, g.best, g.count, undefined, slotTitle(t, g.kind, g.best))),
            ),
          ]
        : []),
      h("p", { className: "sw-summary-career" }, careerLine(t, career)),
      ...unlocked.map((i) =>
        h(
          "p",
          { className: "sw-summary-unlock" },
          classId
            ? heroPortrait(classId, i, true)
            : h("span", { className: "sw-swatch", style: `--sw-swatch: ${hexColor(PALETTES[i]?.color ?? 0)}` }),
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
