import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "@core/server";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  ARENA_PREP_SECONDS,
  arenaRect,
  BOSS_CHEST_RARITY,
  type BossDownMessage,
  DEFAULT_MATCH_TIMES,
  type EnemyShotMessage,
  type GainMessage,
  INTEREST_RADIUS,
  inRect,
  type KillMessage,
  type LevelUpMessage,
  MatchPhase,
  Msg,
  offerPosition,
  type Player,
  type PlayerInput,
  POTION_PRICE,
  PROTOCOL_VERSION,
  RESULTS_SECONDS,
  ROOM_WORLD,
  type ShopMessage,
  type ShotMessage,
  START_COUNTDOWN_SECONDS,
  screenOf,
  statsFor,
  TICK_DT,
  TICK_RATE,
  type WorldState,
  xpToNext,
  ZONE_DAMAGE_PER_SECOND,
} from "@game/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rooms } from "../src";
import { loadWorldInfo, loadWorldObjects } from "../src/world/mapObjects";

// The tests expect the default match timings, whatever the shell exports (runs before the imports).
vi.hoisted(() => {
  delete process.env.MATCH_PVP_SECONDS;
  delete process.env.MATCH_ARENA_SECONDS;
});

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };
const objects = loadWorldObjects("overworld");
const arena = arenaRect(loadWorldInfo("overworld"));
/** The start square, where every match begins. */
const START = { col: 8, row: 4 };

/** Room internals the tests reach into to set up a scene (teleports, timers, gifts). */
interface Brain {
  home: { x: number; y: number; width: number; height: number };
  def: { attacks: unknown[]; behaviour: string };
  stats: { speed: number; damage: number };
}
interface RoomInternals {
  brains: Map<string, Brain>;
  matchStart: number;
  fightStart: number;
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

  /** A world room; it opens as the waiting room. */
  async function createWorld() {
    return colyseus.createRoom<WorldState>(ROOM_WORLD, {});
  }
  type World = Awaited<ReturnType<typeof createWorld>>;

  /** Joins with a hero picked before joining; the server creates the body right away. */
  async function joinAs(room: World, classId: string, name = "P") {
    const client = await colyseus.connectTo(room, { v, name, classId });
    const player = room.state.players.get(client.sessionId) as Player;
    return { client, player };
  }
  type Hero = Awaited<ReturnType<typeof joinAs>>;

  /** Moves the match clock forward to `seconds` (the phase changes on the next tick). */
  async function skipTo(room: World, seconds: number) {
    const target = Math.max(0, seconds - room.state.clock);
    internals(room).matchStart -= target * TICK_RATE;
    await room.waitForNextTimestep();
    await room.waitForNextTimestep();
  }

  /** Everyone in the room presses Ready; after the countdown the match starts (everyone at the centre). */
  async function play(room: World, ...heroes: Hero[]) {
    for (const hero of heroes) hero.client.send(Msg.ready, { ready: true });
    await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
    await skipTo(room, room.state.phaseEnds);
    expect(room.state.phase).toBe(MatchPhase.calm);
  }

