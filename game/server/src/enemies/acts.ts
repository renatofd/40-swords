import { boxHitsSolid } from "@core/shared";
import {
  ACT_GAP_TICKS,
  ACT_MOVE,
  ACT_STONE,
  ActPhase,
  AIM_LOCK_TICKS,
  type AttackDef,
  ENEMIES,
  type EnemyKind,
  encodeAct,
  LOS_RECHECK_TICKS,
  MAX_ATTACKS,
  PHASE2_SPEED,
  type ShotStyle,
  STONE_RECOVER_TICKS,
  STONE_WINDUP_TICKS,
  travelDistance,
} from "@game/shared";
import type { EnemyBrain } from "./brain";
import type { EnemyBody, EnemyEvent, EnemyHost, HeroRef } from "./host";

/** A velocity in px/s, written in place (no allocation per tick). */
export interface Vel {
  x: number;
  y: number;
}

/** What one tick knows besides the body and brain. */
export interface TickInfo {
  /** Boss phase (1, or 2 at or below `phase2At`). */
  phase: 1 | 2;
  /** Cooldown multiplier of this phase. */
  mult: number;
  /** Movement speed of this phase, px/s. */
  spd: number;
}

type Attack<T extends AttackDef["type"]> = Extract<AttackDef, { type: T }>;

/** Slots below this are attacks (ACT_STONE and ACT_MOVE come after). */
const ATTACK_SLOTS = MAX_ATTACKS;

/** The encoded act of a brain (Enemy.act). */
export function actOf(brain: EnemyBrain): number {
  return brain.actSlot < 0 ? 0 : encodeAct(brain.actSlot, brain.actPhase, brain.stunned);
}

/** Clears the act (no cooldown change) and starts the gap before the next one. */
function clearAct(brain: EnemyBrain) {
  brain.actSlot = -1;
  brain.actPhase = ActPhase.none;
  brain.actLeft = 0;
  brain.stunned = false;
  brain.invuln = false;
  brain.gap = ACT_GAP_TICKS;
}

function toRecover(brain: EnemyBrain, ticks: number, stunned = false) {
  brain.actPhase = ActPhase.recover;
  brain.actLeft = ticks;
  brain.stunned = stunned;
}

/**
 * Stops the current act. `half`: an interrupt (a hit in the wind-up, a failed start) puts the
 * attack on half its cooldown; otherwise (knocked out of an action or recover) the full one.
 * A cancelled hop rests `rest[0]` ticks.
 */
export function cancelAct(brain: EnemyBrain, half: boolean) {
  const slot = brain.actSlot;
  if (slot < 0) return;
  const attack = slot < ATTACK_SLOTS ? brain.def.attacks[slot] : undefined;
  if (attack) brain.attackCd[slot] = half ? Math.floor(attack.cooldownTicks / 2) : attack.cooldownTicks;
  if (slot === ACT_MOVE && brain.def.hop) brain.turnIn = brain.def.hop.rest[0];
  clearAct(brain);
}

/** The act ran its course: its attack goes on cooldown (scaled by the phase, plus 0-14 random ticks). */
function endAct(brain: EnemyBrain, host: EnemyHost, mult: number) {
  const slot = brain.actSlot;
  const attack = slot < ATTACK_SLOTS ? brain.def.attacks[slot] : undefined;
  if (attack) brain.attackCd[slot] = Math.round(attack.cooldownTicks * mult) + Math.floor(host.rng() * 15);
  clearAct(brain);
}

/** Unit aim toward the target; `aligned` attacks snap to the axis of the larger gap. */
function aimAt(body: EnemyBody, brain: EnemyBrain, attack: AttackDef, target: HeroRef) {
  const dx = target.x - body.x;
  const dy = target.y - body.y;
  if (attack.aligned !== undefined) {
    if (Math.abs(dy) <= Math.abs(dx)) {
      brain.aimX = Math.sign(dx) || 1;
      brain.aimY = 0;
    } else {
      brain.aimX = 0;
      brain.aimY = Math.sign(dy);
    }
    return;
  }
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    brain.aimX = dx / len;
    brain.aimY = dy / len;
  }
}

