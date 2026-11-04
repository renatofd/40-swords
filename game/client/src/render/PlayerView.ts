import { animKey } from "@core/client";
import type Phaser from "phaser";

/** System fonts so names in any script (Arabic, Devanagari, CJK...) render. */
const LABEL_FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif';
/** Below this speed (px per frame) the player counts as standing still. */
const MOVING_EPSILON = 0.05;

/** Visual for one player. Holds no game state: it only draws positions it is given. */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(
    scene: Phaser.Scene,
    private readonly spriteKey: string,
    name: string,
    tint: number,
    isSelf: boolean,
  ) {
    this.sprite = scene.add.sprite(0, 0, spriteKey).setTint(tint);
    this.sprite.play(animKey(spriteKey, "idle"));
    const label = scene.add
      .text(0, -11, name, { fontFamily: LABEL_FONT, fontSize: "10px", color: isSelf ? "#fff7a8" : "#ffffff" })
      .setOrigin(0.5, 1)
      .setStroke("#000000", 2);
    this.container = scene.add.container(0, 0, [this.sprite, label]).setDepth(isSelf ? 11 : 10);
  }

  /** Moves the view and picks the animation from how far it moved since the last frame. */
  setPosition(x: number, y: number) {
    if (!Number.isNaN(this.lastX)) {
      const dx = x - this.lastX;
      const moving = Math.abs(dx) > MOVING_EPSILON || Math.abs(y - this.lastY) > MOVING_EPSILON;
      this.sprite.play(animKey(this.spriteKey, moving ? "walk" : "idle"), true);
      if (Math.abs(dx) > MOVING_EPSILON) this.sprite.setFlipX(dx < 0);
    }
    this.lastX = x;
    this.lastY = y;
    this.container.setPosition(x, y);
  }

  destroy() {
    this.container.destroy();
  }
}
