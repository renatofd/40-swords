import { describe, expect, it } from "vitest";
import { ENEMIES, ENEMY_KINDS, enemyStats, isEnemyKind } from "./enemies";

describe("enemies", () => {
  it("get stronger farther from the start", () => {
    for (const kind of ENEMY_KINDS) {
      const near = enemyStats(kind, 0, false);
      const far = enemyStats(kind, 6, false);
      expect(far.maxHp).toBeGreaterThan(near.maxHp);
      expect(far.damage).toBeGreaterThan(near.damage);
      expect(far.xp).toBeGreaterThan(near.xp);
    }
  });

  it("elites are tougher and richer", () => {
    const normal = enemyStats("goblin", 2, false);
    const elite = enemyStats("goblin", 2, true);
    expect(Math.abs(elite.maxHp - normal.maxHp * 3)).toBeLessThanOrEqual(2); // rounding
    expect(elite.damage).toBeGreaterThan(normal.damage);
    expect(Math.abs(elite.xp - normal.xp * 3)).toBeLessThanOrEqual(2);
    expect(elite.rupees[1]).toBeGreaterThan(normal.rupees[1]);
    expect(elite.half).toBe(normal.half + 1);
  });

  it("each dungeon has a mini-boss and a boss with attacks; summons are regular enemies", () => {
    const bosses = ENEMY_KINDS.filter((k) => ENEMIES[k].rank === "boss");
    const minis = ENEMY_KINDS.filter((k) => ENEMIES[k].rank === "miniboss");
    expect(bosses).toHaveLength(4);
    expect(minis.length).toBeGreaterThanOrEqual(2);
    for (const k of [...bosses, ...minis]) {
      expect(ENEMIES[k].attacks.length).toBeGreaterThan(0);
      for (const a of ENEMIES[k].attacks)
        if (a.type === "summon") {
          expect(isEnemyKind(a.kind)).toBe(true);
          expect(ENEMIES[a.kind].rank).toBe("normal");
        }
    }
  });
});
