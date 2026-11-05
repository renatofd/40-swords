import { loadMap } from "@core/server";
import {
  ENEMIES,
  type PlayerSimState,
  portalAt,
  type SimWorld,
  stepPlayer,
  TICK_DT,
  TILE_SIZE,
  WEAPON_IDS,
  weaponCooldownKey,
  weaponCountKey,
} from "@game/shared";
import { describe, expect, it } from "vitest";
import { Navigation } from "../src/bots/navigation";
import { loadWorldInfo, loadWorldObjects } from "../src/world/mapObjects";

const map = loadMap("overworld", { tileSize: TILE_SIZE });
const objects = loadWorldObjects("overworld");
const info = loadWorldInfo("overworld");
const nav = new Navigation(map.collision, objects.portals);
const world: SimWorld = { grid: map.collision, portals: objects.portals };
const start = map.spawns[0] ?? { x: 0, y: 0 };
const startNode = nav.nodeAt(start.x, start.y);

function hero(x: number, y: number): PlayerSimState {
  const weapons = Object.fromEntries(
    WEAPON_IDS.flatMap((w) => [[weaponCountKey(w), 0] as const, [weaponCooldownKey(w), 0] as const]),
  );
  return {
    ...(weapons as Record<string, number>),
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 2,
    cooldown: 0,
    lock: 0,
    swing: 0,
    knockX: 0,
    knockY: 0,
    knockTicks: 0,
    dead: false,
    speed: 80,
    swingCd: 12,
    cdPct: 100,
    vseq: 0,
    vmask: 0,
    warp: 0,
  } as PlayerSimState;
}

/** Walks a hero (the real player step) to a screen the way bots do; the ticks it took, or -1. */
function walk(h: PlayerSimState, screen: number, maxTicks = 8000) {
  for (let t = 0; t < maxTicks; t++) {
    const dir = nav.walkToward(h.x, h.y, screen);
    if (!dir) return -1;
    if (dir[0] === 0 && dir[1] === 0) return t;
    stepPlayer(h, { moveX: dir[0], moveY: dir[1], attack: 0 }, TICK_DT, world);
  }
  return -1;
}

/** Nodes the graph links to the start. */
function nodesFromStart() {
  const seen = new Set([startNode]);
  const queue = [startNode];
  for (let i = 0; i < queue.length; i++)
    for (const exit of nav.exitsOf(queue[i] as number))
      if (!seen.has(exit.to)) {
        seen.add(exit.to);
        queue.push(exit.to);
      }
  return seen;
}

describe("bot navigation", () => {
  it("cuts the world into the walkable parts of each screen", () => {
    expect([nav.columns, nav.rows]).toEqual([16, 12]);
    expect(startNode).toBeGreaterThanOrEqual(0);
    expect(nav.screenOf(startNode)).toBe(nav.screenAt(start.x, start.y));
    expect(nav.nodeCount).toBeGreaterThan(150);
    // Solid tiles belong to no node.
    const wall = [...Array(map.collision.width).keys()].find((tx) => map.collision.isSolid(tx, 0)) ?? 0;
    expect(nav.nodeAtTile(wall, 0)).toBe(-1);
  });

  it("links every tile a hero can walk to from the start (edges and portals) to the start", () => {
    const linked = nodesFromStart();
    const { width, height, tileSize } = map.collision;
    const seen = new Set<number>();
    const queue: [number, number][] = [];
    const visit = (tx: number, ty: number) => {
      const k = ty * width + tx;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height || seen.has(k) || map.collision.isSolid(tx, ty)) return;
      seen.add(k);
      queue.push([tx, ty]);
    };
    visit(Math.floor(start.x / tileSize), Math.floor(start.y / tileSize));
    let missing = 0;
    while (queue.length > 0) {
      const [tx, ty] = queue.pop() as [number, number];
      if (!linked.has(nav.nodeAtTile(tx, ty))) missing++;
      const portal = portalAt(objects.portals, (tx + 0.5) * tileSize, (ty + 0.5) * tileSize);
      if (portal) {
        visit(Math.floor(portal.toX / tileSize), Math.floor(portal.toY / tileSize));
        continue;
      }
      visit(tx + 1, ty);
      visit(tx - 1, ty);
      visit(tx, ty + 1);
      visit(tx, ty - 1);
    }
    expect(seen.size).toBeGreaterThan(10_000);
    expect(missing).toBe(0);
  });

  it("walks a hero from the start to the farthest screens, every cave and every dungeon boss", () => {
    const hops = nav.hops(startNode);
    const farthest = [...hops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    expect(farthest[0]?.[1]).toBeGreaterThan(8);
    const caves = info.areas.filter((a) => a.kind === "cave").map((a) => a.row * nav.columns + a.col);
    const bosses = objects.enemies.filter((e) => ENEMIES[e.kind].rank === "boss").map((e) => nav.screenAt(e.x, e.y));
    expect(caves.length).toBeGreaterThanOrEqual(6);
    expect(bosses).toHaveLength(4);
    for (const screen of [...farthest.map(([s]) => s), ...caves, ...bosses]) {
      const h = hero(start.x, start.y);
      expect(walk(h, screen), `to screen ${screen}`).toBeGreaterThan(0);
      expect(nav.screenAt(h.x, h.y)).toBe(screen);
    }
  });

  it("keeps out of screens more dangerous than allowed", () => {
    // Every screen around the start is dangerous: nowhere to go without crossing one.
    const s = nav.screenOf(startNode);
    const around = new Map([s - 1, s + 1, s - nav.columns, s + nav.columns].map((n) => [n, 5]));
    const careful = new Navigation(map.collision, objects.portals, around);
    const far = [...nav.hops(startNode).entries()].find(([, h]) => h === 4)?.[0] ?? -1;
    expect(careful.route(startNode, far, 4)).toBeUndefined();
    expect(careful.route(startNode, far, 5)).toBeDefined();
    expect([...careful.hops(startNode, 4).keys()]).toEqual([s]);
    expect(careful.hops(startNode).size).toBe(nav.hops(startNode).size);
  });
});
