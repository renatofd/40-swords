/**
 * Art the pack has no equivalent for, drawn in code once as textures: shadows,
 * the elite glow and the rarity rings under shop goods. All are hard pixel
 * ellipses (pixelEllipse.ts) in pack colours; everything else is a real sprite
 * (content/sprites, made by tools/art).
 */
import { clampRarity, RARITY_COLORS } from "@game/shared";
import type Phaser from "phaser";
import { ellipseRing, ellipseRuns, type PixelRun } from "./pixelEllipse";

export const TEX_ELITE_GLOW = "fx:elite";

/** Paints pixel runs (whole pixels, one alpha: no anti-aliased edges). */
const fillRuns = (g: Phaser.GameObjects.Graphics, runs: readonly PixelRun[]) => {
  for (const r of runs) g.fillRect(r.x0, r.y, r.x1 - r.x0, 1);
};

/** Generates a `w` x `h` ring texture: its inside at one alpha, its 1 px band at another. */
function ringTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  colors: { inside: number; insideAlpha: number; band: number; bandAlpha: number },
) {
  const ring = ellipseRing(w, h);
  const g = scene.make.graphics({}, false);
  g.fillStyle(colors.inside, colors.insideAlpha);
  fillRuns(g, ring.inside);
  g.fillStyle(colors.band, colors.bandAlpha);
  fillRuns(g, ring.band);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Creates the textures every scene needs. Call once (textures survive scene restarts). */
export function createProceduralArt(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX_ELITE_GLOW)) return;
  // Golden glow under elites: a hard 1 px ring over a faint fill (pack golds).
  ringTexture(scene, TEX_ELITE_GLOW, 20, 10, { inside: 0xffbb31, insideAlpha: 0.35, band: 0xffe737, bandAlpha: 0.9 });
}

/**
 * Ring under a shop good of `rarity`, 10 x 4 px (it fits the cream oval on top
 * of the pedestal): a faint fill and a solid 1 px band in the rarity colour.
 */
export function rarityRingTexture(scene: Phaser.Scene, rarity: number): string {
  const r = clampRarity(rarity);
  const key = `fx:rarity-${r}`;
  if (scene.textures.exists(key)) return key;
  const color = RARITY_COLORS[r] ?? 0xffffff;
  ringTexture(scene, key, 10, 4, { inside: color, insideAlpha: 0.35, band: color, bandAlpha: 1 });
  return key;
}

/**
 * A shadow ellipse `width` px wide (even sizes, so it sits on whole pixels),
 * hard-edged at one alpha, generated once per width. The pack has no shadows.
 */
export function shadowTexture(scene: Phaser.Scene, width: number): string {
  const key = `fx:shadow-${width}`;
  if (scene.textures.exists(key)) return key;
  const height = Math.max(4, 2 * Math.round(width / 7));
  const g = scene.make.graphics({}, false);
  g.fillStyle(0x000000, 0.3);
  fillRuns(g, ellipseRuns(width, height));
  g.generateTexture(key, width, height);
  g.destroy();
  return key;
}
