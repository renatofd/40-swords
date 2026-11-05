import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TiledMap } from "@core/maps";
import { env } from "@core/server";
import { parseWorldObjects, type WorldObjects } from "@game/shared";

const cache = new Map<string, WorldObjects>();

/** The game's objects (enemies, chests, vendors, portals) of content/maps/<mapId>.tmj, parsed once per process. */
export function loadWorldObjects(mapId: string): WorldObjects {
  let objects = cache.get(mapId);
  if (!objects) {
    const raw = JSON.parse(readFileSync(join(env.mapsDir, `${mapId}.tmj`), "utf8")) as TiledMap;
    objects = parseWorldObjects(raw);
    cache.set(mapId, objects);
  }
  return objects;
}
