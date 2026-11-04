import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "@core/server";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  type ArenaState,
  type MoveInput,
  PLAYER_COLORS,
  PLAYER_SPEED,
  Player,
  PROTOCOL_VERSION,
  ROOM_ARENA,
  TICK_DT,
} from "@game/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rooms } from "../src";

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };

describe("ArenaRoom", () => {
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

  it("spawns a player at a map spawn point with a sanitized name", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const client = await colyseus.connectTo(room, { v, name: "  Ana\u0007  " });

    const player = room.state.players.get(client.sessionId);
    expect(player).toBeDefined();
    expect(player?.name).toBe("Ana");
    expect(room.state.mapId).toBe("arena");
  });

  it("uses the colour picked before joining and ignores invalid ones", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const picked = await colyseus.connectTo(room, { v, color: 3 });
    const tooBig = await colyseus.connectTo(room, { v, color: 99 });
    const notANumber = await colyseus.connectTo(room, { v, color: "red" });
    expect(room.state.players.get(picked.sessionId)?.color).toBe(3);
    for (const c of [tooBig, notANumber]) {
      const color = room.state.players.get(c.sessionId)?.color ?? -1;
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThan(PLAYER_COLORS.length);
    }
  });

  it("advances a player one fixed step per input", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const client = await colyseus.connectTo(room, { v });
    const player = room.state.players.get(client.sessionId);
    if (!player) throw new Error("player not created");
    const startX = player.x;

    const input = client.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 1;
    input.data.moveY = 0;
    input.send();

    await room.waitForNextMessage();
    await room.waitForNextTimestep();

    expect(player.x).toBeCloseTo(startX + PLAYER_SPEED * TICK_DT);
  });

  it("clamps out-of-range input from a modified client", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const client = await colyseus.connectTo(room, { v });
    const player = room.state.players.get(client.sessionId);
    if (!player) throw new Error("player not created");
    const startX = player.x;

    const input = client.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 100 as unknown as 1;
    input.send();

    await room.waitForNextMessage();
    await room.waitForNextTimestep();

    expect(player.x).toBeCloseTo(startX + PLAYER_SPEED * TICK_DT);
  });

  it("applies at most a few inputs per tick, so sending faster doesn't move faster", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const client = await colyseus.connectTo(room, { v });
    const player = room.state.players.get(client.sessionId);
    if (!player) throw new Error("player not created");
    const startX = player.x;

    const input = client.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 1;
    input.data.moveY = 0;
    for (let i = 0; i < 40; i++) input.send();
    await room.waitForNextMessage();
    for (let t = 0; t < 10; t++) await room.waitForNextTimestep();

    // Without a limit all 40 would apply at once. With it: a burst of 4, then ~1 per tick
    // (+1 tick of slack for the tick that may run before the first wait resolves).
    const steps = Math.round((player.x - startX) / (PLAYER_SPEED * TICK_DT));
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(4 + 10 + 1);
  });

  it("stops a player whose inputs stop arriving", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const client = await colyseus.connectTo(room, { v });
    const player = room.state.players.get(client.sessionId);
    if (!player) throw new Error("player not created");

    const startX = player.x;

    const input = client.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 1;
    input.send();
    // The input may land on any tick: wait until it moved the player, not for a specific tick.
    await vi.waitFor(() => expect(player.x).toBeGreaterThan(startX));
    await room.waitForNextTimestep();
    const x = player.x;
    expect(player.vx).toBe(0);

    await room.waitForNextTimestep();
    await room.waitForNextTimestep();
    expect(player.vx).toBe(0);
    expect(player.x).toBe(x);
  });

  it("ignores a map chosen by the client", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, { mapId: "something-else" });
    expect(room.state.mapId).toBe("arena");
  });

  it("only sends players inside the area of interest", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    // The first two spawns of the arena map are ~590 px apart: beyond INTEREST_RADIUS.
    const a = await colyseus.connectTo(room, { v, name: "A" });
    const b = await colyseus.connectTo(room, { v, name: "B" });
    await room.waitForNextPatch();
    await vi.waitFor(() => expect(a.state.players.has(a.sessionId)).toBe(true));
    expect(a.state.players.has(b.sessionId)).toBe(false);
    expect(b.state.players.has(a.sessionId)).toBe(false);

    // Move B next to A (server-side teleport, as a game rule would).
    const pa = room.state.players.get(a.sessionId);
    const pb = room.state.players.get(b.sessionId);
    if (!pa || !pb) throw new Error("players missing");
    pb.x = pa.x + 32;
    pb.y = pa.y;
    await vi.waitFor(() => expect(a.state.players.has(b.sessionId)).toBe(true), { timeout: 2000 });
    expect(b.state.players.get(a.sessionId)?.name).toBe("A");
  });

  it("sends a player again after it is replaced under the same id", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const a = await colyseus.connectTo(room, { v, name: "A" });
    await vi.waitFor(() => expect(a.state.players.get(a.sessionId)?.name).toBe("A"));

    const old = room.state.players.get(a.sessionId);
    if (!old) throw new Error("player missing");
    room.state.players.set(a.sessionId, new Player({ name: "A2", color: 0, x: old.x, y: old.y, vx: 0, vy: 0 }));
    await vi.waitFor(() => expect(a.state.players.get(a.sessionId)?.name).toBe("A2"), { timeout: 2000 });
  });

  it("lists every player in the roster and scores walking", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    const a = await colyseus.connectTo(room, { v, name: "A" });
    await colyseus.connectTo(room, { v, name: "B" });
    expect(room.state.roster.size).toBe(2);

    const input = a.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 1;
    input.data.moveY = 1;
    for (let i = 0; i < 40; i++) input.send();
    await vi.waitFor(() => expect(room.state.roster.get(a.sessionId)?.score).toBeGreaterThanOrEqual(1), {
      timeout: 4000,
    });
    // The roster is not AoI-filtered: A sees B's entry even though B is far away.
    await vi.waitFor(() => expect(a.state.roster.size).toBe(2));
  });

  it("removes the player on leave", async () => {
    const room = await colyseus.createRoom<ArenaState>(ROOM_ARENA, {});
    await colyseus.connectTo(room, { v });
    const leaving = await colyseus.connectTo(room, { v });
    expect(room.state.players.size).toBe(2);

    await leaving.leave();
    await vi.waitFor(() => expect(room.state.players.has(leaving.sessionId)).toBe(false));
    expect(room.state.players.size).toBe(1);
    expect(room.state.roster.has(leaving.sessionId)).toBe(false);
  });
});
