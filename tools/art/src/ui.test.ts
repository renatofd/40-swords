import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RARITY_COLORS } from "@game/shared";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { blank, type Rgba } from "./sheet";
import { buildUiFrame, CORNERS, CURSOR_RECT, cornerPieces, MENU_SHEET, nineSlice, UI_FRAMES, UI_RED } from "./ui";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const png = PNG.sync.read(readFileSync(resolve(ROOT, "content/src/notzelda", MENU_SHEET)));
const menu: Rgba = { width: png.width, height: png.height, data: new Uint8Array(png.data) };

const px = (img: Rgba, x: number, y: number) => [
  ...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
];
const rgb = (img: Rgba, x: number, y: number) => {
  const [r = 0, g = 0, b = 0] = px(img, x, y);
  return (r << 16) | (g << 8) | b;
};
const alpha = (img: Rgba, x: number, y: number) => px(img, x, y)[3] ?? 0;
/** Rows of an image as strings: `B` opaque, `.` transparent. */
const rows = (img: Rgba) =>
  Array.from({ length: img.height }, (_, y) =>
    Array.from({ length: img.width }, (_, x) => (alpha(img, x, y) > 0 ? "B" : ".")).join(""),
  );
/** An image from rows of `B` (opaque, the given colour) and `.`. */
function draw(lines: string[], colour = 0x0084ff): Rgba {
  const img = blank(lines[0]?.length ?? 0, lines.length);
  lines.forEach((line, y) => {
    [...line].forEach((c, x) => {
      if (c === "B")
        img.data.set([(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff, 255], (y * img.width + x) * 4);
    });
  });
  return img;
}
const frame = (name: string) => {
  const def = UI_FRAMES.find((f) => f.name === name);
  if (!def) throw new Error(`no frame ${name}`);
  return def;
};

describe("nineSlice", () => {
  // The r4 shape, drawn here so the test does not depend on Menu.png.
  const corner = draw(["....B", "..BBB", ".BBBB", ".BB..", "BBB.."]);
  const edgeCol = draw(["B", "B", ".", ".", "."]);
  const edgeRow = draw(["BB..."]);
  const out = nineSlice(corner, edgeCol, edgeRow, { stroke: 0x58d332, fill: 0x0d2030, alpha: 192 });
  const n = 5;

  it("is (2n+1)² with the corner at the top left", () => {
    expect([out.width, out.height]).toEqual([2 * n + 1, 2 * n + 1]);
    const stroke = Array.from({ length: n }, (_, y) =>
      Array.from({ length: n }, (_, x) => (alpha(out, x, y) === 255 ? "B" : ".")).join(""),
    );
    expect(stroke).toEqual(rows(corner));
  });

  it("is symmetric four ways", () => {
    const s = out.width - 1;
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) {
        expect(px(out, s - x, y)).toEqual(px(out, x, y));
        expect(px(out, x, s - y)).toEqual(px(out, x, y));
      }
  });

  it("recolours only the stroke, fills the inside exactly and leaves the outside transparent", () => {
    const shape = rows(out);
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) {
        const p = px(out, x, y);
        // Inside = reachable from the centre without crossing the stroke.
        const outside = shape[y]?.[x] === "." && (x < 1 || y < 1 || x > out.width - 2 || y > out.height - 2);
        if (p[3] === 255) expect(rgb(out, x, y)).toBe(0x58d332);
        else if (p[3] === 192) expect(rgb(out, x, y)).toBe(0x0d2030);
        else expect(p[3]).toBe(0);
        if (outside) expect(p[3]).toBe(0);
      }
    // Corners outside the round stroke stay transparent; the centre and the middle edge rows are filled.
    expect(alpha(out, 0, 0)).toBe(0);
    expect(alpha(out, 1, 1)).toBe(0);
    expect(px(out, n, n)).toEqual([0x0d, 0x20, 0x30, 192]);
    expect(px(out, n, 2)).toEqual([0x0d, 0x20, 0x30, 192]);
    expect(px(out, 2, n)).toEqual([0x0d, 0x20, 0x30, 192]);
    expect(px(out, n, 1)).toEqual([0x58, 0xd3, 0x32, 255]);
  });

  it("leaves the inside transparent without a fill", () => {
    const hollow = nineSlice(corner, edgeCol, edgeRow, { stroke: 0xffffff });
    expect(alpha(hollow, n, n)).toBe(0);
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) expect(alpha(hollow, x, y) === 255).toBe(alpha(out, x, y) === 255);
  });
});

