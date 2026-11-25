/**
 * Dev-only UI gallery (apps/client/ui-gallery.html, never shipped: `vite build`
 * bundles index.html alone). Mounts every core and game screen and HUD element
 * with fixed data and the real classes, inside a `.ui-root`, so the skin can be
 * reviewed and tested without a server.
 *
 * Query:
 *  - `lang=ar`: locale (default en);
 *  - `u=3`: force the art pixel to 3 device px (default: scale.ts for the window);
 *  - `freeze`: stop animations and transitions (stable screenshots);
 *  - `section=<id>`: one group only. `status` = the in-match HUD at its real
 *    positions (`details` opens the status details); `pixels` = every icon and
 *    frame at u-multiple positions plus the Tiny5 crispness probe (`data-probe`).
 *
 * `window.__uiGallery = { ready, errors, writes, status? }` (`writes`: DOM mutations
 * seen after `ready`; `status`, in `section=status`: the live status panel, its
 * values and each weapon's full cooldown, for the DOM-write budget test). Boxes
 * to check for overflow carry `data-check`.
 */
import { type BeforeJoinContext, h, I18n, LOCALES, type Locale, matchLocale, type Translate } from "@core/client";
import {
  type Career,
  computeStats,
  type GainMessage,
  MatchPhase,
  PASSIVE_IDS,
  type RelicKind,
  type RelicLike,
  scaledCooldown,
  WEAPON_IDS,
  WEAPONS,
  type WorldInfo,
  xpToNext,
} from "@game/shared";
import { messages } from "./messages";
import { BossBar } from "./ui/bossBar";
import { creditsPanel } from "./ui/credits";
import { GainCards } from "./ui/gainCard";
import { chooseHero } from "./ui/heroSelect";
import { ICON_SHEET, type IconName } from "./ui/iconMap";
import { icon } from "./ui/icons";
import { LobbyPanel } from "./ui/lobby";
import { MatchHud, type MatchSelf, type MatchView } from "./ui/matchHud";
import { Minimap } from "./ui/minimap";
import { itemEffect, itemName, rarityColor, rarityName } from "./ui/relicText";
import { StatusHud } from "./ui/statusHud";
import { SummaryPanel } from "./ui/summary";
import { installTheme } from "./ui/theme";

type StatusValues = ReturnType<typeof statusValues>;

interface GalleryState {
  ready: boolean;
  errors: string[];
  writes: number;
  /** `section=status`: drives the status panel like GameScene does each frame. */
  status?: {
    el: HTMLElement;
    values: StatusValues;
    maxCd: Record<(typeof WEAPON_IDS)[number], number>;
    update(values: StatusValues): void;
  };
}

declare global {
  interface Window {
    __uiGallery?: GalleryState;
  }
}

/** Generated 9-slice frames (content/ui), by file name. */
const FRAMES = Object.fromEntries(
  Object.entries(import.meta.glob<string>("@content/ui/*.png", { eager: true, query: "?url", import: "default" })).map(
    ([path, url]) => [path.replace(/^.*\/|\.png$/g, ""), url],
  ),
);
/** Border width (= slice) of each frame, in art px. */
const FRAME_SLICE = (name: string) =>
  name === "frame-card"
    ? 9
    : name === "frame-cursor"
      ? 6
      : name === "frame-bar"
        ? 2
        : /^frame-(button|rarity)/.test(name)
          ? 5
          : 3;

const GALLERY_CSS = `
html, body { overflow: auto; height: auto; touch-action: auto; user-select: auto; }
body { background: #2a3a2a; }
.ui-root.g-root { position: relative; inset: auto; pointer-events: auto; z-index: auto; min-block-size: 100vh; }
.g-page { display: flex; flex-wrap: wrap; align-items: flex-start; gap: calc(6 * var(--sw-u)); padding: calc(4 * var(--sw-u)); }
.g-group { display: flex; flex-direction: column; gap: calc(2 * var(--sw-u)); }
.g-group > h4 { margin: 0; font: 12px/1.2 monospace; color: #9f9; direction: ltr; text-align: left; }
.g-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: calc(6 * var(--sw-u)); }
.g-box { position: relative; }
.g-box > * { position: relative !important; inset: auto !important; margin-inline: 0 !important; }
.g-box > .sw-match { max-inline-size: none; }
.g-box > .ui-chat { inline-size: calc(180 * var(--sw-fp)); }
.g-world { position: relative; inline-size: calc(140 * var(--sw-fp)); block-size: calc(70 * var(--sw-fp)); background: #3a6a2a; }
.g-world .sw-anchor { left: 50%; top: 100%; }
.g-hud { position: fixed; inset: 0; background: #3a6a2a; }
.g-pixels { position: absolute; left: 0; top: 0; inline-size: 100%; min-block-size: 100%; background: #2a3a2a; }
.g-pixels > * { position: absolute; }
.g-frame { box-sizing: border-box; inline-size: calc(40 * var(--sw-u)); block-size: calc(30 * var(--sw-u)); }
.g-probe { background: #000; color: #fff; padding: calc(2 * var(--sw-u)); }
.g-freeze *, .g-freeze *::before, .g-freeze *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
`;

