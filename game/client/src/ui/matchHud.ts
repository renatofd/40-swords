import { h, type Translate } from "@core/client";
import { type KillMessage, MatchPhase } from "@game/shared";
import { itemName } from "./relicText";

const FEED_MS = 6000;
const FEED_LINES = 4;

/** What the match HUD shows, read from the synced state every frame. */
export interface MatchView {
  phase: number;
  clock: number;
  phaseEnds: number;
  alive: number;
  winner: string;
  winnerName: string;
}

export interface MatchSelf {
  id: string;
  /** Outside the arena's safe zone right now. */
  outsideZone: boolean;
  /** Out of the arena fight (knocked out, or arrived after it started): watching. */
  out: boolean;
  /** Name of the hero being watched while out. */
  watching?: string;
  /** Arena placement once knocked out (0 = not knocked out in this match). */
  place: number;
}

/** "4:05" */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Match HUD (DOM, like the rest of the UI): the phase and its countdown
 * (top corner, above the scoreboard), the kill feed (bottom) and a banner for
 * what matters most right now: the winner, your knock-out (and who you
 * watch), or a warning outside the safe zone.
 */
export class MatchHud {
  readonly timer = h("div", { className: "sw-match", role: "status" });
  readonly feed = h("div", { className: "sw-feed", role: "log", "aria-live": "polite" });
  readonly banner = h("div", { className: "sw-banner", "aria-live": "assertive", hidden: true });
  private title = h("div", { className: "sw-banner-title" });
  private sub = h("div", { className: "sw-banner-sub" });
  private lastTimer = "";
  private lastBanner = "";

  constructor(private readonly t: Translate) {
    this.banner.append(this.title, this.sub);
  }

  update(view: MatchView, self: MatchSelf) {
    const { t } = this;
    const left = formatClock(view.phaseEnds - view.clock);
    let text: string;
    switch (view.phase) {
      case MatchPhase.calm:
        text = t("match.calm", { time: left });
        break;
      case MatchPhase.pvp:
        text = t("match.pvp", { time: left });
        break;
      case MatchPhase.prep:
        text = t("match.prep", { time: left });
        break;
      case MatchPhase.arena:
        text = t("match.arena", { alive: view.alive });
        break;
      default:
        text = t("match.ended", { time: left });
    }
    const key = `${view.phase}|${text}`;
    if (key !== this.lastTimer) {
      this.lastTimer = key;
      this.timer.textContent = text;
      this.timer.dataset.phase = String(view.phase);
    }

    let title = "";
    let sub = "";
    let kind = "";
    if (view.phase === MatchPhase.ended) {
      const won = view.winner !== "" && view.winner === self.id;
      title = won
        ? t("match.youWon")
        : view.winner
          ? t("match.winner", { name: view.winnerName })
          : t("match.noWinner");
      if (!won && self.place > 0) sub = t("match.out", { place: self.place });
      kind = won ? "win" : "end";
    } else if (self.out) {
      // Knocked out, or arrived after the arena started (then the next match is theirs).
      title = self.place > 0 ? t("match.out", { place: self.place }) : t("match.next");
      if (self.watching) sub = t("match.watching", { name: self.watching });
      kind = "out";
    } else if (self.outsideZone) {
      title = t("match.zone");
      kind = "danger";
    }
    const bannerKey = `${kind}|${title}|${sub}`;
    if (bannerKey === this.lastBanner) return;
    this.lastBanner = bannerKey;
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.sub.hidden = sub === "";
    this.banner.hidden = title === "";
    this.banner.dataset.kind = kind;
  }

  /** A line in the kill feed (everyone sees every PvP win and arena knock-out). */
  kill(m: KillMessage) {
    const { t } = this;
    const text = m.killer
      ? t("feed.kill", { killer: m.killerName, victim: m.victimName })
      : t("feed.storm", { victim: m.victimName });
    const line = h("div", { className: "sw-feed-line" }, text);
    this.feed.append(line);
    while (this.feed.childElementCount > FEED_LINES) this.feed.firstElementChild?.remove();
    setTimeout(() => line.classList.add("sw-feed-out"), FEED_MS);
    setTimeout(() => line.remove(), FEED_MS + 400);
  }

  /** The toast for the two heroes of a fight (null for everyone else). The winner sees the relic on a gain card. */
  lootText(m: KillMessage, selfId: string): string | null {
    const { t } = this;
    if (!m.killer) return null;
    const { rupees } = m;
    if (m.killer === selfId)
      return rupees > 0 ? t("toast.looted", { name: m.victimName, rupees }) : t("toast.beat", { name: m.victimName });
    if (m.victim !== selfId) return null;
    const name = m.killerName;
    if (!m.relic) return rupees > 0 ? t("toast.robbed", { name, rupees }) : t("toast.beaten", { name });
    const relic = itemName(t, m.relic.kind);
    return rupees > 0 ? t("toast.robbedRelic", { name, relic, rupees }) : t("toast.robbedRelicOnly", { name, relic });
  }
}
