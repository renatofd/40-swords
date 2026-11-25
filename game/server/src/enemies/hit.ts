import { ActPhase, ENEMY_KNOCK_TICKS, facingVector, MAX_ATTACKS, WAKE_SETTLE_TICKS } from "@game/shared";
import { actOf, cancelAct, startStone } from "./acts";
import type { EnemyBrain } from "./brain";
import type { EnemyBody } from "./host";

/** What a blow did: HP actually lost, and whether a guard (front block, stone) took it. */
export interface HitOutcome {
  amount: number;
  blocked: boolean;
}

/** cos 60°: the lancer's front guard covers ±60° around its facing. */
const BLOCK_COS = 0.5;

/**
 * A blow of `amount` from (fromX, fromY) lands on an enemy (spec §2.4 stone, §2.5 hits on special
 * movers): stone (no effect), front block, HP (clamped at a stone mark, which starts the stone),
 * wake-up, interrupt and knockback. Kills are the room's business (`hp <= 0` afterwards).
 */
export function hitEnemy(
  body: EnemyBody,
  brain: EnemyBrain,
  amount: number,
  fromX: number,
  fromY: number,
  knockSpeed: number,
): HitOutcome {
  if (brain.invuln) return { amount: 0, blocked: true };
  const { def } = brain;
  if (def.wake !== undefined) brain.awake = WAKE_SETTLE_TICKS;
  const normal = def.rank === "normal";

  let blocked = false;
  if (def.block !== undefined && !brain.stunned && (brain.actSlot < 0 || brain.actPhase === ActPhase.windup)) {
    const [fx, fy] = facingVector(body.facing);
    const ax = fromX - body.x;
    const ay = fromY - body.y;
    const len = Math.hypot(ax, ay);
    if (len > 0 && (fx * ax + fy * ay) / len >= BLOCK_COS - 1e-9) {
      amount = Math.max(1, Math.round(amount * def.block));
      blocked = true;
    }
  }

  const before = body.hp;
  body.hp -= amount;
  body.hurt = 6;
  const mark = brain.stoneMarks[0];
  if (mark !== undefined && body.hp <= mark * body.maxHp) {
    // One blow never skips a phase (nor kills through a mark): stop at the mark and turn to stone.
    // The crossed mark is dropped by itself: `ceil(mark × maxHp)` sits above a fractional mark, so
    // comparing HP with the mark again would keep it (and restart the stone on every later blow).
    brain.stoneMarks.shift();
    body.hp = Math.min(before, Math.max(body.hp, Math.ceil(mark * body.maxHp)));
    startStone(brain);
    body.act = actOf(brain);
    return { amount: before - body.hp, blocked };
  }
  // Mini-bosses and bosses are never interrupted nor pushed; a guarded blow doesn't either.
  if (!normal || blocked) return { amount, blocked };

  // A blow in the wind-up cancels the attack (elites hold on).
  if (!body.elite && brain.actSlot >= 0 && brain.actSlot < MAX_ATTACKS && brain.actPhase === ActPhase.windup)
    cancelAct(brain, true);
  if (def.behaviour === "bounce") {
    // Floaters don't get pushed: they turn to fly away from the blow.
    brain.dirX = (Math.sign(body.x - fromX) || Math.sign(brain.dirX) || 1) * Math.SQRT1_2;
    brain.dirY = (Math.sign(body.y - fromY) || Math.sign(brain.dirY) || 1) * Math.SQRT1_2;
  } else if (knockSpeed > 0) {
    const midAct = brain.actSlot >= 0 && (brain.actPhase === ActPhase.windup || brain.actPhase === ActPhase.action);
    if (!(body.elite && midAct)) {
      // Knocked out of an action, a recover or a hop (a stunned recover keeps counting down).
      if (!body.elite && brain.actSlot >= 0 && !(brain.actPhase === ActPhase.recover && brain.stunned))
        cancelAct(brain, false);
      const dx = body.x - fromX;
      const dy = body.y - fromY;
      const len = Math.hypot(dx, dy) || 1;
      brain.knockX = (dx / len) * knockSpeed;
      brain.knockY = (dy / len) * knockSpeed;
      brain.knockTicks = ENEMY_KNOCK_TICKS;
    }
  }
  body.act = actOf(brain);
  return { amount, blocked };
}
