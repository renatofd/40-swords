import { h } from "@core/client";
import { isWeaponId, type RelicKind, WEAPONS } from "@game/shared";
import { spriteFiles } from "../assets";
import { ICON_SHEET, type IconName, ITEM_ICON } from "./iconMap";

/**
 * Pack icons in the DOM: a CSS sprite of the same `items.png` the world draws,
 * scaled by whole art pixels (`--sw-u`, see scale.ts and skin.css). Icons are
 * never mirrored in RTL.
 */

export interface IconOptions {
  /** Twice the size (2 art px per sheet pixel). */
  big?: boolean;
  /** Accessible name; without it the icon is decorative (`aria-hidden`). */
  label?: string;
  /** Second frame the CSS can switch to (the low-HP heart blinks `hp-1` / `hp-0`). */
  alt?: IconName;
}

function position(el: HTMLElement, name: IconName, alt?: IconName) {
  const f = ICON_SHEET.icons[name];
  el.dataset.icon = name;
  el.style.setProperty("--x", String(f.x));
  el.style.setProperty("--y", String(f.y));
  if (alt) {
    const a = ICON_SHEET.icons[alt];
    el.style.setProperty("--x2", String(a.x));
    el.style.setProperty("--y2", String(a.y));
  } else {
    el.style.removeProperty("--x2");
    el.style.removeProperty("--y2");
  }
}

/** `<span class="sw-icon" data-icon=name>`: one 16x16 icon (32x32 art px when `big`). */
export function icon(name: IconName, opts: IconOptions = {}): HTMLElement {
  const el = h("span", { className: opts.big ? "sw-icon sw-icon-big" : "sw-icon" });
  position(el, name, opts.alt);
  if (opts.label) {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", opts.label);
  } else {
    el.setAttribute("aria-hidden", "true");
  }
  return el;
}

/** Re-points an existing icon (HUD heart) without creating a node; no-op when unchanged. */
export function setIcon(el: HTMLElement, name: IconName, alt?: IconName): void {
  const altNow = el.style.getPropertyValue("--x2") !== "";
  if (el.dataset.icon === name && altNow === !!alt && (!alt || sameFrame(el, alt))) return;
  position(el, name, alt);
}

const sameFrame = (el: HTMLElement, alt: IconName) => {
  const a = ICON_SHEET.icons[alt];
  return el.style.getPropertyValue("--x2") === String(a.x) && el.style.getPropertyValue("--y2") === String(a.y);
};

/** Points the CSS at the sheet: `--sw-items` (url), `--sw-items-w`/`-h` (unitless px). Once at startup. */
export function initIcons(root: HTMLElement = document.documentElement) {
  const url = spriteFiles("items")?.image;
  if (url) root.style.setProperty("--sw-items", `url("${url}")`);
  root.style.setProperty("--sw-items-w", String(ICON_SHEET.w));
  root.style.setProperty("--sw-items-h", String(ICON_SHEET.h));
}

/**
 * A relic or weapon slot: `frame-slot-<best>` around the icon. Weapons get a
 * cooldown shade (`cd` = shaded rows 0..16, see `cooldownRows`) and a `×V`
 * badge (V = projectiles per volley = copies × `perCopy`); passives a count
 * badge from 2 copies. `title` (e.g. "Boots · Rare") is the tooltip.
 */
export function slot(kind: RelicKind, best: number, count: number, cd?: number, title?: string): HTMLElement {
  const weapon = isWeaponId(kind);
  const el = h("span", { className: "sw-slot", title }, icon(ITEM_ICON[kind]));
  el.dataset.rarity = String(best);
  el.dataset.kind = kind;
  if (weapon) {
    const shade = h("span", { className: "sw-slot-cd" });
    shade.style.setProperty("--cd", String(cd ?? 0));
    el.append(shade);
  }
  const badge = weapon ? `×${count * WEAPONS[kind].perCopy}` : count >= 2 ? String(count) : "";
  if (badge) el.append(h("span", { className: "sw-num sw-slot-badge" }, badge));
  return el;
}

/** Updates the cooldown shade of a weapon slot made by `slot()` (rows 0..16). */
export function setSlotCooldown(slotEl: HTMLElement, rows: number): void {
  const shade = slotEl.querySelector<HTMLElement>(".sw-slot-cd");
  if (shade && shade.style.getPropertyValue("--cd") !== String(rows)) shade.style.setProperty("--cd", String(rows));
}
