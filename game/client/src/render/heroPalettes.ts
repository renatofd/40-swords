/**
 * Hero colours as palette swaps of the hero sheets (content/sprites/<class>.png).
 * Each PALETTES entry (shared, its index travels on the wire) gets a ramp here,
 * and each class says which of its own sheet colours take which shade of the
 * ramp. Visual only, so it lives in the client and not in game/shared.
 */
import type { ClassId } from "@game/shared";
import { PALETTES } from "@game/shared";
import type { RecolorSpec } from "./recolor";

/** Four shades of one hue, lightest first. */
export interface Ramp {
  hi: number;
  light: number;
  mid: number;
  dark: number;
}

/**
 * The class colours ("classic"): the knight's armour goes blue and the
 * barbarian's trousers leather brown (clearly apart from the red "ember");
 * the rogue keeps the sheet's own magenta hair.
 */
const CLASSIC: Readonly<Record<ClassId, Ramp | undefined>> = {
  knight: { hi: 0xc4ecff, light: 0x7cc0ff, mid: 0x3a78e0, dark: 0x1f3f9a },
  rogue: undefined,
  barbarian: { hi: 0xf0c890, light: 0xc08048, mid: 0x86502a, dark: 0x4a2410 },
};

/** Ramps of the unlockable colours, by PALETTES id. */
export const RAMPS: Readonly<Record<string, Ramp>> = {
  forest: { hi: 0xb8f070, light: 0x6ab417, mid: 0x2f8a1e, dark: 0x1e4a10 },
  ember: { hi: 0xffb080, light: 0xff5a3c, mid: 0xb8281c, dark: 0x5a1008 },
  shadow: { hi: 0xd0b8ff, light: 0xa675fe, mid: 0x6a31ca, dark: 0x33186a },
  frost: { hi: 0xc8f0ff, light: 0x7cc8f0, mid: 0x3a7ab0, dark: 0x1f3f6a },
  gold: { hi: 0xfff6b0, light: 0xffe737, mid: 0xd09010, dark: 0x7a4a00 },
};

/** Palettes that also recolour the knight's steel helm (a gold or ice helm). */
const METAL_HELM = new Set(["gold", "frost"]);

/**
 * Which sheet colours each class swaps. Colours of the effect frames
 * (#ff0460 hurt, #ffe737 / #eeffa9 burn, #ffffff stun outline) are never
 * sources, so those frames keep reading the same in every colour.
 */
function classSpec(classId: ClassId, r: Ramp, paletteId: string): RecolorSpec {
  switch (classId) {
    case "knight": {
      // #231712 is both the outline and the dark armour: only the inner pixels change.
      const map = new Map([[0x5c3c0d, r.mid]]);
      if (METAL_HELM.has(paletteId)) {
        map.set(0xa8a8a8, r.light);
        map.set(0xffe9c5, r.hi);
      }
      return { map, interior: new Map([[0x231712, r.dark]]) };
    }
    case "rogue":
      return {
        map: new Map([
          [0xe26aca, r.light],
          [0x7b2387, r.mid],
        ]),
      };
    case "barbarian": {
      // Trousers, belt and boots; the teal mohawk only changes with an unlocked colour.
      const map = new Map([
        [0x139d08, r.light],
        [0x376d03, r.mid],
        [0x5c3c0d, r.dark],
      ]);
      if (paletteId !== "classic") map.set(0x25e2cd, r.light);
      return { map };
    }
  }
}

/** The swap of a hero colour, or undefined when the sheet is used as drawn. */
export function heroRecolor(classId: ClassId, palette: number): RecolorSpec | undefined {
  const id = PALETTES[palette]?.id ?? "classic";
  const ramp = id === "classic" ? CLASSIC[classId] : RAMPS[id];
  return ramp ? classSpec(classId, ramp, id) : undefined;
}

/** Texture key of a hero in a colour: the sheet itself, or its recoloured copy ("knight~2"). */
export const heroSheetKey = (classId: ClassId, palette: number): string =>
  heroRecolor(classId, palette) ? `${classId}~${PALETTES[palette] ? palette : 0}` : classId;