/** Leap landing spot: the target, at most `range` away, inside the home screen inset by `half + 1`. */
function leapDest(body: EnemyBody, brain: EnemyBrain, attack: Attack<"leap">, target: HeroRef) {
  let dx = target.x - body.x;
  let dy = target.y - body.y;
  const d = Math.hypot(dx, dy);
  if (d > attack.range) {
    dx *= attack.range / d;
    dy *= attack.range / d;
  }
  const { home } = brain;
  const inset = brain.stats.half + 1;
  brain.destX = Math.min(home.x + home.width - inset, Math.max(home.x + inset, body.x + dx));
  brain.destY = Math.min(home.y + home.height - inset, Math.max(home.y + inset, body.y + dy));
}

/** Drops minions that are gone; true when the pack still has room. */
function minionRoom(brain: EnemyBrain, host: EnemyHost, max: number): number {
  for (const m of brain.minions) if (!host.enemyAlive(m)) brain.minions.delete(m);
  return max - brain.minions.size;
}

function summon(
  body: EnemyBody,
  brain: EnemyBrain,
  host: EnemyHost,
  kind: EnemyKind,
  count: number,
  max: number,
  out: EnemyEvent[],
) {
  const room = Math.min(count, minionRoom(brain, host, max));
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < room; i++) {
    // Room for the minion's body (not the summoner's).
    const spot = host.freeSpot(brain.home, ENEMIES[kind].half, body.x, body.y, 28);
    if (!spot) break;
    spots.push(spot);
  }
  if (spots.length > 0) out.push({ type: "summon", kind, spots });
}

function ring(
  x: number,
  y: number,
  volley: { count: number; speed: number; range: number; damage: number; style: ShotStyle },
  brain: EnemyBrain,
  host: EnemyHost,
  out: EnemyEvent[],
) {
  const offset = host.rng() * ((Math.PI * 2) / volley.count);
  const angles = Array.from({ length: volley.count }, (_, i) => offset + (i * Math.PI * 2) / volley.count);
  out.push({
    type: "shots",
    x,
    y,
    angles,
    speed: volley.speed,
    range: volley.range,
    damage: volley.damage * brain.stats.shotDamage,
    style: volley.style,
  });
}

/** Angles of an aimed fan of `count` shots, `spreadDeg` wide, around `aim` (radians). */
export function fanAngles(aim: number, count: number, spreadDeg: number): number[] {
  const spread = (spreadDeg * Math.PI) / 180;
  return count <= 1 ? [aim] : Array.from({ length: count }, (_, i) => aim - spread / 2 + (i * spread) / (count - 1));
}

/**
 * The first ready attack (in array order) whose gates pass against `target`, or -1.
 * Aimed shots, charges and strikes need a clear line (checked at most once per LOS_RECHECK_TICKS while it fails).
 */
export function pickAttack(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, target: HeroRef, phase: 1 | 2): number {
  const { def } = brain;
  const dx = target.x - body.x;
  const dy = target.y - body.y;
  const d = Math.hypot(dx, dy);
  for (let i = 0; i < def.attacks.length && i < ATTACK_SLOTS; i++) {
    const a = def.attacks[i] as AttackDef;
    if ((brain.attackCd[i] ?? 0) > 0 || (a.phase && a.phase !== phase)) continue;
    const [lo, hi] = a.within ?? [0, def.aggroRange];
    if (d < lo || d > hi) continue;
    if (a.aligned !== undefined && Math.min(Math.abs(dx), Math.abs(dy)) > a.aligned) continue;
    if (a.type === "summon" && minionRoom(brain, host, a.max) <= 0) continue;
    if (a.type === "aimed" || a.type === "charge" || a.type === "strike") {
      if (brain.losWait > 0) continue;
      let ux: number;
      let uy: number;
      let len: number;
      if (a.aligned !== undefined) {
        const horizontal = Math.abs(dy) <= Math.abs(dx);
        ux = horizontal ? Math.sign(dx) || 1 : 0;
        uy = horizontal ? 0 : Math.sign(dy);
        len = horizontal ? Math.abs(dx) : Math.abs(dy);
      } else {
        ux = d > 0 ? dx / d : 0;
        uy = d > 0 ? dy / d : 1;
        len = d;
      }
      if (travelDistance(host.grid, body.x, body.y, ux, uy, len) < len - 4) {
        brain.losWait = LOS_RECHECK_TICKS;
        continue;
      }
    }
    return i;
  }
  return -1;
}

/**
 * Starts attack `i` (its wind-up). False when it can't start (a blink with no spot far
 * enough from the target): that attack waits half its cooldown.
 */
