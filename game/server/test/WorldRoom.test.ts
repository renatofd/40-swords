import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "@core/server";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  ENEMIES,
  type EnemyKind,
  INTEREST_RADIUS,
  type LevelUpMessage,
  Msg,
  type Player,
  type PlayerInput,
  PROTOCOL_VERSION,
  ROOM_WORLD,
  screenOf,
  statsFor,
  TICK_DT,
  type WorldState,
  xpToNext,
} from "@game/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rooms } from "../src";

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };

/** Room internals the tests reach into to set up a scene (teleports, timers). */
interface RoomInternals {
  brains: Map<string, { home: { x: number; y: number; width: number; height: number }; def: { speed: number } }>;
  respawnTicks: number;
  map: { pixelWidth: number; pixelHeight: number };
}
const internals = (room: unknown) => room as RoomInternals;

describe("WorldRoom", () => {
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

  /** Joins and picks a class; resolves once the server created the player. */
  async function joinAs(room: Awaited<ReturnType<typeof createWorld>>, classId: string, name = "P") {
    const client = await colyseus.connectTo(room, { v, name });
    client.send(Msg.spawn, { classId });
    await vi.waitFor(() => expect(room.state.players.has(client.sessionId)).toBe(true));
    const player = room.state.players.get(client.sessionId) as Player;
    return { client, player };
  }

  /** Moves an enemy next to a point and keeps it there (no wandering off, no leash). */
  function pinEnemy(room: unknown, state: WorldState, x: number, y: number) {
    const [id, enemy] = [...state.enemies.entries()][0] ?? [];
    if (!id || !enemy) throw new Error("no enemies");
    const brain = internals(room).brains.get(id);
    if (!brain) throw new Error("no brain");
    const { pixelWidth, pixelHeight } = internals(room).map;
    brain.home = { x: 0, y: 0, width: pixelWidth, height: pixelHeight };
    brain.def = { ...brain.def, speed: 0 };
    enemy.x = x;
    enemy.y = y;
    return { id, enemy };
  }

  it("lets players in without a body until they pick a class", async () => {
    const room = await createWorld();
    const client = await colyseus.connectTo(room, { v, name: "  Ana\u0007  " });
    expect(room.state.players.has(client.sessionId)).toBe(false);

    client.send(Msg.spawn, { classId: "wizard" });
    await room.waitForNextMessage();
    expect(room.state.players.has(client.sessionId)).toBe(false);

    client.send(Msg.spawn, { classId: "rogue" });
    await vi.waitFor(() => expect(room.state.players.has(client.sessionId)).toBe(true));
    const player = room.state.players.get(client.sessionId);
    expect(player?.name).toBe("Ana");
    expect(player?.classId).toBe("rogue");
    expect(player?.maxHp).toBe(statsFor("rogue", 1).maxHp);
    expect(room.state.roster.get(client.sessionId)?.level).toBe(1);

    // Picking again does nothing.
    client.send(Msg.spawn, { classId: "knight" });
    await room.waitForNextMessage();
    expect(room.state.players.get(client.sessionId)?.classId).toBe("rogue");
  });

  it("moves a player one fixed step per input at its class speed", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue");
    const startX = player.x;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveX = 1;
    input.send();
    await vi.waitFor(() => expect(player.x).toBeGreaterThan(startX));
    expect(player.x).toBeCloseTo(startX + statsFor("rogue", 1).speed * TICK_DT);
  });

  it("clamps out-of-range input from a modified client", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "knight");
    const startX = player.x;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveX = 100 as unknown as 1;
    input.send();
    await vi.waitFor(() => expect(player.x).toBeGreaterThan(startX));
    expect(player.x).toBeCloseTo(startX + statsFor("knight", 1).speed * TICK_DT);
  });

  it("applies at most a few inputs per tick, so sending faster doesn't move faster", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue");
    const startX = player.x;
    const stepPx = statsFor("rogue", 1).speed * TICK_DT;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveX = 1;
    for (let i = 0; i < 40; i++) input.send();
    await room.waitForNextMessage();
    for (let t = 0; t < 10; t++) await room.waitForNextTimestep();

    const steps = Math.round((player.x - startX) / stepPx);
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(4 + 10 + 1);
  });

  it("ignores a map chosen by the client", async () => {
    const room = await colyseus.createRoom<WorldState>(ROOM_WORLD, { mapId: "something-else" });
    expect(room.state.mapId).toBe("overworld");
  });

  it("fills the world with enemies from the map", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    expect(room.state.enemies.size).toBeGreaterThan(10);
    const kinds = new Set([...room.state.enemies.values()].map((e) => e.kind));
    expect(kinds).toEqual(new Set(["slime", "goblin"]));
  });

  it("a sword kill gives XP, levels up and drops rupees the player can collect", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { client, player } = await joinAs(room, "barbarian");
    const levelUps: LevelUpMessage[] = [];
    client.onMessage(Msg.levelUp, (m: LevelUpMessage) => levelUps.push(m));

    // An enemy right in front of the player (facing east), one hit from death.
    const { id, enemy } = pinEnemy(room, room.state, player.x + 12, player.y);
    enemy.hp = 1;
    player.facing = 0;
    player.xp = xpToNext(1) - 1;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    input.send();
    await vi.waitFor(() => expect(room.state.enemies.has(id)).toBe(false));

    expect(player.level).toBe(2);
    expect(player.maxHp).toBe(statsFor("barbarian", 2).maxHp);
    expect(player.hp).toBe(player.maxHp);
    await vi.waitFor(() => expect(levelUps).toEqual([{ level: 2 }]));
    expect(room.state.roster.get(client.sessionId)?.level).toBe(2);

    // The drop lies where the enemy died; walk onto it.
    const drop = [...room.state.pickups.values()][0];
    expect(drop?.kind).toBe("rupee");
    expect(drop?.value).toBeGreaterThanOrEqual(1);
    const value = drop?.value ?? 0;
    input.data.attack = 0;
    input.data.moveX = 1;
    for (let i = 0; i < 6; i++) {
      input.send();
      await room.waitForNextTimestep();
    }
    await vi.waitFor(() => expect(player.rupees).toBe(value));
    expect(room.state.pickups.size).toBe(0);
  });

  it("enemies hurt players on contact, through defense, with knockback and invulnerability", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { player } = await joinAs(room, "knight");
    const { enemy } = pinEnemy(room, room.state, player.x + 4, player.y);
    const before = player.hp;
    await vi.waitFor(() => expect(player.hp).toBeLessThan(before));
    const expected = Math.max(1, Math.round(ENEMIES[enemy.kind as EnemyKind].damage - statsFor("knight", 1).defense));
    expect(before - player.hp).toBe(expected);
    expect(player.invuln).toBeGreaterThan(0);
    expect(player.knockX).toBeLessThan(0); // pushed away (enemy is to the east)
  });

  it("a player who dies comes back at the centre with full HP", async () => {
    const room = await createWorld();
    internals(room).respawnTicks = 3;
    await room.waitForNextTimestep();
    const { player } = await joinAs(room, "rogue");
    player.hp = 1;
    pinEnemy(room, room.state, player.x + 4, player.y);
    await vi.waitFor(() => expect(player.dead).toBe(true));
    // Move the enemy away so it doesn't kill again on respawn.
    pinEnemy(room, room.state, 8, 8);
    await vi.waitFor(() => expect(player.dead).toBe(false));
    expect(player.hp).toBe(player.maxHp);
    expect(screenOf(player.x, player.y)).toEqual({ col: 1, row: 1 });
  });

  it("players can't hurt each other while PvP is off", async () => {
    const room = await createWorld();
    const a = await joinAs(room, "barbarian", "A");
    const b = await joinAs(room, "rogue", "B");
    b.player.x = a.player.x + 12;
    b.player.y = a.player.y;
    a.player.facing = 0;
    const input = a.client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    input.send();
    await vi.waitFor(() => expect(a.player.swing).toBe(1));
    await room.waitForNextTimestep();
    expect(b.player.hp).toBe(b.player.maxHp);
  });

  it("only sends entities inside the area of interest", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { client, player } = await joinAs(room, "knight");
    await vi.waitFor(() => expect(client.state.players.has(client.sessionId)).toBe(true));
    await room.waitForNextPatch();
    expect(client.state.enemies.size).toBeLessThan(room.state.enemies.size);
    const limit = INTEREST_RADIUS * 1.2 + 1;
    for (const e of client.state.enemies.values())
      expect(Math.hypot(e.x - player.x, e.y - player.y)).toBeLessThanOrEqual(limit);
  });

  it("lists every player in the roster, even far away", async () => {
    const room = await createWorld();
    const a = await joinAs(room, "knight", "A");
    const b = await joinAs(room, "rogue", "B");
    b.player.x = 40;
    b.player.y = 40;
    await vi.waitFor(() => expect(a.client.state.roster.size).toBe(2));
  });

  it("removes the player on leave", async () => {
    const room = await createWorld();
    await joinAs(room, "knight");
    const leaving = await joinAs(room, "rogue");
    expect(room.state.players.size).toBe(2);

    await leaving.client.leave();
    await vi.waitFor(() => expect(room.state.players.has(leaving.client.sessionId)).toBe(false));
    expect(room.state.roster.has(leaving.client.sessionId)).toBe(false);
  });
});