const RARITY_OF: Record<RelicKind, number> = {
  heart: 4,
  power: 3,
  boots: 2,
  clover: 1,
  eye: 0,
  mark: 2,
  fang: 3,
  shield: 1,
  haste: 4,
  dagger: 0,
  fireball: 2,
  arrow: 3,
  nova: 4,
};
const COUNT_OF: Record<RelicKind, number> = {
  heart: 12,
  power: 3,
  boots: 1,
  clover: 2,
  eye: 5,
  mark: 1,
  fang: 7,
  shield: 2,
  haste: 1,
  dagger: 3,
  fireball: 1,
  arrow: 2,
  nova: 1,
};

/** Every relic and weapon kind, mixed rarities, counts 1–12 (one copy of each lower rarity too). */
function allRelics(): RelicLike[] {
  const relics: RelicLike[] = [];
  for (const kind of [...WEAPON_IDS, ...PASSIVE_IDS]) {
    const best = RARITY_OF[kind];
    for (let i = 0; i < COUNT_OF[kind]; i++) relics.push({ kind, rarity: i === 0 ? best : Math.max(0, best - 1) });
  }
  return relics;
}

/** Status values: HP at a quarter, rupees, relics, weapons at cooldown 0 / 25 / 75 / 100 %. */
function statusValues(quarter: number, rupees: number, relics: RelicLike[], level = 12) {
  const stats = computeStats("knight", level, relics);
  const maxHp = stats.maxHp;
  const hp = quarter === 0 ? 0 : Math.max(1, Math.round((maxHp * (quarter - 0.5)) / 4));
  const cdPct = stats.cooldownPct;
  const cd = (w: (typeof WEAPON_IDS)[number], f: number) =>
    Math.round(scaledCooldown(WEAPONS[w].cooldownTicks, cdPct) * f);
  return {
    classId: "knight",
    hp,
    maxHp,
    level,
    xp: Math.floor(xpToNext(level) * 0.6),
    rupees,
    relics,
    cdPct,
    daggerCd: cd("dagger", 0),
    fireballCd: cd("fireball", 0.25),
    arrowCd: cd("arrow", 0.75),
    novaCd: cd("nova", 1),
  };
}

function fakeWorld(): { info: WorldInfo; explore: (m: Minimap) => void } {
  const biomes = "GGFFRRHHMMLLWWYY".repeat(8).slice(0, 128).split("");
  biomes[5] = "B";
  biomes[40] = "C";
  const info: WorldInfo = { columns: 16, rows: 8, biomes: biomes.join(""), areas: [] };
  return {
    info,
    explore: (m) => {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 16; c++) if ((c + r) % 5 !== 0) m.update(c * 320 + 160, r * 176 + 88, 0);
      m.update(6 * 320 + 160, 3 * 176 + 88, 0);
    },
  };
}

/** Runs `fn` with setTimeout disabled (gain cards would fade out; the gallery keeps them). */
function withoutTimers(fn: () => void) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout;
  try {
    fn();
  } finally {
    globalThis.setTimeout = real;
  }
}

const group = (title: string, ...children: (Node | false | null | undefined)[]) =>
  h("section", { className: "g-group", "data-group": title }, h("h4", {}, title), ...children);
const row = (...children: (Node | false | null | undefined)[]) => h("div", { className: "g-row" }, ...children);
const box = (el: HTMLElement) => {
  el.hidden = false;
  el.dataset.check = "";
  return h("div", { className: "g-box" }, el);
};

