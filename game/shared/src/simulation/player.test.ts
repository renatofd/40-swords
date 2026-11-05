import type { CollisionGrid } from "@core/shared";
import { describe, expect, it } from "vitest";
import { PLAYER_HALF, SWING_LOCK_TICKS, TICK_DT, TILE_SIZE } from "../constants";
import { scaledCooldown, WEAPONS } from "../weapons";
import { facingFromDir, facingVector } from "./facing";
import { type PlayerSimState, type SimWorld, stepPlayer } from "./player";

/** Builds a grid from rows of "." (open) and "#" (solid). */
function gridFrom(rows: string[]): CollisionGrid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return {
    width,
    height,
    tileSize: TILE_SIZE,
    isSolid: (tx, ty) => tx < 0 || ty < 0 || tx >= width || ty >= height || rows[ty]?.[tx] === "#",
  };
}

const open: SimWorld = { grid: gridFrom(["#####", "#...#", "#...#", "#...#", "#####"]), portals: [] };
const centre = TILE_SIZE * 2.5;
const stats = { speed: 90, attackCooldownTicks: 10 };
const idle = { moveX: 0, moveY: 0, attack: 0 };

const fresh = (over: Partial<PlayerSimState> = {}): PlayerSimState => ({
  x: centre,
  y: centre,
  vx: 0,
  vy: 0,
  facing: 2,
  cooldown: 0,
  lock: 0,
  swing: 0,
  knockX: 0,
  knockY: 0,
  knockTicks: 0,
  dead: false,
  speed: stats.speed,
  swingCd: stats.attackCooldownTicks,
  cdPct: 100,
  vseq: 0,
  vmask: 0,
  warp: 0,
  daggerN: 0,
  daggerCd: 0,
  fireballN: 0,
  fireballCd: 0,
  arrowN: 0,
  arrowCd: 0,
  novaN: 0,
  novaCd: 0,
  ...over,
});

