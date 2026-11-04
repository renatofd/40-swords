import { flattenLayers, getProperty, type TiledMap, type TiledObject, type TiledObjectLayer } from "@core/maps";
import { type EnemyKind, isEnemyKind } from "./enemies";

/**
 * The game's own Tiled object classes (the core only reads "spawn"):
 *  - "enemy"  point, string property `kind` (slime, goblin)
 *  - "chest"  point: a chest with a random relic
 *  - "vendor" point: a merchant; its offers lie two tiles in front (see offerPosition)
 *  - "portal" rectangle, string property `target`: walking in moves the hero to
 *             the object named `target` (cave entrances and exits)
 *
 * Pure: the server parses the .tmj for its rules and the client parses the
 * same file for prediction (portals) and visuals (vendors).
 */

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
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
}

const classOf = (obj: TiledObject) => obj.type ?? obj.class ?? "";
const centre = (obj: TiledObject) => ({ x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 });

export function parseWorldObjects(map: TiledMap): WorldObjects {
  const objects = flattenLayers(map.layers)
    .filter((l): l is TiledObjectLayer => l.type === "objectgroup")
    .flatMap((l) => l.objects);
  const byName = new Map(objects.filter((o) => o.name).map((o) => [o.name, o]));

  const result: WorldObjects = { enemies: [], chests: [], vendors: [], portals: [] };
  for (const obj of objects) {
    switch (classOf(obj)) {
      case "enemy": {
        const kind = getProperty<string>(obj.properties, "kind") ?? obj.name;
        if (isEnemyKind(kind)) result.enemies.push({ kind, ...centre(obj) });
        break;
      }
      case "chest":
        result.chests.push({ id: `c${obj.id}`, ...centre(obj) });
        break;
      case "vendor":
        result.vendors.push({ id: `v${obj.id}`, ...centre(obj) });
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
