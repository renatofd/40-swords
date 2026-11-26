import { type I18n, LOCALE_INFO, LOCALES, type Locale } from "../i18n";
import { h } from "./dom";

export interface ScreenAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

function actionBar(actions: ScreenAction[]) {
  return h(
    "div",
    { className: "ui-actions" },
    ...actions.map((a) =>
      h(
        "button",
        { type: "button", className: a.primary ? "ui-button primary" : "ui-button", onclick: a.onClick },
        a.label,
      ),
    ),
  );
}

export function loadingScreen(i18n: I18n, progress: number) {
  return h(
    "div",
    { className: "ui-panel ui-center" },
    h("p", {}, i18n.t("loading")),
    h(
      "div",
      { className: "ui-progress", role: "progressbar", "aria-valuenow": Math.round(progress * 100) },
      h("div", { className: "ui-progress-fill", style: `inline-size: ${Math.round(progress * 100)}%` }),
    ),
  );
}

export interface MenuOptions {
  title: string;
  name: string;
  maxNameLength: number;
  canFullscreen: boolean;
  onNameInput: (name: string) => void;
  onPlay: () => void;
  onLocale: (locale: Locale) => void;
  onFullscreen: () => void;
  onSettings: () => void;
  footer?: string;
}

export function menuScreen(i18n: I18n, o: MenuOptions) {
  const nameInput = h("input", {
    className: "ui-input",
    type: "text",
    value: o.name,
    maxLength: o.maxNameLength * 2,
    placeholder: i18n.t("menu.namePlaceholder"),
    "aria-label": i18n.t("menu.namePlaceholder"),
    autocomplete: "nickname",
    enterKeyHint: "go",
    oninput: (e: Event) => o.onNameInput((e.target as HTMLInputElement).value),
  });
  const form = h(
    "form",
    {
      className: "ui-form",
      onsubmit: (e: Event) => {
        e.preventDefault();
        nameInput.blur();
        o.onPlay();
      },
    },
    nameInput,
    h("button", { type: "submit", className: "ui-button primary big", autofocus: true }, i18n.t("menu.play")),
  );

  const languageSelect = h(
    "select",
    {
      className: "ui-select",
      "aria-label": i18n.t("menu.language"),
      onchange: (e: Event) => o.onLocale((e.target as HTMLSelectElement).value as Locale),
    },
    ...LOCALES.map((l) =>
      h("option", { value: l, selected: l === i18n.locale, lang: LOCALE_INFO[l].tag }, LOCALE_INFO[l].nativeName),
    ),
  );

  return h(
    "div",
    { className: "ui-panel ui-menu" },
    h("h1", { className: "ui-title" }, o.title),
    form,
    h(
      "div",
      { className: "ui-row" },
      h("label", { className: "ui-label" }, "🌐 ", languageSelect),
      h("button", { type: "button", className: "ui-button", onclick: o.onSettings }, `⚙ ${i18n.t("menu.settings")}`),
      o.canFullscreen &&
        h("button", { type: "button", className: "ui-button", onclick: o.onFullscreen }, i18n.t("menu.fullscreen")),
    ),
    o.footer && h("p", { className: "ui-footer" }, o.footer),
  );
}

export interface MessageOptions {
  title?: string;
  body: string;
  busy?: boolean;
  actions?: ScreenAction[];
}

/** Generic dialog for connecting / reconnecting / errors. */
export function messageScreen(o: MessageOptions) {
  return h(
    "div",
    {
      className: "ui-panel ui-center",
      role: o.busy ? "status" : "alertdialog",
      "aria-live": "polite",
      // Busy screens pop up mid-game: focus the panel, not a button a held key could activate.
      ...(o.busy ? { tabIndex: -1, autofocus: true } : {}),
    },
    o.title && h("h2", {}, o.title),
    o.busy && h("div", { className: "ui-spinner", "aria-hidden": "true" }),
    h("p", {}, o.body),
    o.actions && o.actions.length > 0 && actionBar(o.actions),
  );
}

export interface ResultRow {
  label: string;
  value: string;
}

export function resultScreen(i18n: I18n, title: string | undefined, rows: ResultRow[], actions: ScreenAction[]) {
  return h(
    "div",
    { className: "ui-panel ui-center" },
    h("h2", {}, title ?? i18n.t("result.title")),
    rows.length > 0 &&
      h("dl", { className: "ui-stats" }, ...rows.flatMap((r) => [h("dt", {}, r.label), h("dd", {}, r.value)])),
    actionBar(actions),
  );
}

