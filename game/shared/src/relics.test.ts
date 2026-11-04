import { describe, expect, it } from "vitest";
import { statsFor } from "./classes";
import {
  computeStats,
  MAX_RARITY,
  MAX_SPEED,
  OFFER_SLOTS,
  offerPosition,
  offerPrice,
  PASSIVE_IDS,
  passiveValue,
  RARITIES,
  rarityWeights,
  rollRarity,
  weaponCopies,
} from "./relics";
import { createRng } from "./rng";

const averageRarity = (luck: number) => {
  const rng = createRng(99);
  let sum = 0;
  for (let i = 0; i < 5000; i++) sum += rollRarity(luck, rng);
  return sum / 5000;
};

describe("rarity", () => {
  it("goes from common to legendary", () => {
    expect(RARITIES).toEqual(["common", "uncommon", "rare", "epic", "legendary"]);
  });

  it("luck makes better rarities more likely", () => {
    expect(averageRarity(10)).toBeGreaterThan(averageRarity(0) + 0.15);
    const [, , , , legendaryNoLuck = 0] = rarityWeights(0);
    const [, , , , legendaryLucky = 0] = rarityWeights(20);
    expect(legendaryLucky).toBeGreaterThan(legendaryNoLuck * 5);
  });

  it("every rarity can drop, and a floor is respected", () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i++) seen.add(rollRarity(5, rng));
    expect(seen.size).toBe(RARITIES.length);
    for (let i = 0; i < 500; i++) expect(rollRarity(0, rng, 2)).toBeGreaterThanOrEqual(2);
    expect(rollRarity(0, () => 0.999999, MAX_RARITY)).toBe(MAX_RARITY);
  });
});

describe("relics", () => {
  it("rarer copies are stronger", () => {
    for (const id of PASSIVE_IDS)
      for (let r = 1; r <= MAX_RARITY; r++) expect(passiveValue(id, r)).toBeGreaterThan(passiveValue(id, r - 1));
  });

  it("add to the hero's attributes", () => {
    const base = statsFor("knight", 3);
    const s = computeStats("knight", 3, [
      { kind: "heart", rarity: 0 },
      { kind: "heart", rarity: 4 },
      { kind: "eye", rarity: 2 },
      { kind: "haste", rarity: 4 },
      { kind: "dagger", rarity: 3 }, // weapons don't change attributes
    ]);
    expect(s.maxHp).toBe(Math.round(base.maxHp + passiveValue("heart", 0) + passiveValue("heart", 4)));
    expect(s.critChance).toBeCloseTo(base.critChance + passiveValue("eye", 2));
    expect(s.cooldownPct).toBe(100 - passiveValue("haste", 4));
    expect(s.attackCooldownTicks).toBeLessThan(base.attackCooldownTicks);
    expect(s.damage).toBe(base.damage);
  });

  it("keep movement physically possible however many are stacked", () => {
    const boots = Array.from({ length: 100 }, () => ({ kind: "boots", rarity: 4 }));
    expect(computeStats("rogue", 1, boots).speed).toBe(MAX_SPEED);
  });

  it("weapon copies keep their own rarity", () => {
    const relics = [
      { kind: "dagger", rarity: 1 },
      { kind: "arrow", rarity: 0 },
      { kind: "dagger", rarity: 4 },
    ];
    expect(weaponCopies(relics, "dagger")).toEqual([4, 1]);
    expect(weaponCopies(relics, "nova")).toEqual([]);
  });

  it("cost more when rarer, weapons more than passives", () => {
    for (let r = 1; r <= MAX_RARITY; r++) expect(offerPrice("heart", r)).toBeGreaterThan(offerPrice("heart", r - 1));
    expect(offerPrice("dagger", 2)).toBeGreaterThan(offerPrice("heart", 2));
    expect(offerPrice("potion", 4)).toBe(offerPrice("potion", 0));
  });

  it("vendor offers sit in a row in front of the vendor", () => {
    const slots = Array.from({ length: OFFER_SLOTS }, (_, i) => offerPosition({ x: 100, y: 50 }, i));
    expect(slots.map((p) => p.y)).toEqual([82, 82, 82]);
    expect(new Set(slots.map((p) => p.x)).size).toBe(OFFER_SLOTS);
  });
});
