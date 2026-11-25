/**
 * UI frames (pure: no file system). Every frame the DOM skin draws with CSS
 * `border-image` is rebuilt from the corners of the pack's Menu/Menu.png:
 * the top-left corner is mirrored into the other three, the straight edge
 * samples become the single middle column and row (a 1 px middle that
 * `border-image ... stretch` replicates exactly), the stroke is recoloured
 * and the inside is flood-filled. `import.ts` writes them to content/ui/.
 *
 * Deterministic: the same Menu.png and RARITY_COLORS give the same pixels.
 */
import { RARITY_COLORS } from "@game/shared";
import { blank, type Rgba, transform } from "./sheet";

/** Menu.png, relative to content/src/notzelda. */
export const MENU_SHEET = "Menu/Menu.png";

/** A corner source on Menu.png: top-left corner (x, y, n×n), its top edge column and its left edge row. */
export interface CornerSource {
  /** Corner rect: (x, y) top-left, n×n. */
  readonly x: number;
  readonly y: number;
  readonly n: number;
  /** Column of the straight top edge (rows y..y+n-1). */
  readonly edgeX: number;
  /** Row of the straight left edge (columns x..x+n-1). */
  readonly edgeY: number;
}

/** Corner shapes on Menu.png (stroke #0084FF, 2 px thick), checked pixel by pixel. */
export const CORNERS = {
  /** Chamfer: `.BB` `BBB` `BB.` (square-ish panels, slots). */
  r1: { x: 39, y: 135, n: 3, edgeX: 42, edgeY: 138 },
  /** Round (buttons, rarity cards). */
  r4: { x: 55, y: 135, n: 5, edgeX: 60, edgeY: 140 },
  /** Very round (the "Equipped" card). The corner already ends on its straight edges. */
  r8: { x: 87, y: 135, n: 9, edgeX: 95, edgeY: 143 },
} as const satisfies Record<string, CornerSource>;
export type CornerName = keyof typeof CORNERS;

/** The red rounded selection frame, used as is (24x24). */
export const CURSOR_RECT = { x: 68, y: 84, w: 24, h: 24 } as const;

/** Pack palette colours of the frames. */
export const UI_BLUE = 0x0084ff;
export const UI_RED = 0xe03c28;

export interface UiFrameDef {
  /** File name in content/ui/ (without `.png`). */
  readonly name: string;
  readonly source: CornerName | "cursor" | "bar";
  /** Stroke colour (0xRRGGBB); for `cursor` the source colour is kept. */
  readonly stroke: number;
  /** Interior fill colour and alpha (0-255); none = transparent inside. */
  readonly fill?: number;
  readonly alpha?: number;
  /** Border width in art px = the CSS `border-image` slice. */
  readonly slice: number;
}

const rarityFrames = (prefix: string, source: CornerName, alpha: number, slice: number): UiFrameDef[] =>
  RARITY_COLORS.map((stroke, r) => ({ name: `${prefix}-${r}`, source, stroke, fill: 0x000000, alpha, slice }));

/** Every file in content/ui/ (the tool owns that folder: anything else there is stale). */
export const UI_FRAMES: readonly UiFrameDef[] = [
  { name: "frame-panel", source: "r1", stroke: UI_BLUE, fill: 0x000000, alpha: 255, slice: 3 },
  { name: "frame-hud", source: "r1", stroke: UI_BLUE, fill: 0x000000, alpha: 192, slice: 3 },
  { name: "frame-card", source: "r8", stroke: UI_BLUE, fill: 0x000000, alpha: 255, slice: 9 },
  { name: "frame-button", source: "r4", stroke: UI_BLUE, fill: 0x000000, alpha: 255, slice: 5 },
  { name: "frame-button-hot", source: "r4", stroke: UI_BLUE, fill: 0x0d2030, alpha: 255, slice: 5 },
  { name: "frame-button-primary", source: "r4", stroke: UI_RED, fill: 0x4f1507, alpha: 255, slice: 5 },
  { name: "frame-button-primary-hot", source: "r4", stroke: UI_RED, fill: 0x823c3d, alpha: 255, slice: 5 },
  ...rarityFrames("frame-slot", "r1", 192, 3),
  ...rarityFrames("frame-rarity", "r4", 224, 5),
  { name: "frame-cursor", source: "cursor", stroke: UI_RED, slice: 6 },
  { name: "frame-bar", source: "bar", stroke: 0xffffff, fill: 0x000000, alpha: 255, slice: 2 },
];