export function startAct(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, i: number, target: HeroRef): boolean {
  const a = brain.def.attacks[i];
  if (!a) return false;
  if (a.type === "blink") {
    const { home } = brain;
    const spot = host.freeSpot(home, brain.stats.half, home.x + home.width / 2, home.y + home.height / 2, 90);
    if (!spot || Math.hypot(spot.x - target.x, spot.y - target.y) < (a.minFromTarget ?? 40)) {
      brain.attackCd[i] = Math.floor(a.cooldownTicks / 2);
      return false;
    }
    brain.destX = spot.x;
    brain.destY = spot.y;
  }
  brain.actSlot = i;
  brain.actPhase = ActPhase.windup;
  brain.actLeft = a.windupTicks;
  brain.stunned = false;
  brain.actSeq++;
  aimAt(body, brain, a, target);
  if (a.type === "leap") leapDest(body, brain, a, target);
  return true;
}

/**
 * Witch: turns to stone (slot ACT_STONE), cancelling whatever it was doing. She is invulnerable
 * from the flash on: a blow in it could otherwise cross the next mark and restart the stone.
 */
export function startStone(brain: EnemyBrain) {
  cancelAct(brain, true);
  brain.actSlot = ACT_STONE;
  brain.actPhase = ActPhase.windup;
  brain.actLeft = STONE_WINDUP_TICKS;
  brain.stunned = false;
  brain.invuln = true;
  brain.actSeq++;
}

/** The end of a wind-up: the attack happens (shots, area, summon, blink) or its action starts (charge, leap). */
function release(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, a: AttackDef, out: EnemyEvent[]) {
  brain.actPhase = ActPhase.action;
  brain.actLeft = 1;
  switch (a.type) {
    case "aimed":
      out.push({
        type: "shots",
        x: body.x,
        y: body.y,
        angles: fanAngles(Math.atan2(brain.aimY, brain.aimX), a.count, a.spreadDeg),
        speed: a.speed,
        range: a.range,
        damage: a.damage * brain.stats.shotDamage,
        style: a.style,
      });
      break;
    case "ring":
      ring(body.x, body.y, a, brain, host, out);
      break;
    case "charge":
      brain.bounces = a.bounces ?? 0;
      brain.actLeft = a.ticks;
      break;
    case "strike":
      out.push({
        type: "area",
        x: body.x + brain.aimX * a.offset,
        y: body.y + brain.aimY * a.offset,
        radius: a.radius,
        damage: a.damage * brain.stats.shotDamage,
        walls: true,
      });
      break;
    case "leap": {
      brain.fromX = body.x;
      brain.fromY = body.y;
      // Never land in a wall: pull the spot back toward the take-off, 4 px at a time.
      const half = brain.stats.half;
      for (let n = 0; n < 12 && boxHitsSolid(host.grid, brain.destX, brain.destY, half); n++) {
        const dx = brain.fromX - brain.destX;
        const dy = brain.fromY - brain.destY;
        const len = Math.hypot(dx, dy);
        if (len <= 4) {
          brain.destX = brain.fromX;
          brain.destY = brain.fromY;
        } else {
          brain.destX += (dx / len) * 4;
          brain.destY += (dy / len) * 4;
        }
      }
      if (boxHitsSolid(host.grid, brain.destX, brain.destY, half)) toRecover(brain, a.recoverTicks);
      else brain.actLeft = a.ticks;
      break;
    }
    case "summon":
      summon(body, brain, host, a.kind, a.count, a.max, out);
      break;
    case "blink":
      body.x = brain.destX;
      body.y = brain.destY;
      break;
  }
}

/** One tick of the stone act (witch): flash, stone (invulnerable, minions come), wake up with a ring. */
function stepStone(body: EnemyBody, brain: EnemyBrain, host: EnemyHost, out: EnemyEvent[]) {
  const stone = brain.def.stone;
  switch (brain.actPhase) {
    case ActPhase.windup:
      if (--brain.actLeft > 0) return;
      brain.actPhase = ActPhase.action;
      brain.actLeft = stone?.ticks ?? 1;
      brain.invuln = true;
      if (stone?.summon) summon(body, brain, host, stone.summon.kind, stone.summon.count, stone.summon.max, out);
      return;
    case ActPhase.action:
      brain.invuln = true;
      if (--brain.actLeft > 0) return;
      brain.invuln = false;
      if (stone?.endRing) ring(body.x, body.y, stone.endRing, brain, host, out);
      toRecover(brain, STONE_RECOVER_TICKS);
      return;
    default:
      if (--brain.actLeft <= 0) clearAct(brain);
  }
}

