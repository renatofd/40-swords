import { loadMap } from "@core/server";
import {
  ARENA_SPAWN_MIN,
  arenaRect,
  ENEMIES,
  inRect,
  OFFER_SLOTS,
  offerPosition,
  portalAt,
  screenOf,
  TILE_SIZE,
} from "@game/shared";
import { describe, expect, it } from "vitest";
import { loadWorldInfo, loadWorldObjects } from "../src/world/mapObjects";

const map = loadMap("overworld", { tileSize: TILE_SIZE });
const objects = loadWorldObjects("overworld");
const info = loadWorldInfo("overworld");
const solidAt = (x: number, y: number) => map.collision.isSolid(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));

describe("overworld objects", () => {
  it("is a big world of screens with dungeons and caves", () => {
    expect(info.columns).toBe(16);
    expect(info.rows).toBe(8);
    expect(info.biomes).toHaveLength(16 * 8);
    expect(info.areas.filter((a) => a.kind === "dungeon")).toHaveLength(4);
    expect(info.areas.filter((a) => a.kind === "cave").length).toBeGreaterThanOrEqual(6);
    expect(objects.enemies.length).toBeGreaterThan(300);
    expect(objects.chests.length).toBeGreaterThan(20);
    expect(objects.vendors.length).toBeGreaterThanOrEqual(4);
    const ranks = objects.enemies.map((e) => ENEMIES[e.kind].rank);
    expect(ranks.filter((r) => r === "boss")).toHaveLength(4);
    expect(ranks.filter((r) => r === "miniboss")).toHaveLength(4);
  });

  /** Tiles a hero can walk to from the start, through portals too. */
  function reachableFromStart() {
    const { width, height, tileSize } = map.collision;
    const seen = new Set<number>();
    const queue: [number, number][] = [];
    const visit = (tx: number, ty: number) => {
      const k = ty * width + tx;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height || seen.has(k) || map.collision.isSolid(tx, ty)) return;
      seen.add(k);
      queue.push([tx, ty]);
    };
    for (const s of map.spawns) visit(Math.floor(s.x / tileSize), Math.floor(s.y / tileSize));
    while (queue.length > 0) {
      const [tx, ty] = queue.pop() as [number, number];
      const portal = portalAt(objects.portals, tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2);
      if (portal) {
        visit(Math.floor(portal.toX / tileSize), Math.floor(portal.toY / tileSize));
        continue;
      }
      visit(tx + 1, ty);
      visit(tx - 1, ty);
      visit(tx, ty + 1);
      visit(tx, ty - 1);
    }
    return (p: { x: number; y: number }) => seen.has(Math.floor(p.y / tileSize) * width + Math.floor(p.x / tileSize));
  }

  it("every boss, chest and vendor can be reached from the start, walking and through portals", () => {
    const reached = reachableFromStart();
    for (const e of objects.enemies) if (ENEMIES[e.kind].rank !== "normal") expect(reached(e)).toBe(true);
    for (const c of objects.chests) expect(reached(c)).toBe(true);
    for (const v of objects.vendors) expect(reached(offerPosition(v, 1))).toBe(true);
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

  it("has a closed battle royale arena with spawns spread on open floor", () => {
    const arena = arenaRect(info);
    if (!arena) throw new Error("no arena");
    expect(arena.width).toBe(640);
    expect(arena.height).toBe(352);
    expect(objects.arenaSpawns.length).toBeGreaterThanOrEqual(ARENA_SPAWN_MIN);
    const reached = reachableFromStart();
    for (const spot of objects.arenaSpawns) {
      expect(inRect(arena, spot.x, spot.y)).toBe(true);
      expect(solidAt(spot.x, spot.y)).toBe(false);
      expect(reached(spot)).toBe(false); // only the server's teleport leads there
      expect(Math.hypot(spot.x - arena.centerX, spot.y - arena.centerY)).toBeGreaterThan(64);
    }
    for (const p of objects.portals) expect(inRect(arena, p.toX, p.toY)).toBe(false);
  });
});
