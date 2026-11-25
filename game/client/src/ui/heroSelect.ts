import { type BeforeJoinContext, h, type JoinChoice } from "@core/client";
import {
  CLASS_IDS,
  CLASSES,
  type ClassId,
  DEFAULT_MATCH_TIMES,
  isClassId,
  isUnlocked,
  MAP_IDS,
  type MapId,
  PALETTES,
  ROOM_BY_MAP,
  statsFor,
  TICK_RATE,
} from "@game/shared";
import { loadCareer, savedPalette, savePalette, useCareerStorage } from "../career";
import { creditsPanel } from "./credits";
import { heroPortrait } from "./heroPortrait";
import { STAT_ICON, type StatRow } from "./iconMap";
import { icon } from "./icons";
import { heroColor, hexColor, unlockText } from "./palette";
import { careerLine } from "./summary";

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** The class colour swatch: a stripe of each class colour. */
const CLASSIC_SWATCH = `linear-gradient(135deg, ${CLASS_IDS.map((id, i) => `${hexColor(CLASSES[id].color)} ${(i * 100) / CLASS_IDS.length}% ${((i + 1) * 100) / CLASS_IDS.length}%`).join(", ")})`;

/** Stat rows shown on a class card (attribute → value). */
function statRows(classId: ClassId): [StatRow, string][] {
  const s = statsFor(classId, 1);
  return [
    ["hp", String(s.maxHp)],
    ["damage", String(s.damage)],
    ["speed", String(s.speed)],
    ["attackSpeed", (TICK_RATE / s.attackCooldownTicks).toFixed(1)],
    ["defense", String(s.defense)],
    ["critChance", pct(s.critChance)],
    ["critDamage", pct(s.critDamage)],
    ["lifesteal", pct(s.lifesteal)],
    ["luck", String(s.luck)],
  ];
}

/** Under the colours, after a locked one was tried: its name and how to unlock it. */
interface ColourNote {
  text: string;
  locked: boolean;
}

/**
 * More than one map to pick from? Until then (more maps come after launch) the
 * map step is skipped: picking a hero joins the only map, and its rules show
 * on the hero step.
 */
const PICK_MAP = MAP_IDS.length > 1;

/**
 * A new step starts at its top: the core screen host keeps its scroll, and on a
 * phone Credits is reached by scrolling down the (taller) hero step.
 */
const scrollScreenTop = () => document.querySelector(".ui-screen-host")?.scrollTo(0, 0);

/**
 * Hero and map select, shown by the core between Play and joining
 * (`GameModule.beforeJoin`). The class and colour travel in the join options
 * (the server validates them) and the map picks the room. Also shows the
 * player's career, whose milestones unlock hero colours. DOM, so every script works.
 */