// ─── Game HUD ──────────────────────────────────────────────────────────────

function statusHud(t: Translate, values: StatusValues, open = false): HTMLElement {
  return statusPanel(t, values, open).el;
}

function statusPanel(t: Translate, values: StatusValues, open = false): StatusHud {
  const hud = new StatusHud(t);
  const world = fakeWorld();
  const minimap = new Minimap(world.info, [], t("hud.map"));
  world.explore(minimap);
  hud.addWidget(minimap.el);
  hud.update(values);
  if (open) hud.toggle();
  return hud;
}

function statusGroup(t: Translate) {
  const all = allRelics();
  const few: RelicLike[] = [
    { kind: "dagger", rarity: 1 },
    { kind: "boots", rarity: 2 },
    { kind: "boots", rarity: 0 },
  ];
  return group(
    "status",
    row(
      box(statusHud(t, statusValues(4, 9999, all))),
      box(statusHud(t, statusValues(3, 120, few, 3))),
      box(statusHud(t, statusValues(2, 45, few, 5))),
      box(statusHud(t, statusValues(1, 7, all))),
      box(statusHud(t, statusValues(0, 0, [], 1))),
      box(statusHud(t, statusValues(4, 9999, all), true)),
    ),
  );
}

function gainsGroup(t: Translate) {
  const messagesOf: GainMessage[][] = [
    [
      { kind: "eye", rarity: 0, source: "chest" },
      { kind: "boots", rarity: 1, source: "shop" },
      { kind: "shield", rarity: 2, source: "loot" },
    ],
    [
      { kind: "fang", rarity: 3, source: "chest" },
      { kind: "heart", rarity: 4, source: "chest" },
      { kind: "fireball", rarity: 2, source: "shop" },
    ],
    [{ kind: "potion", rarity: 0, source: "shop" }],
  ];
  return group(
    "gains",
    row(
      ...messagesOf.map((list) => {
        const cards = new GainCards(t);
        // Shown oldest first: the newest is on top, as in the game.
        withoutTimers(() => {
          for (const m of [...list].reverse()) cards.show(m);
        });
        for (const card of cards.el.children) (card as HTMLElement).dataset.check = "";
        return box(cards.el);
      }),
    ),
  );
}

/** Shop cards as GameScene builds them (§2.5): details (when near) over the price chip. */
function offerCard(
  t: Translate,
  kind: GainMessage["kind"],
  rarity: number,
  price: number,
  state: "near" | "sold" | "poor",
) {
  const potion = kind === "potion";
  const sold = state === "sold";
  const card = h(
    "div",
    {
      className: `sw-offer${sold ? " sw-offer-sold" : ""}${state === "near" ? " sw-offer-near" : ""}${state === "poor" ? " sw-offer-poor" : ""}`,
      style: `--sw-rarity: ${rarityColor(rarity)}`,
    },
    h(
      "div",
      { className: "sw-offer-details" },
      h("strong", {}, itemName(t, kind)),
      !potion && h("span", { className: "sw-rarity" }, rarityName(t, rarity)),
      h("span", {}, itemEffect(t, kind, rarity)),
    ),
    h(
      "div",
      { className: "sw-offer-price" },
      sold ? t("shop.sold") : icon("rupee-green"),
      !sold && h("span", { className: "sw-num" }, String(price)),
    ),
  );
  if (!potion) card.dataset.rarity = String(rarity);
  card.dataset.check = "";
  const anchor = h("div", { className: "sw-anchor" }, card);
  return h("div", { className: "g-world sw-labels" }, anchor);
}

function shopGroup(t: Translate) {
  const worlds = [
    offerCard(t, "mark", 2, 48, "near"),
    offerCard(t, "nova", 4, 160, "sold"),
    offerCard(t, "potion", 0, 25, "poor"),
    offerCard(t, "dagger", 1, 30, "poor"),
  ];
  const g = group("shop", row(...worlds));
  // Centre each card like WorldLabels does (whole-pixel physical left).
  requestAnimationFrame(() => {
    for (const w of worlds) {
      const card = w.querySelector<HTMLElement>(".sw-offer");
      if (card) card.style.left = `${-Math.round(card.offsetWidth / 2)}px`;
    }
  });
  return g;
}

