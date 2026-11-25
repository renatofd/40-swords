import { h } from "@core/client";
import type Phaser from "phaser";

const DAMAGE_MS = 700;
/** Floating numbers start this far above the position they are given (over the head of a 32 px sprite). */
const NUMBER_RISE = 12;
/** Gap kept between a pushed-down label and the top of the view, in CSS px. */
const EDGE_PX = 4;

interface Floating {
  el: HTMLElement;
  x: number;
  y: number;
  until: number;
}

/**
 * Text that follows things in the world (names, damage numbers), drawn in the
 * DOM like the rest of the UI: crisp at any zoom and right for every script
 * (Arabic, Devanagari, CJK names). The canvas renders at one-screen resolution,
 * so Phaser text there would be blocky.
 */
export class WorldLabels {
  readonly el = h("div", { className: "sw-labels", "aria-hidden": "true" });
  private anchored = new Map<string, HTMLElement>();
  private floating: Floating[] = [];
  /** Elements waiting to be centred at the start of the next frame (see `centre`). */
  private toCentre = new Set<HTMLElement>();
  /** Measured content height of anchored elements, so tall cards stay inside the view (see `place`). */
  private heights = new WeakMap<HTMLElement, number>();
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Recomputes the world → page mapping. Call once per frame before placing labels. */
  beginFrame(time: number) {
    const canvas = this.scene.game.canvas.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    const cam = this.scene.cameras.main;
    // Centre what was created or changed since the last frame. All reads first,
    // then all writes: layout is computed once per frame, not once per label.
    const widths: [HTMLElement, number][] = [];
    for (const el of this.toCentre) {
      const child = el.firstElementChild;
      if (!el.isConnected || !(child instanceof HTMLElement)) continue;
      widths.push([child, child.offsetWidth]);
      this.heights.set(el, child.offsetHeight);
    }
    this.scale = canvas.width / cam.width;
    this.offsetX = canvas.left - host.left - cam.worldView.x * this.scale;
    this.offsetY = canvas.top - host.top - cam.worldView.y * this.scale;
    // CSS can size world-anchored cards with the zoom (1 world pixel = --sw-px).
    this.el.style.setProperty("--sw-px", `${this.scale}px`);
    for (const [child, width] of widths) child.style.left = `${-Math.round(width / 2)}px`;
    for (const el of this.toCentre) el.style.visibility = "";
    this.toCentre.clear();

    this.floating = this.floating.filter((f) => {
      if (time >= f.until) {
        f.el.remove();
        return false;
      }
      this.place(f.el, f.x, f.y);
      return true;
    });
  }

  /**
   * Puts the element's bottom centre at world (x, y). An element taller than
   * the space above its anchor (a shop card's details near the top of a phone
   * screen) is pushed down so its top stays in view.
   */
  private place(el: HTMLElement, x: number, y: number) {
    const top = (this.heights.get(el) ?? 0) + EDGE_PX;
    const py = Math.max(Math.round(this.offsetY + y * this.scale), top);
    el.style.transform = `translate(${Math.round(this.offsetX + x * this.scale)}px, ${py}px)`;
  }

  /**
   * Centres an anchored element's content on the anchor with a whole-pixel,
   * physical `left` (a translateX(-50%) lands text on half pixels, and the
   * float animation already owns `translate`). Its width is measured at the
   * start of the next frame (`beginFrame`), together with every other new
   * label: measuring right away would force a layout per damage number.
   * `hide`: new content stays hidden until then, so it never shows off-centre.
   */
  private centre(el: HTMLElement, hide: boolean) {
    if (hide) el.style.visibility = "hidden";
    this.toCentre.add(el);
  }

  /**
   * Shows (or moves) an element with its bottom centre at world (x, y). `make`
   * builds it the first time; its first child is what gets centred.
   */
  anchor(id: string, x: number, y: number, make: () => HTMLElement): HTMLElement {
    let el = this.anchored.get(id);
    if (!el) {
      el = h("div", { className: "sw-anchor" }, make());
      this.anchored.set(id, el);
      this.el.append(el);
      this.centre(el, true);
    }
    this.place(el, x, y);
    return el;
  }

  /**
   * Moves an anchored element if it exists; returns its content (the first
   * child). `remeasure`: its width may have changed (a shop card turned
   * near, sold or poor), so centre it again.
   */
  move(id: string, x: number, y: number, remeasure = false): Element | undefined {
    const el = this.anchored.get(id);
    if (!el) return undefined;
    if (remeasure) this.centre(el, false);
    this.place(el, x, y);
    return el.firstElementChild ?? undefined;
  }

  remove(id: string) {
    const el = this.anchored.get(id);
    if (el) this.toCentre.delete(el);
    el?.remove();
    this.anchored.delete(id);
  }

  /** Removes every anchored element whose id starts with `prefix`. */
  removeAll(prefix: string) {
    for (const id of [...this.anchored.keys()]) if (id.startsWith(prefix)) this.remove(id);
  }

  /** Name tag of a player; `foe` (PvP on) shows it in red. */
  name(id: string, text: string, x: number, y: number, self: boolean, foe = false) {
    const el = this.anchor(`name:${id}`, x, y, () =>
      h("span", { className: self ? "sw-name sw-name-self" : "sw-name" }, text),
    );
    const tag = el.firstElementChild;
    if (tag && tag.classList.contains("sw-name-foe") !== foe) tag.classList.toggle("sw-name-foe", foe);
  }

  removeName(id: string) {
    this.remove(`name:${id}`);
  }

  /** Floating heal number (green, "+25"). */
  heal(x: number, y: number, amount: number, time: number) {
    const el = h(
      "div",
      { className: "sw-anchor" },
      h("span", { className: "sw-num sw-dmg sw-dmg-heal" }, `+${amount}`),
    );
    this.el.append(el);
    this.centre(el, true);
    this.floating.push({ el, x, y: y - NUMBER_RISE, until: time + DAMAGE_MS });
    this.place(el, x, y - NUMBER_RISE);
  }

  /** Floating damage number (Tiny5). Crits are gold with a "!"; damage taken by players is red. */
  damage(x: number, y: number, amount: number, crit: boolean, player: boolean, time: number, blocked = false) {
    const className = `sw-num sw-dmg${crit ? " sw-dmg-crit" : ""}${player ? " sw-dmg-player" : ""}${blocked ? " sw-dmg-blocked" : ""}`;
    const el = h("div", { className: "sw-anchor" }, h("span", { className }, crit ? `${amount}!` : String(amount)));
    this.el.append(el);
    this.centre(el, true);
    this.floating.push({ el, x, y: y - NUMBER_RISE, until: time + DAMAGE_MS });
    this.place(el, x, y - NUMBER_RISE);
  }
}
