/**
 * A hero in the DOM (hero select, match summary): the sheet's front-facing idle
 * frame, recoloured like in the world, drawn into a small canvas that CSS
 * scales with `image-rendering: pixelated` so each art pixel covers a whole
 * number of device pixels (also on 125% / 150% screens).
 */
import type { ClassId } from "@game/shared";
import { spriteFiles } from "../assets";
import { heroRecolor } from "../render/heroPalettes";
import { recolorCanvas } from "../render/recolor";

/** The part of the 32x32 frame shown: the body is about 16x17 px at (8,7). */
const CROP = { x: 6, y: 5, size: 20 };

interface Sheet {
  image: HTMLImageElement;
  /** Top-left of the idle-down frame in the sheet. */
  x: number;
  y: number;
}

interface AsepriteJson {
  frames: { frame: { x: number; y: number } }[];
  meta: { frameTags: { name: string; from: number }[] };
}

const sheets = new Map<ClassId, Promise<Sheet | undefined>>();
/** Recoloured crops by "<class>~<palette>", made once. */
const crops = new Map<string, HTMLCanvasElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function loadSheet(classId: ClassId): Promise<Sheet | undefined> {
  let sheet = sheets.get(classId);
  if (!sheet) {
    const files = spriteFiles(classId);
    sheet = files
      ? Promise.all([fetch(files.data).then((r) => r.json() as Promise<AsepriteJson>), loadImage(files.image)])
          .then(([data, image]) => {
            const from = data.meta.frameTags.find((t) => t.name === "idle-down")?.from ?? 0;
            const frame = data.frames[from]?.frame;
            return frame ? { image, x: frame.x, y: frame.y } : undefined;
          })
          // A failed load is not kept: the next portrait tries again.
          .catch(() => {
            sheets.delete(classId);
            return undefined;
          })
      : Promise.resolve(undefined);
    sheets.set(classId, sheet);
  }
  return sheet;
}

/**
 * CSS size of a portrait shown about `scale` CSS px per art pixel: rounded so
 * that each art pixel is a whole number of device pixels.
 */
export function portraitCssSize(scale: number, dpr: number): number {
  const ratio = dpr > 0 ? dpr : 1;
  return (Math.max(1, Math.round(scale * ratio)) / ratio) * CROP.size;
}

/** A canvas showing the hero in a colour (drawn as soon as its sheet has loaded); `small` for lists. */
export function heroPortrait(classId: ClassId, palette: number, small = false): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CROP.size;
  canvas.height = CROP.size;
  canvas.className = small ? "sw-portrait sw-portrait-small" : "sw-portrait";
  const size = `${portraitCssSize(small ? 2 : 3, globalThis.devicePixelRatio ?? 1)}px`;
  canvas.style.inlineSize = size;
  canvas.style.blockSize = size;
  canvas.setAttribute("aria-hidden", "true");
  const key = `${classId}~${palette}`;
  const paint = (crop: HTMLCanvasElement) => canvas.getContext("2d")?.drawImage(crop, 0, 0);
  const ready = crops.get(key);
  if (ready) paint(ready);
  else
    void loadSheet(classId).then((sheet) => {
      if (!sheet) return;
      let crop = crops.get(key);
      if (!crop) {
        crop = recolorCanvas(sheet.image, CROP.size, CROP.size, heroRecolor(classId, palette), {
          x: sheet.x + CROP.x,
          y: sheet.y + CROP.y,
        });
        crops.set(key, crop);
      }
      paint(crop);
    });
  return canvas;
}
