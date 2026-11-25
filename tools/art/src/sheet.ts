/**
 * Sprite sheet builder (pure: no file system). Cuts frames out of pack sheets,
 * applies the manifest's pixel edits, repacks the distinct frames into one
 * image (1 px transparent gap between frames) and writes the Aseprite
 * json-array data the core loader expects (@core/client `loadSprites`):
 *
 * - frames are named "0".."N" (content:validate rule) and each tag step gets
 *   its own json frame, so reordered or repeated loops (bat `3,2,0,1,4,1,0,2`)
 *   are contiguous `from..to` ranges; identical pixels share one rect;
 * - aliases are extra tags over the same range (e.g. `idle` = `idle-down`);
 * - the output is deterministic: same manifest and sources, same bytes.
 */

/** An RGBA image (pngjs's PNG has this shape). */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Pixel transforms of a frame (clockwise rotations). 90° turns are pixel-exact. */
export type Transform = "none" | "flipH" | "flipV" | "rot90" | "rot180" | "rot270";

/** A frame on the source sheet: its index (`row * columns + col`), or the index plus a source and a transform. */
export type FrameRef = number | { readonly i: number; readonly src?: string; readonly t?: Transform };

export interface TagDef {
  /** Tag name; directional tags are `<anim>-<dir>` with dir up | right | down (| left when redrawn). */
  readonly name: string;
  readonly frames: readonly FrameRef[];
  /** Source sheet name for these frames (sprites with several sheets). */
  readonly src?: string;
  /** Transform for every frame of the tag (a frame's own `t` wins). */
  readonly t?: Transform;
  /** Milliseconds per frame: one value for all, or one per frame. */
  readonly duration: number | readonly number[];
  readonly direction?: "forward" | "reverse" | "pingpong";
  /** Plays this many times (1 = once); omitted = loops forever. */
  readonly repeat?: number;
}

export interface SpriteDef {
  /** Texture key = output file name (content/sprites/<key>.png + .json). */
  readonly key: string;
  /** Source sheet(s), relative to content/src/notzelda. A record names several (tags pick one with `src`; the first is the default). */
  readonly src: string | Readonly<Record<string, string>>;
  /** Frame size on the source sheet [w, h]; frame i is at column i % columns, row floor(i / columns). */
  readonly frame: readonly [number, number];
  /** Frames per row on the sheet (default: sheet width / frame width). */
  readonly columns?: number;
  /** Keep only this part of every frame: [x, y, w, h] in frame pixels (the output frame is w x h). */
  readonly crop?: readonly [number, number, number, number];
  /** Exact colour swaps [from, to] as 0xRRGGBB; `to = null` makes the pixel transparent. */
  readonly recolor?: readonly (readonly [number, number | null])[];
  /** Adds a 1 px outline of this colour (0xRRGGBB) around the opaque pixels; the frame grows by 1 px on each side. */
  readonly outline?: number;
  readonly tags: readonly TagDef[];
  /** Extra names for tags: [alias, tag]. Every sprite must end up with an `idle` tag (art lookup keys on it). */
  readonly aliases?: readonly (readonly [string, string])[];
  /**
   * Anchor pixel [x, y] of the output frame. Characters: the feet point (body centre column, first empty
   * row under the body), measured over the `idle` frames when omitted. Weapon overlays: the pixel that
   * goes on the body frame's (16, 16). Effects and shots (`fx-`, `shot-`, `hostile-`): the frame centre by default.
   */
  readonly anchor?: readonly [number, number];
}

export interface AsepriteFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

export interface AsepriteTag {
  name: string;
  from: number;
  to: number;
  direction: "forward" | "reverse" | "pingpong";
  repeat?: string;
}

export interface AsepriteJson {
  frames: AsepriteFrame[];
  meta: {
    app: string;
    version: string;
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: "1";
    frameTags: AsepriteTag[];
  };
}

