import { ACT_GAP_TICKS, ACT_MOVE, ActPhase, type KiteDef } from "@game/shared";
import type { TickInfo, Vel } from "./acts";
import type { EnemyBrain } from "./brain";
import type { EnemyBody, EnemyHost, HeroRef } from "./host";

/** Picks a new direction (one of 8, or a rest) every `minTicks`..`maxTicks` ticks. */
function wander(brain: EnemyBrain, host: EnemyHost, minTicks: number, maxTicks: number, rest: boolean) {
  if (--brain.turnIn > 0) return;
  const choice = Math.floor(host.rng() * (rest ? 10 : 8));
  const angle = (choice * Math.PI) / 4;
  brain.dirX = choice < 8 ? Math.cos(angle) : 0;
  brain.dirY = choice < 8 ? Math.sin(angle) : 0;
  brain.turnIn = minTicks + Math.floor(host.rng() * (maxTicks - minTicks));
}

/** Cardinal kinds without a target: one of 4 directions, or a rest (1 in 5). */
function wander4(brain: EnemyBrain, host: EnemyHost) {
  if (--brain.turnIn > 0) return;
  const choice = Math.floor(host.rng() * 5);
  brain.dirX = choice === 0 ? 1 : choice === 2 ? -1 : 0;
  brain.dirY = choice === 1 ? 1 : choice === 3 ? -1 : 0;
  brain.turnIn = 30 + Math.floor(host.rng() * 60);
}

/** One tick of a hop (slot ACT_MOVE): crouch (the tell), air, land; then a rest, then the next hop. */
function hop(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, t: TickInfo, v: Vel) {
  const def = brain.def.hop;
  if (!def) return;
  if (brain.actSlot === ACT_MOVE) {
    switch (brain.actPhase) {
      case ActPhase.windup:
        if (--brain.actLeft <= 0) {
          brain.actPhase = ActPhase.action;
          brain.actLeft = def.air;
        }
        return;
      case ActPhase.action:
        v.x = brain.dirX * t.spd;
        v.y = brain.dirY * t.spd;
        if (--brain.actLeft <= 0) {
          brain.actPhase = ActPhase.recover;
          brain.actLeft = def.land;
        }
        return;
      default:
        if (--brain.actLeft <= 0) {
          brain.actSlot = -1;
          brain.actPhase = ActPhase.none;
          brain.gap = ACT_GAP_TICKS;
          brain.turnIn = def.rest[0] + Math.floor(host.rng() * (def.rest[1] - def.rest[0] + 1));
        }
        return;
    }
  }
  if (brain.gap > 0 || --brain.turnIn > 0) return;
  const near = def.seek > 0 ? host.nearestHero(body.x, body.y, brain.home, def.seek) : undefined;
  if (near) {
    const dx = near.x - body.x;
    const dy = near.y - body.y;
    const len = Math.hypot(dx, dy);
    brain.dirX = len > 0 ? dx / len : 0;
    brain.dirY = len > 0 ? dy / len : 1;
  } else {
    const angle = host.rng() * Math.PI * 2;
    brain.dirX = Math.cos(angle);
    brain.dirY = Math.sin(angle);
  }
  brain.actSlot = ACT_MOVE;
  brain.actPhase = ActPhase.windup;
  brain.actLeft = def.crouch;
  brain.stunned = false;
  brain.actSeq++;
}

/** Kite: keep the target between `min` and `max` px, strafing in between (the strafe side flips now and then). */
function kiteDir(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, kite: KiteDef, target: HeroRef, want: Vel) {
  const dx = target.x - body.x;
  const dy = target.y - body.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 0 ? dx / d : 0;
  const uy = d > 0 ? dy / d : 1;
  if (--brain.turnIn <= 0) {
    brain.turnIn = 60 + Math.floor(host.rng() * 60);
    if (host.rng() < 0.5) brain.strafe = brain.strafe === 1 ? -1 : 1;
  }
  const px = -uy * brain.strafe;
  const py = ux * brain.strafe;
  if (d < kite.min) {
    if (brain.stuck) {
      // Backed into a corner: slide along the wall instead.
      want.x = px;
      want.y = py;
    } else {
      const bx = -ux + 0.5 * px;
      const by = -uy + 0.5 * py;
      const len = Math.hypot(bx, by) || 1;
      want.x = bx / len;
      want.y = by / len;
    }
  } else if (d > kite.max) {
    want.x = ux;
    want.y = uy;
  } else {
    want.x = px * 0.6;
    want.y = py * 0.6;
  }
}

