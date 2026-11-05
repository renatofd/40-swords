import { h, type Translate } from "@core/client";
import { MAX_PLAYERS_PER_ROOM } from "@game/shared";

export interface LobbyEntry {
  id: string;
  name: string;
  ready: boolean;
  /** Connection dropped (may come back): not waited for. */
  away: boolean;
}

/**
 * The waiting room panel (DOM, top centre): who is in the room and who is
 * ready, the Ready button, and whether bots fill the match (anyone can switch
 * it). The match starts when everyone is ready.
 */
export class LobbyPanel {
  readonly el = h("section", { className: "sw-lobby", hidden: true });
  private list = h("ul", { className: "sw-lobby-list" });
  private button: HTMLButtonElement;
  private botsButton: HTMLButtonElement;
  private botsHint = h("p", { className: "sw-lobby-hint sw-lobby-bots-hint" });
  private last = "";

  constructor(
    private readonly t: Translate,
    onToggle: () => void,
    onBots: () => void,
  ) {
    this.button = h("button", { type: "button", className: "ui-button primary sw-lobby-ready", onclick: onToggle });
    this.botsButton = h("button", { type: "button", className: "ui-button sw-lobby-bots", onclick: onBots });
    this.el.setAttribute("aria-label", t("lobby.title"));
    this.el.append(
      h("h2", { className: "sw-lobby-title" }, t("lobby.title")),
      h("p", { className: "sw-lobby-hint" }, t("lobby.hint")),
      this.list,
      this.button,
      h("p", { className: "sw-lobby-key" }, t("lobby.key")),
      this.botsButton,
      this.botsHint,
    );
  }

  /** Call every frame; touches the DOM only when something changed. */
  update(visible: boolean, entries: LobbyEntry[], selfId: string, bots: boolean) {
    const self = entries.find((e) => e.id === selfId);
    const key = visible ? JSON.stringify([entries, self?.ready, bots]) : "";
    if (key === this.last) return;
    this.last = key;
    this.el.hidden = !visible;
    if (!visible) return;
    const { t } = this;
    this.list.replaceChildren(
      ...entries.map((e) =>
        h(
          "li",
          {
            className: `sw-lobby-player${e.ready ? " sw-lobby-player-ready" : ""}${e.away ? " sw-lobby-player-away" : ""}${e.id === selfId ? " sw-lobby-self" : ""}`,
          },
          h("span", { "aria-hidden": "true" }, e.away ? "⏳" : e.ready ? "✔" : "…"),
          e.name,
        ),
      ),
    );
    this.button.textContent = self?.ready ? t("lobby.cancel") : t("lobby.ready");
    this.button.classList.toggle("primary", !self?.ready);
    this.button.setAttribute("aria-pressed", String(Boolean(self?.ready)));
    this.botsButton.textContent = bots ? t("lobby.botsOn") : t("lobby.botsOff");
    this.botsButton.setAttribute("aria-pressed", String(bots));
    this.botsHint.textContent = bots ? t("lobby.botsHintOn", { count: MAX_PLAYERS_PER_ROOM }) : t("lobby.botsHintOff");
  }
}
