import { loadMap } from "@core/server";
import { OFFER_SLOTS, offerPosition, portalAt, screenOf, TILE_SIZE } from "@game/shared";
import { describe, expect, it } from "vitest";
import { loadWorldObjects } from "../src/world/mapObjects";

const map = loadMap("overworld", { tileSize: TILE_SIZE });
const objects = loadWorldObjects("overworld");
const solidAt = (x: number, y: number) => map.collision.isSolid(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));

describe("overworld objects", () => {
  it("has enemies, chests, vendors and portals", () => {
    expect(objects.enemies.length).toBeGreaterThan(10);
    expect(objects.chests.length).toBeGreaterThan(0);
    expect(objects.vendors.length).toBeGreaterThan(0);
    expect(objects.portals.length).toBeGreaterThan(0);
  });

  it("portals land on open floor outside any portal, and every cave has a way out", () => {
    for (const p of objects.portals) {
      expect(solidAt(p.toX, p.toY)).toBe(false);
      expect(portalAt(objects.portals, p.toX, p.toY)).toBeUndefined();
      // The destination is next to a portal that leads back.
      const back = objects.portals.find((q) => Math.hypot(q.x + q.width / 2 - p.toX, q.y + q.height / 2 - p.toY) <= 16);
      expect(back).toBeDefined();
    }
  });

  it("chests and vendor offers lie on open floor; each vendor has its own screen", () => {
    for (const c of objects.chests) expect(solidAt(c.x, c.y)).toBe(false);
    for (const v of objects.vendors)
      for (let slot = 0; slot < OFFER_SLOTS; slot++) {
        const at = offerPosition(v, slot);
        expect(solidAt(at.x, at.y)).toBe(false);
      }
    const screens = objects.vendors.map((v) => JSON.stringify(screenOf(v.x, v.y)));
    expect(new Set(screens).size).toBe(screens.length);
  });
});
