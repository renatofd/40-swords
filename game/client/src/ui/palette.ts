import type { Translate } from "@core/client";
import { CLASSES, type ClassId, PALETTES, type Palette } from "@game/shared";

export const hexColor = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Body colour of a hero: the colour picked, or the class colour. */
export const heroColor = (classId: ClassId, palette: number): number =>
  PALETTES[palette]?.color ?? CLASSES[classId].color;

/** What unlocks a colour, as a sentence ("Win a match"). */
export function unlockText(t: Translate, palette: Palette): string {
  const unlock = palette.unlock;
  return unlock ? t(`unlock.${unlock.kind}`, { n: unlock.n }) : "";
}