describe("stepPlayer", () => {
  it("moves at the class speed in a straight line", () => {
    const p = fresh();
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open);
    expect(p.x).toBeCloseTo(centre + stats.speed * TICK_DT);
    expect(p.y).toBe(centre);
    expect(p.vx).toBeCloseTo(stats.speed);
  });

  it("normalizes diagonal movement", () => {
    const p = fresh();
    stepPlayer(p, { ...idle, moveX: 1, moveY: 1 }, TICK_DT, open);
    expect(Math.hypot(p.x - centre, p.y - centre)).toBeCloseTo(stats.speed * TICK_DT);
  });

  it("faces all 8 directions", () => {
    const seen = new Set<number>();
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1]) {
        if (dx === 0 && dy === 0) continue;
        const p = fresh();
        stepPlayer(p, { ...idle, moveX: dx, moveY: dy }, TICK_DT, open);
        const [fx, fy] = facingVector(p.facing);
        expect(Math.sign(fx)).toBe(dx);
        expect(Math.sign(fy)).toBe(dy);
        seen.add(p.facing);
      }
    expect(seen.size).toBe(8);
    expect(facingFromDir(0, 0)).toBe(-1);
  });

  it("keeps facing when standing still", () => {
    const p = fresh({ facing: 5 });
    stepPlayer(p, idle, TICK_DT, open);
    expect(p.facing).toBe(5);
  });

  it("clamps out-of-range input from a modified client", () => {
    const p = fresh();
    stepPlayer(p, { ...idle, moveX: 100 }, TICK_DT, open);
    expect(p.x).toBeCloseTo(centre + stats.speed * TICK_DT);
  });

  it("stops at walls", () => {
    const p = fresh();
    for (let i = 0; i < 60; i++) stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open);
    expect(p.x).toBeCloseTo(TILE_SIZE * 4 - PLAYER_HALF);
    expect(p.vx).toBe(0);
  });

  it("swings in the direction pressed, roots the player, then waits for the cooldown", () => {
    const p = fresh();
    stepPlayer(p, { moveX: -1, moveY: 0, attack: 1 }, TICK_DT, open);
    expect(p.swing).toBe(1);
    expect(p.facing).toBe(4);
    expect(p.x).toBe(centre); // no step on the swing tick
    expect(p.lock).toBe(SWING_LOCK_TICKS);

    // Rooted while the swing lasts, even when pushing a direction.
    for (let i = 0; i < SWING_LOCK_TICKS; i++) stepPlayer(p, { moveX: 1, moveY: 0, attack: 1 }, TICK_DT, open);
    expect(p.x).toBe(centre);
    expect(p.swing).toBe(1);

    // Holding attack swings again exactly when the cooldown ends.
    let ticks = SWING_LOCK_TICKS;
    while (p.swing === 1) {
      stepPlayer(p, { moveX: 0, moveY: 0, attack: 1 }, TICK_DT, open);
      ticks++;
    }
    expect(ticks).toBe(stats.attackCooldownTicks);
  });

  it("wraps the swing counter", () => {
    const p = fresh({ swing: 255 });
    stepPlayer(p, { ...idle, attack: 1 }, TICK_DT, open);
    expect(p.swing).toBe(0);
  });

  it("knockback overrides input for its duration", () => {
    const p = fresh({ knockX: -150, knockTicks: 2 });
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open);
    expect(p.x).toBeCloseTo(centre - 150 * TICK_DT);
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open);
    expect(p.knockTicks).toBe(0);
    const x = p.x;
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open);
    expect(p.x).toBeCloseTo(x + stats.speed * TICK_DT);
  });

  it("does nothing while dead", () => {
    const p = fresh({ dead: true });
    stepPlayer(p, { moveX: 1, moveY: 1, attack: 1 }, TICK_DT, open);
    expect(p.x).toBe(centre);
    expect(p.swing).toBe(0);
  });

  it("fires every ready weapon with the attack button, each on its own cooldown", () => {
    const p = fresh({ daggerN: 2, novaN: 1, cdPct: 50 });
    stepPlayer(p, { ...idle, attack: 1 }, TICK_DT, open);
    expect(p.vseq).toBe(1);
    expect(p.vmask).toBe(0b1001); // dagger (index 0) and nova (index 3)
    expect(p.daggerCd).toBe(scaledCooldown(WEAPONS.dagger.cooldownTicks, 50));
    expect(p.novaCd).toBe(scaledCooldown(WEAPONS.nova.cooldownTicks, 50));

    // Releasing the button never fires; holding it fires the dagger again first (shorter cooldown).
    for (let i = 0; i < 40; i++) stepPlayer(p, idle, TICK_DT, open);
    expect(p.vseq).toBe(1);
    stepPlayer(p, { ...idle, attack: 1 }, TICK_DT, open);
    expect(p.vseq).toBe(2);
  });

  it("weapons fire during a sword swing and while knocked back, but not when dead", () => {
    const p = fresh({ arrowN: 1, lock: 3 });
    stepPlayer(p, { ...idle, attack: 1 }, TICK_DT, open);
    expect(p.vmask).toBe(0b0100);
    const dead = fresh({ arrowN: 1, dead: true });
    stepPlayer(dead, { ...idle, attack: 1 }, TICK_DT, open);
    expect(dead.vseq).toBe(0);
  });

  it("walking into a portal moves the player to its target", () => {
    const world: SimWorld = {
      grid: open.grid,
      portals: [{ x: TILE_SIZE * 3, y: TILE_SIZE * 2, width: TILE_SIZE, height: TILE_SIZE, toX: 100, toY: 200 }],
    };
    const p = fresh();
    for (let i = 0; i < 30 && p.warp === 0; i++) stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, world);
    expect(p.warp).toBe(1);
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
  });

  it("is deterministic: same inputs, same result", () => {
    const run = () => {
      const p = fresh();
      for (let i = 0; i < 90; i++)
        stepPlayer(p, { moveX: (i % 3) - 1, moveY: ((i >> 2) % 3) - 1, attack: i % 7 === 0 ? 1 : 0 }, TICK_DT, open);
      return p;
    };
    expect(run()).toEqual(run());
  });
});