export function chooseHero(ctx: BeforeJoinContext): Promise<JoinChoice | null> {
  // The match scene saves the career with the game's storage too (see career.ts).
  useCareerStorage(ctx.storage);
  const career = loadCareer();
  const saved = ctx.storage.get("hero");
  let hero: ClassId = isClassId(saved) ? saved : "knight";
  let palette = savedPalette(career);
  /** Under the colours: the one picked (null), or how to unlock the one tried. */
  let note: ColourNote | null = null;
  let step: "hero" | "map" | "credits" = "hero";

  return new Promise((resolve) => {
    ctx.signal.addEventListener("abort", () => resolve(null));
    const done = (mapId: MapId) => {
      ctx.storage.set("hero", hero);
      resolve({ roomName: ROOM_BY_MAP[mapId], options: { classId: hero, palette } });
    };
    const rules = () =>
      ctx.t("map.rules", { pvp: DEFAULT_MATCH_TIMES.pvpAfter / 60, arena: DEFAULT_MATCH_TIMES.arenaAfter / 60 });
    const colours = () => {
      const { t } = ctx;
      return h(
        "div",
        { className: "sw-colours" },
        h("span", { className: "sw-colours-label", id: "sw-colours-label" }, t("select.colour")),
        h(
          "div",
          { className: "sw-colours-row", role: "radiogroup", "aria-labelledby": "sw-colours-label" },
          ...PALETTES.map((p, i) => {
            const open = isUnlocked(career, i);
            const name = t(`palette.${p.id}`);
            const unlock = unlockText(t, p);
            return h(
              "button",
              {
                type: "button",
                className: `sw-colour${i === palette ? " sw-colour-on" : ""}${open ? "" : " sw-colour-locked"}`,
                role: "radio",
                "aria-checked": String(i === palette),
                "aria-disabled": open ? undefined : "true",
                "aria-label": open ? name : `${name} (${unlock})`,
                "data-palette": p.id,
                title: open ? name : unlock,
                onclick: () => {
                  if (open) {
                    palette = i;
                    savePalette(i);
                    note = null;
                  } else note = { text: `${name}: ${unlock}`, locked: true };
                  ctx.audio.playSfx("ui");
                  ctx.show(render);
                },
              },
              // The fill inside the slot frame; locked: dimmed (skin.css) under the pack's lock.
              h(
                "span",
                {
                  className: "sw-colour-fill",
                  style: `--sw-swatch: ${p.color === undefined ? CLASSIC_SWATCH : hexColor(p.color)}`,
                },
                !open && icon("lock"),
              ),
            );
          }),
        ),
        h(
          "p",
          { className: "sw-colours-note", "aria-live": "polite" },
          // One text node after the icon (no separator), so the note reads exactly "Gold: Win a match".
          note?.locked && icon("lock"),
          note ? note.text : t(`palette.${PALETTES[palette]?.id}`),
        ),
        h("p", { className: "sw-career" }, careerLine(t, career)),
      );
    };

    // Re-rendered by the core when the language changes, so it reads `step` and `hero`.
    const render = () => {
      const { t } = ctx;
      if (step === "hero") {
        return h(
          "div",
          { className: "sw-select" },
          h("h2", { className: "sw-select-title" }, t("select.heroTitle")),
          !PICK_MAP && h("p", { className: "sw-select-rules" }, rules()),
          h(
            "div",
            { className: "sw-cards" },
            ...CLASS_IDS.map((id) =>
              h(
                "button",
                {
                  type: "button",
                  className: "sw-card",
                  "data-class": id,
                  style: `--sw-class: ${hexColor(heroColor(id, palette))}`,
                  autofocus: id === hero,
                  onclick: () => {
                    hero = id;
                    ctx.audio.playSfx("ui");
                    if (!PICK_MAP) {
                      done(MAP_IDS[0]);
                      return;
                    }
                    step = "map";
                    ctx.show(render);
                  },
                },
                h("span", { className: "sw-card-swatch", "aria-hidden": "true" }, heroPortrait(id, palette)),
                h("strong", { className: "sw-card-title" }, t(`class.${id}`)),
                h("span", { className: "sw-card-desc" }, t(`class.${id}.desc`)),
                h(
                  "dl",
                  { className: "sw-stats" },
                  ...statRows(id).flatMap(([row, value]) => [
                    h("dt", {}, icon(STAT_ICON[row]), t(`stat.${row}`)),
                    h("dd", {}, h("span", { className: "sw-num" }, value)),
                  ]),
                ),
              ),
            ),
          ),
          colours(),
          h(
            "div",
            { className: "ui-actions" },
            h("button", { type: "button", className: "ui-button", onclick: () => resolve(null) }, t("select.back")),
            h(
              "button",
              {
                type: "button",
                className: "ui-button sw-credits-button",
                onclick: () => {
                  step = "credits";
                  ctx.audio.playSfx("ui");
                  ctx.show(render);
                  scrollScreenTop();
                },
              },
              t("credits.button"),
            ),
          ),
        );
      }
      if (step === "credits")
        return creditsPanel(t, () => {
          step = "hero";
          ctx.show(render);
          scrollScreenTop();
        });
      return h(
        "div",
        { className: "sw-select" },
        h("h2", { className: "sw-select-title" }, t("select.mapTitle")),
        h(
          "div",
          { className: "sw-cards" },
          ...MAP_IDS.map((id, i) =>
            h(
              "button",
              {
                type: "button",
                className: "sw-card sw-map",
                "data-map": id,
                autofocus: i === 0,
                onclick: () => done(id),
              },
              h("strong", { className: "sw-card-title" }, t(`map.${id}`)),
              h("span", { className: "sw-card-desc" }, t(`map.${id}.desc`)),
              h("span", { className: "sw-card-desc sw-card-rules" }, rules()),
              h("span", { className: "ui-button primary" }, t("select.enter")),
            ),
          ),
        ),
        h(
          "div",
          { className: "ui-actions" },
          h(
            "button",
            {
              type: "button",
              className: "ui-button",
              onclick: () => {
                step = "hero";
                ctx.show(render);
              },
            },
            t("select.back"),
          ),
        ),
      );
    };
    ctx.show(render);
  });
}
