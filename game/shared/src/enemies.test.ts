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

  it("regular monsters around the start are a bit weaker in the overworld, not in dungeons", () => {
    for (const tier of [0, 1, 2]) {
      const outside = enemyStats("goblin", tier, false, true);
      const inside = enemyStats("goblin", tier, false, false);
      expect(outside.maxHp).toBeLessThan(inside.maxHp);
      expect(outside.damage).toBeLessThan(inside.damage);
      expect(outside.xp).toBe(inside.xp);
      expect(outside.rupees).toEqual(inside.rupees);
    }
    // Still stronger the farther they are, and the same as before from tier 3 on.
    expect(enemyStats("goblin", 1, false, true).maxHp).toBeGreaterThan(enemyStats("goblin", 0, false, true).maxHp);
    expect(enemyStats("goblin", 2, false, true).maxHp).toBeGreaterThan(enemyStats("goblin", 1, false, true).maxHp);
    expect(enemyStats("goblin", 3, false, true)).toEqual(enemyStats("goblin", 3, false, false));
    // Bosses keep their strength wherever they are.
    expect(enemyStats("warden", 0, false, true)).toEqual(enemyStats("warden", 0, false, false));
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
