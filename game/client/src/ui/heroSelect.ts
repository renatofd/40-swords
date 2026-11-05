import { type BeforeJoinContext, h, type JoinChoice } from "@core/client";
import {
  CLASS_IDS,
  CLASSES,
  type ClassId,
  DEFAULT_MATCH_TIMES,
  isClassId,
  MAP_IDS,
  type MapId,
  ROOM_BY_MAP,
  statsFor,
  TICK_RATE,
} from "@game/shared";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hexColor = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

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
 * (`GameModule.beforeJoin`). The class travels in the join options (the
 * server validates it) and the map picks the room. DOM, so every script works.
 */
export function chooseHero(ctx: BeforeJoinContext): Promise<JoinChoice | null> {
  const saved = ctx.storage.get("hero");
  let hero: ClassId = isClassId(saved) ? saved : "knight";
  let step: "hero" | "map" = "hero";

  return new Promise((resolve) => {
    ctx.signal.addEventListener("abort", () => resolve(null));
    const done = (mapId: MapId) => {
      ctx.storage.set("hero", hero);
      resolve({ roomName: ROOM_BY_MAP[mapId], options: { classId: hero } });
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
                  style: `--sw-class: ${hexColor(CLASSES[id].color)}`,
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
