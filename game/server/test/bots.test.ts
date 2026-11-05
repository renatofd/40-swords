import type { StepContext } from "@colyseus/core";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { createGameServer, loadMap } from "@core/server";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  arenaRect,
  type BotsMessage,
  inRect,
  type KillMessage,
  MAX_PLAYERS_PER_ROOM,
  MatchPhase,
  Msg,
  type Player,
  PROTOCOL_VERSION,
  RESULTS_SECONDS,
  ROOM_WORLD,
  screenOf,
  TICK_DT,
  TICK_RATE,
  TILE_SIZE,
  type WorldState,
} from "@game/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rooms } from "../src";
import { loadWorldInfo } from "../src/world/mapObjects";

// The tests set their own match timings, whatever the shell exports (runs before the imports).
vi.hoisted(() => {
  delete process.env.MATCH_PVP_SECONDS;
  delete process.env.MATCH_ARENA_SECONDS;
});

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };
const grid = loadMap("overworld", { tileSize: TILE_SIZE }).collision;
const arena = arenaRect(loadWorldInfo("overworld"));

interface RoomInternals {
  times: { pvpAfter: number; arenaAfter: number };
  matchStart: number;
  bots: Map<string, { mode: string }>;
  step(ctx: StepContext): void;
  heroDown(id: string, player: Player, cause: KillMessage["cause"], killerId?: string): void;
  endMatch(winner: [string, Player] | undefined): void;
}
const internals = (room: unknown) => room as RoomInternals;

