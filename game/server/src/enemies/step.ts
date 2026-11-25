import { moveAxis } from "@core/shared";
import {
  ACT_MOVE,
  ActPhase,
  angleFacing,
  enemyPhase,
  facingFromDir,
  MAX_ATTACKS,
  PHASE2_COOLDOWN,
  PHASE2_SPEED,
  TICK_DT,
  TURN_TICKS,
  WAKE_SETTLE_TICKS,
} from "@game/shared";
import {
  actOf,
  chargeBlocked,
  charging,
  pickAttack,
  startAct,
  stepAct,
  type TickInfo,
  untargetable,
  type Vel,
} from "./acts";
import type { EnemyBrain } from "./brain";
import type { EnemyBody, EnemyEvent, EnemyHost, HeroRef } from "./host";
import { flipAxis, moveVelocity } from "./move";

// Scratch values reused every tick (no allocation in the hot path).
const vel: Vel = { x: 0, y: 0 };
const tick: TickInfo = { phase: 1, mult: 1, spd: 0 };

/** 8-way facing of a direction, snapped to the 4 main ones for cardinal kinds. */
function facingOf(x: number, y: number, cardinalOnly: boolean): number {
  // Cardinal: the major axis (quadrants centred on E, S, W, N).
  if (cardinalOnly) return Math.abs(x) >= Math.abs(y) ? (x < 0 ? 4 : 0) : y < 0 ? 6 : 2;
  return angleFacing(Math.atan2(y, x));
}

/**
 * One AI tick of an enemy (spec §2.4): wake, target, knockback / act / new attack / movement,
 * the move itself (walls, home screen), facing and `act`. Pure: randomness only through
 * `host.rng`; side effects outside the body and brain go to `out` (cleared by the caller).
 */