describe("Menu.png corners", () => {
  it.each([
    ["r1", [".BB", "BBB", "BB."], "BB.", "BB."],
    ["r4", ["....B", "..BBB", ".BBBB", ".BB..", "BBB.."], "BB...", "BB..."],
    [
      "r8",
      [
        "......BBB",
        "....BBBBB",
        "...BBBB..",
        "..BBB....",
        ".BBB.....",
        ".BB......",
        "BBB......",
        "BB.......",
        "BB.......",
      ],
      "BB.......",
      "BB.......",
    ],
  ] as const)("%s has the checked shape in #0084FF", (name, corner, edgeCol, edgeRow) => {
    const p = cornerPieces(menu, CORNERS[name]);
    expect(rows(p.corner)).toEqual(corner);
    expect(rows(p.edgeCol).join("")).toBe(edgeCol);
    expect(rows(p.edgeRow).join("")).toBe(edgeRow);
    for (const img of [p.corner, p.edgeCol, p.edgeRow])
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) if (alpha(img, x, y) > 0) expect(rgb(img, x, y)).toBe(0x0084ff);
  });

  it("crops the cursor as is: 24x24, red, hollow", () => {
    const cursor = buildUiFrame(frame("frame-cursor"), menu);
    expect([cursor.width, cursor.height]).toEqual([CURSOR_RECT.w, CURSOR_RECT.h]);
    let opaque = 0;
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++)
        if (alpha(cursor, x, y) > 0) {
          opaque++;
          expect(rgb(cursor, x, y)).toBe(UI_RED);
        }
    expect(opaque).toBeGreaterThan(80);
    expect(alpha(cursor, 12, 12)).toBe(0);
    expect(rows(cursor)[0]).toBe("....BBBBBBBBBBBBBBBB....");
  });
});

describe("UI_FRAMES", () => {
  it("lists 19 unique files whose size matches their slice", () => {
    expect(UI_FRAMES).toHaveLength(19);
    expect(new Set(UI_FRAMES.map((f) => f.name)).size).toBe(19);
    for (const def of UI_FRAMES) {
      const img = buildUiFrame(def, menu);
      expect(img.width, def.name).toBe(img.height);
      if (def.source !== "cursor") expect(img.width, def.name).toBe(2 * def.slice + 1);
    }
  });

  it("strokes slot and rarity frames in RARITY_COLORS, with their fill alpha", () => {
    RARITY_COLORS.forEach((colour, r) => {
      for (const [name, a, n] of [
        [`frame-slot-${r}`, 192, 3],
        [`frame-rarity-${r}`, 224, 5],
      ] as const) {
        const img = buildUiFrame(frame(name), menu);
        expect(rgb(img, n, 0), name).toBe(colour);
        expect(alpha(img, n, 0), name).toBe(255);
        expect(px(img, n, n), name).toEqual([0, 0, 0, a]);
      }
    });
  });

  it("draws the bar as a black ring, a white ring and a black centre", () => {
    const bar = buildUiFrame(frame("frame-bar"), menu);
    expect(rows(bar)).toEqual(["BBBBB", "BBBBB", "BBBBB", "BBBBB", "BBBBB"]);
    expect([rgb(bar, 0, 0), rgb(bar, 1, 1), rgb(bar, 2, 2), rgb(bar, 3, 2), rgb(bar, 4, 4)]).toEqual([
      0, 0xffffff, 0, 0xffffff, 0,
    ]);
  });

  it("gives the same pixels on every run", () => {
    for (const def of UI_FRAMES)
      expect(Buffer.from(buildUiFrame(def, menu).data).equals(Buffer.from(buildUiFrame(def, menu).data))).toBe(true);
  });

  it("matches the files in content/ui (pnpm art)", () => {
    for (const def of UI_FRAMES) {
      const file = PNG.sync.read(readFileSync(resolve(ROOT, "content/ui", `${def.name}.png`)));
      expect(Buffer.from(file.data).equals(Buffer.from(buildUiFrame(def, menu).data)), def.name).toBe(true);
    }
  });
});

// ─── CSS consistency (game/client skin) ─────────────────────────────────────

const SKIN_CSS = resolve(ROOT, "game/client/src/ui/skin.css");
const STYLES_CSS = resolve(ROOT, "game/client/src/styles.css");

interface CssRule {
  selectors: string[];
  body: string;
}

/** Splits at top-level occurrences of `sep` (outside (), []). */
function splitTop(text: string, test: (c: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of text) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (depth === 0 && test(c)) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Innermost `selector { declarations }` blocks (rules inside @media included; at-rules skipped). */
function cssRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? "").trim();
    if (selector.startsWith("@")) continue;
    rules.push({ selectors: splitTop(selector, (c) => c === ","), body: m[2] ?? "" });
  }
  return rules;
}

