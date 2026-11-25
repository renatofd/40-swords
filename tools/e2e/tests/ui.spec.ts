import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";

/**
 * The DOM UI skin on the dev-only UI gallery (apps/client/ui-gallery.html), without a server:
 *  1. pixel exactness of every icon and 9-slice frame at DPR 1 and 2 (0 differing pixels against a
 *     reference built here from the source PNGs) and the Tiny5 crispness probe (only #000 and #FFF);
 *  2. a locale matrix at 1280×720 and 1920×1080 (overflow, font roles, focus frames, RTL);
 *  3. the DOM-write budget of the status panel.
 */
interface UiGallery {
  ready: boolean;
  errors: string[];
  writes: number;
}

const repo = new URL("../../../", import.meta.url);
const readPng = (path: string) => PNG.sync.read(readFileSync(new URL(path, repo)));
const ITEMS = readPng("content/sprites/items.png");
const ICONS = (
  JSON.parse(readFileSync(new URL("game/client/src/ui/iconFrames.json", repo), "utf8")) as {
    icons: Record<string, { x: number; y: number }>;
  }
).icons;
/** Background of the gallery's pixels section (`.g-pixels`). */
const BG = [0x2a, 0x3a, 0x2a];
/** Border width (= slice) of each frame, in art px (tools/art/src/ui.ts UI_FRAMES). */
const sliceOf = (name: string) =>
  name === "frame-card"
    ? 9
    : name === "frame-cursor"
      ? 6
      : name === "frame-bar"
        ? 2
        : /^frame-(button|rarity)/.test(name)
          ? 5
          : 3;
/** RARITY_COLORS, read from the shared source (the e2e package does not import game code). */
const RARITY = (() => {
  const src = readFileSync(new URL("game/shared/src/relics.ts", repo), "utf8");
  const list = /RARITY_COLORS\s*=\s*\[([^\]]+)\]/.exec(src)?.[1] ?? "";
  return list.split(",").map((v) => `#${Number(v.trim()).toString(16).padStart(6, "0")}`);
})();

async function openGallery(page: Page, query: string) {
  await page.goto(`/ui-gallery.html?${query}`);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __uiGallery?: UiGallery }).__uiGallery?.ready ?? false), {
      timeout: 30_000,
    })
    .toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __uiGallery: UiGallery }).__uiGallery.errors)).toEqual([]);
}

/** Art-pixel image (RGBA, straight alpha) of a frame drawn as a W×H 9-slice with `border-image … stretch`. */
function nineSlice(name: string, w: number, h: number) {
  const src = readPng(`content/ui/${name}.png`);
  const b = sliceOf(name);
  const fill = name !== "frame-cursor";
  const mid = src.width - 2 * b;
  // `stretch` maps the source middle onto the box middle; sampled at the art-pixel centre (nearest).
  const map = (i: number, size: number, srcSize: number) => {
    if (i < b) return i;
    if (i >= size - b) return srcSize - (size - i);
    return b + Math.floor(((i - b + 0.5) * mid) / (size - 2 * b));
  };
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= b && x < w - b && y >= b && y < h - b;
      if (inside && !fill) continue;
      const s = (map(y, h, src.height) * src.width + map(x, w, src.width)) * 4;
      out.set(src.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  return out;
}

/**
 * Compares a device-pixel rectangle of the screenshot with an art image scaled by `scale`, over BG,
 * and counts the differing pixels. With `slack`, a pixel also passes when it equals the reference at
 * one of its 8 neighbours (see the frames note in the test).
 */
function diff(
  shot: PNG,
  left: number,
  top: number,
  art: { w: number; h: number; px: (x: number, y: number) => ArrayLike<number> },
  scale: number,
  slack = false,
) {
  const w = art.w * scale;
  const h = art.h * scale;
  const want = (x: number, y: number) => {
    const p = art.px(Math.floor(x / scale), Math.floor(y / scale));
    const a = (p[3] ?? 0) / 255;
    return [0, 1, 2].map((c) => Math.round((p[c] ?? 0) * a + (BG[c] ?? 0) * (1 - a)));
  };
  let bad = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((top + y) * shot.width + left + x) * 4;
      const got = [shot.data[s], shot.data[s + 1], shot.data[s + 2]];
      const same = (x2: number, y2: number) => {
        if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) return false;
        const r = want(x2, y2);
        return r[0] === got[0] && r[1] === got[1] && r[2] === got[2];
      };
      if (same(x, y)) continue;
      let near = false;
      if (slack)
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = same(x + dx, y + dy);
      if (!near) bad++;
    }
  return bad;
}

