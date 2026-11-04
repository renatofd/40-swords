import { h, type Translate } from "@core/client";
import { CLASS_IDS, CLASSES, type ClassId, MAP_IDS, type MapId, statsFor, TICK_RATE } from "@game/shared";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hexColor = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Stat rows shown on a class card (label key → value). */
function statRows(t: Translate, classId: ClassId): [string, string][] {
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

export interface HeroSelectOptions {
  t: Translate;
  onDone: (classId: ClassId, mapId: MapId) => void;
}

/**
 * Hero and map picker shown when the player arrives in the room, before their
 * character exists. DOM (not Phaser) so every script and RTL work.
 */
export function heroSelect({ t, onDone }: HeroSelectOptions): HTMLElement {
  const root = h("div", { className: "sw-select", role: "dialog", "aria-modal": "true" });
  let chosen: ClassId = "knight";

  const showClasses = () => {
    const cards = CLASS_IDS.map((id) =>
      h(
        "button",
        {
          type: "button",
          className: "sw-card",
          "data-class": id,
          style: `--sw-class: ${hexColor(CLASSES[id].color)}`,
          onclick: () => {
            chosen = id;
            showMaps();
          },
        },
        h("span", { className: "sw-card-swatch", "aria-hidden": "true" }),
        h("strong", { className: "sw-card-title" }, t(`class.${id}`)),
        h("span", { className: "sw-card-desc" }, t(`class.${id}.desc`)),
        h(
          "dl",
          { className: "sw-stats" },
          ...statRows(t, id).flatMap(([label, value]) => [h("dt", {}, label), h("dd", {}, value)]),
        ),
      ),
    );
    root.replaceChildren(
      h("h2", { className: "sw-select-title" }, t("select.heroTitle")),
      h("div", { className: "sw-cards" }, ...cards),
    );
    cards[CLASS_IDS.indexOf(chosen)]?.focus({ preventScroll: true });
  };

  const showMaps = () => {
    const cards = MAP_IDS.map((id) =>
      h(
        "button",
        { type: "button", className: "sw-card sw-map", "data-map": id, onclick: () => onDone(chosen, id) },
        h("strong", { className: "sw-card-title" }, t(`map.${id}`)),
        h("span", { className: "sw-card-desc" }, t(`map.${id}.desc`)),
        h("span", { className: "ui-button primary" }, t("select.enter")),
      ),
    );
    root.replaceChildren(
      h("h2", { className: "sw-select-title" }, t("select.mapTitle")),
      h("div", { className: "sw-cards" }, ...cards),
      h(
        "div",
        { className: "ui-actions" },
        h("button", { type: "button", className: "ui-button", onclick: showClasses }, t("select.back")),
      ),
    );
    cards[0]?.focus({ preventScroll: true });
  };

  showClasses();
  return root;
}