describe("bots", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => {
    await colyseus.shutdown();
  });
  beforeEach(async () => {
    await colyseus.cleanup();
  });

  async function createWorld() {
    return colyseus.createRoom<WorldState>(ROOM_WORLD, {});
  }
  type World = Awaited<ReturnType<typeof createWorld>>;

  async function join(room: World, name: string) {
    const client = await colyseus.connectTo(room, { v, name, classId: "knight" });
    // Whatever the room sends (damage numbers, shots...) is fine to drop here.
    client.onMessage("*", () => {});
    return { client, player: room.state.players.get(client.sessionId) as Player };
  }
  type Hero = Awaited<ReturnType<typeof join>>;

  /** Everyone ready, countdown skipped: the match is on. */
  async function start(room: World, ...heroes: Hero[]) {
    for (const hero of heroes) hero.client.send(Msg.ready, { ready: true });
    await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
    internals(room).matchStart -= (room.state.phaseEnds - room.state.clock) * TICK_RATE;
    await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.calm));
  }

  /** Runs the room's simulation for `seconds` right away (no waiting), or until `until` holds. */
  function fastForward(room: World, seconds: number, until?: () => boolean) {
    const ctx = { dt: TICK_DT, dtMs: 1000 / TICK_RATE, tick: 0, subSteps: 1, subDt: TICK_DT } as StepContext;
    const began = performance.now();
    let ticks = 0;
    while (ticks < seconds * TICK_RATE && !until?.()) {
      internals(room).step.call(room, ctx);
      ticks++;
    }
    return { ticks, msPerTick: (performance.now() - began) / Math.max(1, ticks) };
  }

  const bots = (room: World) => [...room.state.players.entries()].filter(([id]) => id.startsWith("bot:"));
  const solidUnder = (p: Player) => grid.isSolid(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE));

  it("the waiting room switches them on (the default) and off; not during the match", async () => {
    const room = await createWorld();
    const a = await join(room, "Ana");
    expect(room.state.bots).toBe(true);
    const off: BotsMessage = { on: false };
    a.client.send(Msg.bots, off);
    await vi.waitFor(() => expect(room.state.bots).toBe(false));
    a.client.send(Msg.bots, { on: "yes" });
    a.client.send(Msg.bots, { on: true });
    await vi.waitFor(() => expect(room.state.bots).toBe(true));

    await start(room, a);
    a.client.send(Msg.bots, off);
    for (let i = 0; i < 3; i++) await room.waitForNextTimestep();
    expect(room.state.bots).toBe(true);
  });

  it("fill the match up to 40 heroes, and leave when it is over", async () => {
    const room = await createWorld();
    const a = await join(room, "Ana");
    const b = await join(room, "Bia");
    await start(room, a, b);
    expect(room.state.players.size).toBe(MAX_PLAYERS_PER_ROOM);
    expect(room.state.alive).toBe(MAX_PLAYERS_PER_ROOM);
    expect(room.locked).toBe(true);
    const entries = [...room.state.roster.entries()].filter(([, r]) => r.bot);
    expect(entries).toHaveLength(MAX_PLAYERS_PER_ROOM - 2);
    expect(new Set(entries.map(([, r]) => r.name)).size).toBe(entries.length);
    for (const [id, r] of entries) {
      expect(id).toMatch(/^bot:\d+$/);
      expect(r.name).toMatch(/^🤖 \S+/);
      const p = room.state.players.get(id) as Player;
      expect(p.hp).toBe(p.maxHp);
      expect(screenOf(p.x, p.y)).toEqual(screenOf(a.player.x, a.player.y));
    }
    expect(room.state.roster.get(a.client.sessionId)?.bot).toBe(false);

    // They play: after a few seconds they have left the start square.
    fastForward(room, 8);
    const home = screenOf(a.player.x, a.player.y);
    const away = bots(room).filter(
      ([, p]) => screenOf(p.x, p.y).col !== home.col || screenOf(p.x, p.y).row !== home.row,
    );
    expect(away.length).toBeGreaterThan(20);

    internals(room).endMatch(undefined);
    fastForward(room, RESULTS_SECONDS + 1);
    expect(room.state.phase).toBe(MatchPhase.lobby);
    expect([...room.state.players.keys()].sort()).toEqual([a.client.sessionId, b.client.sessionId].sort());
    expect([...room.state.roster.values()].some((r) => r.bot)).toBe(false);
    expect(internals(room).bots.size).toBe(0);
  });

  it("play a whole match: they spread out, grow, fight each other and the last one standing wins", {
    timeout: 180_000,
  }, async () => {
    const room = await createWorld();
    internals(room).times = { pvpAfter: 90, arenaAfter: 300 };
    const ana = await join(room, "Ana");
    const causes: KillMessage["cause"][] = [];
    const heroDown = internals(room).heroDown;
    internals(room).heroDown = function (this: unknown, ...args: Parameters<RoomInternals["heroDown"]>) {
      causes.push(args[2]);
      heroDown.apply(this, args);
    };
    await start(room, ana);

    // PvE: they leave the start, spread over the world and level up.
    const calm = fastForward(room, 90);
    const live = bots(room).filter(([, p]) => !p.out);
    const screens = new Set(live.map(([, p]) => `${screenOf(p.x, p.y).col},${screenOf(p.x, p.y).row}`));
    const grown = live.filter(([, p]) => p.level > 1).length;
    const cut = room.state.brokenProps.size;
    const summary = {
      calm: { msPerTick: calm.msPerTick.toFixed(2), alive: live.length, screens: screens.size, grown, cut },
    } as Record<string, unknown>;
    expect(live.every(([, p]) => !solidUnder(p))).toBe(true);
    expect(screens.size).toBeGreaterThan(10);
    expect(grown).toBeGreaterThan(live.length / 3);
    // Tall grass and pots along the way (rupees, hearts).
    expect(cut).toBeGreaterThan(10);

    // PvP until the arena: some fall to other heroes.
    const pvp = fastForward(room, 210, () => room.state.phase !== MatchPhase.pvp);
    const levels = bots(room).map(([, p]) => p.level);
    summary.pvp = {
      msPerTick: pvp.msPerTick.toFixed(2),
      alive: room.state.alive,
      maxLevel: Math.max(...levels),
      avgLevel: (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1),
      relics: Math.max(...bots(room).map(([, p]) => p.relics.length)),
      kills: { hero: causes.filter((c) => c === "hero").length, monster: causes.filter((c) => c === "monster").length },
    };
    expect(causes).toContain("hero");

    // The arena: whoever is still standing fights inside the closing storm until one is left.
    if (room.state.phase === MatchPhase.prep) {
      if (!arena) throw new Error("no arena");
      for (const [, p] of room.state.players) if (!p.out) expect(inRect(arena, p.x, p.y)).toBe(true);
      const fight = fastForward(room, 200, () => room.state.phase === MatchPhase.ended);
      summary.arena = { msPerTick: fight.msPerTick.toFixed(2), storm: causes.filter((c) => c === "storm").length };
    }
    summary.end = { phase: room.state.phase, winner: room.state.winnerName, clock: room.state.clock };
    console.info("bot match", JSON.stringify(summary));
    expect(room.state.phase).toBe(MatchPhase.ended);
    expect(room.state.alive).toBeLessThanOrEqual(1);
    expect(room.state.winner === "" ? 0 : 1).toBe(room.state.alive);

    // Results, then the waiting room: only the player is left.
    fastForward(room, RESULTS_SECONDS + 1);
    expect(room.state.phase).toBe(MatchPhase.lobby);
    expect([...room.state.players.keys()]).toEqual([ana.client.sessionId]);
  });
});
