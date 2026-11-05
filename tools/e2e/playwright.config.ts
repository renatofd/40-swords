import { defineConfig, devices } from "@playwright/test";

/**
 * Starts the game server and client (unless already running) and drives real browsers.
 * Set PW_CHROMIUM_PATH to use a preinstalled Chromium instead of `playwright install`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  fullyParallel: false,
  // One test at a time: every test joins the same public room type (joinOrCreate), and a
  // 40 Swords match only starts once everyone in the room is ready, so tests running side by
  // side would land in each other's rooms and hold up each other's countdown.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath,
      // Software WebGL so the canvas renders on CI machines without a GPU.
      args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7 landscape"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: "pnpm --filter @app/server dev",
      url: "http://localhost:2567/health",
      reuseExistingServer: !process.env.CI,
      cwd: "../..",
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @app/client dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      cwd: "../..",
      timeout: 60_000,
      // Force the plain web platform so tests never depend on GamePush.
      env: { VITE_PLATFORM: "web" },
    },
  ],
});