export interface HudStats {
  ping: number;
  fps: number;
}

export interface HudOptions {
  onMenu: () => void;
  canFullscreen: boolean;
  onFullscreen: () => void;
  /** Touch devices get on-screen buttons for chat and the player list. */
  touch: boolean;
  onChat: () => void;
  onPlayers: () => void;
  /** Core widgets (toasts, scoreboard, player list, chat). */
  widgets: HTMLElement[];
  /** Element the game can fill with its own HUD widgets. */
  gameHud: HTMLElement;
}

export function hudView(i18n: I18n, o: HudOptions, statsEl: HTMLElement) {
  return h(
    "div",
    { className: "ui-hud-inner" },
    h(
      "div",
      { className: "ui-hud-top" },
      h(
        "button",
        { type: "button", className: "ui-icon-button", "aria-label": i18n.t("pause.title"), onclick: o.onMenu },
        "☰",
      ),
      o.canFullscreen &&
        h(
          "button",
          {
            type: "button",
            className: "ui-icon-button",
            "aria-label": i18n.t("menu.fullscreen"),
            onclick: o.onFullscreen,
          },
          "⛶",
        ),
      o.touch &&
        h(
          "button",
          { type: "button", className: "ui-icon-button", "aria-label": i18n.t("chat.open"), onclick: o.onChat },
          "💬",
        ),
      o.touch &&
        h(
          "button",
          { type: "button", className: "ui-icon-button", "aria-label": i18n.t("players.title"), onclick: o.onPlayers },
          "👥",
        ),
    ),
    ...o.widgets,
    o.gameHud,
    statsEl,
  );
}

export function formatStats(i18n: I18n, s: HudStats): string {
  return `${i18n.formatNumber(s.ping)} ms · ${i18n.formatNumber(s.fps)} fps`;
}

export interface SettingsOptions {
  music: number;
  sfx: number;
  muted: boolean;
  /** Retro scanlines over the game picture (see scanlines.ts). */
  scanlines: boolean;
  onMusic: (value: number) => void;
  onSfx: (value: number) => void;
  onMuted: (muted: boolean) => void;
  onScanlines: (on: boolean) => void;
  onLocale: (locale: Locale) => void;
  onBack: () => void;
}

function slider(label: string, value: number, onInput: (v: number) => void) {
  const output = h("output", { className: "ui-slider-value" }, `${Math.round(value * 100)}%`);
  return h(
    "label",
    { className: "ui-slider" },
    h("span", {}, label),
    h("input", {
      type: "range",
      min: 0,
      max: 100,
      step: 5,
      value: String(Math.round(value * 100)),
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value) / 100;
        output.textContent = `${Math.round(v * 100)}%`;
        onInput(v);
      },
    }),
    output,
  );
}

/** Audio, display and language settings, opened from the main menu and the pause menu. */
export function settingsScreen(i18n: I18n, o: SettingsOptions) {
  return h(
    "div",
    { className: "ui-panel ui-settings" },
    h("h2", {}, i18n.t("settings.title")),
    slider(i18n.t("settings.music"), o.music, o.onMusic),
    slider(i18n.t("settings.sfx"), o.sfx, o.onSfx),
    h(
      "label",
      { className: "ui-check" },
      h("input", {
        type: "checkbox",
        checked: o.muted,
        onchange: (e: Event) => o.onMuted((e.target as HTMLInputElement).checked),
      }),
      i18n.t("settings.mute"),
    ),
    h(
      "label",
      { className: "ui-check" },
      h("input", {
        type: "checkbox",
        checked: o.scanlines,
        onchange: (e: Event) => o.onScanlines((e.target as HTMLInputElement).checked),
      }),
      i18n.t("settings.scanlines"),
    ),
    h(
      "label",
      { className: "ui-label ui-settings-lang" },
      `🌐 ${i18n.t("menu.language")} `,
      h(
        "select",
        { className: "ui-select", onchange: (e: Event) => o.onLocale((e.target as HTMLSelectElement).value as Locale) },
        ...LOCALES.map((l) =>
          h("option", { value: l, selected: l === i18n.locale, lang: LOCALE_INFO[l].tag }, LOCALE_INFO[l].nativeName),
        ),
      ),
    ),
    actionBar([{ label: i18n.t("action.back"), onClick: o.onBack, primary: true }]),
  );
}