/** Frame size and anchor pixel of a sprite (see SpriteDef.anchor). */
export interface SpriteAnchor {
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface BuiltSprite {
  image: Rgba;
  json: AsepriteJson;
  anchor: SpriteAnchor;
}

/** Written in `meta.app`; the importer only deletes stale sprites carrying it. */
export const APP = "tools/art (40 Swords)";
export const GAP = 1;
export const MAX_SIZE = 2048;

export function blank(width: number, height: number): Rgba {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function crop(src: Rgba, x: number, y: number, w: number, h: number): Rgba {
  if (x < 0 || y < 0 || x + w > src.width || y + h > src.height)
    throw new Error(`frame rect ${x},${y} ${w}x${h} is outside the ${src.width}x${src.height} sheet`);
  const out = blank(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * src.width + x) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

export function transform(img: Rgba, t: Transform): Rgba {
  if (t === "none") return img;
  const { width: w, height: h } = img;
  const turned = t === "rot90" || t === "rot270";
  const out = blank(turned ? h : w, turned ? w : h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let nx = x;
      let ny = y;
      if (t === "flipH") nx = w - 1 - x;
      else if (t === "flipV") ny = h - 1 - y;
      else if (t === "rot180") [nx, ny] = [w - 1 - x, h - 1 - y];
      else if (t === "rot90") [nx, ny] = [h - 1 - y, x];
      else if (t === "rot270") [nx, ny] = [y, w - 1 - x];
      const s = (y * w + x) * 4;
      const d = (ny * out.width + nx) * 4;
      out.data.set(img.data.subarray(s, s + 4), d);
    }
  return out;
}

function recolor(img: Rgba, swaps: readonly (readonly [number, number | null])[]): Rgba {
  const map = new Map(swaps);
  const out = { ...img, data: img.data.slice() };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const rgb = ((out.data[i] ?? 0) << 16) | ((out.data[i + 1] ?? 0) << 8) | (out.data[i + 2] ?? 0);
    if (!map.has(rgb)) continue;
    const to = map.get(rgb);
    if (to === null || to === undefined) out.data.fill(0, i, i + 4);
    else out.data.set([(to >> 16) & 0xff, (to >> 8) & 0xff, to & 0xff, 255], i);
  }
  return out;
}

function outline(img: Rgba, color: number): Rgba {
  const out = blank(img.width + 2, img.height + 2);
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < img.width && y < img.height && (img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0;
  for (let y = -1; y <= img.height; y++)
    for (let x = -1; x <= img.width; x++) {
      const d = ((y + 1) * out.width + x + 1) * 4;
      if (opaque(x, y)) out.data.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), d);
      else if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1))
        out.data.set([(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 255], d);
    }
  return out;
}

const sourcesOf = (def: SpriteDef): Record<string, string> =>
  typeof def.src === "string" ? { main: def.src } : { ...def.src };

/** Source paths of a sprite (relative to content/src/notzelda), for the importer to load. */
export const spriteSources = (def: SpriteDef): string[] => [...new Set(Object.values(sourcesOf(def)))];

/** Opaque bounds [x0, y0, x1, y1) of some frames together, or undefined if all empty. */
function unionBounds(frames: readonly Rgba[]): [number, number, number, number] | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of frames)
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++)
        if ((f.data[(y * f.width + x) * 4 + 3] ?? 0) > 0) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
        }
  return x0 === Infinity ? undefined : [x0, y0, x1, y1];
}

/**
 * Builds one sprite from its definition. `sheets` maps each source path (as
 * written in the manifest) to its decoded image.
 */
