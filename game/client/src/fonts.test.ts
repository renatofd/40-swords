import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CORE_MESSAGES, type Locale } from "@core/client/i18n";
import { describe, expect, it } from "vitest";
import { messages } from "./messages";
import { woffCoverage } from "./test/woff";

/**
 * Tiny5 (the UI's pixel font, bundled from @fontsource/tiny5 by ui/theme.ts) is
 * used for labels in these locales; Arabic, Devanagari and CJK use the system font.
 */
const TINY5_LOCALES: Locale[] = ["en", "pt", "es", "fr", "de", "it", "tr", "ru", "id"];
const SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"] as const;

const require = createRequire(import.meta.url);
const fontFile = (subset: string) => require.resolve(`@fontsource/tiny5/files/tiny5-${subset}-400-normal.woff`);

const covered = new Set<number>();
for (const subset of SUBSETS) for (const c of woffCoverage(readFileSync(fontFile(subset)))) covered.add(c);

/** Characters that never need Tiny5: whitespace, `{placeholders}`, emoji and the lobby tick (kept on purpose). */
const exempt = (ch: string) => /\s/u.test(ch) || /\p{Extended_Pictographic}/u.test(ch) || ch === "✔" || ch === "️";

describe("Tiny5", () => {
  it("is imported through 400.css: one @font-face per subset, each with a unicode-range", () => {
    const css = readFileSync(require.resolve("@fontsource/tiny5/400.css"), "utf8");
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(5);
    for (const face of faces) expect(face).toMatch(/unicode-range\s*:/);
    const theme = readFileSync(new URL("./ui/theme.ts", import.meta.url), "utf8");
    expect(theme).toContain('import "@fontsource/tiny5/400.css";');
    expect(theme).not.toMatch(/@fontsource\/tiny5\/(latin|cyrillic|greek)/);
  });

  it("reads real coverage from the font files (Latin + Cyrillic yes, CJK and Arabic no)", () => {
    expect(covered.size).toBeGreaterThan(300);
    for (const ch of "AzÇğİşÿЖжЁё€") expect(covered.has(ch.codePointAt(0) ?? 0), ch).toBe(true);
    for (const ch of "日한ع") expect(covered.has(ch.codePointAt(0) ?? 0), ch).toBe(false);
  });

  it("covers digits and the number signs of the HUD", () => {
    for (const ch of "0123456789/×:+-%!.,") expect(covered.has(ch.codePointAt(0) ?? 0), ch).toBe(true);
  });

  it("covers every game and core string of the Latin and Cyrillic locales", () => {
    const missing = new Map<string, string>();
    for (const locale of TINY5_LOCALES) {
      const strings = { ...CORE_MESSAGES[locale], ...messages[locale] };
      for (const [key, value] of Object.entries(strings)) {
        const text = String(value).replace(/\{[\w.]+\}/g, "");
        for (const ch of text) {
          if (exempt(ch) || covered.has(ch.codePointAt(0) ?? 0)) continue;
          missing.set(`${locale}:${ch}`, `${key} = ${text}`);
        }
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });
});