/** A cardinal mover keeps an axis it flipped to after a wall bump this long (unless its gap closes). */
const AXIS_HOLD_TICKS = 12;

/**
 * Cardinal modifier: moves along rows and columns only. Not lined up (both gaps over `tolerance`):
 * it closes the smaller gap first, down to under 3 px; lined up: along the line (a chaser
 * approaches, a kiter backs off, closes in or stands and shoots inside [min, max]).
 */
function cardinal(
  body: EnemyBody,
  brain: EnemyBrain,
  target: HeroRef,
  tolerance: number,
  kite: KiteDef | undefined,
  spd: number,
  v: Vel,
) {
  const dx = target.x - body.x;
  const dy = target.y - body.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) <= 4) return;
  const minor: 0 | 1 = ax < ay ? 0 : 1;
  const lined = Math.min(ax, ay) <= tolerance;
  const desired: 0 | 1 = lined ? (minor === 0 ? 1 : 0) : minor;
  const gapOf = (axis: 0 | 1) => (axis === 0 ? ax : ay);
  let axis: 0 | 1;
  if (brain.axisHold > 0) {
    brain.axisHold--;
    axis = brain.axis;
    if (gapOf(axis) < 3) {
      brain.axisHold = 0;
      axis = desired;
    }
  } else if (brain.axis === minor && gapOf(minor) >= 3) {
    // Hysteresis: once closing a gap, close it fully (no flip-flop at the tolerance).
    axis = minor;
  } else {
    axis = desired;
  }
  brain.axis = axis;
  let s = Math.sign(axis === 0 ? dx : dy);
  if (kite && lined && axis !== minor) {
    const d = Math.hypot(dx, dy);
    s = d < kite.min ? -s : d > kite.max ? s : 0;
  }
  if (axis === 0) v.x = s * spd;
  else v.y = s * spd;
}

/**
 * Velocity (px/s) for this tick from the enemy's behaviour and modifiers (cardinal, burst),
 * scaled by `t.spd` (speed 0 gives 0). Hop kinds continue or start a hop (ACT_MOVE) here.
 */
export function moveVelocity(
  body: EnemyBody,
  brain: EnemyBrain,
  target: HeroRef | undefined,
  host: EnemyHost,
  t: TickInfo,
  v: Vel,
) {
  v.x = 0;
  v.y = 0;
  const { def } = brain;
  const spd = t.spd;
  switch (def.behaviour) {
    case "guard":
      return;
    case "hop":
      hop(body, brain, host, t, v);
      return;
    case "erratic":
      wander(brain, host, 8, 20, false);
      break;
    case "bounce":
      break;
    case "chase":
    case "kite": {
      if (!target) {
        brain.burstLeft = 0;
        if (def.cardinal !== undefined) wander4(brain, host);
        else wander(brain, host, 30, 90, true);
        break;
      }
      const want = v;
      if (def.behaviour === "kite" && def.kite) kiteDir(body, brain, host, def.kite, target, want);
      else {
        const dx = target.x - body.x;
        const dy = target.y - body.y;
        const len = Math.hypot(dx, dy) || 1;
        want.x = dx / len;
        want.y = dy / len;
      }
      brain.dirX = want.x;
      brain.dirY = want.y;
      if (def.burst) {
        if (brain.burstLeft === 0) brain.burstLeft = def.burst[0];
        if (brain.burstLeft > 0) {
          if (--brain.burstLeft === 0) brain.burstLeft = -def.burst[1];
        } else {
          if (++brain.burstLeft === 0) brain.burstLeft = def.burst[0];
          v.x = 0;
          v.y = 0;
          return;
        }
      }
      if (def.cardinal !== undefined) {
        v.x = 0;
        v.y = 0;
        cardinal(body, brain, target, def.cardinal, def.behaviour === "kite" ? def.kite : undefined, spd, v);
        return;
      }
      v.x = want.x * spd;
      v.y = want.y * spd;
      return;
    }
    default:
      wander(brain, host, 30, 90, true);
  }
  v.x = brain.dirX * spd;
  v.y = brain.dirY * spd;
}

/** Cardinal bump: flip to the other axis and keep it a moment, to go around the obstacle. */
export function flipAxis(brain: EnemyBrain) {
  brain.axis = brain.axis === 0 ? 1 : 0;
  brain.axisHold = AXIS_HOLD_TICKS;
}