export function buildSprite(def: SpriteDef, sheets: ReadonlyMap<string, Rgba>): BuiltSprite {
  const sources = sourcesOf(def);
  const defaultSrc = Object.keys(sources)[0] ?? "main";
  const [fw, fh] = def.frame;

  // Every tag step, resolved to its pixels. Identical pixels share one packed cell.
  const cells: Rgba[] = [];
  const cellIndex = new Map<string, number>();
  const cache = new Map<string, number>();
  const cellOf = (ref: FrameRef, tag: TagDef): number => {
    const r = typeof ref === "number" ? { i: ref } : ref;
    const srcName = r.src ?? tag.src ?? defaultSrc;
    const t = r.t ?? tag.t ?? "none";
    const id = `${srcName}|${r.i}|${t}`;
    const known = cache.get(id);
    if (known !== undefined) return known;
    const path = sources[srcName];
    if (!path) throw new Error(`${def.key}: tag "${tag.name}" uses unknown source "${srcName}"`);
    const sheet = sheets.get(path);
    if (!sheet) throw new Error(`${def.key}: source not loaded: ${path}`);
    const columns = def.columns ?? Math.floor(sheet.width / fw);
    let img = crop(sheet, (r.i % columns) * fw, Math.floor(r.i / columns) * fh, fw, fh);
    if (def.crop) img = crop(img, ...def.crop);
    if (def.recolor) img = recolor(img, def.recolor);
    img = transform(img, t);
    if (def.outline !== undefined) img = outline(img, def.outline);
    const hash = Buffer.from(img.data).toString("base64") + img.width;
    let index = cellIndex.get(hash);
    if (index === undefined) {
      index = cells.length;
      cells.push(img);
      cellIndex.set(hash, index);
    }
    cache.set(id, index);
    return index;
  };

  const steps: { cell: number; duration: number }[] = [];
  const frameTags: AsepriteTag[] = [];
  for (const tag of def.tags) {
    if (tag.frames.length === 0) throw new Error(`${def.key}: tag "${tag.name}" has no frames`);
    const from = steps.length;
    tag.frames.forEach((ref, i) => {
      const duration = typeof tag.duration === "number" ? tag.duration : tag.duration[i];
      if (duration === undefined) throw new Error(`${def.key}: tag "${tag.name}" has no duration for frame ${i}`);
      steps.push({ cell: cellOf(ref, tag), duration });
    });
    frameTags.push({
      name: tag.name,
      from,
      to: steps.length - 1,
      direction: tag.direction ?? "forward",
      ...(tag.repeat !== undefined ? { repeat: String(tag.repeat) } : {}),
    });
  }
  for (const [alias, of] of def.aliases ?? []) {
    const target = frameTags.find((t) => t.name === of);
    if (!target) throw new Error(`${def.key}: alias "${alias}" points at unknown tag "${of}"`);
    frameTags.push({ ...target, name: alias });
  }
  const names = frameTags.map((t) => t.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`${def.key}: duplicate tag "${dup}"`);
  if (!names.includes("idle")) throw new Error(`${def.key}: needs an "idle" tag (or alias)`);

  // Pack the distinct cells in a grid, 1 px apart.
  const first = cells[0];
  if (!first) throw new Error(`${def.key}: no frames`);
  const w = first.width;
  const h = first.height;
  if (cells.some((c) => c.width !== w || c.height !== h))
    throw new Error(`${def.key}: frames of different sizes (a rot90 of a non-square frame?)`);
  const maxColumns = Math.max(1, Math.floor((MAX_SIZE + GAP) / (w + GAP)));
  const columns = Math.min(maxColumns, Math.ceil(Math.sqrt(cells.length)));
  const rows = Math.ceil(cells.length / columns);
  const image = blank(columns * (w + GAP) - GAP, rows * (h + GAP) - GAP);
  if (image.height > MAX_SIZE) throw new Error(`${def.key}: sheet would be ${image.width}x${image.height}`);
  const rectOf = (cell: number) => ({
    x: (cell % columns) * (w + GAP),
    y: Math.floor(cell / columns) * (h + GAP),
    w,
    h,
  });
  cells.forEach((c, i) => {
    const r = rectOf(i);
    for (let row = 0; row < h; row++)
      image.data.set(c.data.subarray(row * w * 4, (row + 1) * w * 4), ((r.y + row) * image.width + r.x) * 4);
  });

  const frames: AsepriteFrame[] = steps.map((s, i) => ({
    filename: String(i),
    frame: rectOf(s.cell),
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
    duration: s.duration,
  }));

  // Anchor: given, the centre for effects and shots, or the feet point measured over the idle frames.
  let anchor: SpriteAnchor;
  if (def.anchor) anchor = { w, h, x: def.anchor[0], y: def.anchor[1] };
  else if (/^(fx|shot|hostile)-/.test(def.key)) anchor = { w, h, x: Math.floor(w / 2), y: Math.floor(h / 2) };
  else {
    const idle = frameTags.find((t) => t.name === "idle");
    const idleCells = idle ? steps.slice(idle.from, idle.to + 1).map((s) => cells[s.cell] as Rgba) : [];
    const b = unionBounds(idleCells);
    anchor = { w, h, x: b ? Math.floor((b[0] + b[2]) / 2) : Math.floor(w / 2), y: b ? b[3] : h };
  }

  return {
    image,
    anchor,
    json: {
      frames,
      meta: {
        app: APP,
        version: "1",
        image: `${def.key}.png`,
        format: "RGBA8888",
        size: { w: image.width, h: image.height },
        scale: "1",
        frameTags,
      },
    },
  };
}

/** JSON exactly as Biome formats it (content/ is linted). */
export const formatJson = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;
