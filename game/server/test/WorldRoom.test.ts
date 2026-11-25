import type { StepContext } from "@colyseus/core";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "@core/server";
import { boxHitsSolid, CORE_PROTOCOL_VERSION, type CollisionGrid } from "@core/shared";
import {
  ActPhase,
  ARENA_PREP_SECONDS,
  actPhase,
  arenaRect,
  BOSS_CHEST_RARITY,
  type BossDownMessage,
  type DamageMessage,
  DEFAULT_MATCH_TIMES,
  ENEMIES,
  ENEMY_KINDS,
  type Enemy,
  type EnemyKind,
  type EnemyShotMessage,
  type GainMessage,
  HEART_HEAL,
  type HitResult,
  INTEREST_RADIUS,
  inRect,
  type KillMessage,
  type LevelUpMessage,
  MatchPhase,
  Msg,
  offerPosition,
  PALETTES,
  type PickedMessage,
  type Player,
  type PlayerInput,
  POTION_PRICE,
  PROTOCOL_VERSION,
  RESULTS_SECONDS,
  ROOM_WORLD,
  SHOT_DEFS,
  type ShopMessage,
  type ShotMessage,
  SLOW_FACTOR,
  START_COUNTDOWN_SECONDS,
  type SummaryMessage,
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
import { loadProps, loadWorldInfo, loadWorldObjects } from "../src/world/mapObjects";

// The tests expect the default match timings, whatever the shell exports (runs before the imports).
vi.hoisted(() => {
  delete process.env.MATCH_PVP_SECONDS;
  delete process.env.MATCH_ARENA_SECONDS;
});

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };
const objects = loadWorldObjects("overworld");
const { props } = loadProps("overworld");
const arena = arenaRect(loadWorldInfo("overworld"));
/** The start square, where every match begins. */
const START = { col: 8, row: 4 };

