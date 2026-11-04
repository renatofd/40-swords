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

test("tapping the status panel shows the attributes and relics", async ({ page }) => {
  await joinMatch(page, "Iris", "lang=en");
  await page.locator(".sw-status-main").tap();
  await expect(page.locator(".sw-details")).toBeVisible();
  await expect(page.locator(".sw-details")).toContainText("Attributes");
  await page.locator(".sw-status-main").tap();
  await expect(page.locator(".sw-details")).toBeHidden();
});
