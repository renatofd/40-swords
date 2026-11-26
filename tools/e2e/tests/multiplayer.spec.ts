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
  // The player list (Tab) has everyone in the room: the roster is not limited by area of interest.
  // (Not the scoreboard: it only shows the top five, and heroes of earlier tests may still be
  // in the room for a few seconds, waiting to reconnect.)
  await b.keyboard.down("Tab");
  await expect(b.locator(".ui-playerlist")).toContainText("Eve");
  await expect(b.locator(".ui-playerlist")).toContainText("Frank");
  await b.keyboard.up("Tab");
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

test("scanlines can be switched on in Settings, line up with the art pixels and stay on", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.locator("#game .ui-scanlines")).toBeHidden();
  await page.getByRole("button", { name: /Settings/ }).click();
  await page.getByLabel("Scanlines (retro screen)").check();
  await page.getByRole("button", { name: "Back" }).click();
  const lines = page.locator("#game .ui-scanlines");
  await expect(lines).toBeVisible();
  // Exactly over the game canvas, in device pixels, one line per row of art pixels.
  const fit = await page.evaluate(() => {
    const game = document.querySelector("#game canvas:not(.ui-scanlines)") as HTMLCanvasElement;
    const over = document.querySelector("#game .ui-scanlines") as HTMLCanvasElement;
    const a = game.getBoundingClientRect();
    const b = over.getBoundingClientRect();
    const ctx = over.getContext("2d") as CanvasRenderingContext2D;
    const column = ctx.getImageData(0, 0, 1, over.height).data;
    const alpha = (y: number) => column[y * 4 + 3] ?? 0;
    let lines = 0;
    for (let y = 0; y < over.height; y++) if (alpha(y) > 0 && (y === 0 || alpha(y - 1) === 0)) lines++;
    return {
      same: [a.left, a.top, a.width, a.height].join() === [b.left, b.top, b.width, b.height].join(),
      lines,
      rows: game.height,
    };
  });
  expect(fit.same).toBe(true);
  expect(fit.lines).toBe(fit.rows);

  await page.reload();
  await expect(page.locator("#game .ui-scanlines")).toBeVisible();
});

test("holding Tab shows the player list", async ({ page }) => {
  await joinMatch(page, "Gus");
  await page.keyboard.down("Tab");
  await expect(page.locator(".ui-playerlist")).toBeVisible();
  await expect(page.locator(".ui-playerlist")).toContainText("Gus");
  await page.keyboard.up("Tab");
  await expect(page.locator(".ui-playerlist")).toBeHidden();
});

test("the scoreboard collapses to its title bar and stays collapsed next time", async ({ page }) => {
  await joinMatch(page, "Hana");
  const board = page.locator(".ui-scoreboard");
  await expect(board).toContainText("Hana");
  await page.getByRole("button", { name: "Hide leaderboard" }).click();
  await expect(board.locator("ol")).toBeHidden();
  await expect(board).toContainText("Leaderboard");
  // The click left the keyboard to the game: Space does not toggle it back.
  await page.keyboard.press("Space");
  await expect(board.locator("ol")).toBeHidden();

  // Joining again (a new page load) keeps it collapsed.
  await joinMatch(page, "Hana");
  await expect(page.getByRole("button", { name: "Show leaderboard" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Show leaderboard" }).click();
  await expect(board.locator("ol")).toBeVisible();
  await expect(board).toContainText("Hana");
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
