import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flattenLayers, getProperty, type TiledMap, type TiledObjectLayer } from "@core/maps";
import { env } from "@core/server";
import { type EnemyKind, isEnemyKind } from "@game/shared";

/** Where an enemy lives. Placed in Tiled as a point of class "enemy" with a string property "kind". */
export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
}

/** Reads the game's own object classes from a Tiled map (the core only reads "spawn"). */
export function readEnemySpawns(map: TiledMap): EnemySpawn[] {
  const spawns: EnemySpawn[] = [];
  for (const layer of flattenLayers(map.layers)) {
    if (layer.type !== "objectgroup") continue;
    for (const obj of (layer as TiledObjectLayer).objects) {
      if ((obj.type ?? obj.class) !== "enemy") continue;
      const kind = getProperty<string>(obj.properties, "kind") ?? obj.name;
      if (!isEnemyKind(kind)) continue;
      spawns.push({ kind, x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 });
    }
  }
  return spawns;
}

const cache = new Map<string, EnemySpawn[]>();

/** Enemy spawns of content/maps/<mapId>.tmj, parsed once per process. */
export function loadEnemySpawns(mapId: string): EnemySpawn[] {
  let spawns = cache.get(mapId);
  if (!spawns) {
    const raw = JSON.parse(readFileSync(join(env.mapsDir, `${mapId}.tmj`), "utf8")) as TiledMap;
    spawns = readEnemySpawns(raw);
    cache.set(mapId, spawns);
  }
  return spawns;
}
