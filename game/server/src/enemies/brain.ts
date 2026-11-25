import { ActPhase, type EnemyDef, type EnemyKind, type EnemySpawn, type EnemyStats, type Rng } from "@game/shared";

/** An axis-aligned rectangle in px (an enemy's home screen). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A map spawner and the enemy it currently has out. */
export interface SpawnerState extends EnemySpawn {
  enemyId?: string;
  /** Tick at which a new enemy appears (when `enemyId` is empty). */
  respawnAt: number;
}

/** Server-only enemy data (AI, acts, knockback); the synced part lives in `Enemy` (see EnemyBody). */
export interface EnemyBrain {
  kind: EnemyKind;
  def: EnemyDef;
  stats: EnemyStats;
  /** Difficulty tier it was made with (see enemyStats). */
  tier: number;
  spawner?: SpawnerState;
  /** Minions this enemy summoned (they vanish with it). */
  minions: Set<string>;
  /** Enemies stay on the screen they spawned on. */
  home: Rect;
  /** Unit direction of wander / hop / bounce movement. */
  dirX: number;
  dirY: number;
  /** Ticks until the AI picks a new direction (or ends a rest, or the next hop, or the next strafe flip). */
  turnIn: number;
  knockX: number;
  knockY: number;
  knockTicks: number;
  /** Ticks until each attack of `def.attacks` is ready. */
  attackCd: number[];

  // ─── The act (Enemy.act): an attack (slots 0-5), the stone (6) or a hop (7) ───
  /** -1: no act. */
  actSlot: number;
  actPhase: ActPhase;
  /** Ticks left in the current phase. */
  actLeft: number;
  /** Recover after a charge hit a wall (a free hit for heroes). */
  stunned: boolean;
  /** Unit aim of the act (axis-snapped for `aligned` attacks). */
  aimX: number;
  aimY: number;
  /** Leap landing spot / blink spot. */
  destX: number;
  destY: number;
  /** Where a leap took off. */
  fromX: number;
  fromY: number;
  /** Walls a charge may still reflect off. */
  bounces: number;
  /** ACT_GAP_TICKS countdown: no new attack or hop while > 0. */
  gap: number;
  /** LOS_RECHECK_TICKS countdown after a failed line-of-sight check. */
  losWait: number;

  // ─── Movement state ───
  /** Kite: side it strafes to. */
  strafe: 1 | -1;
  /** Cardinal: current axis (0 x, 1 y). */
  axis: 0 | 1;
  /** Cardinal: ticks it keeps an axis it flipped to after bumping into a wall. */
  axisHold: number;
  /** Burst: > 0 moving, < 0 pausing. */
  burstLeft: number;
  /** Wake kinds: ticks left awake (0 = dormant). */
  awake: number;
  /** Stone marks (HP shares) not reached yet. */
  stoneMarks: number[];
  /** Stone action: hits do nothing. */
  invuln: boolean;
  /** Last actual velocity in px/s (bots). */
  vx: number;
  vy: number;
  /** It wanted to move last tick but went nowhere (walls on every side it pushed). */
  stuck: boolean;
  /** +1 at every act start (attack, stone, hop): bots key threats on it. */
  actSeq: number;
  /** Cardinal: ticks the target has stayed in another quadrant while it stands still (TURN_TICKS). */
  turnWait: number;
}

/** A fresh brain for a new enemy of `kind`, living on the `home` screen. `bounce` movers roll their diagonal here. */
export function createBrain(
  kind: EnemyKind,
  def: EnemyDef,
  stats: EnemyStats,
  tier: number,
  home: Rect,
  spawner: SpawnerState | undefined,
  rng: Rng,
): EnemyBrain {
  let dirX = 0;
  let dirY = 0;
  if (def.behaviour === "bounce") {
    const diagonal = Math.floor(rng() * 4);
    dirX = (diagonal & 1 ? -1 : 1) * Math.SQRT1_2;
    dirY = (diagonal & 2 ? -1 : 1) * Math.SQRT1_2;
  }
  return {
    kind,
    def,
    stats,
    tier,
    spawner,
    minions: new Set(),
    home,
    dirX,
    dirY,
    turnIn: 0,
    knockX: 0,
    knockY: 0,
    knockTicks: 0,
    // A short grace before the first attacks.
    attackCd: def.attacks.map((a) => Math.floor(a.cooldownTicks / 2)),
    actSlot: -1,
    actPhase: ActPhase.none,
    actLeft: 0,
    stunned: false,
    aimX: 0,
    aimY: 1,
    destX: 0,
    destY: 0,
    fromX: 0,
    fromY: 0,
    bounces: 0,
    gap: 0,
    losWait: 0,
    strafe: 1,
    axis: 0,
    axisHold: 0,
    burstLeft: 0,
    awake: 0,
    stoneMarks: [...(def.stone?.marks ?? [])],
    invuln: false,
    vx: 0,
    vy: 0,
    stuck: false,
    actSeq: 0,
    turnWait: 0,
  };
}
