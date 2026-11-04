import type { CollisionGrid } from "@core/shared";
import { type EnemyShotMessage, projectileKey, travelDistance, volleyAngles, WEAPON_IDS, WEAPONS } from "@game/shared";
import type Phaser from "phaser";
import { hostileTexture, projectileTexture } from "./placeholderArt";

interface Flying {
  sprite: Phaser.GameObjects.Image;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  speed: number;
  maxDist: number;
  born: number;
}

/** What one volley needs to be drawn: the same data the server spawned it from. */
export interface VolleyView {
  owner: string;
  volley: number;
  mask: number;
  x: number;
  y: number;
  facing: number;
  /** Projectiles per weapon, indexed like WEAPON_IDS. */
  counts: readonly number[];
}

/**
 * Projectiles of heroes' weapons and of enemies, drawn only (the server decides hits). Each flies in a
 * straight line from its volley and stops at the wall or range the shared
 * `travelDistance` gives, so it matches the server's flight; the server tells
 * when one stops early on an enemy (`end`).
 */
export class Projectiles {
  private flying = new Map<string, Flying>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: CollisionGrid,
  ) {}

  spawnVolley(v: VolleyView, now: number) {
    WEAPON_IDS.forEach((weapon, w) => {
      if ((v.mask & (1 << w)) === 0) return;
      const { speed, range } = WEAPONS[weapon];
      volleyAngles(weapon, v.counts[w] ?? 0, v.facing).forEach((angle, i) => {
        this.spawn(
          projectileKey(v.owner, v.volley, w, i),
          projectileTexture(weapon),
          v.x,
          v.y,
          angle,
          speed,
          range,
          now,
        );
      });
    });
  }

  /** Enemy projectiles: key `${m.key}:${i}` for the i-th angle. */
  spawnHostile(m: EnemyShotMessage, now: number) {
    m.angles.forEach((angle, i) => {
      this.spawn(`${m.key}:${i}`, hostileTexture(m.style), m.x, m.y, angle, m.speed, m.range, now);
    });
  }

  private spawn(
    key: string,
    texture: string,
    x: number,
    y: number,
    angle: number,
    speed: number,
    range: number,
    now: number,
  ) {
    if (this.flying.has(key)) return;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const sprite = this.scene.add.image(x, y, texture).setRotation(angle).setDepth(12);
    const maxDist = travelDistance(this.grid, x, y, dx, dy, range);
    this.flying.set(key, { sprite, x0: x, y0: y, dx, dy, speed, maxDist, born: now });
  }

  end(key: string) {
    this.flying.get(key)?.sprite.destroy();
    this.flying.delete(key);
  }

  update(now: number) {
    for (const [key, p] of this.flying) {
      const d = (p.speed * (now - p.born)) / 1000;
      if (d >= p.maxDist) {
        this.end(key);
        continue;
      }
      p.sprite.setPosition(p.x0 + p.dx * d, p.y0 + p.dy * d);
    }
  }

  destroy() {
    for (const p of this.flying.values()) p.sprite.destroy();
    this.flying.clear();
  }
}
