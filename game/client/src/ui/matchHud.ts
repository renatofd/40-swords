import { h, type Translate, type TranslateParams } from "@core/client";
import { type KillMessage, MatchPhase } from "@game/shared";
import { icon } from "./icons";
import { itemName } from "./relicText";

const FEED_MS = 6000;
const FEED_LINES = 4;
/**
 * The start of a match: how long the countdown stays big in the middle, then
 * how long it takes to reach its corner (the slide itself: `.sw-match-settle` in styles.css).
 */
const INTRO_HOLD_MS = 2600;
const INTRO_MOVE_MS = 800;

/** What the match HUD shows, read from the synced state every frame. */
export interface MatchView {
  phase: number;
  clock: number;
  phaseEnds: number;
  alive: number;
  winner: string;
  winnerName: string;
  /** Waiting room: players ready, and in the room. */
  ready: number;
  total: number;
}

export interface MatchSelf {
  id: string;
  /** Outside the arena's safe zone right now. */
  outsideZone: boolean;
  /** Out of the match (fell, or arrived after it started): watching. */
  out: boolean;
  /** Name of the hero being watched while out. */
  watching?: string;
  /** Final place once fallen (0 = arrived after the start). */
  place: number;
}

/** "4:05" */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A translated message with its numeric parameters in `.sw-num` spans (Tiny5
 * and left-to-right in every locale), e.g. "PvP in " + <2:41>. Numbers joined
 * only by "/" or ":" ("7/12") share one span: as separate isolates, an RTL line
 * would put them in reverse order ("12/7").
 */
export function withNumbers(t: Translate, key: string, params: TranslateParams): (string | HTMLElement)[] {
  const values = Object.values(params).map(String);
  const marks = Object.fromEntries(Object.keys(params).map((name, i) => [name, `\uE000${i}\uE000`]));
  // Even pieces are text, odd ones the index of a number.
  const pieces = t(key, marks).split(/\uE000(\d+)\uE000/);
  const parts: (string | HTMLElement)[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2 === 0) {
      if (pieces[i] !== "") parts.push(pieces[i] ?? "");
      continue;
    }
    let run = values[Number(pieces[i])] ?? "";
    while (i + 2 < pieces.length && /^[/:]$/.test(pieces[i + 1] ?? "")) {
      run += `${pieces[i + 1]}${values[Number(pieces[i + 2])] ?? ""}`;
      i += 2;
    }
    parts.push(h("span", { className: "sw-num" }, run));
  }
  return parts;
}

/**
 * Match HUD (DOM, like the rest of the UI): the phase and its countdown
 * (top corner, above the scoreboard) with the heroes still standing, the
 * kill feed (bottom) and a banner for what matters most right now: the
 * winner, your fall (and who you watch), or a warning outside the safe zone.
 * When a match starts, the countdown to PvP first shows big in the middle of
 * the screen, then slides to its corner (`intro`).
 */
export class MatchHud {
  readonly timer = h("div", { className: "sw-match", role: "status" });
  readonly feed = h("div", { className: "sw-feed", role: "log", "aria-live": "polite" });
  readonly banner = h("div", { className: "sw-banner", "aria-live": "assertive", hidden: true });
  private title = h("div", { className: "sw-banner-title" });
  private sub = h("div", { className: "sw-banner-sub" });
  private lastTimer = "";
  private lastBanner = "";
  private introTimer: ReturnType<typeof setTimeout> | undefined;
  /** `intro` was asked for: it runs once the timer shows the new phase (its size is measured). */
  private introPending = false;

  constructor(private readonly t: Translate) {
    this.banner.append(this.title, this.sub);
  }

