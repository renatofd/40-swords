import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * The dev-only enemy gallery (apps/client/gallery.html): every kind and skin
 * driven through its acts without a server. Screenshots are for review, not a
 * pixel-diff gate; the test fails on missing sheets or tags and on page errors.
 *
 * GALLERY_OUT=<dir> also saves a review set (every segment, 4 facings, 1x and 3x).
 */
interface GalleryHook {
  ready: boolean;
  frozen: boolean;
  missing: string[];
}

async function open(page: Page, query: string): Promise<string[]> {
  await page.goto(`/gallery.html?${query}`);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __gallery?: GalleryHook }).__gallery?.frozen ?? false), {
      timeout: 30_000,
    })
    .toBe(true);
  return page.evaluate(() => (window as unknown as { __gallery: GalleryHook }).__gallery.missing);
}

test.describe("enemy gallery", () => {
  test("draws every kind, skin and act at 1x and 3x", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 2000, height: 1400 });
    for (const zoom of [1, 3]) {
      // Just before the releases: wind-up poses, tells, held items and overlays.
      expect(await open(page, `zoom=${zoom}&seg=tell&at=-90&facing=0`)).toEqual([]);
      await page.locator("#wrap").screenshot({ path: info.outputPath(`gallery-${zoom}x.png`) });
    }
    expect(errors).toEqual([]);
  });

  test("draws every item, pickup, chest, pedestal and loot effect at 1x and 3x", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 3300, height: 900 });
    for (const zoom of [1, 3]) {
      expect(await open(page, `view=items&zoom=${zoom}`)).toEqual([]);
      await page.locator("#wrap").screenshot({ path: info.outputPath(`items-${zoom}x.png`) });
    }
    expect(errors).toEqual([]);
  });

  test("runs the shooters live (shots, impacts, deaths) without page errors", async ({ page }) => {
    // The frozen shots stop before any release: this run lets the shot code play out.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/gallery.html?zoom=2&only=eye,shroom,cobra,witch,archer,spider,drake,colossus");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __gallery?: GalleryHook }).__gallery?.ready ?? false), {
        timeout: 30_000,
      })
      .toBe(true);
    await page.waitForTimeout(4000);
    // Every enemy shot style, many times over: a loop starts on a random frame (some have only 2).
    const shot = await page.evaluate(() => {
      type Spawner = { spawnHostile(m: Record<string, unknown>, now: number): void };
      const actors = (window as unknown as { __actors?: { scene: { projectiles?: Spawner; time: { now: number } } }[] })
        .__actors;
      const scene = actors?.[0]?.scene;
      if (!scene?.projectiles) return false;
      const styles = ["bone", "rock", "orb", "sting", "axe", "web", "arrow", "bolt", "curse", "spore", "spear"];
      styles.forEach((style, i) => {
        for (let n = 0; n < 12; n++)
          scene.projectiles?.spawnHostile(
            { key: `t${i}-${n}`, from: "", style, x: 40, y: 40, angles: [n / 2], speed: 60, range: 60 },
            scene.time.now,
          );
      });
      return true;
    });
    expect(shot).toBe(true);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { __gallery: GalleryHook }).__gallery.missing)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("saves the review set", async ({ page }) => {
    const out = process.env.GALLERY_OUT;
    test.skip(!out, "set GALLERY_OUT to save the review screenshots");
    if (!out) return;
    test.setTimeout(600_000);
    mkdirSync(out, { recursive: true });
    await page.setViewportSize({ width: 2000, height: 1400 });
    const shots: [string, string][] = [
      ["idle", "seg=idle&at=0"],
      ["walk", "seg=walk&at=1200"],
      ["hop-crouch", "seg=hop&at=-60"],
      ["hop-air", "seg=hop&at=150"],
      ["hurt", "seg=hurt&at=90"],
      ["interrupt", "seg=interrupt&at=120"],
      ["death", "seg=death&at=150"],
      ["stunned", "seg=stunned&at=700"],
      ["stone", "seg=stone&at=600"],
      ["stone-end", "seg=stone&at=2050"],
    ];
    for (const slot of [0, 1, 2, 3, 4])
      for (const facing of [0, 2, 4, 6]) {
        shots.push([`slot${slot}-f${facing}-windup`, `seg=slot${slot}&at=-90&facing=${facing}`]);
        shots.push([`slot${slot}-f${facing}-action`, `seg=slot${slot}&at=80&facing=${facing}`]);
      }
    for (const zoom of [1, 3])
      for (const [name, query] of shots) {
        await open(page, `zoom=${zoom}&${query}`);
        await page.locator("#wrap").screenshot({ path: join(out, `${name}-${zoom}x.png`) });
      }
  });
});
