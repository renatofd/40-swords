import { expect, type Page, test } from "@playwright/test";
import { joinMatch } from "./helpers";

test("touch devices get the virtual joystick", async ({ page }) => {
  await joinMatch(page, "Dani", "lang=pt");
  // The controls hint speaks of the joystick and buttons, not of keys.
  await expect(page.locator(".sw-hint")).toContainText("arraste à esquerda");
  await expect(page.locator(".sw-hint")).not.toContainText("WASD");
  await expect(page.locator(".touch-controls")).toBeVisible();
  await expect(page.locator(".touch-stick-zone")).toBeVisible();
});

test("touch HUD buttons are reachable above the joystick area", async ({ page }) => {
  await joinMatch(page, "Hana", "lang=en");
  await page.getByRole("button", { name: "Chat" }).tap();
  await expect(page.locator(".ui-chat-input")).toBeFocused();
  await page.locator(".ui-chat-input").fill("hi from mobile");
  await page.locator(".ui-chat-input").press("Enter");
  await expect(page.locator(".ui-chat-line").last()).toContainText("hi from mobile");

  await page.getByRole("button", { name: "Players" }).tap();
  await expect(page.locator(".ui-playerlist")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).tap();
  await expect(page.getByRole("button", { name: "Leave match" })).toBeVisible();
});

test("tapping the status panel shows the attributes and relics", async ({ page }) => {
  await joinMatch(page, "Iris", "lang=en");
  await page.locator(".sw-status-main").tap();
  await expect(page.locator(".sw-details")).toBeVisible();
  await expect(page.locator(".sw-details")).toContainText("Attributes");
  await page.locator(".sw-status-main").tap();
  await expect(page.locator(".sw-details")).toBeHidden();
});

/** Rects of the HUD boxes that are on screen. */
const HUD_BOXES = [".sw-status", ".ui-scoreboard", ".sw-match", ".ui-hud-top", ".touch-buttons"];

/** Every visible HUD box lies inside the viewport, no two overlap, and the page does not scroll sideways. */
async function expectHudLayout(page: Page, where: string, needed: string[]) {
  const r = await page.evaluate((selectors) => {
    const boxes = selectors.flatMap((sel) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el?.getClientRects().length || getComputedStyle(el).visibility === "hidden") return [];
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return [];
      return [{ sel, left: b.left, top: b.top, right: b.right, bottom: b.bottom }];
    });
    const u = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sw-u"));
    return {
      boxes,
      w: innerWidth,
      h: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      devU: u * devicePixelRatio,
    };
  }, HUD_BOXES);
  const shown = r.boxes.map((b) => b.sel);
  for (const sel of needed) expect(shown, `${where}: ${sel} shown`).toContain(sel);
  for (const b of r.boxes) {
    expect(b.left, `${where}: ${b.sel} left`).toBeGreaterThanOrEqual(0);
    expect(b.top, `${where}: ${b.sel} top`).toBeGreaterThanOrEqual(0);
    expect(b.right, `${where}: ${b.sel} right`).toBeLessThanOrEqual(r.w);
    expect(b.bottom, `${where}: ${b.sel} bottom`).toBeLessThanOrEqual(r.h);
  }
  for (const [i, a] of r.boxes.entries())
    for (const b of r.boxes.slice(i + 1)) {
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `${where}: ${a.sel} overlaps ${b.sel}`).toBe(false);
    }
  // The art pixel is a whole number of device pixels.
  expect(Math.abs(r.devU - Math.round(r.devU)), `${where}: --sw-u × DPR = ${r.devU}`).toBeLessThan(1e-6);
  expect(r.scrollW, `${where}: horizontal scroll`).toBeLessThanOrEqual(r.w);
  return r;
}

test("credits open from hero select and Back stays reachable", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.locator(".ui-input").fill("Tom");
  await page.locator("button[type=submit]").tap();
  await page.getByRole("button", { name: "Credits" }).tap();
  await expect(page.locator(".sw-credits")).toBeVisible();
  // Scrolled to the end of the credits, Back is still there to tap.
  await page.locator(".sw-credits").evaluate((el) => {
    el.scrollIntoView({ block: "end" });
    (el.closest(".ui-screen-host") ?? el).scrollTop = 1e6;
  });
  await page.getByRole("button", { name: "Back" }).tap();
  await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);
});

