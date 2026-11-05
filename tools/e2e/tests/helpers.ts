import { expect, type Page } from "@playwright/test";

interface GameHook {
  room: { sessionId: string; state: { players: { size: number; has(id: string): boolean } } };
  locale: string;
}

/** Opens the game, types a name, picks a hero (40 Swords' pre-join step) and joins a match. */
export async function joinMatch(page: Page, name: string, query = "lang=en", hero = "knight") {
  await page.goto(`/?${query}`);
  await page.locator(".ui-menu").waitFor();
  await page.locator(".ui-input").fill(name);
  await page.locator("button[type=submit]").click();
  await pickHero(page, hero);
  await page.locator(".ui-hud-inner").waitFor();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __game?: GameHook }).__game))).toBe(true);
  await expect(page.locator(".sw-status")).toBeVisible();
}

/** 40 Swords: picks a class on the screen shown between Play and joining (one map for now: that joins it). */
export async function pickHero(page: Page, hero: string) {
  await page.locator(`.sw-select [data-class="${hero}"]`).click();
}

export function sessionId(page: Page) {
  return page.evaluate(() => (window as unknown as { __game: GameHook }).__game.room.sessionId);
}
