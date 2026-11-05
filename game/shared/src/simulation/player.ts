import { type CollisionGrid, moveAxis, signAxis } from "@core/shared";
import { PLAYER_HALF, SWING_LOCK_TICKS, SWING_MOVE_FACTOR } from "../constants";
import { scaledCooldown, WEAPON_IDS, WEAPONS, type WeaponId } from "../weapons";
import { type Portal, portalAt } from "../worldObjects";
import { facingFromDir } from "./facing";

/** Copies owned of each weapon (`daggerN`...) and ticks until it fires again (`daggerCd`...). */
export type WeaponCountKey = `${WeaponId}N`;
export type WeaponCooldownKey = `${WeaponId}Cd`;
export const weaponCountKey = (id: WeaponId): WeaponCountKey => `${id}N`;
export const weaponCooldownKey = (id: WeaponId): WeaponCooldownKey => `${id}Cd`;

/**
 * Structural types on purpose: the same step runs on the server's Schema
 * instance and on the client reconciler's plain predicted copy. Every field the
 * step reads or writes is listed here (and mirrored by the client reconciler).
 */
export interface PlayerSimState extends Record<WeaponCountKey | WeaponCooldownKey, number> {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0..7, see facing.ts. */
  facing: number;
  /** Ticks until the sword can swing again. */
  cooldown: number;
  /** Ticks left of the current swing (facing kept, slower movement). */
  lock: number;
  /** Swing counter (wraps at 256): the server resolves a hit whenever it changes. */
  swing: number;
  /** Knockback velocity (px/s) and remaining ticks, set by the server when hit. */
  knockX: number;
  knockY: number;
  knockTicks: number;
  dead: boolean;
  /** Walking speed (px/s) and sword cooldown (ticks), from the hero's attributes. Set by the server. */
  speed: number;
  swingCd: number;
  /** Cooldown percent of weapons (100 = normal). Set by the server. */
  cdPct: number;
  /** Volley counter (wraps at 256) and which weapons fired in the last volley (bit per WEAPON_IDS index). */
  vseq: number;
  vmask: number;
  /** Counts portal jumps (wraps at 256), so views can cut instead of sliding across the map. */
  warp: number;
}

export interface PlayerInputLike {
  moveX: number;
  moveY: number;
  attack: number;
}

/** The static world the step moves in: tile collision and portals. */
export interface SimWorld {
  grid: CollisionGrid;
  portals: readonly Portal[];
}

/**
 * The single player step, run identically by the server (once per received
 * input) and by the client (prediction and replay after a correction).
 *
 * 8-way movement; the attack button swings the sword (the hero keeps facing
 * the same way and moves at half speed while it lasts) and fires every weapon
 * whose cooldown is over; knockback when hit; portals (cave entrances) move the player.
 *
 * Contract: pure function of (state, input, dt, world). No clocks, no
 * randomness, no reads outside its arguments. Breaking this makes prediction drift.
 */
export function stepPlayer(state: PlayerSimState, input: PlayerInputLike, dt: number, world: SimWorld): void {
  if (state.cooldown > 0) state.cooldown--;
  for (const id of WEAPON_IDS) {
    const cd = weaponCooldownKey(id);
    if (state[cd] > 0) state[cd]--;
  }
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
  } else {
    let dirX: number = signAxis(input.moveX);
    let dirY: number = signAxis(input.moveY);
    let pace = 1;
    if (state.lock > 0) {
      // Mid-swing: still facing the swing, at reduced speed.
      state.lock--;
      pace = SWING_MOVE_FACTOR;
    } else {
      const facing = facingFromDir(dirX, dirY);
      if (facing >= 0) state.facing = facing;
      if (input.attack > 0 && state.cooldown === 0) {
        state.cooldown = state.swingCd;
        state.lock = SWING_LOCK_TICKS;
        state.swing = (state.swing + 1) & 255;
        pace = SWING_MOVE_FACTOR;
      }
    }
    // Diagonal movement must not be faster than straight movement.
    if (dirX !== 0 && dirY !== 0) {
      dirX *= Math.SQRT1_2;
      dirY *= Math.SQRT1_2;
    }
    dx = dirX * state.speed * pace * dt;
    dy = dirY * state.speed * pace * dt;
  }

  // Resolve each axis separately so players slide along walls.
  const nextX = moveAxis(world.grid, "x", state.x, state.y, PLAYER_HALF, dx);
  const nextY = moveAxis(world.grid, "y", nextX, state.y, PLAYER_HALF, dy);
  state.vx = dt > 0 ? (nextX - state.x) / dt : 0;
  state.vy = dt > 0 ? (nextY - state.y) / dt : 0;
  state.x = nextX;
  state.y = nextY;

  const portal = portalAt(world.portals, state.x, state.y);
  if (portal) {
    state.x = portal.toX;
    state.y = portal.toY;
    state.vx = 0;
    state.vy = 0;
    state.warp = (state.warp + 1) & 255;
  }

  // Weapons fire with the sword button, each on its own cooldown, from where the hero ends up.
  if (input.attack > 0) {
    let mask = 0;
    WEAPON_IDS.forEach((id, i) => {
      const cd = weaponCooldownKey(id);
      if (state[weaponCountKey(id)] > 0 && state[cd] === 0) {
        state[cd] = scaledCooldown(WEAPONS[id].cooldownTicks, state.cdPct);
        mask |= 1 << i;
      }
    });
    if (mask !== 0) {
      state.vseq = (state.vseq + 1) & 255;
      state.vmask = mask;
    }
  }
}
