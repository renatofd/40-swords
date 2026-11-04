/** Enemy archetypes. Stage 1 has two; elites, mini-bosses and bosses come later. */

export const ENEMY_KINDS = ["slime", "goblin"] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export const isEnemyKind = (v: unknown): v is EnemyKind =>
  typeof v === "string" && (ENEMY_KINDS as readonly string[]).includes(v);

export interface EnemyDef {
  maxHp: number;
  /** Contact damage. */
  damage: number;
  defense: number;
  /** px/s */
  speed: number;
  /** Collision half-extent in px. */
  half: number;
  xp: number;
  /** Rupees dropped on death, inclusive range. */
  rupees: [number, number];
  /** "wander" drifts around; "chase" runs at players within `aggroRange`. */
  behaviour: "wander" | "chase";
  aggroRange: number;
  /** Seconds before its spawner brings it back. */
  respawnSeconds: number;
  /** Placeholder colour. */
  color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: {
    maxHp: 18,
    damage: 6,
    defense: 0,
    speed: 22,
    half: 5,
    xp: 4,
    rupees: [1, 2],
    behaviour: "wander",
    aggroRange: 0,
    respawnSeconds: 20,
    color: 0x6fd64f,
  },
  goblin: {
    maxHp: 34,
    damage: 10,
    defense: 1,
    speed: 44,
    half: 5,
    xp: 10,
    rupees: [2, 4],
    behaviour: "chase",
    aggroRange: 80,
    respawnSeconds: 25,
    color: 0xc94a4a,
  },
};
