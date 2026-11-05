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

  // Choosing a class goes to the map step; Back returns to the classes.
  await page.locator('.sw-card[data-class="rogue"]').click();
  await expect(page.getByRole("heading", { name: "Escolha o mapa" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);
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

  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.up("Space");
  await expect.poll(async () => (await self(page))?.swing).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
