import type { ClassId } from "../classes";

/** Message types between client and server (besides per-tick inputs). */
export const Msg = {
  /** client → server: pick a class and enter the world. */
  spawn: "spawn",
  /** server → nearby clients: a damage number to show. */
  damage: "dmg",
  /** server → one client: you reached a new level. */
  levelUp: "lvl",
} as const;

export interface SpawnMessage {
  classId: ClassId;
}

export interface DamageMessage {
  x: number;
  y: number;
  amount: number;
  crit: boolean;
  /** True when a player was hurt (shown in another colour). */
  player: boolean;
}

export interface LevelUpMessage {
  level: number;
}