  /** Puts `victim` right in front of `attacker` (south) and has the attacker swing until `until` holds. */
  async function swingAt(room: World, attacker: Hero, victim: Hero, until: () => void) {
    victim.player.x = attacker.player.x;
    victim.player.y = attacker.player.y + 12;
    attacker.player.facing = 2;
    const input = attacker.client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    await vi.waitFor(() => {
      input.send();
      until();
    });
    input.data.attack = 0;
    input.send();
    await room.waitForNextTimestep();
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
    const hero = await joinAs(room, "barbarian");
    const { client, player } = hero;
    await play(room, hero);
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
    const hero = await joinAs(room, "knight");
    await play(room, hero);
    const { player } = hero;
    const { brain } = pinEnemy(room, room.state, player.x + 4, player.y);
    const before = player.hp;
    await vi.waitFor(() => expect(player.hp).toBeLessThan(before));
    const expected = Math.max(1, Math.round(brain.stats.damage - statsFor("knight", 1).defense));
    expect(before - player.hp).toBe(expected);
    expect(player.invuln).toBeGreaterThan(0);
    expect(player.knockX).toBeLessThan(0); // pushed away (enemy is to the east)
  });

  it("weapons fire with the attack button; every copy adds a projectile, and they hurt enemies", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const shooter = await joinAs(room, "knight", "S");
    const watcher = await joinAs(room, "rogue", "W");
    await play(room, shooter, watcher);
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
    const hero = await joinAs(room, "rogue");
    await play(room, hero);
    const { client, player } = hero;
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
    const hero = await joinAs(room, "knight");
    await play(room, hero);
    const { client, player } = hero;
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
    const hero = await joinAs(room, "knight");
    await play(room, hero);
    const { client, player } = hero;
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
    const hero = await joinAs(room, "barbarian", "Hero");
    await play(room, hero);
    const { client, player } = hero;
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
    const hero = await joinAs(room, "knight");
    await play(room, hero);
    const { player } = hero;
    const far = [...room.state.enemies.values()].filter(
      (e) => Math.abs(e.x - player.x) > 2 * 320 || Math.abs(e.y - player.y) > 2 * 176,
    );
    expect(far.length).toBeGreaterThan(100);
    const before = far.map((e) => [e.x, e.y]);
    for (let i = 0; i < 20; i++) await room.waitForNextTimestep();
    expect(far.map((e) => [e.x, e.y])).toEqual(before);
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

  describe("the waiting room", () => {
    it("waits until everyone is ready, counts down, then starts the match at the centre and closes the room", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      expect(room.state.phase).toBe(MatchPhase.lobby);

      a.client.send(Msg.ready, { ready: true });
      await vi.waitFor(() => expect(room.state.roster.get(a.client.sessionId)?.ready).toBe(true));
      for (let i = 0; i < 3; i++) await room.waitForNextTimestep();
      expect(room.state.phase).toBe(MatchPhase.lobby);

      b.client.send(Msg.ready, { ready: true });
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
      expect(room.state.phaseEnds - room.state.clock).toBe(START_COUNTDOWN_SECONDS);
      // Changing your mind cancels the countdown.
      b.client.send(Msg.ready, { ready: false });
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.lobby));
      b.client.send(Msg.ready, { ready: true });
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));

      // Heroes may wander off while waiting; the match starts everyone at the centre.
      a.player.x = 40;
      a.player.y = 40;
      expect(room.locked).toBe(false);
      await skipTo(room, room.state.phaseEnds);
      expect(room.state.phase).toBe(MatchPhase.calm);
      expect(room.state.phaseEnds).toBe(DEFAULT_MATCH_TIMES.pvpAfter);
      expect(room.state.clock).toBeLessThan(2);
      expect(room.locked).toBe(true);
      expect(room.state.alive).toBe(2);
      for (const p of [a.player, b.player]) {
        expect(p.ready).toBe(false);
        expect(screenOf(p.x, p.y)).toEqual(START);
      }
    });

    it("a newcomer has to be ready too: the countdown waits for them", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      a.client.send(Msg.ready, { ready: true });
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
      const b = await joinAs(room, "rogue", "B");
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.lobby));
      b.client.send(Msg.ready, {});
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
    });

    it("doesn't wait for a player whose connection dropped; they watch if the match starts without them", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      await b.client.leave(false); // dropped, not left: the seat is held for a while
      await vi.waitFor(() => expect(room.state.roster.get(b.client.sessionId)?.away).toBe(true));
      expect(room.state.players.has(b.client.sessionId)).toBe(true);

      a.client.send(Msg.ready, { ready: true });
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
      await skipTo(room, room.state.phaseEnds);
      expect(room.state.phase).toBe(MatchPhase.calm);
      expect(room.state.alive).toBe(1);
      expect(b.player.out).toBe(true);
      expect(b.player.place).toBe(0);
      expect(a.player.out).toBe(false);
    });

    it("nothing hurts and nothing can be taken while waiting", async () => {
      const room = await createWorld();
      await room.waitForNextTimestep();
      const { client, player } = await joinAs(room, "barbarian");
      const { enemy } = pinEnemy(room, room.state, player.x, player.y + 12);
      const enemyHp = enemy.hp;
      player.facing = 2;
      const input = client.input<PlayerInput>({ mode: "reliable" });
      input.data.attack = 1;
      for (let i = 0; i < 10; i++) {
        input.send();
        await room.waitForNextTimestep();
      }
      expect(player.swing).toBeGreaterThan(0);
      expect(enemy.hp).toBe(enemyHp);
      expect(player.hp).toBe(player.maxHp);

      const [, chest] = [...room.state.chests.entries()][0] ?? [];
      if (!chest) throw new Error("no chest");
      player.x = chest.x;
      player.y = chest.y;
      for (let i = 0; i < 5; i++) await room.waitForNextTimestep();
      expect(chest.open).toBe(false);
      expect(player.relics.length).toBe(0);
    });

    it("ignores Ready once the match is on", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      await play(room, a);
      a.client.send(Msg.ready, { ready: true });
      for (let i = 0; i < 3; i++) await room.waitForNextTimestep();
      expect(a.player.ready).toBe(false);
      expect(room.state.phase).toBe(MatchPhase.calm);
    });
  });

  describe("the match", () => {
    it("players can't hurt each other while PvP is off", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "barbarian", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      await swingAt(room, a, b, () => expect(a.player.swing).toBeGreaterThan(0));
      expect(b.player.hp).toBe(b.player.maxHp);
    });

    it("turns PvP on after the calm phase: a sword hit hurts another hero", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "barbarian", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      await skipTo(room, DEFAULT_MATCH_TIMES.pvpAfter);
      expect(room.state.phase).toBe(MatchPhase.pvp);
      expect(room.state.phaseEnds).toBe(DEFAULT_MATCH_TIMES.arenaAfter);
      await swingAt(room, a, b, () => expect(b.player.hp).toBeLessThan(b.player.maxHp));
      expect(b.player.invuln).toBeGreaterThan(0);
      expect(b.player.knockY).toBeGreaterThan(0); // pushed away, south
    });

    it("whoever falls to a monster is out for the match and watches a hero still in it", async () => {
      const room = await createWorld();
      await room.waitForNextTimestep();
      const a = await joinAs(room, "rogue", "A");
      const b = await joinAs(room, "knight", "B");
      const c = await joinAs(room, "knight", "C");
      await play(room, a, b, c);
      const kills: KillMessage[] = [];
      b.client.onMessage(Msg.kill, (m: KillMessage) => kills.push(m));

      a.player.hp = 1;
      pinEnemy(room, room.state, a.player.x + 4, a.player.y);
      await vi.waitFor(() => expect(a.player.out).toBe(true));
      expect(a.player.dead).toBe(true);
      expect(a.player.place).toBe(3);
      expect(room.state.roster.get(a.client.sessionId)?.out).toBe(true);
      await vi.waitFor(() => expect(kills).toHaveLength(1));
      expect(kills[0]).toMatchObject({ cause: "monster", killer: "", victimName: "A", place: 3 });

      // It follows the hero it watches, and can switch to the next one.
      const first = a.player.watch;
      expect([b.client.sessionId, c.client.sessionId]).toContain(first);
      const watched = room.state.players.get(first) as Player;
      watched.x += 30;
      await vi.waitFor(() => expect(a.player.x).toBe(watched.x));
      a.client.send(Msg.watchNext);
      await vi.waitFor(() => expect(a.player.watch).not.toBe(first));
      expect([b.client.sessionId, c.client.sessionId]).toContain(a.player.watch);

      // No coming back: the match goes on without it.
      for (let i = 0; i < 10; i++) await room.waitForNextTimestep();
      expect(a.player.dead).toBe(true);
      expect(room.state.phase).toBe(MatchPhase.calm);
      expect(room.state.alive).toBe(2);
    });

    it("the winner of a fight takes one relic and every rupee; the loser is out and watches the winner", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "barbarian", "A");
      const b = await joinAs(room, "rogue", "B");
      const c = await joinAs(room, "knight", "C");
      await play(room, a, b, c);
      const kills: KillMessage[] = [];
      const gains: GainMessage[] = [];
      b.client.onMessage(Msg.kill, (m: KillMessage) => kills.push(m));
      a.client.onMessage(Msg.gain, (m: GainMessage) => gains.push(m));
      internals(room).giveRelic(b.client.sessionId, b.player, "boots", 3, "chest");
      b.player.rupees = 37;
      a.player.rupees = 5;
      await skipTo(room, DEFAULT_MATCH_TIMES.pvpAfter);

      b.player.hp = 1;
      await swingAt(room, a, b, () => expect(b.player.out).toBe(true));
      expect(a.player.rupees).toBe(42);
      expect(b.player.rupees).toBe(0);
      expect(b.player.relics.length).toBe(0);
      expect(a.player.relics.map((r) => [r.kind, r.rarity])).toEqual([["boots", 3]]);
      expect(b.player.watch).toBe(a.client.sessionId);
      await vi.waitFor(() => expect(kills).toHaveLength(1));
      expect(kills[0]).toMatchObject({
        cause: "hero",
        killer: a.client.sessionId,
        killerName: "A",
        victim: b.client.sessionId,
        victimName: "B",
        relic: { kind: "boots", rarity: 3 },
        rupees: 37,
        place: 3,
      });
      await vi.waitFor(() => expect(gains.at(-1)).toEqual({ kind: "boots", rarity: 3, source: "loot" }));
      expect(room.state.phase).toBe(MatchPhase.pvp);
      expect(room.state.alive).toBe(2);
    });

    it("weapon projectiles hurt other heroes once PvP is on", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      for (let i = 0; i < 2; i++) internals(room).giveRelic(a.client.sessionId, a.player, "dagger", 0, "chest");
      await skipTo(room, DEFAULT_MATCH_TIMES.pvpAfter);
      // Out of sword reach, straight south (open floor on the start square).
      b.player.x = a.player.x;
      b.player.y = a.player.y + 48;
      a.player.facing = 2;
      const input = a.client.input<PlayerInput>({ mode: "reliable" });
      input.data.attack = 1;
      input.send();
      await vi.waitFor(() => expect(b.player.hp).toBeLessThan(b.player.maxHp));
    });

    it("the last hero standing wins at any moment; then everyone goes back to the waiting room", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "barbarian", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      internals(room).giveRelic(a.client.sessionId, a.player, "heart", 0, "chest");
      await skipTo(room, DEFAULT_MATCH_TIMES.pvpAfter);

      b.player.hp = 1;
      await swingAt(room, a, b, () => expect(b.player.out).toBe(true));
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.ended));
      expect(room.state.winner).toBe(a.client.sessionId);
      expect(room.state.winnerName).toBe("A");
      expect(room.state.phaseEnds - room.state.clock).toBe(RESULTS_SECONDS);
      expect(room.locked).toBe(true);

      await skipTo(room, room.state.phaseEnds);
      expect(room.state.phase).toBe(MatchPhase.lobby);
      expect(room.locked).toBe(false);
      expect(room.state.winner).toBe("");
      for (const p of [a.player, b.player]) {
        expect(p.out).toBe(false);
        expect(p.dead).toBe(false);
        expect(p.ready).toBe(false);
        expect(p.level).toBe(1);
        expect(p.relics.length).toBe(0);
        expect(p.rupees).toBe(0);
        expect(p.hp).toBe(p.maxHp);
        expect(screenOf(p.x, p.y)).toEqual(START);
      }
      expect(a.player.maxHp).toBe(statsFor("barbarian", 1).maxHp);
      await vi.waitFor(() => expect(room.state.enemies.size).toBe(objects.enemies.length));
    });

    it("at 30 minutes the heroes still standing go to the arena, healed; the fallen keep watching", async () => {
      const room = await createWorld();
      await room.waitForNextTimestep();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      const c = await joinAs(room, "knight", "C");
      await play(room, a, b, c);
      c.player.hp = 1;
      pinEnemy(room, room.state, c.player.x + 4, c.player.y);
      await vi.waitFor(() => expect(c.player.out).toBe(true));
      // Move the enemy away from the others.
      pinEnemy(room, room.state, 8, 8);

      a.player.hp = 3;
      await skipTo(room, DEFAULT_MATCH_TIMES.arenaAfter);
      expect(room.state.phase).toBe(MatchPhase.prep);
      expect(room.state.phaseEnds).toBe(DEFAULT_MATCH_TIMES.arenaAfter + ARENA_PREP_SECONDS);
      if (!arena) throw new Error("no arena in the map");
      for (const p of [a.player, b.player]) {
        expect(inRect(arena, p.x, p.y)).toBe(true);
        expect(p.hp).toBe(p.maxHp);
      }
      expect(c.player.out).toBe(true);
      await vi.waitFor(() => expect(inRect(arena, c.player.x, c.player.y)).toBe(true)); // with the hero it watches
      expect(room.state.alive).toBe(2);
      expect(room.state.zone).toBeGreaterThan(Math.hypot(arena.width, arena.height) / 2 - 1);

      // No fighting during the countdown.
      await swingAt(room, a, b, () => expect(a.player.swing).toBeGreaterThan(0));
      expect(b.player.hp).toBe(b.player.maxHp);
      await skipTo(room, DEFAULT_MATCH_TIMES.arenaAfter + ARENA_PREP_SECONDS);
      expect(room.state.phase).toBe(MatchPhase.arena);
      expect(room.state.phaseEnds).toBe(0);
    });

    it("the storm hurts heroes outside the safe zone and can finish them", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      const kills: KillMessage[] = [];
      a.client.onMessage(Msg.kill, (m: KillMessage) => kills.push(m));
      await skipTo(room, DEFAULT_MATCH_TIMES.arenaAfter);
      await skipTo(room, room.state.phaseEnds);
      expect(room.state.phase).toBe(MatchPhase.arena);
      if (!arena) throw new Error("no arena in the map");
      // Two minutes into the fight: a small zone around the centre.
      internals(room).fightStart -= 120 * TICK_RATE;
      a.player.x = arena.centerX;
      a.player.y = arena.centerY;
      b.player.x = arena.x + 40;
      b.player.y = arena.y + 48;
      await vi.waitFor(() => expect(room.state.zone).toBeLessThan(Math.hypot(arena.width, arena.height) / 4));
      const before = b.player.hp;
      await vi.waitFor(() => expect(b.player.hp).toBeLessThan(before), { timeout: 3000 });
      expect(before - b.player.hp).toBe(Math.round(b.player.maxHp * ZONE_DAMAGE_PER_SECOND));
      expect(a.player.hp).toBe(a.player.maxHp);

      b.player.hp = 1;
      await vi.waitFor(() => expect(b.player.out).toBe(true), { timeout: 3000 });
      await vi.waitFor(() => expect(kills).toHaveLength(1));
      expect(kills[0]).toMatchObject({ cause: "storm", killer: "", victimName: "B", place: 2 });
      await vi.waitFor(() => expect(room.state.winnerName).toBe("A"));
    });

    it("someone who arrives after the match started watches until the next one", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      await room.unlock(); // a seat reserved just before the doors closed
      const late = await joinAs(room, "barbarian", "Late");
      expect(late.player.out).toBe(true);
      expect(late.player.dead).toBe(true);
      expect(late.player.place).toBe(0);
      expect([a.client.sessionId, b.client.sessionId]).toContain(late.player.watch);
      for (let i = 0; i < 5; i++) await room.waitForNextTimestep();
      expect(late.player.dead).toBe(true);
      expect(room.state.alive).toBe(2);
    });

    it("a match started alone ends when the hero falls, or wins when it reaches the arena", async () => {
      const room = await createWorld();
      await room.waitForNextTimestep();
      const solo = await joinAs(room, "knight", "Solo");
      await play(room, solo);
      await skipTo(room, DEFAULT_MATCH_TIMES.arenaAfter);
      await skipTo(room, room.state.phaseEnds);
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.ended));
      expect(room.state.winnerName).toBe("Solo");

      await skipTo(room, room.state.phaseEnds);
      expect(room.state.phase).toBe(MatchPhase.lobby);
      await play(room, solo);
      solo.player.hp = 1;
      pinEnemy(room, room.state, solo.player.x + 4, solo.player.y);
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.ended));
      expect(room.state.winner).toBe("");
    });
  });
});
