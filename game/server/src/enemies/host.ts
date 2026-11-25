import type { CollisionGrid } from "@core/shared";
import type { EnemyKind, Rng, ShotStyle } from "@game/shared";
import type { Rect } from "./brain";

/** The synced part of an enemy the AI reads and moves (the schema `Enemy` satisfies it). */
export interface EnemyBody {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  hurt: number;
  /** encodeAct of the current act (0: none); written by the AI every tick. */
  act: number;
  elite: boolean;
}

/** A hero an enemy noticed. */
export interface HeroRef {
  id: string;
  x: number;
  y: number;
}

/** What the AI needs from the room. Every random roll goes through `rng`, in a fixed order. */
export interface EnemyHost {
  readonly grid: CollisionGrid;
  readonly rng: Rng;
  /** The nearest hero still up within `range` of (x, y), on the `home` screen. */
  nearestHero(x: number, y: number, home: Rect, range: number): HeroRef | undefined;
  /** A random open spot within `radius` of (x, y) on the `home` screen; it adds a 2 px margin to `half`. */
  freeSpot(home: Rect, half: number, x: number, y: number, radius: number): { x: number; y: number } | undefined;
  /** True while that enemy id still exists: prunes `brain.minions` before a summon's `max` check. */
  enemyAlive(id: string): boolean;
}

/** Side effects of one AI tick, applied by the room in order. */
export type EnemyEvent =
  | {
      type: "shots";
      /** Where the shots start (the enemy's position when it fired). */
      x: number;
      y: number;
      angles: number[];
      speed: number;
      range: number;
      damage: number;
      style: ShotStyle;
    }
  /**
   * Hurts every hero within `radius` (+ the hero's half) of (x, y): strikes and leap landings.
   * `walls`: a strike, which doesn't reach a hero behind a wall (seen from the enemy); a landing is a shockwave.
   */
  | { type: "area"; x: number; y: number; radius: number; damage: number; walls: boolean }
  | {
      type: "summon";
      kind: EnemyKind;
      /** Where each minion appears (picked during the tick, so the random rolls keep their order). */
      spots: { x: number; y: number }[];
    };
