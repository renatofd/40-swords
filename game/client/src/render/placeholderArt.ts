/**
 * PLACEHOLDER ART drawn in code (shapes and colours), generated once as textures:
 * what the pack does not cover yet (pickups, chests, the vendor pedestal) plus
 * shadows and the elite glow (hard pixel ellipses, see pixelEllipse.ts). Characters, shots and effects are real sprites
 * (content/sprites, made by tools/art).
 */
import Phaser from "phaser";
import { ellipseRing, ellipseRuns, type PixelRun } from "./pixelEllipse";

export const TEX_CHEST = "prop:chest";
export const TEX_CHEST_OPEN = "prop:chest-open";
export const TEX_PEDESTAL = "prop:pedestal";
export const TEX_ELITE_GLOW = "fx:elite";
export const rupeeTexture = (value: number) => (value >= 5 ? "pickup:rupee-blue" : "pickup:rupee-green");
export const TEX_HEART = "pickup:heart";

const darken = (color: number, f: number) => {
  const r = ((color >> 16) & 0xff) * f;
  const g = ((color >> 8) & 0xff) * f;
  const b = (color & 0xff) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

/** Paints pixel runs (whole pixels, one alpha: no anti-aliased edges). */
const fillRuns = (g: Phaser.GameObjects.Graphics, runs: readonly PixelRun[]) => {
  for (const r of runs) g.fillRect(r.x0, r.y, r.x1 - r.x0, 1);
};

/** Creates every placeholder texture. Call once (textures survive scene restarts). */
export function createPlaceholderArt(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX_ELITE_GLOW)) return;
  const g = scene.make.graphics({}, false);
  // Golden glow under elites: a hard 1 px ring over a faint fill.
  g.clear();
  const glow = ellipseRing(20, 10);
  g.fillStyle(0xffd040, 0.35);
  fillRuns(g, glow.inside);
  g.fillStyle(0xffe080, 0.9);
  fillRuns(g, glow.band);
  g.generateTexture(TEX_ELITE_GLOW, 20, 10);

  // Rupees: small gems.
  for (const [key, color] of [
    ["pickup:rupee-green", 0x3fe07a],
    ["pickup:rupee-blue", 0x4aa8ff],
  ] as const) {
    g.clear();
    g.fillStyle(darken(color, 0.45)).fillPoints(
      [
        new Phaser.Math.Vector2(4, 0),
        new Phaser.Math.Vector2(8, 3),
        new Phaser.Math.Vector2(8, 9),
        new Phaser.Math.Vector2(4, 12),
        new Phaser.Math.Vector2(0, 9),
        new Phaser.Math.Vector2(0, 3),
      ],
      true,
    );
    g.fillStyle(color).fillRect(2, 3, 4, 6);
    g.fillStyle(0xffffff).fillRect(3, 3, 1, 3);
    g.generateTexture(key, 8, 12);
  }

  // Heart: heals a hurt hero.
  g.clear();
  g.fillStyle(0x7a1020).fillCircle(3, 3.5, 3.5).fillCircle(8, 3.5, 3.5).fillTriangle(0, 4.5, 11, 4.5, 5.5, 10.5);
  g.fillStyle(0xe8344a).fillCircle(3, 3.5, 2.5).fillCircle(8, 3.5, 2.5).fillTriangle(1.2, 4.5, 9.8, 4.5, 5.5, 9);
  g.fillStyle(0xffd0d8).fillRect(2, 2, 1, 1);
  g.generateTexture(TEX_HEART, 11, 11);

  // Chest, closed and open.
  g.clear();
  g.fillStyle(0x3a2412).fillRect(0, 3, 14, 10);
  g.fillStyle(0x8a5a2e).fillRect(1, 4, 12, 8);
  g.fillStyle(0x6b4523).fillRect(1, 7, 12, 1);
  g.fillStyle(0xe8c050).fillRect(6, 6, 2, 3).fillRect(0, 3, 14, 1);
  g.generateTexture(TEX_CHEST, 14, 13);
  g.clear();
  g.fillStyle(0x3a2412).fillRect(0, 0, 14, 4).fillRect(0, 5, 14, 8);
  g.fillStyle(0x8a5a2e).fillRect(1, 1, 12, 2).fillRect(1, 9, 12, 3);
  g.fillStyle(0x140c06).fillRect(1, 6, 12, 3);
  g.fillStyle(0xe8c050).fillRect(0, 3, 14, 1);
  g.generateTexture(TEX_CHEST_OPEN, 14, 13);

  // Pedestal under vendor offers.
  g.clear();
  g.fillStyle(0x55555f).fillRect(1, 2, 12, 6);
  g.fillStyle(0x9a9aa6).fillRect(0, 0, 14, 3);
  g.generateTexture(TEX_PEDESTAL, 14, 8);

  g.destroy();
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
