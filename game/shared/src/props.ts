import { cleanGid, flattenLayers, getProperty, type TiledMap, type TiledTileLayer } from "@core/maps";
import { rollRupees } from "./combat";
import type { Rng } from "./rng";

/**
 * Props: tall grass ("bush") in the overworld and pots in caves and dungeons.
 * The sword cuts or breaks them, and some hold rupees or a heart. They never
 * block the way (heroes walk over them), so movement, prediction and bot
 * navigation don't depend on them.
 *
 * In Tiled they are tiles on the tile layer "props": a tile with the string
 * property `prop` (a PropKind) and the bool `broken` (what is left once broken).
 * A prop's id on the wire is its tile index (ty * map width + tx).
 */
export const PROP_KINDS = ["bush", "pot"] as const;
export type PropKind = (typeof PROP_KINDS)[number];
export const isPropKind = (v: unknown): v is PropKind => PROP_KINDS.includes(v as PropKind);

export const PROPS_LAYER = "props";

/** Half-extent (px) of a prop for the sword's hitbox. */
export const PROP_HALF = 5;

export interface PropDef {
  /** Seconds before it is back (only while no hero is on its screen, so nobody sees it reappear). */
  regrowSeconds: number;
  /** Chance it holds a heart; otherwise the chance it holds rupees (between the two values, luck can double them). */
  heart: number;
  rupee: number;
  rupees: [number, number];
}

export const PROPS: Record<PropKind, PropDef> = {
  bush: { regrowSeconds: 45, heart: 0.08, rupee: 0.3, rupees: [1, 1] },
  pot: { regrowSeconds: 90, heart: 0.2, rupee: 0.5, rupees: [1, 5] },
};

export type PropDrop = { kind: "heart"; value: 1 } | { kind: "rupee"; value: number };

/** What a prop held, if anything (one roll when it breaks). */
export function rollPropDrop(kind: PropKind, luck: number, rng: Rng): PropDrop | undefined {
  const def = PROPS[kind];
  const roll = rng();
  if (roll < def.heart) return { kind: "heart", value: 1 };
  if (roll < def.heart + def.rupee) return { kind: "rupee", value: rollRupees(def.rupees, luck, rng) };
  return undefined;
}

export interface Prop {
  /** Tile index (ty * map width + tx): the prop's id on the wire. */
  id: number;
  kind: PropKind;
  /** Centre of its tile, in pixels. */
  x: number;
  y: number;
}

export interface MapProps {
  props: Prop[];
  /** Tile gid drawn for each kind, whole and broken (for the client's tile layer). */
  tiles: Partial<Record<PropKind, { whole: number; broken: number }>>;
}

/** The props of a map (layer "props"); a map without that layer has none. */
export function parseProps(map: TiledMap): MapProps {
  const kinds = new Map<number, { kind: PropKind; broken: boolean }>();
  const tiles: MapProps["tiles"] = {};
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles ?? []) {
      const kind = getProperty<string>(tile.properties, "prop");
      if (!isPropKind(kind)) continue;
      const broken = getProperty<boolean>(tile.properties, "broken") === true;
      const gid = tileset.firstgid + tile.id;
      kinds.set(gid, { kind, broken });
      const entry = tiles[kind] ?? { whole: 0, broken: 0 };
      if (broken) entry.broken = gid;
      else entry.whole = gid;
      tiles[kind] = entry;
    }
  }
  const layer = flattenLayers(map.layers).find(
    (l): l is TiledTileLayer => l.type === "tilelayer" && l.name === PROPS_LAYER,
  );
  const props: Prop[] = [];
  if (layer && typeof layer.data !== "string") {
    layer.data.forEach((raw, id) => {
      const prop = kinds.get(cleanGid(raw));
      if (!prop || prop.broken) return;
      const tx = id % map.width;
      const ty = Math.floor(id / map.width);
      props.push({ id, kind: prop.kind, x: (tx + 0.5) * map.tilewidth, y: (ty + 0.5) * map.tileheight });
    });
  }
  return { props, tiles };
}