function bossGroup() {
  const boss = new BossBar();
  boss.update({ name: "Lich King", hp: 610, maxHp: 1000, mini: false });
  const mini = new BossBar();
  mini.update({ name: "Ogre", hp: 90, maxHp: 400, mini: true });
  return group("boss bar", row(box(boss.el), box(mini.el)));
}

function matchGroup(t: Translate) {
  const view = (phase: number, over: Partial<MatchView> = {}): MatchView => ({
    phase,
    clock: 100,
    phaseEnds: 261,
    alive: 37,
    winner: "",
    winnerName: "",
    ready: 7,
    total: 12,
    ...over,
  });
  const self = (over: Partial<MatchSelf> = {}): MatchSelf => ({
    id: "me",
    outsideZone: false,
    out: false,
    place: 0,
    ...over,
  });
  const timers = Object.values(MatchPhase).map((phase) => {
    const hud = new MatchHud(t);
    hud.update(view(phase), self());
    return box(hud.timer);
  });
  const banner = (v: MatchView, s: MatchSelf) => {
    const hud = new MatchHud(t);
    hud.update(v, s);
    return box(hud.banner);
  };
  const feedLines = h(
    "div",
    { className: "sw-feed" },
    h("div", { className: "sw-feed-line" }, "Ana ⚔ Bruno"),
    h("div", { className: "sw-feed-line" }, "Zé ⚔ مريم"),
  );
  return group(
    "match",
    row(...timers),
    row(
      banner(view(MatchPhase.ended, { winner: "me", winnerName: "Me" }), self()),
      banner(view(MatchPhase.ended, { winner: "x", winnerName: "Kenji" }), self({ place: 3 })),
      banner(view(MatchPhase.pvp), self({ out: true, place: 12, watching: "Kenji" })),
      banner(view(MatchPhase.arena), self({ outsideZone: true })),
      box(feedLines),
    ),
  );
}

function lobbyGroup(t: Translate) {
  const lobby = new LobbyPanel(
    t,
    () => undefined,
    () => undefined,
  );
  lobby.update(
    true,
    [
      { id: "me", name: "Renata", ready: true, away: false, wins: 3 },
      { id: "b", name: "Kenji", ready: false, away: false, wins: 0 },
      { id: "c", name: "مريم", ready: true, away: false, wins: 12 },
      { id: "d", name: "Олег", ready: false, away: true, wins: 0 },
      { id: "e", name: "Ana", ready: false, away: false, wins: 1 },
    ],
    "me",
    true,
  );
  return group("lobby", row(box(lobby.el)));
}

function summaryGroup(t: Translate) {
  const career: Career = {
    matches: 14,
    wins: 3,
    best: 1,
    kills: 22,
    monsters: 431,
    bosses: 4,
    level: 15,
    seconds: 8000,
  };
  const relicList = allRelics().slice(0, 18);
  const won = new SummaryPanel(t);
  won.show(
    {
      place: 1,
      heroes: 40,
      kills: 9,
      monsters: 214,
      bosses: 2,
      chests: 11,
      level: 15,
      relics: relicList.length,
      relicList,
      seconds: 1745,
    },
    career,
    [2],
    "rogue",
  );
  const lost = new SummaryPanel(t);
  lost.show(
    {
      place: 17,
      heroes: 40,
      kills: 0,
      monsters: 31,
      bosses: 0,
      chests: 2,
      level: 4,
      relics: 2,
      relicList: [
        { kind: "boots", rarity: 1 },
        { kind: "dagger", rarity: 0 },
      ],
      seconds: 402,
    },
    { ...career, matches: 1, wins: 0, best: 17 },
    [],
  );
  return group("summary", row(box(won.el), box(lost.el)));
}

// ─── Screens ───────────────────────────────────────────────────────────────

function heroSelectGroup(t: Translate) {
  const host = h("div", { className: "ui-screen-host g-screen" });
  const saved = new Map<string, string>([["hero", "rogue"]]);
  const ctx = {
    t,
    name: "Renata",
    show: (render: () => HTMLElement) => host.replaceChildren(render()),
    audio: { playSfx: () => undefined, playMusic: () => undefined },
    platform: {},
    storage: { get: (k: string) => saved.get(k) ?? null, set: (k: string, v: string) => void saved.set(k, v) },
    signal: new AbortController().signal,
  } as unknown as BeforeJoinContext;
  void chooseHero(ctx);
  // A locked colour shows its unlock note, as after a click on it.
  requestAnimationFrame(() => host.querySelector<HTMLElement>(".sw-colour-locked")?.click());
  for (const card of host.querySelectorAll<HTMLElement>(".sw-card")) card.dataset.check = "";
  host.style.position = "relative";
  return group("hero select", host);
}