test.describe("UI skin pixels", () => {
  for (const dpr of [1, 2])
    for (const u of [1, 2, 3])
      test(`icons and frames are pixel exact at DPR ${dpr}, u ${u}`, async ({ browser }) => {
        const page = await browser.newPage({
          viewport: { width: Math.ceil(1900 / dpr), height: Math.ceil(860 / dpr) },
          deviceScaleFactor: dpr,
        });
        await openGallery(page, `section=pixels&u=${u}&freeze`);
        const boxes = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".g-pixels > [data-check]")].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              icon: el.dataset.icon,
              big: el.classList.contains("sw-icon-big"),
              frame: el.dataset.frame,
              probe: el.dataset.probe !== undefined,
              x: r.left,
              y: r.top,
              w: r.width,
              h: r.height,
            };
          }),
        );
        const shot = PNG.sync.read(await page.screenshot({ animations: "disabled", caret: "hide" }));
        const failures: string[] = [];
        let checked = 0;
        for (const b of boxes) {
          // Every box starts on a whole device pixel (positions are u multiples).
          const left = b.x * dpr;
          const top = b.y * dpr;
          expect(Math.abs(left - Math.round(left)), `${b.icon ?? b.frame} left`).toBeLessThan(1e-3);
          expect(Math.abs(top - Math.round(top)), `${b.icon ?? b.frame} top`).toBeLessThan(1e-3);
          if (b.probe) {
            // Tiny5 crispness: the probe (white digits on black) holds no anti-aliased pixel.
            const odd = new Set<string>();
            for (let y = Math.round(top); y < Math.round(top + b.h * dpr); y++)
              for (let x = Math.round(left); x < Math.round(left + b.w * dpr); x++) {
                const s = (y * shot.width + x) * 4;
                const [r, g, bl] = [shot.data[s], shot.data[s + 1], shot.data[s + 2]];
                if (!((r === 0 && g === 0 && bl === 0) || (r === 255 && g === 255 && bl === 255)))
                  odd.add(`${r},${g},${bl}`);
              }
            expect([...odd], "Tiny5 probe colours").toEqual([]);
            continue;
          }
          let bad: number;
          if (b.icon) {
            const cell = ICONS[b.icon];
            if (!cell) {
              failures.push(`${b.icon}: not in iconFrames.json`);
              continue;
            }
            bad = diff(
              shot,
              Math.round(left),
              Math.round(top),
              {
                w: 16,
                h: 16,
                px: (x, y) => {
                  const s = ((cell.y + y) * ITEMS.width + cell.x + x) * 4;
                  return ITEMS.data.subarray(s, s + 4);
                },
              },
              u * (b.big ? 2 : 1),
            );
          } else {
            const name = b.frame ?? "";
            const w = Math.round((b.w * dpr) / u);
            const h = Math.round((b.h * dpr) / u);
            expect([w, h], name).toEqual([40, 30]);
            const img = nineSlice(name, w, h);
            // Chrome (153) snaps the nine pieces of a border image to whole CSS px. When the art pixel is
            // not a whole number of CSS px (DPR 2 with an odd u; every fractional DPR), the 3-art-px
            // corner of a 1.5 CSS px art pixel is drawn into 4 CSS px instead of 4.5, so the frame
            // pieces may be one device px off. Exact where u / DPR is an integer; within 1 px otherwise.
            bad = diff(
              shot,
              Math.round(left),
              Math.round(top),
              { w, h, px: (x, y) => img.subarray((y * w + x) * 4, (y * w + x) * 4 + 4) },
              u,
              u % dpr !== 0,
            );
          }
          checked++;
          if (bad) failures.push(`${b.icon ?? b.frame}${b.big ? " (2×)" : ""}: ${bad} px`);
        }
        expect(checked).toBe(Object.keys(ICONS).length * 2 + 19);
        expect(failures).toEqual([]);
        await page.close();
      });
});