/**
 * One tick of the current attack or stone act; the enemy stands still unless the action
 * moves it (charge) or carries it (leap). Events (shots, areas, summons) go to `out`.
 */
export function stepAct(
  body: EnemyBody,
  brain: EnemyBrain,
  host: EnemyHost,
  target: HeroRef | undefined,
  t: TickInfo,
  v: Vel,
  out: EnemyEvent[],
) {
  v.x = 0;
  v.y = 0;
  if (brain.actSlot === ACT_STONE) {
    stepStone(body, brain, host, out);
    return;
  }
  const a = brain.def.attacks[brain.actSlot];
  if (!a) {
    // The def changed under it (tests pin enemies): just drop the act.
    clearAct(brain);
    return;
  }
  switch (brain.actPhase) {
    case ActPhase.windup:
      if (!target) {
        cancelAct(brain, true);
        return;
      }
      if (
        brain.actLeft > AIM_LOCK_TICKS &&
        a.aligned === undefined &&
        (a.type === "aimed" || a.type === "strike" || a.type === "leap")
      ) {
        aimAt(body, brain, a, target);
        if (a.type === "leap") leapDest(body, brain, a, target);
      }
      if (--brain.actLeft > 0) return;
      release(body, brain, host, a, out);
      // Charges and leaps start moving on the release tick.
      if ((brain.actPhase as ActPhase) === ActPhase.action && (a.type === "charge" || a.type === "leap"))
        stepAction(body, brain, host, a, t, v, out);
      return;
    case ActPhase.action:
      stepAction(body, brain, host, a, t, v, out);
      return;
    default:
      if (--brain.actLeft <= 0) endAct(brain, host, t.mult);
  }
}

/** One tick of an attack's action phase: charges move, leaps fly, the rest last one tick. */
function stepAction(
  body: EnemyBody,
  brain: EnemyBrain,
  host: EnemyHost,
  a: AttackDef,
  t: TickInfo,
  v: Vel,
  out: EnemyEvent[],
) {
  if (a.type === "leap") {
    brain.actLeft--;
    // In the air: no collision (the landing spot was checked at take-off).
    const k = 1 - Math.max(0, brain.actLeft) / a.ticks;
    body.x = brain.fromX + (brain.destX - brain.fromX) * k;
    body.y = brain.fromY + (brain.destY - brain.fromY) * k;
    if (brain.actLeft > 0) return;
    out.push({
      type: "area",
      x: brain.destX,
      y: brain.destY,
      radius: a.radius,
      damage: a.damage * brain.stats.shotDamage,
      walls: false,
    });
    if (a.ring) ring(brain.destX, brain.destY, a.ring, brain, host, out);
    toRecover(brain, a.recoverTicks);
    return;
  }
  if (a.type === "charge") {
    const speed = a.speed * (t.phase === 2 ? PHASE2_SPEED : 1);
    v.x = brain.aimX * speed;
    v.y = brain.aimY * speed;
    if (--brain.actLeft <= 0) toRecover(brain, a.recoverTicks);
    return;
  }
  if (--brain.actLeft <= 0) toRecover(brain, a.recoverTicks);
}

/**
 * A charge bumped into a wall (after the move): it reflects while it has bounces left,
 * else it stops; with `stunTicks` it stands stunned that long (a free hit).
 */
export function chargeBlocked(brain: EnemyBrain, blockedX: boolean, blockedY: boolean) {
  const a = brain.def.attacks[brain.actSlot];
  if (a?.type !== "charge") return;
  if (brain.bounces > 0) {
    brain.bounces--;
    if (blockedX) brain.aimX = -brain.aimX;
    if (blockedY) brain.aimY = -brain.aimY;
    return;
  }
  const stun = a.stunTicks ?? 0;
  toRecover(brain, stun > 0 ? stun : a.recoverTicks, stun > 0);
}

/** True while a charge is moving (its action phase). */
export function charging(brain: EnemyBrain): boolean {
  return (
    brain.actSlot >= 0 &&
    brain.actSlot < ATTACK_SLOTS &&
    brain.actPhase === ActPhase.action &&
    brain.def.attacks[brain.actSlot]?.type === "charge"
  );
}

/** True while a leap is in the air: no contact damage, and swords and projectiles pass under it. */
export function untargetable(brain: EnemyBrain): boolean {
  return (
    brain.actSlot >= 0 &&
    brain.actSlot < ATTACK_SLOTS &&
    brain.actPhase === ActPhase.action &&
    brain.def.attacks[brain.actSlot]?.type === "leap"
  );
}
