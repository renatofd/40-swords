import { expect, type Page, test } from "@playwright/test";
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
  await expect(page.locator(".sw-colours-note")).toHaveText("Ouro: Vença uma partida");
  await expect(page.locator(".sw-colours-note .sw-icon[data-icon=lock]")).toBeVisible();
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
  // The pack skin: icons from the items sheet, the HUD frame and the pixel font.
  await expect(page.locator('.sw-status .sw-icon[data-icon="rupee-green"]')).toBeVisible();
  await expect(page.locator('.sw-status .sw-icon[data-icon^="hp-"]')).toBeVisible();
  expect(await page.locator(".sw-status").evaluate((el) => getComputedStyle(el).borderImageSource)).toContain(
    "frame-hud",
  );
  expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check("16px Tiny5")))).toBe(true);

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
  await expect(clock).toHaveText(/^PvP in \d+:\d\d · 40$/, { timeout: 10_000 });
  await expect(clock.locator(".sw-icon[data-icon=heroes]")).toBeVisible();
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

test("credits are one click away from hero select", async ({ page, request }, info) => {
  await page.goto("/?lang=pt");
  await page.locator(".ui-input").fill("Zé");
  await page.locator("button[type=submit]").click();
  await page.getByRole("button", { name: "Créditos" }).click();
  const credits = page.locator(".sw-credits");
  await expect(credits).toBeVisible();
  for (const text of [
    "#NotZelda Overhead Adventure Tiles",
    "Raphael Azcueta",
    "CC BY-SA 4.0",
    "creativecommons.org/licenses/by-sa/4.0",
    "Tiny5",
    "SIL Open Font License",
  ])
    await expect(credits).toContainText(text);
  await expect(page.getByRole("button", { name: "Voltar" })).toBeFocused();
  await info.attach("credits", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);

  // The same credits ship as files next to the game (and in the release zip).
  const txt = await request.get("/CREDITS.txt");
  expect(txt.status()).toBe(200);
  expect(await txt.text()).toContain("CC BY-SA 4.0");
  const ofl = await request.get("/licenses/OFL-1.1-Tiny5.txt");
  expect(ofl.status()).toBe(200);
  expect(await ofl.text()).toContain("SIL OPEN FONT LICENSE");
});

/**
 * Tiny5 is drawn on its 8 px grid only at whole multiples of the art pixel: every visible element in the
 * pixel font has a size of N × 8 × --sw-u (N a positive integer) and no letter spacing.
 */
async function expectPixelFontOnGrid(page: Page, where: string) {
  const bad = await page.evaluate(() => {
    const u = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sw-u"));
    const out: string[] = [];
    let seen = 0;
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || !/^"?Tiny5"?,/.test(cs.fontFamily)) continue;
      seen++;
      const k = Number.parseFloat(cs.fontSize) / (8 * u);
      if (!(k > 0.5 && Math.abs(k - Math.round(k)) < 1e-3))
        out.push(`${el.tagName}.${el.className} font ${cs.fontSize} (u ${u})`);
      if (cs.letterSpacing !== "normal" && cs.letterSpacing !== "0px")
        out.push(`${el.tagName}.${el.className} letter-spacing ${cs.letterSpacing}`);
    }
    return seen ? out : ["no element uses Tiny5"];
  });
  expect(bad, where).toEqual([]);
}

/** No element inside these boxes is wider than its box (long German or Russian labels, big scales). */
async function expectNoOverflow(page: Page, selectors: string, where: string) {
  const over = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const box of document.querySelectorAll<HTMLElement>(sel))
      for (const el of [box, ...box.querySelectorAll<HTMLElement>("*")]) {
        if (!el.getClientRects().length) continue;
        if (el.scrollWidth > el.clientWidth + 1)
          out.push(`${el.tagName}.${el.className} ${el.scrollWidth} > ${el.clientWidth}`);
      }
    return out;
  }, selectors);
  expect(over, where).toEqual([]);
}

for (const size of [
  { width: 1280, height: 720, langs: ["en"] },
  { width: 1920, height: 1080, langs: ["en", "fr", "de", "ru"] },
])
  test.describe(`at ${size.width}×${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("menu, hero select and the HUD use the pixel font on its grid and fit their boxes", async ({ page }, info) => {
      test.setTimeout(90_000);
      const shot = async (name: string) =>
        info.attach(`${name}-${size.width}`, { body: await page.screenshot(), contentType: "image/png" });

      await page.goto("/?lang=en");
      await page.locator(".ui-menu").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await expectPixelFontOnGrid(page, "menu");
      await shot("menu");

      for (const lang of size.langs) {
        await page.goto(`/?lang=${lang}`);
        await page.locator(".ui-input").fill("Lia");
        await page.locator("button[type=submit]").click();
        await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);
        await page.evaluate(() => document.fonts.ready);
        await expectPixelFontOnGrid(page, `hero select (${lang})`);
        await expectNoOverflow(page, ".sw-card", `hero select (${lang})`);
        await shot(`select-${lang}`);
      }

      // Waiting room, then the match (bots fill it once the only player is ready).
      await page.goto("/?lang=en");
      await page.locator(".ui-input").fill("Lia");
      await page.locator("button[type=submit]").click();
      await page.locator('.sw-select [data-class="knight"]').click();
      await expect(page.locator(".sw-lobby")).toBeVisible();
      await expect(page.locator(".sw-status")).toBeVisible();
      await expectPixelFontOnGrid(page, "waiting room");
      await expectNoOverflow(page, ".sw-status, .sw-match, .sw-lobby", "waiting room");
      await shot("waiting-room");

      await page.getByRole("button", { name: "Ready" }).click();
      const clock = page.locator(".sw-match");
      await expect(clock).toHaveText(/^PvP in \d+:\d\d · 40$/, { timeout: 15_000 });
      await expect(clock).not.toHaveClass(/sw-match-intro/, { timeout: 6000 });
      await expectPixelFontOnGrid(page, "match");
      await expectNoOverflow(page, ".sw-status, .sw-match", "match");
      await shot("match");
    });
  });
