import { animKey } from "@core/client";
import type { CollisionGrid } from "@core/shared";
import { type EnemyShotMessage, projectileKey, travelDistance, volleyAngles, WEAPON_IDS, WEAPONS } from "@game/shared";
import type Phaser from "phaser";
import { DEPTH } from "./depth";
import { playFx } from "./fx";

/**
 * How a shot sheet is drawn: its looping tag (if it animates), the turn that
 * points its art along the flight (`null`: round or spinning, never turned)
 * and the effect where it stops.
 */
interface ShotLook {
  loop?: string;
  /** Added to the flight angle (radians); null keeps it upright. */
  turn: number | null;
  impact: string;
}

const SHOT_LOOKS: Readonly<Record<string, ShotLook>> = {
  // The knife is drawn diagonally, tip up-right (−45°).
  "shot-dagger": { turn: Math.PI / 4, impact: "fx-spark" },
  "shot-fireball": { loop: "loop", turn: null, impact: "fx-explosion-small" },
  "shot-arrow": { turn: 0, impact: "fx-spark" },
  "shot-nova": { turn: 0, impact: "fx-explosion-small-blue" },
  "hostile-bone": { loop: "spin", turn: null, impact: "fx-smoke-small" },
  "hostile-rock": { loop: "spin", turn: null, impact: "fx-smoke-small" },
  "hostile-orb": { loop: "loop", turn: null, impact: "fx-explosion-small-pink" },
  "hostile-sting": { loop: "loop", turn: null, impact: "fx-smoke-small" },
};
const DEFAULT_LOOK: ShotLook = { turn: 0, impact: "fx-smoke-small" };

/**
 * Turns are drawn in 45° steps: nearest-neighbour rotation by a few degrees
 * (the spread of a volley) breaks the pixel art, while quarter and eighth
 * turns stay clean. Only the drawing snaps; the flight keeps its exact angle.
 */
const EIGHTH = Math.PI / 4;
export const snapTurn = (angle: number): number => Math.round(angle / EIGHTH) * EIGHTH;

interface Flying {
  sprite: Phaser.GameObjects.Sprite;
  look: ShotLook;
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
 * when one stops early on an enemy (`end`). Sheets: `shot-<weapon>` and
 * `hostile-<style>` (tools/art); each leaves a small effect where it stops.
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
        this.spawn(projectileKey(v.owner, v.volley, w, i), `shot-${weapon}`, v.x, v.y, angle, speed, range, now);
      });
    });
  }

  /** Enemy projectiles: key `${m.key}:${i}` for the i-th angle. */
  spawnHostile(m: EnemyShotMessage, now: number) {
    m.angles.forEach((angle, i) => {
      this.spawn(`${m.key}:${i}`, `hostile-${m.style}`, m.x, m.y, angle, m.speed, m.range, now);
    });
  }

  private spawn(
    key: string,
    sheet: string,
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
    const look = SHOT_LOOKS[sheet] ?? DEFAULT_LOOK;
    const sprite = this.scene.add.sprite(Math.round(x), Math.round(y), sheet).setDepth(DEPTH.shots);
    if (look.turn !== null) sprite.setRotation(snapTurn(angle + look.turn));
    const loop = animKey(sheet, look.loop ?? "idle");
    if (this.scene.anims.exists(loop)) sprite.play({ key: loop, startFrame: look.loop ? (Math.random() * 4) | 0 : 0 });
    const maxDist = travelDistance(this.grid, x, y, dx, dy, range);
    this.flying.set(key, { sprite, look, x0: x, y0: y, dx, dy, speed, maxDist, born: now });
  }

  /** Stops a projectile where it is drawn, with its impact effect (it hit something, a wall, or its range). */
  end(key: string) {
    const p = this.flying.get(key);
    if (!p) return;
    const { sprite } = p;
    if (this.scene.cameras.main.worldView.contains(sprite.x, sprite.y))
      playFx(this.scene, p.look.impact, sprite.x, sprite.y, { depth: DEPTH.shots });
    sprite.destroy();
    this.flying.delete(key);
  }

  update(now: number) {
    for (const [key, p] of this.flying) {
      const d = (p.speed * (now - p.born)) / 1000;
      if (d >= p.maxDist) {
        // At the very end of its flight, where the server stopped it.
        p.sprite.setPosition(Math.round(p.x0 + p.dx * p.maxDist), Math.round(p.y0 + p.dy * p.maxDist));
        this.end(key);
        continue;
      }
      p.sprite.setPosition(Math.round(p.x0 + p.dx * d), Math.round(p.y0 + p.dy * d));
    }
  }

  destroy() {
    for (const p of this.flying.values()) p.sprite.destroy();
    this.flying.clear();
  }
}