function creditsGroup(t: Translate) {
  const panel = creditsPanel(t, () => undefined);
  panel.dataset.check = "";
  return group("credits", h("div", { className: "ui-screen-host", style: "position: relative" }, panel));
}

/** Core screens and widgets as static samples with the core's classes. */
function coreGroup(t: Translate, i18n: I18n) {
  const select = h(
    "select",
    { className: "ui-select", "aria-label": t("menu.language") },
    ...LOCALES.map((l) => h("option", { value: l, selected: l === i18n.locale }, l)),
  );
  const menu = h(
    "div",
    { className: "ui-panel ui-menu" },
    h("h1", { className: "ui-title" }, "40 Swords"),
    h(
      "form",
      { className: "ui-form" },
      h("input", { className: "ui-input", type: "text", value: "Renata", placeholder: t("menu.namePlaceholder") }),
      h("button", { type: "button", className: "ui-button primary big" }, t("menu.play")),
    ),
    h(
      "div",
      { className: "ui-row" },
      h("label", { className: "ui-label" }, "🌐 ", select),
      h("button", { type: "button", className: "ui-button" }, `⚙ ${t("menu.settings")}`),
      h("button", { type: "button", className: "ui-button" }, t("menu.fullscreen")),
    ),
    h("p", { className: "ui-footer" }, "v0.9"),
  );
  const message = h(
    "div",
    { className: "ui-panel ui-center" },
    h("h2", {}, t("error.title")),
    h("div", { className: "ui-spinner" }),
    h("p", {}, t("error.unreachable")),
    h(
      "div",
      { className: "ui-actions" },
      h("button", { type: "button", className: "ui-button primary" }, t("action.retry")),
      h("button", { type: "button", className: "ui-button" }, t("action.backToMenu")),
    ),
  );
  const loading = h(
    "div",
    { className: "ui-panel ui-center" },
    h("p", {}, t("loading")),
    h("div", { className: "ui-progress" }, h("div", { className: "ui-progress-fill", style: "inline-size: 62%" })),
  );
  const settings = h(
    "div",
    { className: "ui-panel ui-settings" },
    h("h2", {}, t("settings.title")),
    h(
      "label",
      { className: "ui-slider" },
      h("span", {}, t("settings.music")),
      h("input", { type: "range", min: 0, max: 100, value: 60 }),
      h("span", { className: "ui-slider-value" }, "60%"),
    ),
    h(
      "label",
      { className: "ui-check" },
      h("input", { type: "checkbox", checked: true }),
      h("span", {}, t("settings.mute")),
    ),
  );
  const toast = h(
    "div",
    { className: "ui-toasts", style: "position: relative" },
    h("div", { className: "ui-toast" }, t("reconnecting")),
  );
  const scoreRow = (rank: number, name: string, score: number, self = false) =>
    h(
      "li",
      { className: self ? "ui-score-row self" : "ui-score-row" },
      h("span", { className: "ui-score-rank" }, i18n.formatNumber(rank)),
      h("span", { className: "ui-score-name", dir: "auto" }, name),
      h("span", { className: "ui-score-value" }, i18n.formatNumber(score)),
    );
  const scoreboard = h(
    "section",
    { className: "ui-scoreboard" },
    h("h3", {}, t("scoreboard.title")),
    h(
      "ol",
      {},
      scoreRow(1, "Kenji", 12),
      scoreRow(2, "مريم", 9),
      scoreRow(3, "Олег Смирнов", 7),
      scoreRow(4, "Ana", 5),
      scoreRow(5, "Zé", 3),
      scoreRow(17, "Renata", 1, true),
    ),
  );
  const chat = h(
    "div",
    { className: "ui-chat open" },
    h(
      "ol",
      { className: "ui-chat-log" },
      h("li", { className: "ui-chat-line" }, "Kenji: gg"),
      h("li", { className: "ui-chat-line system" }, t("chat.slowDown")),
      h("li", { className: "ui-chat-line", dir: "auto" }, "مريم: مرحبا"),
    ),
    h(
      "form",
      { className: "ui-chat-form" },
      h("input", { className: "ui-input ui-chat-input", type: "text", value: "hello" }),
    ),
  );
  const iconButtons = h(
    "div",
    { className: "ui-hud-top" },
    h("button", { type: "button", className: "ui-icon-button" }, "☰"),
    h("button", { type: "button", className: "ui-icon-button" }, "💬"),
    h("button", { type: "button", className: "ui-icon-button" }, "👥"),
  );
  const touch = h(
    "div",
    { className: "touch-buttons", style: "position: relative; inset: auto" },
    h("button", { type: "button", className: "touch-button" }, t("action.attack")),
  );
  return group(
    "core",
    row(box(menu), box(message), box(loading), box(settings)),
    row(box(toast), box(scoreboard), box(chat), box(iconButtons), box(touch)),
  );
}

