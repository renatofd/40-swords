// Order matters: the font faces, then the layout, then the skin (core ui.css loads earlier via @core/client).
import "@fontsource/tiny5/400.css";
import "../styles.css";
import "./skin.css";
import { RARITY_COLORS } from "@game/shared";
import { initIcons } from "./icons";
import { applyUiScale, watchUiScale } from "./scale";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

let installed = false;

/**
 * The game's look for the DOM UI (index.ts and the UI gallery): Tiny5, the
 * pack-framed skin, the integer UI scale, the icon sheet and the rarity
 * colours as `--sw-r0..r4` (so CSS never hand-copies RARITY_COLORS).
 */
export function installTheme(root: HTMLElement = document.documentElement): void {
  if (installed) return;
  installed = true;
  applyUiScale(root);
  watchUiScale();
  initIcons(root);
  RARITY_COLORS.forEach((c, i) => {
    root.style.setProperty(`--sw-r${i}`, hex(c));
  });
}
