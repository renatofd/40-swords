import { animKey } from "@core/client";
import Phaser from "phaser";
import { artFor, enemyTexture, TEX_ELITE_GLOW, TEX_SHADOW } from "./placeholderArt";

/**
 * Visual for one enemy: sprite, hurt flash and a small HP bar once damaged.
 * Elites are bigger with a golden glow; bosses show their HP in the HUD instead.
 */
export class EnemyView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Sprite;
  private bar: Phaser.GameObjects.Graphics;
  private barY: number;

  constructor(
    scene: Phaser.Scene,
    kind: string,
    elite: boolean,
    private readonly boss: boolean,
  ) {
    const art = artFor(scene, kind, enemyTexture(kind));
    this.body = scene.add.sprite(0, 0, art.texture);
    if (art.animated) this.body.play(animKey(art.texture, "idle"));
    const feet = this.body.height / 2;
    const shadow = scene.add.image(0, feet - 1, TEX_SHADOW).setScale(Math.max(1, this.body.width / 12));
    const parts: Phaser.GameObjects.GameObject[] = [shadow];
    if (elite) {
      parts.push(scene.add.image(0, feet - 1, TEX_ELITE_GLOW));
      this.body.setScale(1.3);
    }
    this.bar = scene.add.graphics();
    this.barY = -(this.body.displayHeight / 2) - 4;
    parts.push(this.body, this.bar);
    this.container = scene.add.container(0, 0, parts).setDepth(9);
  }

  update(x: number, y: number, hp: number, maxHp: number, hurt: number, time: number) {
    this.container.setPosition(Math.round(x), Math.round(y));
    this.body.y = Math.round(Math.sin(time / 180 + x) * 0.8);
    if (hurt > 0) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.bar.clear();
    if (hp < maxHp && !this.boss) {
      const w = 12;
      this.bar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, this.barY, w + 2, 3);
      this.bar.fillStyle(0xe04040).fillRect(-w / 2, this.barY + 1, Math.max(0, (hp / maxHp) * w), 1);
    }
  }

  destroy() {
    this.container.destroy();
  }
}