// ─── The HUD at its real positions (phones and desktop checks) ───────────────

function hudScreen(t: Translate, i18n: I18n, open: boolean, state: GalleryState) {
  const root = h("div", { className: "ui-hud g-hud" });
  const inner = h("div", { className: "ui-hud-inner" });
  root.append(inner);
  inner.append(
    h(
      "div",
      { className: "ui-hud-top" },
      h("button", { type: "button", className: "ui-icon-button" }, "☰"),
      h("button", { type: "button", className: "ui-icon-button" }, "💬"),
      h("button", { type: "button", className: "ui-icon-button" }, "👥"),
    ),
  );
  const values = statusValues(4, 9999, allRelics());
  const hud = statusPanel(t, values, open);
  const status = hud.el;
  const maxCd = Object.fromEntries(
    WEAPON_IDS.map((w) => [w, scaledCooldown(WEAPONS[w].cooldownTicks, values.cdPct)]),
  ) as Record<(typeof WEAPON_IDS)[number], number>;
  state.status = { el: status, values, maxCd, update: (v) => hud.update(v) };
  const scoreRow = (rank: number, name: string, score: number, self = false) =>
    h(
      "li",
      { className: self ? "ui-score-row self" : "ui-score-row" },
      h("span", { className: "ui-score-rank" }, i18n.formatNumber(rank)),
      h("span", { className: "ui-score-name", dir: "auto" }, name),
      h("span", { className: "ui-score-value" }, i18n.formatNumber(score)),
    );
  const scoreboard = h(
    "section",
    { className: "ui-scoreboard" },
    h("h3", {}, t("scoreboard.title")),
    h(
      "ol",
      {},
      scoreRow(1, "Kenji", 12),
      scoreRow(2, "مريم", 9),
      scoreRow(3, "Олег", 7),
      scoreRow(4, "Ana", 5),
      scoreRow(5, "Zé", 3),
      scoreRow(17, "Renata", 1, true),
    ),
  );
  const match = new MatchHud(t);
  match.update(
    {
      phase: MatchPhase.pvp,
      clock: 100,
      phaseEnds: 261,
      alive: 37,
      winner: "",
      winnerName: "",
      ready: 0,
      total: 40,
    },
    { id: "me", outsideZone: false, out: false, place: 0 },
  );
  const gains = new GainCards(t);
  withoutTimers(() => {
    gains.show({ kind: "eye", rarity: 1, source: "chest" });
    gains.show({ kind: "nova", rarity: 4, source: "shop" });
    gains.show({ kind: "heart", rarity: 3, source: "loot" });
  });
  const lobby = new LobbyPanel(
    t,
    () => undefined,
    () => undefined,
  );
  lobby.update(
    true,
    [
      { id: "me", name: "Renata", ready: true, away: false, wins: 3 },
      { id: "b", name: "Kenji", ready: false, away: false, wins: 0 },
      { id: "c", name: "مريم", ready: true, away: false, wins: 12 },
    ],
    "me",
    false,
  );
  const chat = h(
    "div",
    { className: "ui-chat" },
    h(
      "ol",
      { className: "ui-chat-log" },
      ...["Kenji: gg", "Ana: cuidado com o boss", "مريم: مرحبا", "Олег: привет", "Zé: 🗡️ vamos"].map((line) =>
        h("li", { className: "ui-chat-line", dir: "auto" }, line),
      ),
    ),
  );
  const touch = h(
    "div",
    { className: "touch-controls" },
    h(
      "div",
      { className: "touch-buttons" },
      h("button", { type: "button", className: "touch-button" }, t("action.attack")),
    ),
  );
  status.hidden = false;
  scoreboard.hidden = false;
  inner.append(status, scoreboard, match.timer, gains.el, lobby.el, chat, touch);
  return root;
}

