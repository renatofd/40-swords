import { expect, test } from "@playwright/test";
import { joinMatch } from "./helpers";

test("touch devices get the virtual joystick", async ({ page }) => {
  await joinMatch(page, "Dani", "lang=pt");
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