test("credits in Arabic keep the names and URLs left-to-right and fit the screen", async ({ page }, info) => {
  await page.goto("/?lang=ar");
  await page.locator(".ui-input").fill("مريم");
  await page.locator("button[type=submit]").tap();
  await page.locator(".sw-credits-button").tap();
  const credits = page.locator(".sw-credits");
  await expect(credits).toBeVisible();
  expect(await credits.locator('bdi[dir="ltr"]').count()).toBeGreaterThanOrEqual(6);
  const fit = await credits.evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
    pageW: document.documentElement.scrollWidth,
    innerW: innerWidth,
  }));
  expect(fit.scrollW).toBeLessThanOrEqual(fit.clientW);
  expect(fit.pageW).toBeLessThanOrEqual(fit.innerW);
  await info.attach("credits-ar", { body: await page.screenshot(), contentType: "image/png" });
});

test("hero cards fit their text in French, German and Russian", async ({ page }) => {
  for (const lang of ["fr", "de", "ru"]) {
    await page.goto(`/?lang=${lang}`);
    await page.locator(".ui-input").fill("Lia");
    await page.locator("button[type=submit]").tap();
    await expect(page.locator(".sw-card[data-class]")).toHaveCount(3);
    const over = await page.evaluate(() => {
      const out: string[] = [];
      for (const card of document.querySelectorAll<HTMLElement>(".sw-card"))
        for (const el of [card, ...card.querySelectorAll<HTMLElement>("*")])
          if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 1)
            out.push(`${el.className} ${el.scrollWidth} > ${el.clientWidth}`);
      return out;
    });
    expect(over, lang).toEqual([]);
  }
});

for (const lang of ["en", "ar", "ja"])
  test(`HUD boxes fit and do not overlap (${lang})`, async ({ page }, info) => {
    await joinMatch(page, "Iris", `lang=${lang}`);
    await page.evaluate(() => document.fonts.ready);
    await expectHudLayout(page, "waiting room", [".sw-status", ".sw-match", ".ui-hud-top", ".touch-buttons"]);
    await info.attach(`hud-${lang}`, { body: await page.screenshot(), contentType: "image/png" });
    await page.locator(".sw-status-main").tap();
    await expect(page.locator(".sw-details")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach(`hud-${lang}-details`, { body: await page.screenshot(), contentType: "image/png" });
  });

/**
 * The worst case, on the UI gallery: all 13 kinds (3 slot rows), 3 gain cards, the waiting room panel and
 * 5 chat lines, with the details closed and open.
 */
for (const lang of ["en", "ar", "ja"])
  test(`the fullest status panel still fits a phone (${lang})`, async ({ page }, info) => {
    for (const details of [false, true]) {
      await page.goto(`/ui-gallery.html?section=status&lang=${lang}&freeze${details ? "&details" : ""}`);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __uiGallery?: { ready: boolean } }).__uiGallery?.ready))
        .toBe(true);
      await expect(page.locator(".sw-status .sw-slots > .sw-slot")).toHaveCount(13);
      const where = details ? "details open" : "details closed";
      const r = await expectHudLayout(page, where, HUD_BOXES);
      const status = r.boxes.find((b) => b.sel === ".sw-status");
      expect(status?.bottom ?? Number.POSITIVE_INFINITY, where).toBeLessThanOrEqual(r.h - 8);
      await info.attach(`status-${lang}-${details ? "details" : "closed"}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  });

test("right to left, the chat stays clear of the touch buttons", async ({ page }) => {
  await joinMatch(page, "مريم", "lang=ar");
  await page.getByRole("button", { name: "الدردشة" }).tap();
  await page.locator(".ui-chat-input").fill("مرحبا بالجميع، هذه رسالة طويلة قليلًا");
  await page.locator(".ui-chat-input").press("Enter");
  await expect(page.locator(".ui-chat-line").last()).toContainText("مرحبا");
  const chat = await page.locator(".ui-chat").boundingBox();
  const buttons = await page.locator(".touch-buttons").boundingBox();
  expect(chat && buttons).toBeTruthy();
  if (!chat || !buttons) return;
  expect(chat.x + chat.width).toBeLessThanOrEqual(buttons.x);
});