// ─── Pixels: icons and frames at u-multiple positions, Tiny5 probe ───────────

function pixelsScreen() {
  const root = h("div", { className: "g-pixels" });
  const at = (el: HTMLElement, x: number, y: number) => {
    el.style.left = `calc(${x} * var(--sw-u))`;
    el.style.top = `calc(${y} * var(--sw-u))`;
    el.dataset.check = "";
    root.append(el);
    return el;
  };
  const names = Object.keys(ICON_SHEET.icons) as IconName[];
  names.forEach((name, i) => {
    at(icon(name), 4 + (i % 16) * 20, 4 + Math.floor(i / 16) * 20).dataset.px = "1";
    at(icon(name, { big: true }), 4 + (i % 16) * 36, 50 + Math.floor(i / 16) * 36).dataset.px = "2";
  });
  Object.keys(FRAMES)
    .sort()
    .forEach((name, i) => {
      const b = FRAME_SLICE(name);
      const el = h("div", { className: "g-frame" });
      el.style.border = `calc(${b} * var(--sw-u)) solid transparent`;
      el.style.borderImage = `url("${FRAMES[name]}") ${b} ${name === "frame-cursor" ? "" : "fill"} / calc(${b} * var(--sw-u)) stretch`;
      el.dataset.frame = name;
      at(el, 4 + (i % 7) * 46, 130 + Math.floor(i / 7) * 36);
    });
  const probe = h("div", { className: "g-probe" }, h("span", { className: "sw-num" }, "0123456789/"));
  probe.dataset.probe = "";
  at(probe, 4, 244);
  return root;
}

// ─── Start ─────────────────────────────────────────────────────────────────

export async function startUiGallery(mount: HTMLElement = document.body): Promise<void> {
  const state: GalleryState = { ready: false, errors: [], writes: 0 };
  window.__uiGallery = state;
  window.addEventListener("error", (e) => state.errors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => state.errors.push(String(e.reason)));

  const params = new URLSearchParams(location.search);
  const i18n = new I18n(messages);
  const locale: Locale = matchLocale(params.get("lang")) ?? "en";
  i18n.setLocale(locale);
  const { t } = i18n;

  installTheme();
  const forcedU = Number(params.get("u"));
  if (forcedU > 0) {
    const force = () => {
      const dpr = globalThis.devicePixelRatio || 1;
      const s = document.documentElement.style;
      s.setProperty("--sw-u", `${forcedU / dpr}px`);
      s.setProperty("--sw-fp", `${(2 * forcedU) / dpr}px`);
      document.documentElement.dataset.swUi = String(forcedU);
    };
    force();
    window.addEventListener("resize", () => requestAnimationFrame(force));
  }

  const style = document.createElement("style");
  style.textContent = GALLERY_CSS;
  document.head.append(style);

  const root = h("div", { className: "ui-root g-root" });
  if (params.has("freeze")) root.classList.add("g-freeze");
  mount.append(root);

  const section = params.get("section");
  if (section === "status") root.append(hudScreen(t, i18n, params.has("details"), state));
  else if (section === "pixels") root.append(pixelsScreen());
  else {
    const page = h("div", { className: "g-page" });
    root.append(page);
    const groups: Record<string, () => HTMLElement | null | Promise<HTMLElement | null>> = {
      core: () => coreGroup(t, i18n),
      select: () => heroSelectGroup(t),
      credits: () => creditsGroup(t),
      hud: () => statusGroup(t),
      gains: () => gainsGroup(t),
      shop: () => shopGroup(t),
      boss: () => bossGroup(),
      match: () => matchGroup(t),
      lobby: () => lobbyGroup(t),
      summary: () => summaryGroup(t),
    };
    for (const [id, make] of Object.entries(groups)) {
      if (section && section !== id) continue;
      try {
        const el = await make();
        if (el) page.append(el);
      } catch (err) {
        state.errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  new MutationObserver((records) => {
    state.writes += records.length;
  }).observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  state.ready = true;
}