  update(view: MatchView, self: MatchSelf) {
    const { t } = this;
    const time = formatClock(view.phaseEnds - view.clock);
    /** The phase's message, and whether the heroes still standing follow it. */
    let message: [string, TranslateParams];
    let standing = false;
    switch (view.phase) {
      case MatchPhase.lobby:
        message = ["match.lobby", { ready: view.ready, total: view.total }];
        break;
      case MatchPhase.starting:
        message = ["match.starting", { time }];
        break;
      case MatchPhase.calm:
        message = ["match.calm", { time }];
        standing = true;
        break;
      case MatchPhase.pvp:
        message = ["match.pvp", { time }];
        standing = true;
        break;
      case MatchPhase.prep:
        message = ["match.prep", { time }];
        standing = true;
        break;
      case MatchPhase.arena:
        message = ["match.arena", { alive: view.alive }];
        break;
      default:
        message = ["match.ended", { time }];
    }
    const key = `${view.phase}|${t(...message)}|${standing ? view.alive : ""}`;
    if (key !== this.lastTimer) {
      this.lastTimer = key;
      // "PvP in 2:41 · [heroes] 40": the numbers in the pixel font, the heroes still standing as an icon.
      // One inline run (a flex item per text piece would drop the spaces around the numbers).
      this.timer.replaceChildren(
        h(
          "span",
          {},
          ...withNumbers(t, ...message),
          ...(standing
            ? [
                " · ",
                icon("heroes", { label: t("hud.standing") }),
                h("span", { className: "sw-num" }, String(view.alive)),
              ]
            : []),
        ),
      );
      this.timer.dataset.phase = String(view.phase);
    }
    if (this.introPending) {
      this.introPending = false;
      this.startIntro();
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
      // Fell, or arrived after the match started (then the next match is theirs).
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
    this.title.replaceChildren(...(kind === "danger" ? [icon("mark-danger", { big: true })] : []), title);
    this.sub.textContent = sub;
    this.sub.hidden = sub === "";
    this.banner.hidden = title === "";
    this.banner.dataset.kind = kind;
  }

  /**
   * The countdown shows big in the middle of the screen for a moment, then
   * slides back to its corner (on the next `update`, with the new text).
   */
  intro() {
    this.introPending = true;
  }

  /** Measured on the page, so it works whichever corner the timer lives in (right to left languages too). */
  private startIntro() {
    const el = this.timer;
    clearTimeout(this.introTimer);
    el.classList.remove("sw-match-settle");
    el.style.scale = "";
    el.style.translate = "";
    el.classList.add("sw-match-intro");
    const parent = el.offsetParent?.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (!parent || rect.width === 0) {
      el.classList.remove("sw-match-intro");
      return;
    }
    // Whole scales only (pixel art and the pixel font stay crisp), moved by whole device pixels.
    const scale = Math.max(1, Math.round(Math.min(2.4, (parent.width * 0.8) / rect.width)));
    const dpr = globalThis.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const dx = snap(parent.left + parent.width / 2 - (rect.left + rect.width / 2));
    // Above the middle: the heroes start in the middle of the square.
    const dy = snap(parent.top + parent.height * 0.27 - (rect.top + rect.height / 2));
    el.style.scale = String(scale);
    el.style.translate = `${dx}px ${dy}px`;
    this.introTimer = setTimeout(() => {
      // Back to scale 1 at once; only the slide is animated (`.sw-match-settle`, steps(8)).
      el.classList.add("sw-match-settle");
      el.style.scale = "";
      el.style.translate = "";
      this.introTimer = setTimeout(() => el.classList.remove("sw-match-intro", "sw-match-settle"), INTRO_MOVE_MS + 100);
    }, INTRO_HOLD_MS);
  }

  /** A line in the kill feed (everyone sees every hero who falls, and why). */
  kill(m: KillMessage) {
    const { t } = this;
    const text =
      m.cause === "hero"
        ? t("feed.kill", { killer: m.killerName, victim: m.victimName })
        : m.cause === "storm"
          ? t("feed.storm", { victim: m.victimName })
          : t("feed.monster", { victim: m.victimName });
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
