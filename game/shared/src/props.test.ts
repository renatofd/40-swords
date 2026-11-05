import type { TiledMap } from "@core/maps";
import { describe, expect, it } from "vitest";
import { PROPS, parseProps, rollPropDrop } from "./props";
import { createRng } from "./rng";

/** A 4x2 map whose tileset has tall grass (whole, cut) and a pot (whole, broken). */
function tinyMap(props?: number[]): TiledMap {
  const prop = (kind: string, broken: boolean) => [
    { name: "prop", type: "string", value: kind },
    { name: "broken", type: "bool", value: broken },
  ];
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width: 4,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [
      {
        firstgid: 1,
        tiles: [
          { id: 2, properties: [{ name: "collides", type: "bool", value: true }] },
          { id: 5, properties: prop("bush", false) },
          { id: 6, properties: prop("bush", true) },
          { id: 7, properties: prop("pot", false) },
          { id: 8, properties: prop("pot", true) },
        ],
      },
    ],
    layers: [
      { type: "tilelayer", name: "ground", width: 4, height: 2, visible: true, data: [1, 1, 1, 1, 1, 1, 1, 1] },
      ...(props
        ? [{ type: "tilelayer" as const, name: "props", width: 4, height: 2, visible: true, data: props }]
        : []),
    ],
  };
}

describe("tall grass and pots", () => {
  it("are read from the tile layer `props`: id = tile index, at the tile's centre", () => {
    // A flipped pot (Tiled's flag bits) counts too; tiles drawn broken in the map are not props.
    const flipped = 8 + 0x80000000;
    const { props, tiles } = parseProps(tinyMap([0, 6, 0, 7, 0, 0, flipped, 9]));
    expect(props).toEqual([
      { id: 1, kind: "bush", x: 24, y: 8 },
      { id: 6, kind: "pot", x: 40, y: 24 },
    ]);
    expect(tiles).toEqual({ bush: { whole: 6, broken: 7 }, pot: { whole: 8, broken: 9 } });
    expect(parseProps(tinyMap()).props).toEqual([]);
  });

  it("hold a heart now and then, rupees more often (luck can double them), or nothing", () => {
    expect(rollPropDrop("bush", 0, () => 0)).toEqual({ kind: "heart", value: 1 });
    const rolls = [0.5, 0.99, 0.99];
    expect(rollPropDrop("pot", 0, () => rolls.shift() ?? 0)).toEqual({ kind: "rupee", value: 5 });
    expect(rollPropDrop("bush", 0, () => 0.99)).toBeUndefined();

    for (const kind of ["bush", "pot"] as const) {
      const rng = createRng(7);
      const n = 20_000;
      let hearts = 0;
      let rupees = 0;
      let lucky = 0;
      for (let i = 0; i < n; i++) {
        const drop = rollPropDrop(kind, 0, rng);
        if (drop?.kind === "heart") hearts++;
        if (drop?.kind === "rupee") {
          rupees++;
          expect(drop.value).toBeGreaterThanOrEqual(PROPS[kind].rupees[0]);
          expect(drop.value).toBeLessThanOrEqual(PROPS[kind].rupees[1]);
        }
        const luckyDrop = rollPropDrop(kind, 15, rng);
        if (luckyDrop?.kind === "rupee" && luckyDrop.value > PROPS[kind].rupees[1]) lucky++;
      }
      expect(hearts / n).toBeCloseTo(PROPS[kind].heart, 1);
      expect(rupees / n).toBeCloseTo(PROPS[kind].rupee, 1);
      expect(lucky).toBeGreaterThan(0);
    }
    // Pots are the better find.
    expect(PROPS.pot.heart).toBeGreaterThan(PROPS.bush.heart);
    expect(PROPS.pot.rupees[1]).toBeGreaterThan(PROPS.bush.rupees[1]);
  });
});
