import type { CollisionGrid } from "@core/shared";
import { projectileKey, travelDistance, volleyAngles, WEAPON_IDS, WEAPONS, type WeaponId } from "@game/shared";
import type Phaser from "phaser";
import { projectileTexture } from "./placeholderArt";

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
 * Weapon projectiles, drawn only (the server decides hits). Each flies in a
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
      volleyAngles(weapon, v.counts[w] ?? 0, v.facing).forEach((angle, i) => {
        this.spawn(projectileKey(v.owner, v.volley, w, i), weapon, v.x, v.y, angle, now);
      });
    });
  }

  private spawn(key: string, weapon: WeaponId, x: number, y: number, angle: number, now: number) {
    if (this.flying.has(key)) return;
    const def = WEAPONS[weapon];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const sprite = this.scene.add.image(x, y, projectileTexture(weapon)).setRotation(angle).setDepth(12);
    const maxDist = travelDistance(this.grid, x, y, dx, dy, def.range);
    this.flying.set(key, { sprite, x0: x, y0: y, dx, dy, speed: def.speed, maxDist, born: now });
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
