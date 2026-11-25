/**
 * One-shot effects from tools/art (`fx-*` sheets with a `play` tag): the sprite
 * plays once where it is put and removes itself.
 */
import { animKey } from "@core/client";
import Phaser from "phaser";
import { DEPTH } from "./depth";

export interface FxOptions {
  depth?: number;
  flipX?: boolean;
  /** Frame of the tag to start from (skips a lead-in). */
  startFrame?: number;
  /** Tag to play (default `play`). */
  tag?: string;
  /** Waits this long before showing it (ms). */
  delay?: number;
}

/** Plays effect `key` once at (x, y) (whole pixels) and returns it; nothing if the sheet is missing. */
export function playFx(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  options: FxOptions = {},
): Phaser.GameObjects.Sprite | undefined {
  const anim = animKey(key, options.tag ?? "play");
  if (!scene.anims.exists(anim)) return undefined;
  const sprite = scene.add
    .sprite(Math.round(x), Math.round(y), key)
    .setDepth(options.depth ?? DEPTH.fx)
    .setFlipX(options.flipX ?? false);
  sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  if (options.delay) {
    sprite.setVisible(false);
    scene.time.delayedCall(options.delay, () => {
      if (!sprite.active) return;
      sprite.setVisible(true).play({ key: anim, startFrame: options.startFrame ?? 0 });
    });
  } else sprite.play({ key: anim, startFrame: options.startFrame ?? 0 });
  return sprite;
}
