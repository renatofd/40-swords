import { loadMap } from "@core/server";
import {
  ACT_MOVE,
  ActPhase,
  createRng,
  ENEMIES,
  enemyStats,
  MatchPhase,
  PLAYER_HALF,
  Player,
  type PlayerInputLike,
  type SimWorld,
  statsFor,
  stepPlayer,
  TICK_DT,
  TILE_SIZE,
} from "@game/shared";
import { describe, expect, it } from "vitest";
import {
  BOT_DODGE_BASE,
  BotBrain,
  type BotEnemy,
  type BotPersonality,
  type BotView,
  type Threat,
  threatEta,
} from "../src/bots/BotBrain";
import { Navigation } from "../src/bots/navigation";
import { createBrain } from "../src/enemies";
import { threatsOf } from "../src/enemies/botView";
import { loadWorldObjects } from "../src/world/mapObjects";

const map = loadMap("overworld", { tileSize: TILE_SIZE });
const objects = loadWorldObjects("overworld");
const nav = new Navigation(map.collision, objects.portals);
const world: SimWorld = { grid: map.collision, portals: objects.portals };
const start = map.spawns[0] ?? { x: 0, y: 0 };
const knight = statsFor("knight", 1);
const ts = TILE_SIZE;

/** True when every tile within `r` tiles of (tx, ty) is open. */
const openAround = (tx: number, ty: number, r: number) => {
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (!nav.walkable(x, y)) return false;
  return true;
};

/** The centre of an open patch (7×7 tiles) near the start, on one screen. */
function openSpot(): { x: number; y: number } {
  const [sx, sy] = nav.tileOf(start.x, start.y);
  for (let r = 0; r < 40; r++)
    for (let ty = sy - r; ty <= sy + r; ty++)
      for (let tx = sx - r; tx <= sx + r; tx++) {
        const x = (tx + 0.5) * ts;
        const y = (ty + 0.5) * ts;
        if (openAround(tx, ty, 3) && nav.screenAt(x - 3 * ts, y - 3 * ts) === nav.screenAt(x + 3 * ts, y + 3 * ts))
          return { x, y };
      }
  throw new Error("no open spot");
}

/** A tile with a wall right east of it (5 tiles tall) and open ground west, north and south. */
function wallSpot(): { x: number; y: number } {
  for (let ty = 3; ty < nav.height - 3; ty++)
    for (let tx = 3; tx < nav.width - 3; tx++) {
      let wall = true;
      for (let y = ty - 2; y <= ty + 2; y++) if (nav.walkable(tx + 1, y)) wall = false;
      if (!wall) continue;
      let open = true;
      for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 3; x <= tx; x++) if (!nav.walkable(x, y)) open = false;
      if (open) return { x: (tx + 0.5) * ts, y: (ty + 0.5) * ts };
    }
  throw new Error("no wall spot");
}

function hero(x: number, y: number): Player {
  const p = new Player();
  p.x = x;
  p.y = y;
  p.level = 1;
  p.maxHp = knight.maxHp;
  p.hp = knight.maxHp;
  p.speed = knight.speed;
  p.swingCd = knight.attackCooldownTicks;
  p.cdPct = knight.cooldownPct;
  return p;
}

const personality = (skill: number): BotPersonality => ({ boldness: 0, courage: 9, caution: 0.3, skill });

function enemy(id: string, x: number, y: number, extra: Partial<BotEnemy> = {}): BotEnemy {
  return {
    id,
    x,
    y,
    hp: 30,
    half: 6,
    defense: 0,
    damage: 4,
    danger: 0,
    aggressive: true,
    ranged: false,
    invulnerable: false,
    elite: false,
    interruptible: false,
    open: false,
    vx: 0,
    vy: 0,
    threats: [],
    ...extra,
  };
}

function viewOf(enemies: BotEnemy[], me: Player): BotView {
  return {
    tick: 1,
    phase: MatchPhase.calm,
    zone: 0,
    nav,
    arena: undefined,
    vendorScreens: [],
    hero: (id) => (id === "bot:1" ? me : undefined),
    heroes: () => [["bot:1", me]],
    enemy: (id) => enemies.find((e) => e.id === id),
    enemiesOn: () => enemies,
    hostilesNear: () => [],
    chestsOn: () => [],
    pickupsOn: () => [],
    propsOn: () => [],
    propWhole: () => false,
    vendorOn: () => undefined,
    offers: () => undefined,
    stats: () => knight,
  };
}

/** One tick: the bot's input, then the real player step. */
function tick(bot: BotBrain, view: BotView, me: Player): PlayerInputLike {
  const input = bot.think(view, me);
  stepPlayer(me, input, TICK_DT, world);
  view.tick++;
  return input;
}

