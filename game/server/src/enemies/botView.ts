import type { CollisionGrid } from "@core/shared";
import {
  ACT_MOVE,
  ACT_STONE,
  ActPhase,
  type AttackDef,
  type Enemy,
  enemyPhase,
  facingVector,
  MAX_ATTACKS,
  PHASE2_SPEED,
  SHOT_DEFS,
  TICK_RATE,
  travelDistance,
} from "@game/shared";
import { type BotEnemy, enemyDanger, type Threat } from "../bots/BotBrain";
import { fanAngles, untargetable } from "./acts";
import type { EnemyBrain } from "./brain";

/** A ring's tell: heroes this close (px) are in it. */
const RING_ZONE = 48;
/** A wisp's flight ahead of it read as a threat (px). */
const FLIGHT_LANE = 40;

/** Strongest blow of an attack (tier 0, before `shotDamage`); 0 for attacks that hurt by contact or not at all. */
function attackDamage(a: AttackDef): number {
  switch (a.type) {
    case "aimed":
    case "ring":
    case "strike":
    case "leap":
      return a.damage;
    default:
      return 0;
  }
}

/**
 * A monster as bots see it (spec §5.1): what a player reads on screen, its body, its open or
 * guarded state and the tell of the attack it is winding up (lanes and zones keyed by
 * `brain.actSeq`). Pure: the room memoizes it per enemy per tick (every bot shares it).
 */
export function botEnemyOf(id: string, enemy: Enemy, brain: EnemyBrain, grid: CollisionGrid): BotEnemy {
  const { def, stats } = brain;
  const { half, defense } = stats;
  let strongest = 0;
  let ranged = false;
  for (const a of def.attacks) {
    strongest = Math.max(strongest, attackDamage(a));
    if (a.type === "aimed" || a.type === "ring") ranged = true;
  }
  const attacking = brain.actSlot >= 0 && brain.actSlot < MAX_ATTACKS;
  const guarding =
    def.block !== undefined && !brain.stunned && (brain.actSlot < 0 || brain.actPhase === ActPhase.windup);
  const [fx, fy] = facingVector(enemy.facing);
  return {
    id,
    x: enemy.x,
    y: enemy.y,
    hp: enemy.hp,
    half,
    defense,
    damage: Math.max(stats.damage, strongest * stats.shotDamage),
    danger: enemyDanger(def.rank, brain.tier, enemy.elite, def.danger ?? 0),
    // Dormant kinds (perched bats, sleeping spiders) only matter once awake.
    aggressive:
      def.wake !== undefined
        ? brain.awake > 0
        : def.aggroRange > 0 || (def.hop?.seek ?? 0) > 0 || def.attacks.length > 0 || def.behaviour === "bounce",
    ranged: ranged,
    invulnerable: brain.invuln || untargetable(brain),
    block: guarding ? { fx, fy } : undefined,
    elite: enemy.elite,
    interruptible: def.rank === "normal" && !enemy.elite,
    open: (attacking || brain.actSlot === ACT_STONE) && brain.actPhase === ActPhase.recover,
    vx: brain.vx / TICK_RATE,
    vy: brain.vy / TICK_RATE,
    threats: threatsOf(id, enemy, brain, grid),
  };
}

/** Where the act it is in is about to hurt (spec §5.1 table); empty when nothing is coming. */
export function threatsOf(id: string, enemy: Enemy, brain: EnemyBrain, grid: CollisionGrid): Threat[] {
  const { def, stats } = brain;
  const { x, y } = enemy;
  const key = `${id}:${brain.actSeq}`;
  const phase = brain.actPhase;
  const windup = phase === ActPhase.windup ? brain.actLeft : 0;
  const lane = (dirX: number, dirY: number, length: number, width: number, ticks: number, speed: number, k = key) =>
    ({ kind: "lane", x, y, dirX, dirY, length, width, ticks, speed, key: k }) as const;

  if (brain.actSlot < 0) {
    // A wisp flies at whatever is ahead of it, all the time.
    const speed = Math.hypot(brain.vx, brain.vy);
    if (def.behaviour !== "bounce" || speed === 0) return [];
    return [
      lane(brain.vx / speed, brain.vy / speed, FLIGHT_LANE, 2 * stats.half + 4, 0, speed / TICK_RATE, `${id}:fly`),
    ];
  }
  if (brain.actSlot === ACT_STONE) {
    if (phase === ActPhase.recover) return [];
    return [{ kind: "zone", x, y, radius: stats.half + 20, ticks: brain.actLeft, key }];
  }
  if (brain.actSlot === ACT_MOVE) {
    // A hop at a hero: the crouch is the tell, the jump the lane (only kinds that jump at heroes).
    const hop = def.hop;
    if (!hop || hop.seek <= 0 || (phase !== ActPhase.windup && phase !== ActPhase.action)) return [];
    const spd = stats.speed / TICK_RATE;
    const air = phase === ActPhase.windup ? hop.air : brain.actLeft;
    return [lane(brain.dirX, brain.dirY, spd * air + stats.half, 2 * stats.half + 4, windup, spd)];
  }
  const a = def.attacks[brain.actSlot];
  if (!a || phase === ActPhase.recover) return [];
  switch (a.type) {
    case "charge": {
      if (phase !== ActPhase.windup && phase !== ActPhase.action) return [];
      const speed = (a.speed * (enemyPhase(def, enemy.hp, enemy.maxHp) === 2 ? PHASE2_SPEED : 1)) / TICK_RATE;
      const ticks = phase === ActPhase.windup ? a.ticks : brain.actLeft;
      const length = travelDistance(grid, x, y, brain.aimX, brain.aimY, speed * ticks) + stats.half;
      return [lane(brain.aimX, brain.aimY, length, 2 * stats.half, windup, speed)];
    }
    case "aimed": {
      if (phase !== ActPhase.windup) return [];
      const width = 2 * SHOT_DEFS[a.style].radius + 2;
      const speed = a.speed / TICK_RATE;
      return fanAngles(Math.atan2(brain.aimY, brain.aimX), a.count, a.spreadDeg).map((angle, i) => {
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const length = travelDistance(grid, x, y, dirX, dirY, a.range);
        return lane(dirX, dirY, length, width, windup, speed, `${key}:${i}`);
      });
    }
    case "strike":
      if (phase !== ActPhase.windup) return [];
      return [
        {
          kind: "zone",
          x: x + brain.aimX * a.offset,
          y: y + brain.aimY * a.offset,
          radius: a.radius,
          ticks: windup,
          key,
        },
      ];
    case "leap":
      return [
        {
          kind: "zone",
          x: brain.destX,
          y: brain.destY,
          radius: a.radius + 6,
          ticks: phase === ActPhase.windup ? windup + a.ticks : brain.actLeft,
          key,
        },
      ];
    case "ring":
      if (phase !== ActPhase.windup) return [];
      return [{ kind: "zone", x, y, radius: Math.min(a.range, RING_ZONE), ticks: windup, key }];
    default:
      return [];
  }
}
