import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TiledMap } from "@core/maps";
import { env } from "@core/server";
import { parseWorldInfo, parseWorldObjects, type WorldInfo, type WorldObjects } from "@game/shared";

const cache = new Map<string, { objects: WorldObjects; info: WorldInfo }>();

function load(mapId: string) {
  let world = cache.get(mapId);
  if (!world) {
    const raw = JSON.parse(readFileSync(join(env.mapsDir, `${mapId}.tmj`), "utf8")) as TiledMap;
    world = { objects: parseWorldObjects(raw), info: parseWorldInfo(raw) };
    cache.set(mapId, world);
  }
  return world;
}

/** The game's objects (enemies, chests, vendors, portals) of content/maps/<mapId>.tmj, parsed once per process. */
export const loadWorldObjects = (mapId: string): WorldObjects => load(mapId).objects;

/** The map's layout properties (overworld size, biomes, dungeon and cave areas). */
export const loadWorldInfo = (mapId: string): WorldInfo => load(mapId).info;