/** Counts every threat's `ticks` down by one (the act goes on). */
const age = (e: BotEnemy) => {
  e.threats = e.threats.map((t) => ({ ...t, ticks: Math.max(0, t.ticks - 1) }));
};

const lane = (
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  length: number,
  width: number,
  ticks: number,
  speed: number,
  key: string,
): Threat => ({
  kind: "lane",
  x,
  y,
  dirX,
  dirY,
  length,
  width,
  ticks,
  speed,
  key,
});

describe("bot dodging", () => {
  it("steps out of a lancer's wind-up lane within 8 ticks", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    const lancer = enemy("e1", spot.x - 40, spot.y, {
      threats: [lane(spot.x - 40, spot.y, 1, 0, (160 / 30) * 16 + 6, 12, 12, 160 / 30, "e1:1")],
    });
    const view = viewOf([lancer], me);
    const bot = new BotBrain("bot:1", createRng(1), personality(1));
    const [t0] = lancer.threats;
    if (!t0) throw new Error("no threat");
    expect(threatEta(t0, me.x, me.y)).toBeGreaterThanOrEqual(0);
    let out = -1;
    for (let i = 0; i < 12 && out < 0; i++) {
      tick(bot, view, me);
      age(lancer);
      if (threatEta(t0, me.x, me.y) < 0) out = i + 1;
    }
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThanOrEqual(8);
    expect(bot.dodges).toBe(1);
  });

  it("steps out of a strike zone", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    const raider = enemy("e1", spot.x, spot.y - 14, {
      threats: [{ kind: "zone", x: spot.x, y: spot.y, radius: 14, ticks: 10, key: "e1:1" }],
    });
    const view = viewOf([raider], me);
    const bot = new BotBrain("bot:1", createRng(2), personality(1));
    for (let i = 0; i < 10; i++) {
      tick(bot, view, me);
      age(raider);
    }
    expect(Math.hypot(me.x - spot.x, me.y - spot.y)).toBeGreaterThanOrEqual(14 + PLAYER_HALF);
  });

  it("swings at its target in the wind-up instead of stepping away (a blow interrupts)", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    const raider = enemy("e1", spot.x, spot.y - 14, {
      interruptible: true,
      threats: [{ kind: "zone", x: spot.x, y: spot.y, radius: 14, ticks: 10, key: "e1:1" }],
    });
    const view = viewOf([raider], me);
    const bot = new BotBrain("bot:1", createRng(9), personality(1));
    // It picks the fight first (a decision tick), then swings north at once.
    const input = tick(bot, view, me);
    expect(bot.mode).toBe("fight");
    expect(input).toEqual({ moveX: 0, moveY: -1, attack: 1 });
    expect(bot.dodges).toBe(0);
    // An elite (or a boss) holds on: it steps out instead.
    const me2 = hero(spot.x, spot.y);
    const elite = enemy("e2", spot.x, spot.y - 14, {
      elite: true,
      threats: [{ kind: "zone", x: spot.x, y: spot.y, radius: 14, ticks: 10, key: "e2:1" }],
    });
    const bot2 = new BotBrain("bot:1", createRng(9), personality(1));
    expect(tick(bot2, viewOf([elite], me2), me2).attack).toBe(0);
    expect(bot2.dodges).toBe(1);
  });

  it("never dodges into a wall", () => {
    const spot = wallSpot();
    const me = hero(spot.x, spot.y);
    // A zone centred west of it: east (into the wall) would be the quickest way out.
    const shroom = enemy("e1", spot.x - 10, spot.y, {
      threats: [{ kind: "zone", x: spot.x - 10, y: spot.y, radius: 30, ticks: 12, key: "e1:1" }],
    });
    const view = viewOf([shroom], me);
    const bot = new BotBrain("bot:1", createRng(3), personality(1));
    let dodging = 0;
    for (let i = 0; i < 16; i++) {
      const input = tick(bot, view, me);
      age(shroom);
      if (bot.isDodging(view.tick - 1)) dodging++;
      const [tx, ty] = nav.tileOf(me.x + input.moveX * 12, me.y + input.moveY * 12);
      expect(nav.walkable(tx, ty)).toBe(true);
      expect(nav.walkable(...nav.tileOf(me.x, me.y))).toBe(true);
    }
    expect(dodging).toBeGreaterThan(0);
  });

  it("never stands still while a threat it reacted to is on it", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    // A big ring tell that keeps coming (a new key every 8 ticks), centred on the bot's start.
    const shroom = enemy("e1", spot.x, spot.y);
    const view = viewOf([shroom], me);
    const bot = new BotBrain("bot:1", createRng(4), personality(1));
    for (let i = 0; i < 60; i++) {
      shroom.threats = [{ kind: "zone", x: spot.x, y: spot.y, radius: 40, ticks: 8 - (i % 8), key: `e1:${i >> 3}` }];
      const inside = shroom.threats.some((t) => threatEta(t, me.x, me.y) >= 0);
      const input = tick(bot, view, me);
      if (inside) expect(input.moveX !== 0 || input.moveY !== 0).toBe(true);
    }
  });

  it(`reacts to about ${Math.round((BOT_DODGE_BASE + 0.25) * 100)}% of threats with skill 0.25`, () => {
    const spot = openSpot();
    const seeds = createRng(5);
    let reacted = 0;
    for (let n = 0; n < 200; n++) {
      const me = hero(spot.x, spot.y);
      const e = enemy("e1", spot.x, spot.y - 14, {
        threats: [{ kind: "zone", x: spot.x, y: spot.y, radius: 14, ticks: 10, key: `e1:${n}` }],
      });
      const bot = new BotBrain("bot:1", createRng(Math.floor(seeds() * 2 ** 32)), personality(0.25));
      tick(bot, viewOf([e], me), me);
      if (bot.dodges > 0) reacted++;
    }
    expect(reacted / 200).toBeGreaterThanOrEqual(0.5);
    expect(reacted / 200).toBeLessThanOrEqual(0.7);
  });

  it("circles a target it can't hurt, never swinging, moving every tick", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    const witch = enemy("e1", spot.x + 30, spot.y, { hp: 10, damage: 2, aggressive: false });
    const view = viewOf([witch], me);
    const bot = new BotBrain("bot:1", createRng(6), personality(1));
    // It picks the fight while the target can be hurt...
    for (let i = 0; i < 6; i++) tick(bot, view, me);
    expect(bot.mode).toBe("fight");
    // ...then the target turns to stone.
    witch.invulnerable = true;
    for (let i = 0; i < 60; i++) {
      const input = tick(bot, view, me);
      expect(input.attack).toBe(0);
      expect(input.moveX !== 0 || input.moveY !== 0).toBe(true);
    }
    expect(bot.mode).toBe("fight");
    expect(Math.hypot(me.x - witch.x, me.y - witch.y)).toBeGreaterThan(24);
  });

  it("goes round a lancer facing it, and swings only from outside its guard", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    // The lancer, 40 px east, faces west (at the bot).
    const lancer = enemy("e1", spot.x + 40, spot.y, { hp: 40, damage: 4, block: { fx: -1, fy: 0 } });
    const view = viewOf([lancer], me);
    const bot = new BotBrain("bot:1", createRng(7), personality(1));
    const inCone = () => {
      const ax = me.x - lancer.x;
      const ay = me.y - lancer.y;
      return (-1 * ax + 0 * ay) / Math.hypot(ax, ay) >= 0.5;
    };
    let flanked = false;
    let swings = 0;
    for (let i = 0; i < 60; i++) {
      const was = inCone();
      const input = tick(bot, view, me);
      if (input.attack) {
        swings++;
        expect(was).toBe(false);
      }
      if (!inCone() && Math.hypot(me.x - lancer.x, me.y - lancer.y) < 40) flanked = true;
    }
    expect(flanked).toBe(true);
    expect(swings).toBeGreaterThan(0);
  });

  it("steps out of a spider's hop lane before it jumps", () => {
    const spot = openSpot();
    const me = hero(spot.x, spot.y);
    const crouch = ENEMIES.spider.hop?.crouch ?? 8;
    const air = ENEMIES.spider.hop?.air ?? 8;
    const spd = ENEMIES.spider.speed / 30;
    // The real tell: a spider crouching 24 px west of the bot, about to jump east.
    const brain = createBrain(
      "spider",
      ENEMIES.spider,
      enemyStats("spider", 0, false),
      0,
      { x: 0, y: 0, width: 1, height: 1 },
      undefined,
      createRng(1),
    );
    brain.actSlot = ACT_MOVE;
    brain.actPhase = ActPhase.windup;
    brain.actLeft = crouch;
    brain.dirX = 1;
    brain.dirY = 0;
    brain.actSeq = 1;
    const body = { x: spot.x - 24, y: spot.y, hp: 36, maxHp: 36, elite: false, facing: 0 };
    const threats = threatsOf("e1", body as never, brain, map.collision);
    expect(threats).toHaveLength(1);
    const [hop] = threats;
    if (hop?.kind !== "lane") throw new Error("not a lane");
    expect(hop.length).toBeCloseTo(spd * air + brain.stats.half);
    expect(hop.ticks).toBe(crouch);
    expect(threatEta(hop, me.x, me.y)).toBeGreaterThanOrEqual(0);
    const spider = enemy("e1", body.x, body.y, { threats });
    const view = viewOf([spider], me);
    const bot = new BotBrain("bot:1", createRng(8), personality(1));
    for (let i = 0; i < crouch; i++) {
      tick(bot, view, me);
      age(spider);
    }
    expect(threatEta(hop, me.x, me.y)).toBe(-1);
  });
});
