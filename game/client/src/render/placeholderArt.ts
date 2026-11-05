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
export const TEX_CHEST = "prop:chest";
export const TEX_CHEST_OPEN = "prop:chest-open";
export const TEX_MERCHANT = "npc:merchant";
export const TEX_PEDESTAL = "prop:pedestal";
export const projectileTexture = (weapon: string) => `shot:${weapon}`;
export const hostileTexture = (style: string) => `hostile:${style}`;
export const TEX_ELITE_GLOW = "fx:elite";
export const rupeeTexture = (value: number) => (value >= 5 ? "pickup:rupee-blue" : "pickup:rupee-green");
export const TEX_HEART = "pickup:heart";

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

  // ─── More enemies (original designs) ───────────────────────────────────
  // Bat: spread wings, small body, yellow eyes.
  g.clear();
  g.fillStyle(0x4a3270).fillTriangle(0, 3, 7, 6, 3, 9).fillTriangle(15, 3, 8, 6, 12, 9);
  g.fillStyle(0x8a6ad0).fillEllipse(7.5, 7, 6, 7);
  g.fillStyle(0xffe040).fillRect(6, 6, 1, 1).fillRect(8, 6, 1, 1);
  g.generateTexture("enemy:bat", 15, 12);

  // Skeleton: skull, ribs, thin limbs.
  g.clear();
  g.fillStyle(0xe8e4d0).fillCircle(7, 4, 3.5).fillRect(6, 8, 3, 1).fillRect(5, 10, 5, 1).fillRect(6, 12, 3, 1);
  g.fillRect(7, 7, 1, 8).fillRect(3, 9, 2, 1).fillRect(10, 9, 2, 1).fillRect(5, 14, 1, 2).fillRect(9, 14, 1, 2);
  g.fillStyle(0x221a14).fillRect(5, 3, 2, 2).fillRect(8, 3, 2, 2);
  g.generateTexture("enemy:skeleton", 14, 16);

  // Scorpion: body, pincers and a tail curling up.
  g.clear();
  g.fillStyle(0x8a4a18).fillEllipse(8, 10, 10, 6);
  g.fillStyle(0xd08a30).fillEllipse(8, 9.5, 8, 4).fillCircle(2, 8, 2).fillCircle(14, 8, 2);
  g.fillRect(11, 3, 2, 6).fillRect(9, 2, 4, 2);
  g.fillStyle(0xffd0a0).fillTriangle(8, 2, 9, 0, 10, 2);
  g.generateTexture("enemy:scorpion", 16, 13);

  // Wolf: grey four-legged hunter.
  g.clear();
  g.fillStyle(0x5a5a66).fillRect(2, 12, 2, 3).fillRect(11, 12, 2, 3);
  g.fillStyle(0x8a8a96).fillEllipse(8, 9, 12, 6).fillCircle(13, 6, 3).fillTriangle(12, 2, 14, 2, 13, 5);
  g.fillStyle(0xd8d8e0).fillRect(14, 7, 2, 1);
  g.fillStyle(0xffd040).fillRect(13, 5, 1, 1);
  g.generateTexture("enemy:wolf", 16, 15);

  // Lurker: a squat swamp hopper with big eyes.
  g.clear();
  g.fillStyle(0x2f7a6a).fillEllipse(7, 10, 14, 7);
  g.fillStyle(0x4ab09a).fillEllipse(7, 9, 11, 5);
  g.fillStyle(0xffffff).fillCircle(4, 5, 2).fillCircle(10, 5, 2);
  g.fillStyle(0x101010).fillRect(4, 5, 1, 1).fillRect(10, 5, 1, 1);
  g.generateTexture("enemy:lurker", 14, 14);

  // Brute (mini-boss): hulking brawler with a club.
  g.clear();
  g.fillStyle(0x5a3a28).fillRoundedRect(4, 8, 16, 14, 4);
  g.fillStyle(0x9a6a4a).fillRoundedRect(5, 9, 14, 12, 3).fillCircle(12, 6, 5);
  g.fillStyle(0x3a2412).fillRect(20, 2, 3, 16);
  g.fillStyle(0x6b4523).fillRoundedRect(19, 0, 5, 7, 2);
  g.fillStyle(0xff4030).fillRect(10, 5, 1, 1).fillRect(13, 5, 1, 1);
  g.generateTexture("enemy:brute", 24, 22);

  // Hexer (mini-boss): hooded caster with a glowing staff.
  g.clear();
  g.fillStyle(0x3a2a6a).fillTriangle(2, 20, 16, 20, 9, 2);
  g.fillStyle(0x6a4ab0).fillTriangle(4, 20, 14, 20, 9, 5);
  g.fillStyle(0x101018).fillCircle(9, 8, 2.5);
  g.fillStyle(0xd080ff).fillRect(7, 8, 1, 1).fillRect(10, 8, 1, 1);
  g.fillStyle(0x6b4523).fillRect(17, 4, 2, 16);
  g.fillStyle(0xd080ff).fillCircle(18, 3, 3);
  g.generateTexture("enemy:hexer", 22, 21);

  // Bone Warden (boss): armoured giant skeleton with a tower shield.
  g.clear();
  g.fillStyle(0x6e6a7c).fillRoundedRect(8, 12, 18, 18, 3);
  g.fillStyle(0xd8d0b8).fillCircle(17, 8, 6).fillRect(15, 14, 4, 14);
  g.fillRect(10, 16, 14, 2).fillRect(10, 20, 14, 2).fillRect(10, 24, 14, 2);
  g.fillStyle(0x221a14).fillRect(14, 7, 2, 3).fillRect(18, 7, 2, 3);
  g.fillStyle(0x8a7a40).fillRect(11, 2, 12, 2).fillTriangle(11, 2, 13, 2, 12, -2);
  g.fillStyle(0x4a4558).fillRoundedRect(0, 12, 8, 16, 2);
  g.fillStyle(0xc0b070).fillRect(3, 15, 2, 10);
  g.generateTexture("enemy:warden", 28, 32);

  // Bog Witch (boss): wide hat, cloak of moss, cauldron-green glow.
  g.clear();
  g.fillStyle(0x2a3a1e).fillTriangle(4, 30, 24, 30, 14, 10);
  g.fillStyle(0x58a04a).fillCircle(14, 12, 4);
  g.fillStyle(0x1a2412).fillEllipse(14, 8, 22, 4).fillTriangle(9, 8, 19, 8, 16, -1);
  g.fillStyle(0xd0ff60).fillRect(12, 12, 1, 1).fillRect(15, 12, 1, 1);
  g.fillStyle(0x80d060, 0.8).fillCircle(4, 22, 3).fillCircle(24, 20, 2.5);
  g.generateTexture("enemy:witch", 28, 31);

  // Sand Matriarch (boss): a crowned giant scorpion.
  g.clear();
  g.fillStyle(0x7a3a10).fillEllipse(16, 22, 26, 14);
  g.fillStyle(0xc07a28).fillEllipse(16, 21, 22, 10).fillCircle(3, 17, 4).fillCircle(29, 17, 4);
  g.fillRect(22, 6, 4, 12).fillRect(17, 3, 9, 4);
  g.fillStyle(0xffe0a0).fillTriangle(15, 4, 17, 0, 18, 5);
  g.fillStyle(0xffd040)
    .fillTriangle(10, 14, 12, 10, 14, 14)
    .fillTriangle(14, 14, 16, 9, 18, 14)
    .fillTriangle(18, 14, 20, 10, 22, 14);
  g.generateTexture("enemy:matriarch", 32, 29);

  // Stone Colossus (boss): stacked blocks around a glowing core.
  g.clear();
  g.fillStyle(0x5a5246).fillRect(6, 10, 20, 18).fillRect(0, 12, 6, 12).fillRect(26, 12, 6, 12);
  g.fillStyle(0x8a8070).fillRect(7, 11, 18, 16).fillRect(1, 13, 4, 10).fillRect(27, 13, 4, 10).fillRect(10, 1, 12, 9);
  g.fillStyle(0x4a4238).fillRect(8, 28, 6, 4).fillRect(18, 28, 6, 4);
  g.fillStyle(0x40e0ff).fillCircle(16, 18, 3).fillRect(13, 5, 2, 2).fillRect(18, 5, 2, 2);
  g.generateTexture("enemy:colossus", 32, 32);

  // Enemy projectiles.
  g.clear();
  g.fillStyle(0xe8e4d0)
    .fillRect(1, 1, 6, 2)
    .fillCircle(1, 1, 1.2)
    .fillCircle(1, 3, 1.2)
    .fillCircle(7, 1, 1.2)
    .fillCircle(7, 3, 1.2);
  g.generateTexture(hostileTexture("bone"), 9, 5);
  g.clear();
  g.fillStyle(0x5a5246).fillCircle(4, 4, 4);
  g.fillStyle(0x8a8070).fillCircle(3, 3, 2);
  g.generateTexture(hostileTexture("rock"), 8, 8);
  g.clear();
  g.fillStyle(0xb060ff, 0.5).fillCircle(4, 4, 4);
  g.fillStyle(0xe0b0ff).fillCircle(4, 4, 2);
  g.generateTexture(hostileTexture("orb"), 8, 8);
  g.clear();
  g.fillStyle(0xd08a30).fillTriangle(0, 0, 9, 2, 0, 4);
  g.fillStyle(0xffe0a0).fillRect(6, 1, 3, 2);
  g.generateTexture(hostileTexture("sting"), 9, 4);

  // Golden glow under elites.
  g.clear();
  g.fillStyle(0xffd040, 0.35).fillEllipse(10, 5, 20, 10);
  g.lineStyle(1, 0xffe080, 0.9).strokeEllipse(10, 5, 18, 8);
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

  // Merchant: a hooded traveller with a huge pack and a lantern.
  g.clear();
  g.fillStyle(0x5a3a1e).fillRoundedRect(8, 2, 8, 11, 2); // pack
  g.fillStyle(0x3c2a5a).fillRoundedRect(2, 6, 10, 10, 3); // robe
  g.fillStyle(0x2a1d40).fillTriangle(2, 8, 12, 8, 7, 0); // hood
  g.fillStyle(0xe8c9a0).fillCircle(7, 6, 2.5);
  g.fillStyle(0x221a14).fillRect(6, 6, 1, 1).fillRect(8, 6, 1, 1);
  g.fillStyle(0xffd860).fillCircle(2, 12, 2); // lantern
  g.generateTexture(TEX_MERCHANT, 17, 16);

  // Pedestal under vendor offers.
  g.clear();
  g.fillStyle(0x55555f).fillRect(1, 2, 12, 6);
  g.fillStyle(0x9a9aa6).fillRect(0, 0, 14, 3);
  g.generateTexture(TEX_PEDESTAL, 14, 8);

  // Weapon projectiles, pointing east (rotated at runtime).
  g.clear();
  g.fillStyle(0xd8dce8).fillTriangle(2, 0, 9, 2, 2, 4);
  g.fillStyle(0x6b4523).fillRect(0, 1, 3, 2);
  g.generateTexture(projectileTexture("dagger"), 9, 4);
  g.clear();
  g.fillStyle(0xff6a1a, 0.6).fillCircle(5, 5, 5);
  g.fillStyle(0xffb030).fillCircle(5, 5, 3.5);
  g.fillStyle(0xfff0a0).fillCircle(5, 5, 1.8);
  g.generateTexture(projectileTexture("fireball"), 10, 10);
  g.clear();
  g.fillStyle(0x8a5a2e).fillRect(0, 1, 9, 1);
  g.fillStyle(0xd0d4e0).fillTriangle(8, 0, 11, 1.5, 8, 3);
  g.fillStyle(0xf0f0f0).fillRect(0, 0, 2, 1).fillRect(0, 2, 2, 1);
  g.generateTexture(projectileTexture("arrow"), 11, 3);
  g.clear();
  g.fillStyle(0x9fe8ff).fillTriangle(0, 2.5, 3, 0, 3, 5).fillTriangle(6, 2.5, 3, 0, 3, 5);
  g.fillStyle(0xffffff).fillRect(2, 2, 2, 1);
  g.generateTexture(projectileTexture("nova"), 6, 5);

  g.destroy();
}

/** Texture key (and whether it is an animated sprite) for a hero class or enemy kind. */
export function artFor(scene: Phaser.Scene, key: string, fallback: string): { texture: string; animated: boolean } {
  const animated = scene.textures.exists(key) && scene.anims.exists(animKey(key, "idle"));
  return { texture: animated ? key : fallback, animated };
}

export const heroTexture = (classId: string) => `hero:${classId}`;
export const enemyTexture = (kind: string) => `enemy:${kind}`;