export function stepEnemyAi(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, out: EnemyEvent[]) {
  const { def, stats, home } = brain;
  if (body.hurt > 0) body.hurt--;
  const phase = enemyPhase(def, body.hp, body.maxHp);
  tick.phase = phase;
  tick.mult = phase === 2 ? PHASE2_COOLDOWN : 1;
  tick.spd = stats.speed > 0 ? stats.speed * (phase === 2 ? PHASE2_SPEED : 1) : 0;
  if (brain.gap > 0) brain.gap--;
  if (brain.losWait > 0) brain.losWait--;

  const v = vel;
  v.x = 0;
  v.y = 0;
  let knocked = false;
  let target: HeroRef | undefined;
  let dormant = false;
  if (def.wake !== undefined) {
    if (brain.awake === 0) {
      if (host.nearestHero(body.x, body.y, home, def.wake)) brain.awake = WAKE_SETTLE_TICKS;
      else dormant = true;
    } else if (host.nearestHero(body.x, body.y, home, Math.max(def.wake, def.aggroRange))) {
      brain.awake = WAKE_SETTLE_TICKS;
    } else if (brain.actSlot < 0) {
      // Never dozes off mid-hop or mid-act.
      brain.awake--;
    }
  }

  if (dormant) {
    // Asleep: no move, no attack; a blow still slides it.
    if (brain.knockTicks > 0) {
      brain.knockTicks--;
      v.x = brain.knockX;
      v.y = brain.knockY;
      knocked = true;
    }
  } else {
    target = def.aggroRange > 0 ? host.nearestHero(body.x, body.y, home, def.aggroRange) : undefined;
    // Cooldowns tick only while engaged.
    if (target)
      for (let i = 0; i < brain.attackCd.length; i++) brain.attackCd[i] = Math.max(0, (brain.attackCd[i] ?? 0) - 1);

    if (brain.knockTicks > 0) {
      brain.knockTicks--;
      // A recover (a stunned one too) keeps counting down while the blow pushes it.
      if (brain.actPhase === ActPhase.recover) {
        if (brain.actSlot === ACT_MOVE) moveVelocity(body, brain, target, host, tick, v);
        else stepAct(body, brain, host, target, tick, v, out);
      }
      v.x = brain.knockX;
      v.y = brain.knockY;
      knocked = true;
    } else if (brain.actSlot >= 0 && brain.actSlot !== ACT_MOVE) {
      stepAct(body, brain, host, target, tick, v, out);
    } else {
      const i = brain.actSlot < 0 && target && brain.gap === 0 ? pickAttack(body, brain, host, target, phase) : -1;
      if (!(i >= 0 && target && startAct(body, brain, host, i, target)))
        moveVelocity(body, brain, target, host, tick, v);
    }
  }

  // ─── The move ───
  const half = stats.half;
  const x0 = body.x;
  const y0 = body.y;
  const wantX = x0 + v.x * TICK_DT;
  const wantY = y0 + v.y * TICK_DT;
  const nextX = clamp(
    moveAxis(host.grid, "x", x0, y0, half, v.x * TICK_DT),
    home.x + half + 1,
    home.x + home.width - half - 1,
  );
  const nextY = clamp(
    moveAxis(host.grid, "y", nextX, y0, half, v.y * TICK_DT),
    home.y + half + 1,
    home.y + home.height - half - 1,
  );
  // The home clamp counts as a wall.
  const blockedX = v.x !== 0 && Math.abs(nextX - wantX) > 0.01;
  const blockedY = v.y !== 0 && Math.abs(nextY - wantY) > 0.01;
  body.x = nextX;
  body.y = nextY;
  brain.vx = (nextX - x0) / TICK_DT;
  brain.vy = (nextY - y0) / TICK_DT;
  brain.stuck = (v.x !== 0 || v.y !== 0) && nextX === x0 && nextY === y0;
  if (blockedX || blockedY) {
    if (knocked) {
      if (def.behaviour !== "bounce") brain.turnIn = Math.min(brain.turnIn, 5);
    } else if (charging(brain)) {
      chargeBlocked(brain, blockedX, blockedY);
    } else if (brain.actSlot === ACT_MOVE && brain.actPhase === ActPhase.action) {
      // A hop that hits a wall lands early.
      brain.actPhase = ActPhase.recover;
      brain.actLeft = def.hop?.land ?? 1;
    } else if (def.behaviour === "bounce") {
      if (blockedX) brain.dirX = -brain.dirX;
      if (blockedY) brain.dirY = -brain.dirY;
    } else {
      if (def.behaviour === "kite" && target) brain.strafe = brain.strafe === 1 ? -1 : 1;
      else brain.turnIn = Math.min(brain.turnIn, 5);
      if (def.cardinal !== undefined && target) flipAxis(brain);
    }
  }

  // ─── Facing ───
  const cardinalOnly = def.cardinal !== undefined;
  const acting = brain.actSlot >= 0 && brain.actSlot < MAX_ATTACKS;
  if (knocked) {
    // Recoils facing the same way.
  } else if (acting && brain.actPhase !== ActPhase.recover) {
    body.facing = facingOf(brain.aimX, brain.aimY, cardinalOnly);
  } else if (brain.actSlot === ACT_MOVE) {
    body.facing = facingOf(brain.dirX, brain.dirY, false);
  } else if (def.behaviour === "kite" && !cardinalOnly && target) {
    body.facing = facingOf(target.x - body.x, target.y - body.y, false);
  } else if (cardinalOnly) {
    if (v.x !== 0 || v.y !== 0) {
      body.facing = facingOf(v.x, v.y, true);
      brain.turnWait = 0;
    } else if (brain.actSlot < 0 && target) {
      // Standing: turns to the target's side only after TURN_TICKS (heroes can flank it).
      const q = facingOf(target.x - body.x, target.y - body.y, true);
      if (q === body.facing) brain.turnWait = 0;
      else if (++brain.turnWait >= TURN_TICKS) {
        body.facing = q;
        brain.turnWait = 0;
      }
    }
  } else {
    const facing = facingFromDir(Math.sign(Math.round(v.x)), Math.sign(Math.round(v.y)));
    if (facing >= 0) body.facing = facing;
  }

  body.act = actOf(brain);
}

/** Whether touching the enemy hurts this tick: not while a leap is in the air. */
export function contactActive(brain: EnemyBrain): boolean {
  return !untargetable(brain);
}

/** `v` kept inside [lo, hi] (the home screen inset by the body). */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
