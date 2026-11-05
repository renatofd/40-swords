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
import { heroColor, hexColor, unlockText } from "./palette";
import { careerLine } from "./summary";

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** The class colour swatch: a stripe of each class colour. */
const CLASSIC_SWATCH = `linear-gradient(135deg, ${CLASS_IDS.map((id, i) => `${hexColor(CLASSES[id].color)} ${(i * 100) / CLASS_IDS.length}% ${((i + 1) * 100) / CLASS_IDS.length}%`).join(", ")})`;

/** Stat rows shown on a class card (label → value). */
function statRows(ctx: BeforeJoinContext, classId: ClassId): [string, string][] {
  const { t } = ctx;
  const s = statsFor(classId, 1);
  return [
    [t("stat.hp"), String(s.maxHp)],
    [t("stat.damage"), String(s.damage)],
    [t("stat.speed"), String(s.speed)],
    [t("stat.attackSpeed"), (TICK_RATE / s.attackCooldownTicks).toFixed(1)],
    [t("stat.defense"), String(s.defense)],
    [t("stat.critChance"), pct(s.critChance)],
    [t("stat.critDamage"), pct(s.critDamage)],
    [t("stat.lifesteal"), pct(s.lifesteal)],
    [t("stat.luck"), String(s.luck)],
  ];
}

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
  /** Under the colours: the one picked, or how to unlock the one tried. */
  let note = "";
  let step: "hero" | "map" = "hero";

  return new Promise((resolve) => {
    ctx.signal.addEventListener("abort", () => resolve(null));
    const done = (mapId: MapId) => {
      ctx.storage.set("hero", hero);
      resolve({ roomName: ROOM_BY_MAP[mapId], options: { classId: hero, palette } });
    };
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
            return h(
              "button",
              {
                type: "button",
                className: `sw-colour${i === palette ? " sw-colour-on" : ""}${open ? "" : " sw-colour-locked"}`,
                role: "radio",
                "aria-checked": String(i === palette),
                "aria-disabled": open ? undefined : "true",
                "aria-label": open ? name : `${name} (🔒 ${unlockText(t, p)})`,
                "data-palette": p.id,
                title: open ? name : `🔒 ${unlockText(t, p)}`,
                style: `--sw-swatch: ${p.color === undefined ? CLASSIC_SWATCH : hexColor(p.color)}`,
                onclick: () => {
                  if (open) {
                    palette = i;
                    savePalette(i);
                    note = "";
                  } else note = `🔒 ${name}: ${unlockText(t, p)}`;
                  ctx.audio.playSfx("ui");
                  ctx.show(render);
                },
              },
              open ? "" : "🔒",
            );
          }),
        ),
        h("p", { className: "sw-colours-note", "aria-live": "polite" }, note || t(`palette.${PALETTES[palette]?.id}`)),
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
                    step = "map";
                    ctx.audio.playSfx("ui");
                    ctx.show(render);
                  },
                },
                h("span", { className: "sw-card-swatch", "aria-hidden": "true" }),
                h("strong", { className: "sw-card-title" }, t(`class.${id}`)),
                h("span", { className: "sw-card-desc" }, t(`class.${id}.desc`)),
                h(
                  "dl",
                  { className: "sw-stats" },
                  ...statRows(ctx, id).flatMap(([label, value]) => [h("dt", {}, label), h("dd", {}, value)]),
                ),
              ),
            ),
          ),
          colours(),
          h(
            "div",
            { className: "ui-actions" },
            h("button", { type: "button", className: "ui-button", onclick: () => resolve(null) }, t("select.back")),
          ),
        );
      }
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
              h(
                "span",
                { className: "sw-card-desc sw-card-rules" },
                t("map.rules", {
                  pvp: DEFAULT_MATCH_TIMES.pvpAfter / 60,
                  arena: DEFAULT_MATCH_TIMES.arenaAfter / 60,
                }),
              ),
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
