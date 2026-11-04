import { describe, expect, it } from "vitest";
import { CLASS_IDS, MAX_LEVEL, statsFor, xpToNext } from "./classes";
import { hitboxTouches, mitigate, rollHit, rollRupees, swordHitbox } from "./combat";
import { createRng } from "./rng";

describe("classes", () => {
  it("have all the attributes and grow with level", () => {
    for (const id of CLASS_IDS) {
      const l1 = statsFor(id, 1);
      const l10 = statsFor(id, 10);
      for (const key of ["maxHp", "damage", "speed", "luck", "critChance", "critDamage", "defense"] as const)
        expect(l1[key]).toBeGreaterThan(0);
      expect(l1.lifesteal).toBeGreaterThanOrEqual(0);
      expect(l10.maxHp).toBeGreaterThan(l1.maxHp);
      expect(l10.damage).toBeGreaterThan(l1.damage);
    }
  });

  it("need more XP for each level", () => {
    for (let l = 1; l < MAX_LEVEL; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
});

describe("combat", () => {
  const knight = statsFor("knight", 1);

  it("the sword reaches in front, not behind", () => {
    const east = swordHitbox(0, 0, 0, knight.reach);
    expect(hitboxTouches(east, 14, 0, 5)).toBe(true);
    expect(hitboxTouches(east, -14, 0, 5)).toBe(false);
    const north = swordHitbox(0, 0, 6, knight.reach);
    expect(hitboxTouches(north, 0, -14, 5)).toBe(true);
  });

  it("defense reduces damage but a hit always does at least 1", () => {
    expect(mitigate(10, 4)).toBe(6);
    expect(mitigate(3, 50)).toBe(1);
  });

  it("crits multiply damage and life steal heals a share of it", () => {
    const always = { ...knight, critChance: 1, lifesteal: 0.5 };
    const hit = rollHit(always, 0, createRng(1));
    expect(hit.crit).toBe(true);
    expect(hit.amount).toBe(Math.round(knight.damage * knight.critDamage));
    expect(hit.heal).toBeCloseTo(hit.amount * 0.5);
    const never = rollHit({ ...knight, critChance: 0 }, 2, createRng(1));
    expect(never).toEqual({ amount: knight.damage - 2, crit: false, heal: 0 });
  });

  it("crit rate follows critChance", () => {
    const rng = createRng(42);
    const stats = { ...knight, critChance: 0.25 };
    let crits = 0;
    for (let i = 0; i < 4000; i++) if (rollHit(stats, 0, rng).crit) crits++;
    expect(crits / 4000).toBeGreaterThan(0.22);
    expect(crits / 4000).toBeLessThan(0.28);
  });

  it("luck makes double rupee drops more likely", () => {
    const total = (luck: number) => {
      const rng = createRng(7);
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += rollRupees([1, 2], luck, rng);
      return sum;
    };
    expect(total(10)).toBeGreaterThan(total(0) * 1.2);
  });
});
