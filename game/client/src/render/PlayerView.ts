import { animKey } from "@core/client";
import { facingVector } from "@game/shared";
import type Phaser from "phaser";
import { artFor, heroTexture, TEX_FACING, TEX_SHADOW, TEX_SWING } from "./placeholderArt";

/** Below this distance (px per frame) the player counts as standing still. */
const MOVING_EPSILON = 0.05;

export interface PlayerLook {
  facing: number;
  dead: boolean;
  /** Invulnerability ticks left: the sprite blinks while > 0. */
  invuln: number;
}

/** Visual for one player (the name tag is DOM, see WorldLabels). Holds no game state: it only draws what it is given. */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Sprite;
  private marker: Phaser.GameObjects.Image;
  private swing: Phaser.GameObjects.Image;
  private animated: boolean;
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(
    private readonly scene: Phaser.Scene,
    classId: string,
    isSelf: boolean,
  ) {
    const art = artFor(scene, classId, heroTexture(classId));
    this.animated = art.animated;
    const shadow = scene.add.image(0, 7, TEX_SHADOW);
    this.body = scene.add.sprite(0, 0, art.texture);
    if (this.animated) this.body.play(animKey(art.texture, "idle"));
    this.marker = scene.add.image(0, 0, TEX_FACING);
    this.swing = scene.add.image(0, 0, TEX_SWING).setVisible(false).setOrigin(0.2, 0.5);
    this.container = scene.add.container(0, 0, [shadow, this.body, this.marker, this.swing]).setDepth(isSelf ? 11 : 10);
  }

  /** Moves the view; picks the animation from how far it moved since the last frame. */
  update(x: number, y: number, look: PlayerLook, time: number) {
    const moving =
      !Number.isNaN(this.lastX) &&
      (Math.abs(x - this.lastX) > MOVING_EPSILON || Math.abs(y - this.lastY) > MOVING_EPSILON);
    if (this.animated) this.body.play(animKey(this.body.texture.key, moving ? "walk" : "idle"), true);
    else this.body.y = moving ? Math.round(Math.sin(time / 60)) * -1 : 0; // placeholder walk bob
    this.lastX = x;
    this.lastY = y;
    this.container.setPosition(Math.round(x), Math.round(y));

    const [fx, fy] = facingVector(look.facing);
    this.marker.setPosition(fx * 10, fy * 10 + 1).setRotation(Math.atan2(fy, fx));
    this.body.setFlipX(fx < -0.1);
    this.body.setAlpha(look.dead ? 0.35 : look.invuln > 0 && Math.floor(time / 70) % 2 === 0 ? 0.3 : 1);
    this.body.setAngle(look.dead ? 90 : 0);
    this.marker.setVisible(!look.dead);
  }

  /** Shows the sword arc in the given facing. */
  playSwing(facing: number, reach: number) {
    const [fx, fy] = facingVector(facing);
    this.swing
      .setVisible(true)
      .setAlpha(1)
      .setPosition(fx * 2, fy * 2)
      .setRotation(Math.atan2(fy, fx) - 0.6)
      .setScale(reach / 18);
    this.scene.tweens.killTweensOf(this.swing);
    this.scene.tweens.add({
      targets: this.swing,
      rotation: Math.atan2(fy, fx) + 0.6,
      alpha: 0,
      duration: 150,
      onComplete: () => this.swing.setVisible(false),
    });
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.swing);
    this.container.destroy();
  }
}
