import type { CollisionGrid } from "@core/shared";
import { describe, expect, it } from "vitest";
import { PLAYER_HALF, SWING_LOCK_TICKS, TICK_DT, TILE_SIZE } from "../constants";
import { facingFromDir, facingVector } from "./facing";
import { type PlayerSimState, stepPlayer } from "./player";

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

const open = gridFrom(["#####", "#...#", "#...#", "#...#", "#####"]);
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
  ...over,
});

describe("stepPlayer", () => {
  it("moves at the class speed in a straight line", () => {
    const p = fresh();
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open, stats);
    expect(p.x).toBeCloseTo(centre + stats.speed * TICK_DT);
    expect(p.y).toBe(centre);
    expect(p.vx).toBeCloseTo(stats.speed);
  });

  it("normalizes diagonal movement", () => {
    const p = fresh();
    stepPlayer(p, { ...idle, moveX: 1, moveY: 1 }, TICK_DT, open, stats);
    expect(Math.hypot(p.x - centre, p.y - centre)).toBeCloseTo(stats.speed * TICK_DT);
  });

  it("faces all 8 directions", () => {
    const seen = new Set<number>();
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1]) {
        if (dx === 0 && dy === 0) continue;
        const p = fresh();
        stepPlayer(p, { ...idle, moveX: dx, moveY: dy }, TICK_DT, open, stats);
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
    stepPlayer(p, idle, TICK_DT, open, stats);
    expect(p.facing).toBe(5);
  });

  it("clamps out-of-range input from a modified client", () => {
    const p = fresh();
    stepPlayer(p, { ...idle, moveX: 100 }, TICK_DT, open, stats);
    expect(p.x).toBeCloseTo(centre + stats.speed * TICK_DT);
  });

  it("stops at walls", () => {
    const p = fresh();
    for (let i = 0; i < 60; i++) stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open, stats);
    expect(p.x).toBeCloseTo(TILE_SIZE * 4 - PLAYER_HALF);
    expect(p.vx).toBe(0);
  });

  it("swings in the direction pressed, roots the player, then waits for the cooldown", () => {
    const p = fresh();
    stepPlayer(p, { moveX: -1, moveY: 0, attack: 1 }, TICK_DT, open, stats);
    expect(p.swing).toBe(1);
    expect(p.facing).toBe(4);
    expect(p.x).toBe(centre); // no step on the swing tick
    expect(p.lock).toBe(SWING_LOCK_TICKS);

    // Rooted while the swing lasts, even when pushing a direction.
    for (let i = 0; i < SWING_LOCK_TICKS; i++) stepPlayer(p, { moveX: 1, moveY: 0, attack: 1 }, TICK_DT, open, stats);
    expect(p.x).toBe(centre);
    expect(p.swing).toBe(1);

    // Holding attack swings again exactly when the cooldown ends.
    let ticks = SWING_LOCK_TICKS;
    while (p.swing === 1) {
      stepPlayer(p, { moveX: 0, moveY: 0, attack: 1 }, TICK_DT, open, stats);
      ticks++;
    }
    expect(ticks).toBe(stats.attackCooldownTicks);
  });

  it("wraps the swing counter", () => {
    const p = fresh({ swing: 255 });
    stepPlayer(p, { ...idle, attack: 1 }, TICK_DT, open, stats);
    expect(p.swing).toBe(0);
  });

  it("knockback overrides input for its duration", () => {
    const p = fresh({ knockX: -150, knockTicks: 2 });
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open, stats);
    expect(p.x).toBeCloseTo(centre - 150 * TICK_DT);
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open, stats);
    expect(p.knockTicks).toBe(0);
    const x = p.x;
    stepPlayer(p, { ...idle, moveX: 1 }, TICK_DT, open, stats);
    expect(p.x).toBeCloseTo(x + stats.speed * TICK_DT);
  });

  it("does nothing while dead", () => {
    const p = fresh({ dead: true });
    stepPlayer(p, { moveX: 1, moveY: 1, attack: 1 }, TICK_DT, open, stats);
    expect(p.x).toBe(centre);
    expect(p.swing).toBe(0);
  });

  it("is deterministic: same inputs, same result", () => {
    const run = () => {
      const p = fresh();
      for (let i = 0; i < 90; i++)
        stepPlayer(
          p,
          { moveX: (i % 3) - 1, moveY: ((i >> 2) % 3) - 1, attack: i % 7 === 0 ? 1 : 0 },
          TICK_DT,
          open,
          stats,
        );
      return p;
    };
    expect(run()).toEqual(run());
  });
});
