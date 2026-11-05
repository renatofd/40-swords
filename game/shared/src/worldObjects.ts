import { flattenLayers, getProperty, type TiledMap, type TiledObject, type TiledObjectLayer } from "@core/maps";
import { type EnemyKind, isEnemyKind } from "./enemies";
import { screenRect } from "./world";

/**
 * The game's own Tiled object classes (the core only reads "spawn"):
 *  - "enemy"  point, string property `kind` (see ENEMY_KINDS), int `tier` (difficulty,
 *             0 near the start) and bool `dungeon` (inside a dungeon: more elites)
 *  - "chest"  point: a chest with a random relic
 *  - "vendor" point: a merchant; its offers lie two tiles in front (see offerPosition)
 *  - "portal" rectangle, string property `target`: walking in moves the hero to
 *             the object named `target` (cave entrances and exits)
 *  - "arenaSpawn" point: where heroes appear in the battle royale arena
 *
 * Pure: the server parses the .tmj for its rules and the client parses the
 * same file for prediction (portals) and visuals (vendors).
 */

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
  tier: number;
  dungeon: boolean;
}

/** A chest or vendor. `id` is stable for a given map file (from the Tiled object id). */
export interface Spot {
  id: string;
  x: number;
  y: number;
}

export interface Portal {
  x: number;
  y: number;
  width: number;
  height: number;
  toX: number;
  toY: number;
}

export interface WorldObjects {
  enemies: EnemySpawn[];
  chests: Spot[];
  vendors: Spot[];
  portals: Portal[];
  arenaSpawns: { x: number; y: number }[];
}

const classOf = (obj: TiledObject) => obj.type ?? obj.class ?? "";
const centre = (obj: TiledObject) => ({ x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 });

export function parseWorldObjects(map: TiledMap): WorldObjects {
  const objects = flattenLayers(map.layers)
    .filter((l): l is TiledObjectLayer => l.type === "objectgroup")
    .flatMap((l) => l.objects);
  const byName = new Map(objects.filter((o) => o.name).map((o) => [o.name, o]));

  const result: WorldObjects = { enemies: [], chests: [], vendors: [], portals: [], arenaSpawns: [] };
  for (const obj of objects) {
    switch (classOf(obj)) {
      case "enemy": {
        const kind = getProperty<string>(obj.properties, "kind") ?? obj.name;
        const tier = Math.max(0, Math.floor(getProperty<number>(obj.properties, "tier") ?? 0));
        const dungeon = getProperty<boolean>(obj.properties, "dungeon") === true;
        if (isEnemyKind(kind)) result.enemies.push({ kind, ...centre(obj), tier, dungeon });
        break;
      }
      case "chest":
        result.chests.push({ id: `c${obj.id}`, ...centre(obj) });
        break;
      case "vendor":
        result.vendors.push({ id: `v${obj.id}`, ...centre(obj) });
        break;
      case "arenaSpawn":
        result.arenaSpawns.push(centre(obj));
        break;
      case "portal": {
        const target = byName.get(getProperty<string>(obj.properties, "target") ?? "");
        if (!target || obj.width <= 0 || obj.height <= 0) break;
        const to = centre(target);
        result.portals.push({ x: obj.x, y: obj.y, width: obj.width, height: obj.height, toX: to.x, toY: to.y });
        break;
      }
    }
  }
  return result;
}

/** The portal whose rectangle contains (x, y), if any. */
export function portalAt(portals: readonly Portal[], x: number, y: number): Portal | undefined {
  return portals.find((p) => x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height);
}

/** A group of screens with a name: a dungeon, a cave or the arena (from the map property `areas`). */
export interface Area {
  id: string;
  kind: "dungeon" | "cave" | "arena";
  /** Screen rectangle. */
  col: number;
  row: number;
  width: number;
  height: number;
}

/** World layout from the map properties (written by tools/world-gen), for the minimap and banners. */
export interface WorldInfo {
  /** Size of the overworld in screens (interiors lie below it). */
  columns: number;
  rows: number;
  /** One biome letter per overworld screen, row by row (see tools/world-gen). */
  biomes: string;
  areas: Area[];
}

export function parseWorldInfo(map: TiledMap): WorldInfo {
  const columns = getProperty<number>(map.properties, "overworldColumns") ?? 0;
  const rows = getProperty<number>(map.properties, "overworldRows") ?? 0;
  const biomes = getProperty<string>(map.properties, "biomes") ?? "";
  let areas: Area[] = [];
  try {
    const parsed = JSON.parse(getProperty<string>(map.properties, "areas") ?? "[]") as Area[];
    if (Array.isArray(parsed)) areas = parsed;
  } catch {
    areas = [];
  }
  return { columns, rows, biomes, areas };
}

/** The area containing screen (col, row), if any. */
export const areaAt = (areas: readonly Area[], col: number, row: number): Area | undefined =>
  areas.find((a) => col >= a.col && col < a.col + a.width && row >= a.row && row < a.row + a.height);

/** The battle royale arena (an area of kind "arena"), in pixels, with its centre. */
export function arenaRect(info: WorldInfo) {
  const area = info.areas.find((a) => a.kind === "arena");
  if (!area) return undefined;
  const rect = screenRect(area.col, area.row);
  const width = area.width * rect.width;
  const height = area.height * rect.height;
  return { x: rect.x, y: rect.y, width, height, centerX: rect.x + width / 2, centerY: rect.y + height / 2 };
}

/** Whether (x, y) lies inside a rectangle. */
export const inRect = (r: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
  x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
