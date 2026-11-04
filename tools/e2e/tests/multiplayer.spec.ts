import { expect, test } from "@playwright/test";
import { joinMatch, pickHero, sessionId } from "./helpers";

test("two players join the same match", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));

  await joinMatch(a, "Alice");
  await joinMatch(b, "Bob");

  // Both are in the same room (the server reports two clients).
  const metrics = await (await fetch("http://localhost:2567/metrics")).text();
  expect(metrics).toMatch(/game_clients [2-9]/);
  expect(await sessionId(a)).not.toBe(await sessionId(b));
  expect(errors).toEqual([]);
  await a.context().close();
  await b.context().close();
});

test("pause menu leaves the match and returns to the main menu", async ({ page }) => {
  await joinMatch(page, "Carol");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Leave match" }).click();
  await expect(page.locator(".ui-menu")).toBeVisible();
  await expect(page.locator(".ui-input")).toHaveValue("Carol");
});

test("Arabic switches the interface to right-to-left", async ({ page }) => {
  await page.goto("/?lang=ar");
  await page.locator(".ui-menu").waitFor();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("button[type=submit]")).toHaveText("العب");
});

test("chat messages reach other players, in any script", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await joinMatch(a, "Eve");
  await joinMatch(b, "Frank", "lang=ar");

  await a.keyboard.press("Enter");
  await a.keyboard.type("Olá! مرحبا 👋");
  await a.keyboard.press("Enter");

  await expect(b.locator(".ui-chat-line").last()).toContainText("Eve: Olá! مرحبا 👋");
  // The scoreboard lists other players too (the roster is not limited by area of interest).
  await expect(b.locator(".ui-scoreboard")).toContainText("Eve");
  await expect(b.locator(".ui-scoreboard")).toContainText("Frank");
  await a.context().close();
  await b.context().close();
});

test("audio settings are saved between visits", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.getByRole("button", { name: /Settings/ }).click();
  await page.locator(".ui-slider input").first().fill("25");
  await page.getByRole("button", { name: "Back" }).click();

  await page.reload();
  await page.getByRole("button", { name: /Settings/ }).click();
  await expect(page.locator(".ui-slider input").first()).toHaveValue("25");
});

test("holding Tab shows the player list", async ({ page }) => {
  await joinMatch(page, "Gus");
  await page.keyboard.down("Tab");
  await expect(page.locator(".ui-playerlist")).toBeVisible();
  await expect(page.locator(".ui-playerlist")).toContainText("Gus");
  await page.keyboard.up("Tab");
  await expect(page.locator(".ui-playerlist")).toBeHidden();
});

test("a dropped connection shows the reconnect screen until the room is back", async ({ page, context }) => {
  await joinMatch(page, "Ivy");
  const before = await sessionId(page);
  // The SDK only auto-reconnects rooms that have been up for a moment.
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await expect(page.getByText("Connection lost")).toBeVisible();
  // Esc must not close the reconnect screen.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Connection lost")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Connection lost")).toBeHidden({ timeout: 20_000 });
  expect(await sessionId(page)).toBe(before);
});

test("connecting can be cancelled back to the menu", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.locator(".ui-menu").waitFor();
  // Matchmaking never answers.
  await page.route("**/matchmake/**", () => {});
  await page.locator("button[type=submit]").click();
  await pickHero(page, "knight");
  await expect(page.getByText("Connecting")).toBeVisible();
  await page.getByRole("button", { name: "Back to menu" }).click();
  await expect(page.locator(".ui-menu")).toBeVisible();
});