function crop(src: Rgba, x: number, y: number, w: number, h: number): Rgba {
  if (x < 0 || y < 0 || x + w > src.width || y + h > src.height)
    throw new Error(`rect ${x},${y} ${w}x${h} is outside the ${src.width}x${src.height} image`);
  const out = blank(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * src.width + x) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

function paste(dst: Rgba, src: Rgba, x: number, y: number) {
  for (let row = 0; row < src.height; row++)
    dst.data.set(src.data.subarray(row * src.width * 4, (row + 1) * src.width * 4), ((y + row) * dst.width + x) * 4);
}

const rgba = (rgb: number, a: number) => [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, a];

/**
 * A (2n+1)² nine-slice frame from a top-left `corner` (n×n), the top edge's straight column
 * `edgeCol` (1×n) and the left edge's straight row `edgeRow` (n×1). Every opaque source pixel
 * becomes `stroke`; the inside (4-way flood from the centre over transparent pixels) becomes
 * `fill`/`alpha`; pixels outside the rounded stroke stay transparent.
 */
export function nineSlice(
  corner: Rgba,
  edgeCol: Rgba,
  edgeRow: Rgba,
  opts: { stroke: number; fill?: number; alpha?: number },
): Rgba {
  const n = corner.width;
  if (corner.height !== n) throw new Error(`corner must be square (got ${corner.width}x${corner.height})`);
  if (edgeCol.width !== 1 || edgeCol.height !== n) throw new Error(`edge column must be 1x${n}`);
  if (edgeRow.width !== n || edgeRow.height !== 1) throw new Error(`edge row must be ${n}x1`);
  const size = 2 * n + 1;
  const out = blank(size, size);
  paste(out, corner, 0, 0);
  paste(out, transform(corner, "flipH"), n + 1, 0);
  paste(out, transform(corner, "flipV"), 0, n + 1);
  paste(out, transform(corner, "rot180"), n + 1, n + 1);
  paste(out, edgeCol, n, 0);
  paste(out, transform(edgeCol, "flipV"), n, n + 1);
  paste(out, edgeRow, 0, n);
  paste(out, transform(edgeRow, "flipH"), n + 1, n);

  const stroke = rgba(opts.stroke, 255);
  for (let i = 0; i < out.data.length; i += 4) if ((out.data[i + 3] ?? 0) > 0) out.data.set(stroke, i);

  if (opts.fill !== undefined) {
    const fill = rgba(opts.fill, opts.alpha ?? 255);
    const seen = new Uint8Array(size * size);
    const stack = [n * size + n];
    while (stack.length > 0) {
      const p = stack.pop() as number;
      if (seen[p]) continue;
      seen[p] = 1;
      if ((out.data[p * 4 + 3] ?? 0) > 0) continue;
      out.data.set(fill, p * 4);
      const x = p % size;
      const y = Math.floor(p / size);
      if (x > 0) stack.push(p - 1);
      if (x < size - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - size);
      if (y < size - 1) stack.push(p + size);
    }
  }
  return out;
}

/** The corner pieces of a Menu.png corner source. */
export function cornerPieces(menu: Rgba, c: CornerSource): { corner: Rgba; edgeCol: Rgba; edgeRow: Rgba } {
  return {
    corner: crop(menu, c.x, c.y, c.n, c.n),
    edgeCol: crop(menu, c.edgeX, c.y, 1, c.n),
    edgeRow: crop(menu, c.x, c.edgeY, c.n, 1),
  };
}

/** 5x5 bar frame: outer ring `ring1`, inner ring `stroke`, centre `fill`. */
function barFrame(ring1: number, ring2: number, centre: number): Rgba {
  const out = blank(5, 5);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      const ring = Math.min(x, y, 4 - x, 4 - y);
      out.data.set(rgba(ring === 0 ? ring1 : ring === 1 ? ring2 : centre, 255), (y * 5 + x) * 4);
    }
  return out;
}

/** Builds one UI frame from Menu.png. */
export function buildUiFrame(def: UiFrameDef, menu: Rgba): Rgba {
  if (def.source === "cursor") {
    const { x, y, w, h } = CURSOR_RECT;
    return crop(menu, x, y, w, h);
  }
  if (def.source === "bar") return barFrame(0x000000, def.stroke, def.fill ?? 0x000000);
  const p = cornerPieces(menu, CORNERS[def.source]);
  return nineSlice(p.corner, p.edgeCol, p.edgeRow, {
    stroke: def.stroke,
    ...(def.fill !== undefined ? { fill: def.fill } : {}),
    ...(def.alpha !== undefined ? { alpha: def.alpha } : {}),
  });
}
