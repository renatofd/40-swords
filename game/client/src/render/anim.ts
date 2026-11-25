/**
 * Helpers for the sprites made by tools/art (content/sprites): which sheet row
 * a facing uses, playing tags without restarting them, and where a sprite's
 * feet are (spriteAnchors.json, written by the same tool).
 */
import { animKey } from "@core/client";
import type Phaser from "phaser";
import ANCHORS from "./spriteAnchors.json";

/** Sheet rows of directional tags (`walk-up`, `walk-right`...). */
export type Dir = "up" | "right" | "down" | "left";

/**
 * Row and mirroring for an 8-way facing (0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE):
 * N → up, S → down, the diagonals take the side view. West uses the right row
 * mirrored, unless the sprite has a redrawn left row (`hasLeft`).
 */
export function facingDir(facing: number, hasLeft = false): { dir: Dir; flipX: boolean } {
  const f = ((Math.round(facing) % 8) + 8) % 8;
  if (f === 6) return { dir: "up", flipX: false };
  if (f === 2) return { dir: "down", flipX: false };
  if (f >= 3 && f <= 5) return hasLeft ? { dir: "left", flipX: false } : { dir: "right", flipX: true };
  return { dir: "right", flipX: false };
}

/**
 * Animation key of `<anim>-<dir>` for a facing, and whether to mirror it; falls
 * back to the plain `<anim>` tag for sprites without directions.
 */
export function directionalAnim(
  scene: Phaser.Scene,
  key: string,
  anim: string,
  facing: number,
): { anim: string; flipX: boolean } {
  const { dir, flipX } = facingDir(facing, scene.anims.exists(animKey(key, `${anim}-left`)));
  const directional = animKey(key, `${anim}-${dir}`);
  return scene.anims.exists(directional) ? { anim: directional, flipX } : { anim: animKey(key, anim), flipX };
}

/**
 * Plays an animation unless it is already the current one and still running
 * (a finished one-shot starts again). Missing animations are ignored.
 */
export function playAnim(sprite: Phaser.GameObjects.Sprite, anim: string): void {
  const current = sprite.anims.currentAnim;
  if (current?.key === anim && sprite.anims.isPlaying) return;
  if (sprite.scene.anims.exists(anim)) sprite.play(anim);
}

/** Frame size and anchor pixel of a sprite (feet point; overlay attach point; centre of effects and shots). */
export interface SpriteAnchor {
  w: number;
  h: number;
  x: number;
  y: number;
}

const anchors: Readonly<Record<string, SpriteAnchor>> = ANCHORS;

export const spriteAnchor = (key: string): SpriteAnchor | undefined => anchors[key];

/**
 * Origin that puts a character's feet on the bottom of its collision box:
 * the body is centred on x and its feet line lands on y + half (whole pixels,
 * so the art stays crisp). Effects and shots get their centre.
 */
export function feetOrigin(key: string, half: number): [number, number] {
  const a = anchors[key];
  if (!a) return [0.5, 0.5];
  if (/^(fx|shot|hostile)-/.test(key)) return [a.x / a.w, a.y / a.h];
  return [a.x / a.w, (a.y - half) / a.h];
}

/**
 * Mirrors a sprite around its anchor. Phaser's flipX mirrors the art inside
 * its own frame rectangle, not around the origin, so a sheet whose anchor is
 * not the frame's middle column would jump sideways: the origin mirrors with
 * it (`originX` is the unflipped one, from feetOrigin).
 */
export function setFlipAnchored(sprite: Phaser.GameObjects.Sprite, flip: boolean, originX: number): void {
  sprite.setFlipX(flip).setOrigin(flip ? 1 - originX : originX, sprite.originY);
}
