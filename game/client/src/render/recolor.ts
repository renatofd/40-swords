/**
 * Palette swaps of pixel-art sheets: exact colour → colour replacement (no
 * tint), done once per sheet and colour. Used for hero colours (heroPalettes.ts)
 * in the world (Phaser textures) and in the DOM previews (hero select).
 */
import { createSpriteAnimations } from "@core/client";
import type Phaser from "phaser";

/** Colours are 0xRRGGBB; alpha is kept. */
export interface RecolorSpec {
  /** Replacements for every pixel of a colour. */
  map: ReadonlyMap<number, number>;
  /**
   * Replacements only for "inner" pixels: all four neighbours opaque. Lets a
   * sheet that uses one colour for both the outline and a dark fill recolour
   * the fill and keep the outline.
   */
  interior?: ReadonlyMap<number, number>;
}

/** Recolours RGBA pixels (ImageData layout) in place. Pure: no DOM needed. */
export function recolorPixels(data: Uint8ClampedArray, width: number, height: number, spec: RecolorSpec): void {
  const { map, interior } = spec;
  // Read neighbours from the original alpha, not from pixels already replaced.
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && (data[(y * width + x) * 4 + 3] ?? 0) > 0;
  const out: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((data[i + 3] ?? 0) === 0) continue;
      const rgb = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
      const inner =
        interior?.has(rgb) && opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1)
          ? interior.get(rgb)
          : undefined;
      const to = inner ?? map.get(rgb);
      if (to !== undefined) out.push([i, to]);
    }
  }
  for (const [i, to] of out) {
    data[i] = (to >> 16) & 0xff;
    data[i + 1] = (to >> 8) & 0xff;
    data[i + 2] = to & 0xff;
  }
}

/** A canvas with `source` (or the `crop` part of it) recoloured. */
export function recolorCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  spec: RecolorSpec | undefined,
  crop: { x: number; y: number } = { x: 0, y: 0 },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(source, crop.x, crop.y, width, height, 0, 0, width, height);
  if (spec) {
    const image = ctx.getImageData(0, 0, width, height);
    recolorPixels(image.data, width, height, spec);
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}

/**
 * Registers a recoloured copy of a loaded Aseprite sprite as texture `key`,
 * with the same frame names and its own "<key>/<tag>" animations. Done once:
 * textures survive scene restarts. Returns false if the source is missing.
 */
export function addRecoloredSprite(scene: Phaser.Scene, source: string, key: string, spec: RecolorSpec): boolean {
  if (scene.textures.exists(key)) return true;
  if (!scene.textures.exists(source)) return false;
  const src = scene.textures.get(source);
  const image = src.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const texture = scene.textures.addCanvas(key, recolorCanvas(image, image.width, image.height, spec));
  if (!texture) return false;
  for (const name of src.getFrameNames()) {
    const f = src.get(name);
    texture.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
  // Same tags and timings: the core builds animations from the Aseprite json in the cache.
  const data: unknown = scene.cache.json.get(source);
  if (data && !scene.cache.json.exists(key)) scene.cache.json.add(key, data);
  createSpriteAnimations(scene, key);
  return true;
}

/** Every opaque colour (0xRRGGBB) of a loaded texture's image. */
export function textureColors(scene: Phaser.Scene, key: string): Set<number> {
  const colors = new Set<number>();
  if (!scene.textures.exists(key)) return colors;
  const image = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = recolorCanvas(image, image.width, image.height, undefined);
  const data = canvas
    .getContext("2d", { willReadFrequently: true })
    ?.getImageData(0, 0, image.width, image.height).data;
  if (!data) return colors;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) > 0) colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
  }
  return colors;
}
