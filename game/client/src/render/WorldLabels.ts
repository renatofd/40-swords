import { h } from "@core/client";
import type Phaser from "phaser";

const DAMAGE_MS = 700;

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
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Recomputes the world → page mapping. Call once per frame before placing labels. */
  beginFrame(time: number) {
    const canvas = this.scene.game.canvas.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    const cam = this.scene.cameras.main;
    this.scale = canvas.width / cam.width;
    this.offsetX = canvas.left - host.left - cam.worldView.x * this.scale;
    this.offsetY = canvas.top - host.top - cam.worldView.y * this.scale;
    // CSS can size world-anchored cards with the zoom (1 world pixel = --sw-px).
    this.el.style.setProperty("--sw-px", `${this.scale}px`);

    this.floating = this.floating.filter((f) => {
      if (time >= f.until) {
        f.el.remove();
        return false;
      }
      this.place(f.el, f.x, f.y);
      return true;
    });
  }

  private place(el: HTMLElement, x: number, y: number) {
    el.style.transform = `translate(${Math.round(this.offsetX + x * this.scale)}px, ${Math.round(this.offsetY + y * this.scale)}px)`;
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
    }
    this.place(el, x, y);
    return el;
  }

  /** Moves an anchored element if it exists; returns its content (the first child). */
  move(id: string, x: number, y: number): Element | undefined {
    const el = this.anchored.get(id);
    if (!el) return undefined;
    this.place(el, x, y);
    return el.firstElementChild ?? undefined;
  }

  remove(id: string) {
    this.anchored.get(id)?.remove();
    this.anchored.delete(id);
  }

  /** Removes every anchored element whose id starts with `prefix`. */
  removeAll(prefix: string) {
    for (const id of [...this.anchored.keys()]) if (id.startsWith(prefix)) this.remove(id);
  }

  /** Name tag of a player. */
  name(id: string, text: string, x: number, y: number, self: boolean) {
    this.anchor(`name:${id}`, x, y, () => h("span", { className: self ? "sw-name sw-name-self" : "sw-name" }, text));
  }

  removeName(id: string) {
    this.remove(`name:${id}`);
  }

  /** Floating damage number. Crits are bigger and yellow; damage taken by players is red. */
  damage(x: number, y: number, amount: number, crit: boolean, player: boolean, time: number) {
    const className = `sw-dmg${crit ? " sw-dmg-crit" : ""}${player ? " sw-dmg-player" : ""}`;
    const el = h("div", { className: "sw-anchor" }, h("span", { className }, crit ? `${amount}!` : String(amount)));
    this.el.append(el);
    this.floating.push({ el, x, y: y - 8, until: time + DAMAGE_MS });
    this.place(el, x, y - 8);
  }
}