const LOCALES = ["en", "pt", "de", "ru", "ar", "hi", "ja", "zh", "ko"] as const;
const PIXEL_FONT = /^"?Tiny5"?,/;

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
])
  test.describe(`UI gallery at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });
    for (const lang of LOCALES)
      test(`${lang}: no overflow, the right fonts and frames`, async ({ page }, info) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await openGallery(page, `lang=${lang}&freeze`);
        await page.screenshot({ path: info.outputPath(`gallery-${lang}-${size.width}.png`), fullPage: true });

        const report = await page.evaluate(() => {
          const over: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("[data-check]")) {
            if (!el.getClientRects().length) continue;
            if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
              over.push(`${el.className} ${el.scrollWidth}×${el.scrollHeight} > ${el.clientWidth}×${el.clientHeight}`);
          }
          const fontOf = (sel: string) => [
            ...new Set([...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).fontFamily)),
          ];
          const root = getComputedStyle(document.documentElement);
          return {
            over,
            num: fontOf(".sw-num"),
            title: fontOf(".sw-card-title"),
            rarity: [0, 1, 2, 3, 4].map((i) => root.getPropertyValue(`--sw-r${i}`).trim().toLowerCase()),
            dir: document.documentElement.dir,
            // Core .ui-button.primary paints an accent background; the skin must clear it (round frame corners).
            primaryBg: [...document.querySelectorAll(".ui-button.primary")].map(
              (el) => getComputedStyle(el).backgroundColor,
            ),
            // "7/12 ready": one left-to-right number run (two isolates would read 12/7 in Arabic).
            lobbyNums: [...document.querySelectorAll(".sw-match")]
              .map((el) => [...el.querySelectorAll(".sw-num")].map((n) => n.textContent))
              .find((nums) => nums.some((n) => n?.includes("/"))),
          };
        });
        expect(report.over).toEqual([]);
        expect(report.num.length).toBeGreaterThan(0);
        for (const f of report.num) expect(f).toMatch(PIXEL_FONT);
        expect(report.title.length).toBe(1);
        if (lang === "en" || lang === "ru") expect(report.title[0]).toMatch(PIXEL_FONT);
        if (lang === "ar" || lang === "ja") expect(report.title[0]).toMatch(/^system-ui/);
        expect(report.rarity).toEqual(RARITY);
        expect(report.dir).toBe(lang === "ar" ? "rtl" : "ltr");
        expect(report.primaryBg.length).toBeGreaterThan(0);
        for (const bg of report.primaryBg) expect(bg).toBe("rgba(0, 0, 0, 0)");
        expect(report.lobbyNums).toEqual(["7/12"]);

        // Keyboard focus on the name input and the language select: the red primary frame (no ::after there).
        const frameOf = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).borderImageSource);
        await page.locator(".ui-menu .ui-input").focus();
        expect(await frameOf(".ui-menu .ui-input")).toContain("frame-button-primary");
        await page.keyboard.press("Tab"); // Play
        await page.keyboard.press("Tab"); // language
        await expect(page.locator(".ui-menu .ui-select")).toBeFocused();
        expect(await frameOf(".ui-menu .ui-select")).toContain("frame-button-primary");

        // The HUD at its real positions: nothing overflows; in Arabic the status panel sits on the right.
        await openGallery(page, `section=status&lang=${lang}&freeze`);
        const hud = await page.evaluate(() => {
          const over: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("[data-check], .sw-status, .sw-match")) {
            if (!el.getClientRects().length) continue;
            if (el.scrollWidth > el.clientWidth + 1) over.push(`${el.className} ${el.scrollWidth} > ${el.clientWidth}`);
          }
          const status = document.querySelector(".sw-status")?.getBoundingClientRect();
          return { over, statusRight: status?.right ?? 0, statusLeft: status?.left ?? 0, width: innerWidth };
        });
        expect(hud.over).toEqual([]);
        if (lang === "ar") expect(hud.width - hud.statusRight).toBeLessThanOrEqual(16);
        else expect(hud.statusLeft).toBeLessThanOrEqual(16);
        await page.screenshot({ path: info.outputPath(`hud-${lang}-${size.width}.png`) });
        expect(errors).toEqual([]);
      });
  });

test("the status panel writes nothing when nothing changes, and little during a cooldown", async ({ page }) => {
  await openGallery(page, "section=status&freeze");
  const writes = await page.evaluate(() => {
    type Values = Record<string, unknown> & { daggerCd: number };
    const g = (
      window as unknown as {
        __uiGallery: {
          status: { el: HTMLElement; values: Values; maxCd: Record<string, number>; update(v: Values): void };
        };
      }
    ).__uiGallery.status;
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.length;
    });
    const watch = () =>
      observer.observe(g.el, { subtree: true, childList: true, attributes: true, characterData: true });
    const flush = () => {
      count += observer.takeRecords().length;
    };
    // The same values 60 times (one second of frames): no DOM write at all.
    watch();
    for (let i = 0; i < 60; i++) g.update({ ...g.values });
    flush();
    const idle = count;
    // Each weapon from a full cooldown to ready, one tick at a time (as the server counts it down).
    const sweep: Record<string, number> = {};
    for (const [w, max] of Object.entries(g.maxCd)) {
      const values = { ...g.values };
      values[`${w}Cd`] = max;
      g.update(values);
      flush();
      count = 0;
      for (let cd = max - 1; cd >= 0; cd--) g.update({ ...values, [`${w}Cd`]: cd });
      flush();
      sweep[w] = count;
    }
    observer.disconnect();
    return { idle, sweep };
  });
  expect(writes.idle).toBe(0);
  expect(Object.keys(writes.sweep)).toHaveLength(4);
  for (const [w, n] of Object.entries(writes.sweep)) {
    expect(n, w).toBeGreaterThan(0);
    expect(n, w).toBeLessThanOrEqual(16);
  }
});
