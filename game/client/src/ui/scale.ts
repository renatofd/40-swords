import { computeZoom } from "@core/client";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@game/shared";

/**
 * UI scale. The art pixel `u` is a whole number of DEVICE pixels (so frames and
 * icons stay exact at fractional DPR: 125 %, 150 %, Android 2.625), and one
 * Tiny5 font pixel is always 2 art pixels: the layout is the same at every
 * resolution, only `u` changes.
 *
 * CSS reads `--sw-u` (art pixel, CSS px) and `--sw-fp` (font pixel, CSS px).
 */

/** Art pixel in DEVICE px: about a third of the world zoom, never below one CSS px (ceil(dpr)), at most 4 CSS px. */
export const uiDevicePx = (zoom: number, dpr: number) => {
  const d = dpr > 0 ? dpr : 1;
  return Math.min(4 * Math.ceil(d), Math.max(Math.ceil(d), Math.round((zoom * d) / 3)));
};

/** One Tiny5 font pixel = 2 art pixels (Tiny5 is 8 px per em, so text is ≥ 16 CSS px). */
export const FONT_PX_PER_ART_PX = 2;

/** Minimal element shape `applyUiScale` writes to (a real `<html>` or a test fake). */
export interface ScaleRoot {
  style: { setProperty(name: string, value: string): void };
  dataset: Record<string, string | undefined>;
}

/** Writes `--sw-u`, `--sw-fp` and `data-sw-ui` (u in device px) for the current window. */
export function applyUiScale(root: ScaleRoot = document.documentElement) {
  const dpr = globalThis.devicePixelRatio || 1;
  const uDev = uiDevicePx(computeZoom({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }), dpr);
  root.style.setProperty("--sw-u", `${uDev / dpr}px`);
  root.style.setProperty("--sw-fp", `${(FONT_PX_PER_ART_PX * uDev) / dpr}px`);
  root.dataset.swUi = String(uDev);
}

let watching = false;

/**
 * Re-applies on resize and on every DPR change (a resolution media query
 * matches one DPR only, so it is re-registered after each change).
 */
export function watchUiScale(): void {
  if (watching) return;
  watching = true;
  const apply = () => applyUiScale();
  globalThis.addEventListener("resize", apply);
  const watchDpr = () => {
    const query = globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
    query?.addEventListener(
      "change",
      () => {
        apply();
        watchDpr();
      },
      { once: true },
    );
  };
  watchDpr();
}
