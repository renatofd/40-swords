import { expect, type Page } from "@playwright/test";

interface GameHook {
  room: { sessionId: string; state: { players: { size: number; has(id: string): boolean } } };
  locale: string;
}

/** Opens the game, types a name, picks a colour (the demo's pre-join step) and joins a match. */
export async function joinMatch(page: Page, name: string, query = "lang=en") {
  await page.goto(`/?${query}`);
  await page.locator(".ui-menu").waitFor();
  await page.locator(".ui-input").fill(name);
  await page.locator("button[type=submit]").click();
  await page.locator(".arena-swatch").first().click();
  await page.locator(".ui-hud-inner").waitFor();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __game?: GameHook }).__game))).toBe(true);
}

export function sessionId(page: Page) {
  return page.evaluate(() => (window as unknown as { __game: GameHook }).__game.room.sessionId);
}
