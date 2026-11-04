import type { CollisionGrid } from "@core/shared";
import { describe, expect, it } from "vitest";
import { statsFor } from "./classes";
import { projectileDamage, rollProjectileHit } from "./combat";
import { TILE_SIZE } from "./constants";
import { createRng } from "./rng";
import { scaledCooldown, sweptHit, travelDistance, volleyAngles, WEAPON_IDS, WEAPONS } from "./weapons";

const knight = statsFor("knight", 1);

describe("weapons", () => {
  it("each copy adds projectiles to the volley, with no limit", () => {
    expect(volleyAngles("dagger", 1, 0)).toEqual([0]);
    expect(volleyAngles("dagger", 3, 0)).toHaveLength(3);
    expect(volleyAngles("dagger", 250, 0)).toHaveLength(250);
    expect(volleyAngles("nova", 8 * 2, 0)).toHaveLength(16);
  });

  it("fans stay centred on the facing and within their spread", () => {
    const angles = volleyAngles("fireball", 5, 2); // facing south
    const mid = angles[2] ?? 0;
    expect(mid).toBeCloseTo(Math.PI / 2);
    const spread = (angles.at(-1) ?? 0) - (angles[0] ?? 0);
    expect(spread).toBeLessThanOrEqual((WEAPONS.fireball.maxSpreadDeg * Math.PI) / 180 + 1e-9);
  });

  it("a nova rings all around the hero", () => {
    const angles = volleyAngles("nova", 8, 0);
    const gaps = angles.slice(1).map((a, i) => a - (angles[i] ?? 0));
    for (const g of gaps) expect(g).toBeCloseTo(Math.PI / 4);
  });

  it("projectiles stop at walls", () => {
    const grid: CollisionGrid = {
      width: 10,
      height: 1,
      tileSize: TILE_SIZE,
      isSolid: (tx, ty) => ty !== 0 || tx < 0 || tx >= 10 || tx === 5,
    };
    expect(travelDistance(grid, 8, 8, 1, 0, 200)).toBeLessThan(5 * TILE_SIZE - 8);
    expect(travelDistance(grid, 8, 8, 1, 0, 40)).toBe(40);
  });

  it("hits along the path, not only at the end of the tick", () => {
    expect(sweptHit(0, 0, 20, 0, 2, 10, 4, 3)).toBe(true);
    expect(sweptHit(0, 0, 20, 0, 2, 10, 9, 3)).toBe(false);
    expect(sweptHit(0, 0, 20, 0, 2, 30, 0, 3)).toBe(false);
  });

  it("damage grows with rarity and strength; cooldowns shrink with haste", () => {
    for (const id of WEAPON_IDS) {
      expect(projectileDamage(id, 4, knight)).toBeGreaterThan(projectileDamage(id, 0, knight));
      expect(projectileDamage(id, 0, { ...knight, damage: 30 })).toBeGreaterThan(projectileDamage(id, 0, knight));
      expect(scaledCooldown(WEAPONS[id].cooldownTicks, 70)).toBeLessThan(WEAPONS[id].cooldownTicks);
    }
    const hit = rollProjectileHit("arrow", 2, { ...knight, critChance: 0 }, 0, createRng(1));
    expect(hit.amount).toBe(Math.round(projectileDamage("arrow", 2, knight)));
  });
});
