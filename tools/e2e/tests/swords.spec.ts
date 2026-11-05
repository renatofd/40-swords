import { expect, test } from "@playwright/test";
import { joinMatch } from "./helpers";

interface WorldHook {
  room: {
    sessionId: string;
    state: {
      players: { get(id: string): { classId: string; x: number; y: number; swing: number } | undefined };
      enemies: { size: number };
    };
  };
}

const self = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const g = (window as unknown as { __game: WorldHook }).__game;
    const p = g.room.state.players.get(g.room.sessionId);
    return p ? { classId: p.classId, x: p.x, y: p.y, swing: p.swing } : undefined;
  });

test("the hero select shows the three classes with their stats, in the player's language", async ({ page }) => {
  await page.goto("/?lang=pt");
  await page.locator(".ui-input").fill("Zé");
  await page.locator("button[type=submit]").click();
  await expect(page.getByRole("heading", { name: "Escolha seu herói" })).toBeVisible();
  await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);
  for (const label of [
    "Vida",
    "Força",
    "Velocidade",
    "Sorte",
    "Chance de crítico",
    "Dano crítico",
    "Roubo de vida",
    "Defesa",
  ])
    await expect(page.locator('.sw-card[data-class="rogue"]')).toContainText(label);

  // Hero colours: the class colour is on; the others unlock with the career (a new browser has none yet).
  await expect(page.locator(".sw-colour")).toHaveCount(6);
  await expect(page.locator('.sw-colour[data-palette="classic"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('.sw-colour[data-palette="gold"]')).toHaveAttribute("aria-disabled", "true");
  // A locked colour can't be picked (aria-disabled), but clicking it still says how to unlock it.
  await page.locator('.sw-colour[data-palette="gold"]').click({ force: true });
  await expect(page.locator(".sw-colours-note")).toHaveText("🔒 Ouro: Vença uma partida");
  await expect(page.locator('.sw-colour[data-palette="classic"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".sw-career")).toHaveText("Sua carreira começa na primeira partida.");

  // One map for now: no map step, its rules show here; Back returns to the menu.
  await expect(page.locator(".sw-select-rules")).toHaveText(
    "Uma vida por partida · só monstros por 5 min, depois PvP · aos 30 min, battle royale na arena",
  );
  await expect(page.locator(".sw-select [data-map]")).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.locator(".ui-menu")).toBeVisible();

  // Esc also returns to the menu.
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ui-menu")).toBeVisible();
});

test("the hero picked before joining is the one in the world, and is remembered", async ({ page }) => {
  await joinMatch(page, "Bia", "lang=en", "barbarian");
  await expect.poll(async () => (await self(page))?.classId).toBe("barbarian");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Leave match" }).click();
  await page.locator("button[type=submit]").click();
  await expect(page.locator('.sw-card[data-class="barbarian"]')).toBeFocused();
});

test("a hero enters the world, walks and swings the sword", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await joinMatch(page, "Lia", "lang=en", "rogue");
  await expect.poll(async () => (await self(page))?.classId).toBe("rogue");
  await expect(page.locator(".sw-status")).toContainText("Lv 1");
  await expect(page.locator(".sw-name-self")).toHaveText("Lia");

  // South of every spawn point of the square is open floor.
  const start = await self(page);
  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await self(page))?.y ?? 0).toBeGreaterThan((start?.y ?? 0) + 20);
  await page.keyboard.up("KeyS");

  // A quick tap (down and up within one frame) still swings.
  await page.keyboard.press("Space");
  await expect.poll(async () => (await self(page))?.swing).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("C opens the attributes and relics panel", async ({ page }) => {
  await joinMatch(page, "Caio", "lang=en", "knight");
  await page.keyboard.press("KeyC");
  await expect(page.locator(".sw-details")).toBeVisible();
  await expect(page.locator(".sw-details")).toContainText("Attributes");
  await expect(page.locator(".sw-details")).toContainText("No relics yet");
  await page.keyboard.press("KeyC");
  await expect(page.locator(".sw-details")).toBeHidden();
});

test("the waiting room starts the match once everyone is ready", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.locator(".ui-input").fill("Duda");
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".sw-select-rules")).toHaveText(
    "One life per match · only monsters for 5 min, then PvP · at 30 min, battle royale in the arena",
  );
  // Picking a hero joins the (only) map.
  await page.locator('.sw-select [data-class="knight"]').click();

  // Joining lands in the waiting room: nothing starts until everyone is ready.
  const lobby = page.locator(".sw-lobby");
  const clock = page.locator(".sw-match");
  await expect(lobby).toBeVisible();
  await expect(lobby).toContainText("Waiting room");
  // (Heroes of earlier tests may still be listed for a few seconds, waiting to reconnect: they don't count.)
  await expect(lobby.locator(".sw-lobby-self")).toHaveText("…Duda");
  await expect(clock).toHaveText("Waiting room · 0/1 ready");

  // Bots fill the match (on by default); anyone in the room can switch them off and on again.
  const bots = lobby.locator(".sw-lobby-bots");
  await expect(bots).toHaveText("🤖 Bots: on");
  await expect(lobby).toContainText("Bots fill the match up to 40 heroes.");
  await bots.click();
  await expect(bots).toHaveText("🤖 Bots: off");
  await expect(lobby).toContainText("Players only: no bots.");
  await bots.click();
  await expect(bots).toHaveText("🤖 Bots: on");

  // Ready, then changing your mind (R), then ready again with the button.
  await page.getByRole("button", { name: "Ready" }).click();
  await expect(clock).toHaveText(/^The match starts in 0:0\d$/);
  await expect(lobby.locator(".sw-lobby-self")).toHaveText("✔Duda");
  await page.keyboard.press("KeyR");
  await expect(clock).toHaveText("Waiting room · 0/1 ready");
  await page.getByRole("button", { name: "Ready" }).click();

  // After the countdown the match is on, with bots up to 40 heroes: the panel goes away and the PvP clock runs,
  // first big in the middle of the screen, then back in its corner.
  await expect(clock).toHaveText(/^PvP in \d+:\d\d · 👥 40$/, { timeout: 10_000 });
  await expect(lobby).toBeHidden();
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const centreX = async () => {
    const box = await clock.boundingBox();
    return box ? box.x + box.width / 2 : 0;
  };
  await expect(clock).toHaveClass(/sw-match-intro/);
  expect(Math.abs((await centreX()) - viewport.width / 2)).toBeLessThan(40);
  await expect(clock).not.toHaveClass(/sw-match-intro/, { timeout: 6000 });
  expect(await centreX()).toBeGreaterThan(viewport.width * 0.7);
  // Bots are listed with the players (Tab), marked as bots.
  await page.keyboard.down("Tab");
  await expect(page.locator(".ui-playerlist")).toContainText("🤖");
  await page.keyboard.up("Tab");
});
