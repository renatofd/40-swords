import { animKey } from "@core/client";
import Phaser from "phaser";
import { artFor, enemyTexture, TEX_SHADOW } from "./placeholderArt";

/** Visual for one enemy: sprite, hurt flash and a small HP bar once damaged. */
export class EnemyView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Sprite;
  private bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, kind: string) {
    const art = artFor(scene, kind, enemyTexture(kind));
    const shadow = scene.add.image(0, 7, TEX_SHADOW);
    this.body = scene.add.sprite(0, 0, art.texture);
    if (art.animated) this.body.play(animKey(art.texture, "idle"));
    this.bar = scene.add.graphics();
    this.container = scene.add.container(0, 0, [shadow, this.body, this.bar]).setDepth(9);
  }

  update(x: number, y: number, hp: number, maxHp: number, hurt: number, time: number) {
    this.container.setPosition(Math.round(x), Math.round(y));
    this.body.y = Math.round(Math.sin(time / 180 + x) * 0.8);
    if (hurt > 0) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.bar.clear();
    if (hp < maxHp) {
      const w = 12;
      this.bar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, -11, w + 2, 3);
      this.bar.fillStyle(0xe04040).fillRect(-w / 2, -10, Math.max(0, (hp / maxHp) * w), 1);
    }
  }

  destroy() {
    this.container.destroy();
  }
}
