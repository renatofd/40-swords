import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env, loadMap } from "@core/server";
import {
  ARENA_SPAWN_MIN,
  areaAt,
  arenaRect,
  ENEMIES,
  ENEMY_KINDS,
  type EnemyKind,
  inRect,
  OFFER_SLOTS,
  offerPosition,
  portalAt,
  screenOf,
  TILE_SIZE,
} from "@game/shared";
import { describe, expect, it } from "vitest";
import { loadProps, loadWorldInfo, loadWorldObjects } from "../src/world/mapObjects";

const map = loadMap("overworld", { tileSize: TILE_SIZE });
const objects = loadWorldObjects("overworld");
const info = loadWorldInfo("overworld");
const solidAt = (x: number, y: number) => map.collision.isSolid(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));

/**
 * sha256 of the tile layers (name + data) of content/maps/overworld.tmj, recorded before stage 8B
 * changed the enemy pools: placing other kinds must not move a single tile. Regenerating the world
 * on purpose (new layout, new art) changes it; record the new value then. Last: stage 10, forests made
 * of whole big trees (only wall cells look different; objects and collision are unchanged).
 */
const TILE_LAYERS_SHA256 = "0a4ad1c88933d821c0b8ba16ddc1fedb684aebe12d01bd2fb6e3ea7351f9bef8";

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

  it("has tall grass on grassy screens outside and pots in caves and dungeons, on open floor clear of the rest", () => {
    const { props, broken } = loadProps("overworld");
    // Every look has its broken look, and there are several looks of each kind.
    for (const p of props) expect(broken[p.gid]).toBeGreaterThan(0);
    for (const kind of ["bush", "pot"])
      expect(new Set(props.filter((p) => p.kind === kind).map((p) => p.gid)).size).toBeGreaterThan(1);
    const bushes = props.filter((p) => p.kind === "bush");
    const pots = props.filter((p) => p.kind === "pot");
    expect(bushes.length).toBeGreaterThan(300);
    expect(pots.length).toBeGreaterThan(60);
    const reached = reachableFromStart();
    const start = screenOf(map.spawns[0]?.x ?? 0, map.spawns[0]?.y ?? 0);
    const offers = objects.vendors.flatMap((v) => [0, 1, 2].map((slot) => offerPosition(v, slot)));
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) <= TILE_SIZE && Math.abs(a.y - b.y) <= TILE_SIZE;
    for (const p of props) {
      expect(solidAt(p.x, p.y)).toBe(false);
      expect(reached(p)).toBe(true);
      expect(portalAt(objects.portals, p.x, p.y)).toBeUndefined();
      expect([...objects.chests, ...offers].some((spot) => near(spot, p))).toBe(false);
      const { col, row } = screenOf(p.x, p.y);
      const area = areaAt(info.areas, col, row);
      if (p.kind === "bush") {
        expect(row).toBeLessThan(info.rows);
        expect(col !== start.col || row !== start.row).toBe(true);
      } else expect(area?.kind === "cave" || area?.kind === "dungeon").toBe(true);
    }
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

  it("keeps the tile layers of the map (enemy pools change only enemy kinds)", () => {
    const raw = JSON.parse(readFileSync(join(env.mapsDir, "overworld.tmj"), "utf8")) as {
      layers: { type: string; name: string; data?: number[] }[];
    };
    const layers = raw.layers.filter((l) => l.type === "tilelayer").map((l) => ({ name: l.name, data: l.data }));
    expect(layers.length).toBeGreaterThan(0);
    expect(createHash("sha256").update(JSON.stringify(layers)).digest("hex")).toBe(TILE_LAYERS_SHA256);
  });

  it("places enemies on a difficulty ladder: easy kinds near the start, telegraphed attacks farther out", () => {
    const NEAR = new Set<EnemyKind>(["slime", "goblin", "bat", "shroom", "lurker", "wolf"]);
    // Rings 3-4 add the first telegraphs: the skeleton (a thrown bone) and the scorpion (a charge).
    // (The axeman was planned here too; balance runs moved it out to ring 5, see overworld.ts.)
    const MID = new Set<EnemyKind>([...NEAR, "skeleton", "scorpion"]);
    const start = screenOf(map.spawns[0]?.x ?? 0, map.spawns[0]?.y ?? 0);
    const outside = objects.enemies.filter((e) => !e.dungeon);
    const bands = { near: 0, mid: 0, far: 0 };
    for (const e of outside) {
      const { col, row } = screenOf(e.x, e.y);
      const ring = Math.max(Math.abs(col - start.col), Math.abs(row - start.row));
      expect(ENEMIES[e.kind].rank).toBe("normal");
      if (ring <= 2) {
        bands.near++;
        expect(NEAR.has(e.kind), `${e.kind} at ring ${ring}`).toBe(true);
      } else if (ring <= 4) {
        bands.mid++;
        expect(MID.has(e.kind), `${e.kind} at ring ${ring}`).toBe(true);
      } else bands.far++;
      // Every dangerous kind stays at ring 5 or beyond (or in a dungeon).
      if ((ENEMIES[e.kind].danger ?? 0) > 0) expect(ring, e.kind).toBeGreaterThanOrEqual(5);
    }
    for (const band of Object.values(bands)) expect(band).toBeGreaterThan(30);
  });

  it("gives every normal kind enough spawners, and the whole roster a place", () => {
    const count = new Map<EnemyKind, number>();
    for (const e of objects.enemies) count.set(e.kind, (count.get(e.kind) ?? 0) + 1);
    for (const kind of ENEMY_KINDS) {
      if (ENEMIES[kind].rank === "normal") expect(count.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(6);
      else expect(count.get(kind) ?? 0, kind).toBe(1);
    }
  });

  it("gives each dungeon its own mini-boss and boss", () => {
    const expected: Record<string, [EnemyKind, EnemyKind]> = {
      crypt: ["hexer", "warden"],
      lair: ["drake", "witch"],
      tomb: ["brute", "matriarch"],
      hall: ["warlord", "colossus"],
    };
    const dungeons = info.areas.filter((a) => a.kind === "dungeon");
    expect(dungeons.map((a) => a.id).sort()).toEqual(Object.keys(expected).sort());
    for (const area of dungeons) {
      const inside = objects.enemies.filter((e) => {
        const { col, row } = screenOf(e.x, e.y);
        return areaAt(info.areas, col, row) === area;
      });
      for (const e of inside) expect(e.dungeon).toBe(true);
      const [miniboss, boss] = expected[area.id] as [EnemyKind, EnemyKind];
      expect(inside.filter((e) => ENEMIES[e.kind].rank === "miniboss").map((e) => e.kind)).toEqual([miniboss]);
      expect(inside.filter((e) => ENEMIES[e.kind].rank === "boss").map((e) => e.kind)).toEqual([boss]);
      expect(inside.filter((e) => ENEMIES[e.kind].rank === "normal").length).toBeGreaterThan(10);
    }
  });
});
