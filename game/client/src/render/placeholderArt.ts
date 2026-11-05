/**
 * PLACEHOLDER ART drawn in code (shapes and colours), generated once as textures.
 *
 * To use real art, drop an Aseprite export in content/sprites/ with the same
 * name as a key below (e.g. content/sprites/knight.png + knight.json, with
 * tags "idle" and "walk"): `artFor` then returns the sprite instead.
 */
import { animKey } from "@core/client";
import { CLASS_IDS, CLASSES, ENEMIES } from "@game/shared";
import Phaser from "phaser";

export const TEX_SWING = "fx:swing";
export const TEX_FACING = "fx:facing";
export const TEX_SHADOW = "fx:shadow";
export const rupeeTexture = (value: number) => (value >= 5 ? "pickup:rupee-blue" : "pickup:rupee-green");

const darken = (color: number, f: number) => {
  const r = ((color >> 16) & 0xff) * f;
  const g = ((color >> 8) & 0xff) * f;
  const b = (color & 0xff) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

/** Creates every placeholder texture. Call once (textures survive scene restarts). */
export function createPlaceholderArt(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX_SWING)) return;
  const g = scene.make.graphics({}, false);

  // Heroes: a body in the class colour, a head and a class mark.
  for (const id of CLASS_IDS) {
    const color = CLASSES[id].color;
    g.clear();
    g.fillStyle(darken(color, 0.45)).fillRoundedRect(1, 5, 12, 10, 3);
    g.fillStyle(color).fillRoundedRect(2, 6, 10, 8, 2);
    g.fillStyle(0xf2c9a0).fillCircle(7, 4.5, 3.5);
    g.fillStyle(0x221a14).fillRect(5, 4, 1, 1).fillRect(8, 4, 1, 1);
    if (id === "knight") g.fillStyle(0xd0d4e0).fillRect(3, 0, 8, 2); // helmet
    if (id === "rogue") g.fillStyle(0x2c2c3c).fillTriangle(2, 3, 12, 3, 7, -1); // hood
    if (id === "barbarian") g.fillStyle(0xe8e0c8).fillTriangle(2, 2, 4, 2, 2, -1).fillTriangle(10, 2, 12, 2, 12, -1); // horns
    g.generateTexture(`hero:${id}`, 14, 16);
  }

  // Slime: a wobbly green blob.
  g.clear();
  const slime = ENEMIES.slime.color;
  g.fillStyle(darken(slime, 0.5)).fillEllipse(7, 9, 14, 10);
  g.fillStyle(slime).fillEllipse(7, 8.5, 12, 8);
  g.fillStyle(0xffffff).fillRect(4, 7, 2, 2).fillRect(8, 7, 2, 2);
  g.fillStyle(0x101010).fillRect(5, 8, 1, 1).fillRect(9, 8, 1, 1);
  g.generateTexture("enemy:slime", 14, 14);

  // Goblin: red body, pointy ears.
  g.clear();
  const goblin = ENEMIES.goblin.color;
  g.fillStyle(darken(goblin, 0.5)).fillRoundedRect(2, 6, 10, 9, 2);
  g.fillStyle(goblin).fillRoundedRect(3, 7, 8, 7, 2);
  g.fillStyle(0x8fbf4a).fillCircle(7, 5, 4).fillTriangle(0, 2, 4, 4, 3, 6).fillTriangle(14, 2, 10, 4, 11, 6);
  g.fillStyle(0xffe040).fillRect(5, 4, 1, 2).fillRect(8, 4, 1, 2);
  g.generateTexture("enemy:goblin", 14, 16);

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

  // Sword swing: a crescent pointing east (rotated by facing at runtime).
  g.clear();
  g.lineStyle(3, 0xffffff, 0.95).beginPath().arc(4, 16, 13, -1.1, 1.1).strokePath();
  g.lineStyle(1, 0xbfe8ff, 0.8).beginPath().arc(4, 16, 9, -0.9, 0.9).strokePath();
  g.generateTexture(TEX_SWING, 20, 32);

  // Facing marker: a little triangle pointing east.
  g.clear();
  g.fillStyle(0xffffff, 0.85).fillTriangle(0, 0, 4, 2, 0, 4);
  g.generateTexture(TEX_FACING, 4, 4);

  // Shadow under characters.
  g.clear();
  g.fillStyle(0x000000, 0.3).fillEllipse(6, 2, 12, 4);
  g.generateTexture(TEX_SHADOW, 12, 4);

  g.destroy();
}

/** Texture key (and whether it is an animated sprite) for a hero class or enemy kind. */
export function artFor(scene: Phaser.Scene, key: string, fallback: string): { texture: string; animated: boolean } {
  const animated = scene.textures.exists(key) && scene.anims.exists(animKey(key, "idle"));
  return { texture: animated ? key : fallback, animated };
}

export const heroTexture = (classId: string) => `hero:${classId}`;
export const enemyTexture = (kind: string) => `enemy:${kind}`;
