import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "@core/server";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  BOSS_CHEST_RARITY,
  type BossDownMessage,
  type EnemyShotMessage,
  type GainMessage,
  INTEREST_RADIUS,
  type LevelUpMessage,
  Msg,
  offerPosition,
  type Player,
  type PlayerInput,
  POTION_PRICE,
  PROTOCOL_VERSION,
  ROOM_WORLD,
  type ShopMessage,
  type ShotMessage,
  screenOf,
  statsFor,
  TICK_DT,
  type WorldState,
  xpToNext,
} from "@game/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rooms } from "../src";
import { loadWorldObjects } from "../src/world/mapObjects";

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };
const objects = loadWorldObjects("overworld");

/** Room internals the tests reach into to set up a scene (teleports, timers, gifts). */
interface Brain {
  home: { x: number; y: number; width: number; height: number };
  def: { attacks: unknown[]; behaviour: string };
  stats: { speed: number; damage: number };
}
interface RoomInternals {
  brains: Map<string, Brain>;
  respawnTicks: number;
  map: { pixelWidth: number; pixelHeight: number };
  giveRelic(id: string, player: Player, kind: string, rarity: number, source: string): void;
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

  /** Joins with a hero picked before joining; the server creates the body right away. */
  async function joinAs(room: Awaited<ReturnType<typeof createWorld>>, classId: string, name = "P") {
    const client = await colyseus.connectTo(room, { v, name, classId });
    const player = room.state.players.get(client.sessionId) as Player;
    return { client, player };
  }

  /**
   * Moves an enemy next to a point and keeps it there (no walking, no leash).
   * Picks the first enemy, or the first of `kind`; attacks are removed unless `keepAttacks`.
   */
  function pinEnemy(
    room: unknown,
    state: WorldState,
    x: number,
    y: number,
    options: { kind?: string; keepAttacks?: boolean } = {},
  ) {
    const [id, enemy] = [...state.enemies.entries()].find(([, e]) => !options.kind || e.kind === options.kind) ?? [];
    if (!id || !enemy) throw new Error(`no ${options.kind ?? "enemy"}`);
    const brain = internals(room).brains.get(id);
    if (!brain) throw new Error("no brain");
    const { pixelWidth, pixelHeight } = internals(room).map;
    brain.home = { x: 0, y: 0, width: pixelWidth, height: pixelHeight };
    brain.def = { ...brain.def, behaviour: "guard", attacks: options.keepAttacks ? brain.def.attacks : [] };
    brain.stats = { ...brain.stats, speed: 0 };
    enemy.x = x;
    enemy.y = y;
    return { id, enemy, brain };
  }

