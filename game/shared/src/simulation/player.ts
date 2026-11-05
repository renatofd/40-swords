import { type CollisionGrid, moveAxis, signAxis } from "@core/shared";
import { PLAYER_HALF, SWING_LOCK_TICKS } from "../constants";
import { facingFromDir } from "./facing";

/**
 * Structural types on purpose: the same step runs on the server's Schema
 * instance and on the client reconciler's plain predicted copy.
 */
export interface PlayerSimState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0..7, see facing.ts. */
  facing: number;
  /** Ticks until the sword can swing again. */
  cooldown: number;
  /** Ticks left of the current swing (player rooted). */
  lock: number;
  /** Swing counter (wraps at 256): the server resolves a hit whenever it changes. */
  swing: number;
  /** Knockback velocity (px/s) and remaining ticks, set by the server when hit. */
  knockX: number;
  knockY: number;
  knockTicks: number;
  dead: boolean;
}

export interface PlayerInputLike {
  moveX: number;
  moveY: number;
  attack: number;
}

/** The parts of the class stats the step reads. */
export interface StepStats {
  speed: number;
  attackCooldownTicks: number;
}

/**
 * The single player step, run identically by the server (once per received
 * input) and by the client (prediction and replay after a correction).
 *
 * 8-way movement, sword swing with cooldown (the swing roots the player for a
 * few ticks), and knockback when hit.
 *
 * Contract: pure function of (state, input, dt, grid, stats). No clocks, no
 * randomness, no reads outside its arguments. Breaking this makes prediction drift.
 */
export function stepPlayer(
  state: PlayerSimState,
  input: PlayerInputLike,
  dt: number,
  grid: CollisionGrid,
  stats: StepStats,
): void {
  if (state.cooldown > 0) state.cooldown--;
  if (state.dead) {
    state.vx = 0;
    state.vy = 0;
    state.lock = 0;
    state.knockTicks = 0;
    return;
  }

  let dx = 0;
  let dy = 0;
  if (state.knockTicks > 0) {
    state.knockTicks--;
    dx = state.knockX * dt;
    dy = state.knockY * dt;
  } else if (state.lock > 0) {
    state.lock--;
  } else {
    let dirX: number = signAxis(input.moveX);
    let dirY: number = signAxis(input.moveY);
    const facing = facingFromDir(dirX, dirY);
    if (facing >= 0) state.facing = facing;

    if (input.attack > 0 && state.cooldown === 0) {
      state.cooldown = stats.attackCooldownTicks;
      state.lock = SWING_LOCK_TICKS;
      state.swing = (state.swing + 1) & 255;
    } else {
      // Diagonal movement must not be faster than straight movement.
      if (dirX !== 0 && dirY !== 0) {
        dirX *= Math.SQRT1_2;
        dirY *= Math.SQRT1_2;
      }
      dx = dirX * stats.speed * dt;
      dy = dirY * stats.speed * dt;
    }
  }

  // Resolve each axis separately so players slide along walls.
  const nextX = moveAxis(grid, "x", state.x, state.y, PLAYER_HALF, dx);
  const nextY = moveAxis(grid, "y", nextX, state.y, PLAYER_HALF, dy);

  state.vx = dt > 0 ? (nextX - state.x) / dt : 0;
  state.vy = dt > 0 ? (nextY - state.y) / dt : 0;
  state.x = nextX;
  state.y = nextY;
}
