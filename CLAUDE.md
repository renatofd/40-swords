# CLAUDE.md

Guidance for AI coding agents working in this repository (the template or a game derived from it).

## What this is

Template for online web games (.io now, MMO-ready later): Phaser 4 client, Colyseus 0.18 authoritative server, TypeScript, Tiled maps, pixel art. pnpm monorepo.

## Layout and ownership

- `packages/core-*` — **template core** (`@core/shared`, `@core/maps`, `@core/server`, `@core/client`). In a game repo, do not edit; change the template instead (see docs/TEMPLATE.md).
- `game/*` — **the game** (`@game/shared`, `@game/server`, `@game/client`). Rules, rooms, scenes, assets, strings.
- `apps/*` — thin entrypoints wiring core + game. `content/` — maps and art. `tools/` — scripts.
- Dependencies point inward: apps → game → core. Core never imports game code (tools may import `TILE_SIZE` from `@game/shared`).

## Rules that keep the netcode correct

- The server is authoritative. Clients send inputs only (`defineInput` schemas, sanitized server-side).
- Simulation code shared by server and client prediction (e.g. `stepPlayer`) must be **pure and deterministic**: no `Date`, `Math.random`, timers or globals. Same inputs → same outputs.
- `packages/core-*` and `game/shared` must not import Phaser, Node or DOM APIs (except `@core/client`).
- Bump `PROTOCOL_VERSION` in `game/shared/src/constants.ts` whenever schemas, inputs or messages change; bump `CORE_PROTOCOL_VERSION` for core wire changes. Mismatched clients are told to reload.
- Never trust join options or messages: sanitize (`sanitizeName`, clamps) on the server.

## Server building blocks (@core/server)

- Rooms extend `GameRoom`; run the simulation with `this.startSimulation(step, TICK_RATE)` (records tick time in /metrics).
- Apply inputs with `channel.take(inputBudget.refill(id))` (`InputBudget`), never by draining the whole buffer: that lets clients speed-hack. Set room options that clients must not control in `defineRoom(Room, { ... })`.
- Identity: `this.identity(client)` → `{ id, name, provider, verified }`. Accounts are verified by registered `AccountProvider`s (GamePush auto-registers from env). Set `allowGuests = false` to require accounts.
- Area of interest: tag collections with `.view()` in the schema and use `InterestManager` (addViewer/removeViewer/update). Entities outside the radius are not sent.
- Config comes from validated env (`env`, see docs/DEPLOY.md). Log with `log.info/warn/error`, never `console.log` in server code.
- Import Colyseus server APIs from `@colyseus/core` (not the `colyseus` meta package).

## Platform (@core/client)

- Assets: sprites (`content/sprites/<name>.png+json`, Aseprite json-array with `{frame}` filenames) and audio (`content/audio/{music,sfx}/*`) are auto-discovered in `game/client/src/assets.ts`. Play animations with `animKey(sprite, tag)`.
- Sound: `ctx.audio.playMusic(key)` / `ctx.audio.playSfx(key)`; volumes are player settings, never hardcode them.
- HUD: `ctx.ui.toast(text)`, `ctx.ui.setScores(rows, selfId)` (scoreboard + Tab list), chat is built in (rooms: `chat = false` to disable, `filterChat` to moderate).
- Games use `ctx.platform` for ads (`ads.showRewarded()` resolves true only if rewarded), `openLeaderboard?.()`, etc. Never call `window.gp` directly.
- Secrets never go to the client. `VITE_*` values are public by definition.

## UI and i18n

- Menus/HUD are DOM (`@core/client` ui), not Phaser text: needed for RTL Arabic, Devanagari, CJK and IME.
- Every user-visible string goes through `t()`. Core strings: `packages/core-client/src/i18n/coreMessages.ts` (typed; missing keys fail typecheck). Game strings: `game/client/src/messages.ts`.
- Supported locales (all must be filled): en, pt, es, fr, de, it, tr, ru, ar, hi, id, ja, zh, ko. Use CSS logical properties (inline/block) so RTL works.
- Read input through `ctx.input` (`InputManager`: keyboard + gamepad + touch). Don't use Phaser keyboard (disabled). `isDown(id)` for held actions, `wasPressed(id)` for one-shot ones (a tap shorter than a frame still counts once).
- Screens before joining (character/map select) go in `GameModule.beforeJoin`: resolve `{ roomName?, options? }` (or null for the menu); the server validates those join options.

## Maps

Tiled `.tmj`, orthogonal, 16x16, embedded tilesets, CSV layers, object layer `objects` with `spawn` points, `collides=true` tile property for collision. Validate with `pnpm content:validate` (maps, sprites, audio). Maps and tilesets are auto-discovered by `game/client/src/assets.ts` (tilesets matched by image file name).

## Commands

- `pnpm dev` — server :2567 + client :3000 (the client reaches the server through the Vite proxy at `/__server`; works in Codespaces via `.devcontainer/`) (`?debug` shows the Colyseus network panel; `__net(150, 30)` in console simulates lag)
- `pnpm check` — lint (Biome) + typecheck + tests (Vitest) + content validation. Run before pushing; CI runs the same plus `pnpm build` and `pnpm e2e`.
- `pnpm lint:fix` — auto-format.
- `pnpm loadtest` — 20 bots (behaviour in `game/client/src/bot.ts`).
- `pnpm e2e` — Playwright end-to-end tests (starts server + client). `PW_CHROMIUM_PATH` to reuse a local Chromium.
- `pnpm build:client && pnpm pack:client` — client zip for GamePush/itch.io. `docker build .` — server image.

## Conventions

- TypeScript strict, ESM, `moduleResolution: bundler`; workspace packages export `.ts` sources directly (no build step).
- Tests next to code (`*.test.ts`) or in `test/`. Room integration tests use `@colyseus/testing` with `createGameServer`.
- Code and comments in English; user-facing docs (`docs/`, READMEs) in Portuguese.