  it("creates the hero picked before joining, with a sanitized name", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue", "  Ana\u0007  ");
    expect(player.name).toBe("Ana");
    expect(player.classId).toBe("rogue");
    expect(player.maxHp).toBe(statsFor("rogue", 1).maxHp);
    expect(player.hp).toBe(player.maxHp);
    expect(player.speed).toBe(statsFor("rogue", 1).speed);
    expect(room.state.roster.get(client.sessionId)?.level).toBe(1);
  });

  it("turns an unknown or missing class into a knight", async () => {
    const room = await createWorld();
    const { player } = await joinAs(room, "wizard");
    const bot = await colyseus.connectTo(room, { v });
    expect(player.classId).toBe("knight");
    expect(room.state.players.get(bot.sessionId)?.classId).toBe("knight");
  });

  it("moves a player one fixed step per input at its class speed", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue");
    const startY = player.y;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveY = 1;
    input.send();
    await vi.waitFor(() => expect(player.y).toBeGreaterThan(startY));
    expect(player.y).toBeCloseTo(startY + statsFor("rogue", 1).speed * TICK_DT);
  });

  it("clamps out-of-range input from a modified client", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "knight");
    const startY = player.y;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveY = 100 as unknown as 1;
    input.send();
    await vi.waitFor(() => expect(player.y).toBeGreaterThan(startY));
    expect(player.y).toBeCloseTo(startY + statsFor("knight", 1).speed * TICK_DT);
  });

  it("applies at most a few inputs per tick, so sending faster doesn't move faster", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue");
    const startY = player.y;
    const stepPx = statsFor("rogue", 1).speed * TICK_DT;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveY = 1;
    for (let i = 0; i < 40; i++) input.send();
    await room.waitForNextMessage();
    for (let t = 0; t < 10; t++) await room.waitForNextTimestep();

    const steps = Math.round((player.y - startY) / stepPx);
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(4 + 10 + 1);
  });

  it("ignores a map chosen by the client", async () => {
    const room = await colyseus.createRoom<WorldState>(ROOM_WORLD, { mapId: "something-else" });
    expect(room.state.mapId).toBe("overworld");
  });

  it("fills the world with enemies and chests from the map", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    expect(room.state.enemies.size).toBe(objects.enemies.length);
    const kinds = new Set([...room.state.enemies.values()].map((e) => e.kind));
    for (const kind of ["slime", "goblin", "skeleton", "brute", "warden", "colossus"])
      expect(kinds.has(kind)).toBe(true);
    expect(room.state.chests.size).toBe(objects.chests.length);
  });

  it("a sword kill gives XP, levels up and drops rupees the player can collect", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { client, player } = await joinAs(room, "barbarian");
    const levelUps: LevelUpMessage[] = [];
    client.onMessage(Msg.levelUp, (m: LevelUpMessage) => levelUps.push(m));

    // A slime right in front of the player (facing south), one hit from death.
    const { id, enemy } = pinEnemy(room, room.state, player.x, player.y + 12, { kind: "slime" });
    enemy.hp = 1;
    player.facing = 2;
    player.xp = xpToNext(1) - 1;

    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    input.send();
    await vi.waitFor(() => expect(room.state.enemies.has(id)).toBe(false));

    expect(player.level).toBeGreaterThanOrEqual(2);
    expect(player.maxHp).toBe(statsFor("barbarian", player.level).maxHp);
    expect(player.hp).toBe(player.maxHp);
    await vi.waitFor(() => expect(levelUps.at(-1)).toEqual({ level: player.level }));
    expect(room.state.roster.get(client.sessionId)?.level).toBe(player.level);

    // The drop lies where the enemy died; walk onto it.
    const drop = [...room.state.pickups.values()][0];
    expect(drop?.kind).toBe("rupee");
    const value = drop?.value ?? 0;
    expect(value).toBeGreaterThanOrEqual(1);
    input.data.attack = 0;
    input.data.moveY = 1;
    for (let i = 0; i < 8; i++) {
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
    const { brain } = pinEnemy(room, room.state, player.x + 4, player.y);
    const before = player.hp;
    await vi.waitFor(() => expect(player.hp).toBeLessThan(before));
    const expected = Math.max(1, Math.round(brain.stats.damage - statsFor("knight", 1).defense));
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
    expect(screenOf(player.x, player.y)).toEqual({ col: 8, row: 4 }); // the start square in the middle
  });

  it("weapons fire with the attack button; every copy adds a projectile, and they hurt enemies", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const shooter = await joinAs(room, "knight", "S");
    const watcher = await joinAs(room, "rogue", "W");
    const seenByWatcher: ShotMessage[] = [];
    const seenByShooter: ShotMessage[] = [];
    watcher.client.onMessage(Msg.shot, (m: ShotMessage) => seenByWatcher.push(m));
    shooter.client.onMessage(Msg.shot, (m: ShotMessage) => seenByShooter.push(m));

    for (let i = 0; i < 3; i++)
      internals(room).giveRelic(shooter.client.sessionId, shooter.player, "dagger", 0, "chest");
    expect(shooter.player.daggerN).toBe(3);

    // A sturdy enemy straight south, out of sword reach but within dagger range.
    const { enemy } = pinEnemy(room, room.state, shooter.player.x, shooter.player.y + 48);
    enemy.hp = 500;
    shooter.player.facing = 2;
    const input = shooter.client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    input.send();

    await vi.waitFor(() => expect(seenByWatcher.length).toBe(1));
    expect(seenByWatcher[0]?.counts[0]).toBe(3);
    expect(seenByWatcher[0]?.owner).toBe(shooter.client.sessionId);
    await vi.waitFor(() => expect(enemy.hp).toBeLessThan(500));
    // The shooter predicts its own volleys; the server doesn't echo them back.
    expect(seenByShooter).toEqual([]);
  });

  it("walking onto a chest opens it and gives a relic", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue");
    const gains: GainMessage[] = [];
    client.onMessage(Msg.gain, (m: GainMessage) => gains.push(m));
    const [chestId, chest] = [...room.state.chests.entries()][0] ?? [];
    if (!chestId || !chest) throw new Error("no chest");
    player.x = chest.x;
    player.y = chest.y;
    await vi.waitFor(() => expect(chest.open).toBe(true));
    expect(player.relics.length).toBe(1);
    await vi.waitFor(() => expect(gains).toHaveLength(1));
    expect(gains[0]?.source).toBe("chest");
    expect(gains[0]?.kind).toBe(player.relics[0]?.kind);
  });

  it("vendors sell by walking onto an offer, and refuse when rupees are short", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "knight");
    const shops: ShopMessage[] = [];
    const fails: unknown[] = [];
    client.onMessage(Msg.shop, (m: ShopMessage) => shops.push(m));
    client.onMessage(Msg.shopFail, (m: unknown) => fails.push(m));
    const vendor = objects.vendors[0];
    if (!vendor) throw new Error("no vendor");

    // Into the cave, away from the counter: the vendor shows this player's offers.
    player.x = vendor.x;
    player.y = vendor.y + 80;
    await vi.waitFor(() => expect(shops).toHaveLength(1));
    const potionSlot = shops[0]?.offers.findIndex((o) => o.kind === "potion") ?? -1;
    expect(potionSlot).toBeGreaterThanOrEqual(0);
    const spot = offerPosition(vendor, potionSlot);

    player.hp = 1;
    player.rupees = 0;
    player.x = spot.x;
    player.y = spot.y;
    await vi.waitFor(() => expect(fails).toHaveLength(1));
    expect(player.hp).toBe(1);

    // Step off and back on with enough rupees.
    player.rupees = 50;
    player.y = vendor.y + 80;
    await room.waitForNextTimestep();
    await room.waitForNextTimestep();
    player.x = spot.x;
    player.y = spot.y;
    await vi.waitFor(() => expect(player.rupees).toBe(50 - POTION_PRICE));
    expect(player.hp).toBe(player.maxHp);
    await vi.waitFor(() => expect(shops.at(-1)?.offers[potionSlot]?.sold).toBe(true));
  });

  it("cave entrances lead into the cave and back out", async () => {
    const room = await createWorld();
    const { client, player } = await joinAs(room, "rogue");
    // The first portal is a cave entrance in the overworld; stand just below it and walk up.
    const entrance = objects.portals.find((p) => screenOf(p.x, p.y).row < 3);
    if (!entrance) throw new Error("no cave entrance");
    player.x = entrance.x + entrance.width / 2;
    player.y = entrance.y + entrance.height + 8;
    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.moveY = -1;
    for (let i = 0; i < 20 && player.warp === 0; i++) {
      input.send();
      await room.waitForNextTimestep();
    }
    await vi.waitFor(() => expect(player.warp).toBe(1));
    expect(screenOf(player.x, player.y).row).toBeGreaterThanOrEqual(8); // caves and dungeons lie below the overworld
  });

  it("ranged enemies shoot at heroes, and their shots hurt", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { client, player } = await joinAs(room, "knight");
    const shots: EnemyShotMessage[] = [];
    client.onMessage(Msg.enemyShot, (m: EnemyShotMessage) => shots.push(m));
    // Straight south of the spawn the square is open floor (no pillar in the way).
    pinEnemy(room, room.state, player.x, player.y + 48, { kind: "skeleton", keepAttacks: true });
    const before = player.hp;
    await vi.waitFor(() => expect(shots.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(shots[0]?.style).toBe("bone");
    await vi.waitFor(() => expect(player.hp).toBeLessThan(before), { timeout: 5000 });
  });

  it("a boss drops a chest of at least rare relics and everyone hears about it", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { client, player } = await joinAs(room, "barbarian", "Hero");
    const downs: BossDownMessage[] = [];
    const gains: GainMessage[] = [];
    client.onMessage(Msg.bossDown, (m: BossDownMessage) => downs.push(m));
    client.onMessage(Msg.gain, (m: GainMessage) => gains.push(m));
    const chestsBefore = new Set(room.state.chests.keys());

    const { id, enemy } = pinEnemy(room, room.state, player.x, player.y + 12, { kind: "warden" });
    enemy.hp = 1;
    player.facing = 2;
    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    input.send();
    await vi.waitFor(() => expect(room.state.enemies.has(id)).toBe(false));
    await vi.waitFor(() => expect(downs).toEqual([{ kind: "warden", by: "Hero" }]));

    const [, dropped] = [...room.state.chests.entries()].find(([chestId]) => !chestsBefore.has(chestId)) ?? [];
    if (!dropped) throw new Error("no chest dropped");
    player.x = dropped.x;
    player.y = dropped.y;
    await vi.waitFor(() => expect(gains).toHaveLength(1));
    expect(gains[0]?.rarity).toBeGreaterThanOrEqual(BOSS_CHEST_RARITY);
  });

  it("enemies far from every hero stand still", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const { player } = await joinAs(room, "knight");
    const far = [...room.state.enemies.values()].filter(
      (e) => Math.abs(e.x - player.x) > 2 * 320 || Math.abs(e.y - player.y) > 2 * 176,
    );
    expect(far.length).toBeGreaterThan(100);
    const before = far.map((e) => [e.x, e.y]);
    for (let i = 0; i < 20; i++) await room.waitForNextTimestep();
    expect(far.map((e) => [e.x, e.y])).toEqual(before);
  });

  it("players can't hurt each other while PvP is off", async () => {
    const room = await createWorld();
    const a = await joinAs(room, "barbarian", "A");
    const b = await joinAs(room, "rogue", "B");
    b.player.x = a.player.x;
    b.player.y = a.player.y + 12;
    a.player.facing = 2;
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