/** Room internals the tests reach into to set up a scene (teleports, timers, gifts). */
interface Brain {
  home: { x: number; y: number; width: number; height: number };
  def: { attacks: unknown[]; behaviour: string; stone?: { ticks: number; endRing?: { count: number } } };
  stats: { speed: number; damage: number; half: number };
  attackCd: number[];
  actSlot: number;
  actPhase: number;
  stunned: boolean;
  destX: number;
  destY: number;
}
interface RoomInternals {
  brains: Map<string, Brain>;
  hostiles: unknown[];
  step(ctx: StepContext): void;
  spawnEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    tier: number,
    dungeon: boolean,
    spawner?: undefined,
    summoned?: boolean,
  ): string;
  removeEnemy(id: string): void;
  damageEnemy(
    enemyId: string,
    enemy: Enemy,
    brain: Brain,
    attackerId: string,
    attacker: Player,
    hit: HitResult,
    fromX: number,
    fromY: number,
    knockSpeed: number,
  ): void;
  resolveSwing(id: string, player: Player): void;
  fireHostile(
    from: string,
    kind: EnemyKind,
    shots: {
      type: "shots";
      x: number;
      y: number;
      angles: number[];
      speed: number;
      range: number;
      damage: number;
      style: string;
    },
  ): void;
  heroDown(id: string, player: Player, cause: KillMessage["cause"]): void;
  applyInput(id: string, player: Player, input: { moveX: number; moveY: number; attack: number }, dt: number): void;
  matchStart: number;
  fightStart: number;
  map: { pixelWidth: number; pixelHeight: number; collision: CollisionGrid };
  freeSpot(
    home: Brain["home"],
    half: number,
    x: number,
    y: number,
    radius: number,
  ): { x: number; y: number } | undefined;
  rng: () => number;
  regrowAt: Map<number, number>;
  giveRelic(id: string, player: Player, kind: string, rarity: number, source: string): void;
  openLobby(): void;
  teleport(player: Player, x: number, y: number): void;
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

  /**
   * Everyone in the room presses Ready; after the countdown the match starts
   * (everyone at the centre). Without bots: these tests set up their own scenes
   * (bots are tested in bots.test.ts).
   */
  async function play(room: World, ...heroes: Hero[]) {
    if (heroes[0]) await noBots(room, heroes[0]);
    for (const hero of heroes) hero.client.send(Msg.ready, { ready: true });
    await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
    await skipTo(room, room.state.phaseEnds);
    expect(room.state.phase).toBe(MatchPhase.calm);
  }

  /** Switches bots off for the next match (the waiting room switch). */
  async function noBots(room: World, hero: Hero) {
    hero.client.send(Msg.bots, { on: false });
    await vi.waitFor(() => expect(room.state.bots).toBe(false));
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

  /** Runs the room's simulation `ticks` ticks right away (no waiting), or until `until` holds (checked before each). */
  function fastForward(room: unknown, ticks: number, until?: () => boolean) {
    const ctx = { dt: TICK_DT, dtMs: 1000 / TICK_RATE, tick: 0, subSteps: 1, subDt: TICK_DT } as StepContext;
    let n = 0;
    while (n < ticks && !until?.()) {
      internals(room).step.call(room, ctx);
      n++;
    }
    return n;
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

  it("takes the hero colour from the join options, if it is a known one", async () => {
    const room = await createWorld();
    const gold = await colyseus.connectTo(room, { v, name: "G", classId: "knight", palette: PALETTES.length - 1 });
    const odd = await colyseus.connectTo(room, { v, name: "O", classId: "knight", palette: 99 });
    expect(room.state.players.get(gold.sessionId)?.palette).toBe(PALETTES.length - 1);
    expect(room.state.players.get(odd.sessionId)?.palette).toBe(0);
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
    // Every kind is placed somewhere (normal kinds in the overworld or dungeons, one of each boss).
    for (const kind of ENEMY_KINDS) expect(kinds.has(kind), kind).toBe(true);
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
    const drop = [...room.state.pickups.values()].find((p) => p.kind === "rupee");
    expect(drop).toBeDefined();
    const value = drop?.value ?? 0;
    expect(value).toBeGreaterThanOrEqual(1);
    input.data.attack = 0;
    input.data.moveY = 1;
    for (let i = 0; i < 8; i++) {
      input.send();
      await room.waitForNextTimestep();
    }
    await vi.waitFor(() => expect(player.rupees).toBe(value));
    // (A heart may have dropped too: it stays, the hero has full health.)
    expect([...room.state.pickups.values()].filter((p) => p.kind === "rupee")).toHaveLength(0);
  });

  it("monsters drop hearts now and then (bosses always); only a hurt hero picks one up", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const hero = await joinAs(room, "knight");
    await play(room, hero);
    const { client, player } = hero;
    const picked: PickedMessage[] = [];
    client.onMessage(Msg.picked, (m: PickedMessage) => picked.push(m));

    const { id, enemy } = pinEnemy(room, room.state, player.x, player.y + 12, { kind: "brute" });
    enemy.hp = 1;
    player.facing = 2;
    const input = client.input<PlayerInput>({ mode: "reliable" });
    input.data.attack = 1;
    input.send();
    await vi.waitFor(() => expect(room.state.enemies.has(id)).toBe(false));
    input.data.attack = 0;
    input.send();
    const heart = [...room.state.pickups.values()].find((p) => p.kind === "heart");
    if (!heart) throw new Error("no heart");

    // With full health (the kill levelled the hero up) the heart stays on the ground.
    expect(player.hp).toBe(player.maxHp);
    player.x = heart.x;
    player.y = heart.y;
    for (let i = 0; i < 3; i++) await room.waitForNextTimestep();
    expect([...room.state.pickups.values()]).toContain(heart);

    // Hurt, the hero takes it: a quarter of its health back.
    player.hp = 10;
    await vi.waitFor(() => expect([...room.state.pickups.values()]).not.toContain(heart));
    const heal = Math.round(player.maxHp * HEART_HEAL);
    expect(player.hp).toBe(10 + heal);
    await vi.waitFor(() => expect(picked).toContainEqual({ kind: "heart", value: heal }));
  });

  it("the sword cuts tall grass and breaks pots; some hold a heart or rupees; they come back unseen", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const hero = await joinAs(room, "knight");
    const { client, player } = hero;
    const bush = props.find((p) => p.kind === "bush");
    const pot = props.find((p) => p.kind === "pot");
    if (!bush || !pot) throw new Error("no props");
    const broken = (id: number) => room.state.brokenProps.has(String(id));
    const input = client.input<PlayerInput>({ mode: "reliable" });
    /** Stands just north of a prop (out of reach of what falls out), facing it, and swings once with every random roll at `roll`. */
    const swingAtProp = async (prop: { x: number; y: number }, roll = 0.99) => {
      player.x = prop.x;
      player.y = prop.y - 12;
      player.facing = 2;
      // The sword recovers as the hero's steps run (one per input).
      await vi.waitFor(() => {
        input.send();
        expect(player.cooldown).toBe(0);
      });
      const rng = internals(room).rng;
      internals(room).rng = () => roll;
      input.data.attack = 1;
      input.send();
      input.data.attack = 0;
      input.send();
      for (let i = 0; i < 3; i++) await room.waitForNextTimestep();
      internals(room).rng = rng;
    };
    const dropsOn = (prop: { x: number; y: number }) =>
      [...room.state.pickups.values()].filter((p) => p.x === prop.x && p.y === prop.y);

    // In the waiting room the world is frozen.
    await swingAtProp(bush, 0);
    expect(broken(bush.id)).toBe(false);

    await play(room, hero);
    await swingAtProp(bush, 0);
    expect(broken(bush.id)).toBe(true);
    await vi.waitFor(() => expect(client.state.brokenProps.get(String(bush.id))).toBe(0));
    expect(dropsOn(bush)).toEqual([expect.objectContaining({ kind: "heart" })]);
    // Already cut: nothing more in it.
    await swingAtProp(bush, 0);
    expect(dropsOn(bush)).toHaveLength(1);
    // A pot with three rupees (the roll is past the heart's chance, within the rupees').
    await swingAtProp(pot, 0.5);
    expect(broken(pot.id)).toBe(true);
    expect(dropsOn(pot)).toEqual([expect.objectContaining({ kind: "rupee", value: 3 })]);

    // The tall grass is due back, but not while a hero is on its screen to see it pop up.
    internals(room).regrowAt.set(bush.id, 0);
    player.x = bush.x;
    player.y = bush.y - 10;
    for (let i = 0; i < TICK_RATE + 2; i++) await room.waitForNextTimestep();
    expect(broken(bush.id)).toBe(true);
    player.x = pot.x;
    player.y = pot.y - 10;
    await vi.waitFor(() => expect(broken(bush.id)).toBe(false), { timeout: 3000 });
    await vi.waitFor(() => expect(client.state.brokenProps.has(String(bush.id))).toBe(false));

    // The next match starts with everything whole.
    expect(broken(pot.id)).toBe(true);
    internals(room).openLobby();
    expect(room.state.brokenProps.size).toBe(0);
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

  it("ranged enemies wind up, then shoot (the message names the shooter), and their shots hurt", async () => {
    const room = await createWorld();
    await room.waitForNextTimestep();
    const hero = await joinAs(room, "knight");
    await play(room, hero);
    const { client, player } = hero;
    const shots: EnemyShotMessage[] = [];
    client.onMessage(Msg.enemyShot, (m: EnemyShotMessage) => shots.push(m));
    // Straight south of the spawn the square is open floor (no pillar in the way).
    const { id, enemy, brain } = pinEnemy(room, room.state, player.x, player.y + 48, {
      kind: "skeleton",
      keepAttacks: true,
    });
    brain.attackCd = brain.attackCd.map(() => 0);
    let woundUp = false;
    fastForward(room, 5 * TICK_RATE, () => {
      if (actPhase(enemy.act) === ActPhase.windup) woundUp = true;
      return internals(room).hostiles.length > 0;
    });
    // The wind-up is on the wire before the shot.
    expect(woundUp).toBe(true);
    const before = player.hp;
    await vi.waitFor(() => expect(shots.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(shots[0]).toMatchObject({ style: "bone", from: id });
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

  describe("enemy acts", () => {
    // An open stretch of the start square (rows 49-51 are floor from x 2592 to 2848).
    const ROW_Y = 808;

    /** Two heroes in a match (no bots), sturdy, and no other monster around the start. */
    async function scene() {
      const room = await createWorld();
      await room.waitForNextTimestep();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "knight", "B");
      await play(room, a, b);
      for (const [id, e] of room.state.enemies)
        if (Math.abs(e.x - 2720) < 400 && Math.abs(e.y - ROW_Y) < 250) internals(room).removeEnemy(id);
      for (const { player } of [a, b]) {
        player.maxHp = 100000;
        player.hp = 100000;
      }
      return { room, a, b };
    }

    /** Puts a hero somewhere (server side: the tests send no input). */
    function place(player: Player, x: number, y: number) {
      player.x = x;
      player.y = y;
    }

    /** A fresh enemy of `kind` (never elite) living on the whole map; or the map's own one if it has to be. */
    function addEnemy(room: World, kind: EnemyKind, x: number, y: number) {
      const id = internals(room).spawnEnemy(kind, x, y, 0, false, undefined, true);
      const enemy = room.state.enemies.get(id);
      const brain = internals(room).brains.get(id);
      if (!enemy || !brain) throw new Error(`no ${kind}`);
      const { pixelWidth, pixelHeight } = internals(room).map;
      brain.home = { x: 0, y: 0, width: pixelWidth, height: pixelHeight };
      return { id, enemy, brain };
    }

    const blow = (amount: number): HitResult => ({ amount, crit: false, heal: 0 });

    it("a web slows the hero it hits, not again right after, and the slow ends with the hero", async () => {
      const { room, a } = await scene();
      const { client, player } = a;
      const id = client.sessionId;
      place(player, 2700, ROW_Y);
      const web = (y: number) =>
        internals(room).fireHostile("e0", "spider", {
          type: "shots",
          x: 2700,
          y,
          angles: [Math.PI / 2],
          speed: 100,
          range: 130,
          damage: 4,
          style: "web",
        });
      web(770);
      fastForward(room, 30, () => player.slow > 0);
      expect(player.slow).toBe(SHOT_DEFS.web.slowTicks);
      // Webbed: each input moves it SLOW_FACTOR as far.
      player.knockTicks = 0;
      const x0 = player.x;
      internals(room).applyInput(id, player, { moveX: 1, moveY: 0, attack: 0 }, TICK_DT);
      expect(player.x - x0).toBeCloseTo(player.speed * SLOW_FACTOR * TICK_DT, 6);
      // Another web inside the immunity window hurts but doesn't slow again.
      player.invuln = 0;
      player.slow = 5;
      const hp = player.hp;
      web(player.y - 30);
      fastForward(room, 30, () => player.hp < hp);
      expect(player.hp).toBeLessThan(hp);
      expect(player.slow).toBe(5);
      // The match moving a hero (teleport: start, arena, waiting room) shakes the web off too.
      internals(room).teleport(player, 2720, ROW_Y);
      expect(player.slow).toBe(0);
      player.slow = 7;
      internals(room).heroDown(id, player, "monster");
      expect(player.slow).toBe(0);
    });

    it("the witch turns to stone at a mark: HP clamps there, blows do nothing, wisps come, a ring ends it", async () => {
      const { room, a } = await scene();
      const { client, player } = a;
      const damage: DamageMessage[] = [];
      const shots: EnemyShotMessage[] = [];
      client.onMessage(Msg.damage, (m: DamageMessage) => damage.push(m));
      client.onMessage(Msg.enemyShot, (m: EnemyShotMessage) => shots.push(m));
      const { id, enemy, brain } = pinEnemy(room, room.state, 2760, ROW_Y, { kind: "witch" });
      brain.attackCd = [];
      const stone = ENEMIES.witch.stone;
      if (!stone?.endRing) throw new Error("the witch turns to stone");
      place(player, 2700, ROW_Y);
      enemy.hp = Math.round(enemy.maxHp * 0.7);
      // Half her HP in one blow from 70%: she stops at the 66% mark, not lower.
      internals(room).damageEnemy(id, enemy, brain, client.sessionId, player, blow(enemy.maxHp / 2), 2700, ROW_Y, 0);
      const mark = Math.ceil((stone.marks[0] ?? 0) * enemy.maxHp);
      expect(enemy.hp).toBe(mark);
      fastForward(room, 8);
      const wisps = [...room.state.enemies.values()].filter(
        (e) => e.kind === "wisp" && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 60,
      );
      expect(wisps).toHaveLength(stone.summon?.count ?? 0);
      // A sword blow on the stone: amount 0, blocked, HP unchanged.
      place(player, enemy.x, enemy.y - 12);
      player.facing = 2;
      damage.length = 0;
      internals(room).resolveSwing(client.sessionId, player);
      expect(enemy.hp).toBe(mark);
      await vi.waitFor(() => expect(damage).toContainEqual(expect.objectContaining({ amount: 0, blocked: true })));
      place(player, 2700, ROW_Y);
      fastForward(room, stone.ticks + 4);
      await vi.waitFor(() =>
        expect(shots.some((m) => m.from === id && m.angles.length === stone.endRing?.count)).toBe(true),
      );
    });

    it("a lancer guards its front (30%, blocked) but not its side, nor while stunned or charging", async () => {
      const { room, a } = await scene();
      const { client, player } = a;
      const damage: DamageMessage[] = [];
      client.onMessage(Msg.damage, (m: DamageMessage) => damage.push(m));
      place(player, 2720, ROW_Y);
      const { id, enemy, brain } = addEnemy(room, "lancer", 2740, ROW_Y);
      enemy.facing = 4; // toward the hero
      const hit = (fromX: number, fromY: number) => {
        enemy.hp = 1000;
        internals(room).damageEnemy(id, enemy, brain, client.sessionId, player, blow(20), fromX, fromY, 0);
        return 1000 - enemy.hp;
      };
      expect(hit(2720, ROW_Y)).toBe(Math.round(20 * (ENEMIES.lancer.block ?? 1)));
      await vi.waitFor(() => expect(damage.at(-1)).toMatchObject({ amount: 6, blocked: true }));
      expect(hit(2740, ROW_Y - 20)).toBe(20);
      Object.assign(brain, { actSlot: 0, actPhase: ActPhase.recover, stunned: true });
      expect(hit(2720, ROW_Y)).toBe(20);
      Object.assign(brain, { actSlot: 0, actPhase: ActPhase.action, stunned: false });
      expect(hit(2720, ROW_Y)).toBe(20);
      await vi.waitFor(() => expect(damage.at(-1)).toMatchObject({ amount: 20 }));
      expect(damage.at(-1)?.blocked).toBeUndefined();
    });

    it("the colossus leaps: no sword reaches it in the air, it lands where the hero stood and hurts only there", async () => {
      const { room, a, b } = await scene();
      place(a.player, 2680, ROW_Y);
      place(b.player, 2620, ROW_Y); // 60 px from the landing spot, farther from the colossus than A
      const { enemy, brain } = pinEnemy(room, room.state, 2800, ROW_Y, { kind: "colossus", keepAttacks: true });
      const leap = ENEMIES.colossus.attacks[1];
      if (leap?.type !== "leap") throw new Error("the colossus leaps");
      brain.attackCd = brain.attackCd.map((_, i) => (i === 1 ? 0 : 9999));
      const [hpA, hpB] = [a.player.hp, b.player.hp];
      let ticks = fastForward(room, leap.windupTicks + 10);
      expect(brain.actPhase).toBe(ActPhase.action);
      // In the air: a blade passes under it.
      const hp = enemy.hp;
      place(b.player, enemy.x, enemy.y - 12);
      b.player.facing = 2;
      internals(room).resolveSwing(b.client.sessionId, b.player);
      expect(enemy.hp).toBe(hp);
      place(b.player, 2620, ROW_Y);
      ticks += fastForward(room, 60, () => a.player.hp < hpA);
      expect(ticks).toBe(leap.windupTicks + leap.ticks);
      expect([enemy.x, enemy.y]).toEqual([2680, ROW_Y]);
      expect(b.player.hp).toBe(hpB);
    });

    it("a raider's strike hits the hero in front of it, not the one behind", async () => {
      const { room, a, b } = await scene();
      place(a.player, 2720, 800);
      place(b.player, 2720, 844);
      const { brain } = addEnemy(room, "raider", 2720, 820);
      brain.def = { ...brain.def, behaviour: "guard" };
      brain.attackCd = [0];
      const strike = ENEMIES.raider.attacks[0];
      if (strike?.type !== "strike") throw new Error("the raider strikes");
      const [hpA, hpB] = [a.player.hp, b.player.hp];
      fastForward(room, strike.windupTicks + 1);
      expect(a.player.hp).toBeLessThan(hpA);
      expect(b.player.hp).toBe(hpB);
    });

    it("summons and blinks only land on open floor: the whole body box, not just its corners", async () => {
      const room = await createWorld();
      await room.waitForNextTimestep();
      const world = internals(room);
      let spots = 0;
      for (const [id, e] of room.state.enemies) {
        const brain = world.brains.get(id);
        if (!brain) continue;
        for (const half of [5, 12]) {
          for (let n = 0; n < 8; n++) {
            const spot = world.freeSpot(brain.home, half, e.x, e.y, 60);
            if (!spot) continue;
            spots++;
            expect(boxHitsSolid(world.map.collision, spot.x, spot.y, half + 2)).toBe(false);
          }
        }
      }
      expect(spots).toBeGreaterThan(1000);
    });

    it("every kind spawns and acts for 300 ticks next to a hero without throwing", async () => {
      const { room, a } = await scene();
      place(a.player, 2720, 800);
      ENEMY_KINDS.forEach((kind, i) => {
        addEnemy(room, kind, 2610 + (i % 9) * 26, 792 + Math.floor(i / 9) * 16);
      });
      expect(() => fastForward(room, 300)).not.toThrow();
      for (const e of room.state.enemies.values()) expect(Number.isFinite(e.x + e.y + e.hp)).toBe(true);
    });
  });

  describe("the waiting room", () => {
    it("waits until everyone is ready, counts down, then starts the match at the centre and closes the room", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "knight", "A");
      const b = await joinAs(room, "rogue", "B");
      expect(room.state.phase).toBe(MatchPhase.lobby);
      await noBots(room, a);

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
      await noBots(room, a);

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

    it("each player gets a summary of their match; wins and heroes defeated carry over in the room", async () => {
      const room = await createWorld();
      const a = await joinAs(room, "barbarian", "A");
      const b = await joinAs(room, "rogue", "B");
      await play(room, a, b);
      const summaries = new Map<string, SummaryMessage[]>();
      for (const hero of [a, b]) {
        const list: SummaryMessage[] = [];
        summaries.set(hero.client.sessionId, list);
        hero.client.onMessage(Msg.summary, (m: SummaryMessage) => list.push(m));
      }

      // B slays a monster and opens a chest, then falls to A once PvP is on.
      const { id, enemy } = pinEnemy(room, room.state, b.player.x, b.player.y + 12, { kind: "slime" });
      enemy.hp = 1;
      b.player.facing = 2;
      const input = b.client.input<PlayerInput>({ mode: "reliable" });
      input.data.attack = 1;
      input.send();
      await vi.waitFor(() => expect(room.state.enemies.has(id)).toBe(false));
      input.data.attack = 0;
      input.send();
      const [, chest] = [...room.state.chests.entries()].find(([, c]) => !c.open) ?? [];
      if (!chest) throw new Error("no chest");
      b.player.x = chest.x;
      b.player.y = chest.y;
      await vi.waitFor(() => expect(chest.open).toBe(true));
      await skipTo(room, DEFAULT_MATCH_TIMES.pvpAfter + 30);
      b.player.hp = 1;
      await swingAt(room, a, b, () => expect(b.player.out).toBe(true));

      await vi.waitFor(() => expect(summaries.get(b.client.sessionId)).toHaveLength(1));
      const fallen = summaries.get(b.client.sessionId)?.[0];
      expect(fallen).toMatchObject({ place: 2, heroes: 2, kills: 0, monsters: 1, bosses: 0, chests: 1 });
      expect(fallen?.level).toBe(b.player.level);
      expect(fallen?.seconds).toBeGreaterThanOrEqual(DEFAULT_MATCH_TIMES.pvpAfter + 30);

      // A is the last one standing: the winner's summary, and the room remembers.
      await vi.waitFor(() => expect(summaries.get(a.client.sessionId)).toHaveLength(1));
      expect(summaries.get(a.client.sessionId)?.[0]).toMatchObject({ place: 1, heroes: 2, kills: 1, monsters: 0 });
      expect(room.state.roster.get(a.client.sessionId)).toMatchObject({ wins: 1, kills: 1 });
      expect(room.state.roster.get(b.client.sessionId)).toMatchObject({ wins: 0, kills: 0 });
      await skipTo(room, room.state.phaseEnds);
      expect(room.state.phase).toBe(MatchPhase.lobby);
      expect(room.state.roster.get(a.client.sessionId)).toMatchObject({ wins: 1, kills: 1 });
      // One summary per match.
      expect(summaries.get(b.client.sessionId)).toHaveLength(1);
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
