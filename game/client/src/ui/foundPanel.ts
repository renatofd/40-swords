import { h, type Translate } from "@core/client";
import { clampRarity, type GainMessage, isWeaponId } from "@game/shared";
import { ITEM_ICON } from "./iconMap";
import { icon } from "./icons";
import { itemEffect, itemName, rarityColor, rarityName } from "./relicText";

/** How long one item stays on screen, from the moment it appears. */
export const FOUND_MS = 5000;
/** With more items waiting, each one stays this long (the last one waiting gets FOUND_MS). */
export const FOUND_QUEUED_MS = 2500;
/** Typewriter speed: one character every this many ms. */
export const FOUND_TYPE_MS = 18;
/** Fade out before the panel hides (skin.css `.sw-found-out`). */
const FADE_MS = 400;
/** Stand-in for the item name while the sentence is split around it. */
const SLOT = "";

interface Typed {
  node: Text;
  rest: HTMLElement;
  chars: string[];
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;
/** Characters as the reader sees them (an accented letter or an emoji is one). */
const graphemes = (s: string) => (segmenter ? [...segmenter.segment(s)].map((g) => g.segment) : Array.from(s));

/**
 * The "You found the Time Compass!" box at the top of the screen, as in the
 * Zelda games: the item's icon, the sentence (its verb says where the item
 * came from: a chest, the shop or a defeated hero) with the item's name in its
 * rarity colour, then the rarity, what the item is and what it does. The text
 * types itself out; a click or tap shows it all at once, a second one closes
 * the box. Each box stays FOUND_MS; items that arrive meanwhile wait their
 * turn (shorter turns while others wait). Screen readers get the whole text
 * at once (a polite live region).
 *
 * Driven by `update(now)` from the game loop (no timers), so it pauses with
 * the game and the gallery can freeze it.
 */
export class FoundPanel {
  readonly el = h("section", { className: "sw-found", hidden: true });
  private live = h("div", { className: "sw-sr-only", role: "status", "aria-live": "polite" });
  private queue: GainMessage[] = [];
  /** When the box on screen appeared (set by the first `update` after it did). */
  private shownAt?: number;
  private closing?: number;
  private typed: Typed[] = [];
  private revealed = 0;
  private total = 0;
  private now = 0;
  /**
   * Called when a box opens, filled and visible, before the browser paints it:
   * GameScene moves it to the bottom of the screen when it would cover the hero.
   */
  onShow?: (el: HTMLElement) => void;
  private reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private readonly t: Translate) {
    this.el.addEventListener("click", () => this.advance());
    // A click must not take the keyboard from the game (Space would press the box).
    this.el.addEventListener("pointerdown", (e) => e.preventDefault());
  }

  /** The live region for screen readers: put it anywhere in the HUD. */
  get announcer(): HTMLElement {
    return this.live;
  }

  /** Queues an item; it shows now if the box is free. */
  show(m: GainMessage) {
    this.queue.push(m);
    if (this.el.hidden && this.closing === undefined) this.next();
  }

  /** Whether an item is on screen or waiting. */
  get busy(): boolean {
    return !this.el.hidden || this.queue.length > 0;
  }

  /** Shows the whole text now (the gallery, reduced motion). */
  finishTyping() {
    this.reveal(this.total);
  }

  /** Per frame: types the text, and closes the box when its time is up. */
  update(now: number) {
    this.now = now;
    if (this.el.hidden) return;
    if (this.closing !== undefined) {
      if (now >= this.closing) {
        this.closing = undefined;
        this.el.hidden = true;
        this.el.classList.remove("sw-found-out");
        if (this.queue.length > 0) this.next();
      }
      return;
    }
    this.shownAt ??= now;
    if (this.revealed < this.total) this.reveal(Math.floor((now - this.shownAt) / FOUND_TYPE_MS));
    const stay = this.queue.length > 0 ? FOUND_QUEUED_MS : FOUND_MS;
    if (now - this.shownAt >= stay) this.close();
  }

  /** Click or tap: the whole text first, then the next item (or nothing). */
  private advance() {
    if (this.el.hidden || this.closing !== undefined) return;
    if (this.revealed < this.total) this.finishTyping();
    else this.close();
  }

  private close() {
    this.closing = this.now + FADE_MS;
    this.el.classList.add("sw-found-out");
  }

  private next() {
    const m = this.queue.shift();
    if (!m) return;
    const { t } = this;
    const rarity = clampRarity(m.rarity);
    const potion = m.kind === "potion";
    const name = itemName(t, m.kind);
    const [before = "", after = ""] = t(`found.${m.source}`, { item: SLOT }).split(SLOT);
    const rarityLine = potion
      ? undefined
      : isWeaponId(m.kind)
        ? `${t("item.weapon")} · ${rarityName(t, rarity)}`
        : rarityName(t, rarity);
    const description = t(`item.${m.kind}.desc`);
    const effect = itemEffect(t, m.kind, rarity);

    this.el.style.setProperty("--sw-rarity", rarityColor(rarity));
    this.el.dataset.rarity = String(potion ? 0 : rarity);
    this.el.replaceChildren(
      icon(ITEM_ICON[m.kind], { big: true }),
      h(
        "div",
        { className: "sw-found-text", "aria-hidden": "true" },
        h("p", { className: "sw-found-title" }, before, h("strong", { className: "sw-found-name" }, name), after),
        rarityLine && h("p", { className: "sw-rarity" }, rarityLine),
        h("p", {}, description),
        h("p", { className: "sw-found-effect" }, effect),
      ),
    );
    this.live.textContent = [before + name + after, rarityLine, description, effect].filter(Boolean).join(" ");

    this.prepareTyping();
    this.el.classList.remove("sw-found-out");
    this.el.hidden = false;
    // Restart the pop-in animation for a box that follows another.
    this.el.style.animation = "none";
    void this.el.offsetWidth;
    this.el.style.animation = "";
    this.shownAt = undefined;
    this.reveal(this.reduceMotion ? this.total : 0);
    this.onShow?.(this.el);
  }

  /**
   * Splits every text node into what is shown and the rest, kept in the layout
   * but invisible: the box has its final size from the first frame, and the
   * letters appear in place.
   */
  private prepareTyping() {
    this.typed = [];
    const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const node of nodes) {
      const chars = graphemes(node.data);
      const rest = h("span", { className: "sw-found-rest" }, node.data);
      node.data = "";
      node.after(rest);
      this.typed.push({ node, rest, chars });
    }
    this.total = this.typed.reduce((sum, p) => sum + p.chars.length, 0);
    this.revealed = -1;
  }

  private reveal(count: number) {
    const n = Math.max(0, Math.min(count, this.total));
    if (n === this.revealed) return;
    this.revealed = n;
    let left = n;
    for (const p of this.typed) {
      const shown = Math.min(left, p.chars.length);
      left -= shown;
      p.node.data = p.chars.slice(0, shown).join("");
      p.rest.textContent = p.chars.slice(shown).join("");
    }
  }
}