/** Removes `:not(...)` groups (their classes do not name the styled element). */
function dropNot(selector: string): string {
  let out = "";
  for (let i = 0; i < selector.length; i++) {
    if (selector.startsWith(":not(", i)) {
      let depth = 0;
      for (let j = i + 4; j < selector.length; j++) {
        if (selector[j] === "(") depth++;
        else if (selector[j] === ")" && --depth === 0) {
          i = j;
          break;
        }
      }
      continue;
    }
    out += selector[i];
  }
  return out;
}

/** Keys of the element a selector styles: each class of its last compound, plus its pseudo-element. */
function subjectKeys(selector: string): string[] {
  const compounds = splitTop(dropNot(selector), (c) => c === " " || c === ">" || c === "+" || c === "~");
  const last = compounds[compounds.length - 1] ?? "";
  const pseudo = /::(after|before)/.exec(last)?.[0] ?? "";
  return [...last.matchAll(/\.([\w-]+)/g)].map((m) => `.${m[1]}${pseudo}`);
}

const URL_RE = /url\(\s*["']?@content\/ui\/([\w-]+)\.png["']?\s*\)/;

describe.runIf(existsSync(SKIN_CSS))("skin CSS uses the generated frames consistently", () => {
  const css = [SKIN_CSS, STYLES_CSS].filter(existsSync).map((f) => readFileSync(f, "utf8"));
  const rules = css.flatMap(cssRules);
  const sizeOf = (name: string) => {
    const def = UI_FRAMES.find((f) => f.name === name);
    return def ? buildUiFrame(def, menu).width : undefined;
  };
  const ownB = (body: string) => {
    const m = /--sw-b\s*:\s*(\d+)/.exec(body);
    return m ? Number(m[1]) : undefined;
  };

  /** Rules drawing a whole frame (`border-image: url(...) <slice> ...`). */
  const bases: { keys: string[]; frame: string }[] = [];
  for (const r of rules) {
    const m = new RegExp(`border-image\\s*:\\s*${URL_RE.source}\\s+(\\d+|var\\(--sw-b\\))`).exec(r.body);
    if (m) bases.push({ keys: r.selectors.flatMap(subjectKeys), frame: m[1] ?? "" });
  }

  it("names an existing frame with its own slice in every border-image", () => {
    for (const r of rules) {
      const m = new RegExp(`border-image\\s*:\\s*${URL_RE.source}\\s+(\\d+|var\\(--sw-b\\))`).exec(r.body);
      if (!m) continue;
      const def = UI_FRAMES.find((f) => f.name === m[1]);
      expect(def, `${r.selectors.join(", ")}: ${m[1]}.png is not in UI_FRAMES`).toBeDefined();
      const slice = m[2] === "var(--sw-b)" ? ownB(r.body) : Number(m[2]);
      if (slice !== undefined) expect(slice, `${r.selectors.join(", ")}: slice of ${m[1]}`).toBe(def?.slice);
    }
  });

  it("swaps a frame (border-image-source) only for one of the same size as the frame it replaces", () => {
    for (const r of rules) {
      const m = new RegExp(`border-image-source\\s*:\\s*${URL_RE.source}`).exec(r.body);
      if (!m) continue;
      const name = m[1] ?? "";
      const size = sizeOf(name);
      const where = `${r.selectors.join(", ")} → ${name}.png`;
      expect(size, `${where} is not in UI_FRAMES`).toBeDefined();
      const keys = new Set(r.selectors.flatMap(subjectKeys));
      const replaced = bases.filter((b) => b.keys.some((k) => keys.has(k)));
      if (replaced.length > 0)
        for (const b of replaced) expect(size, `${where} replaces ${b.frame}.png`).toBe(sizeOf(b.frame));
      else {
        const b = ownB(r.body);
        expect(b, `${where}: no base frame rule found for this selector, and no --sw-b`).toBeDefined();
        expect(UI_FRAMES.find((f) => f.name === name)?.slice, where).toBe(b);
      }
    }
  });

  it("references every UI_FRAMES file at least once", () => {
    const used = new Set(css.flatMap((text) => [...text.matchAll(new RegExp(URL_RE.source, "g"))].map((m) => m[1])));
    for (const def of UI_FRAMES) expect(used.has(def.name), `${def.name}.png is not used by the skin`).toBe(true);
  });
});
