import { boxHitsSolid, type CollisionGrid } from "@core/shared";
import {
  ACT_GAP_TICKS,
  ACT_MOVE,
  ACT_STONE,
  ActPhase,
  AIM_LOCK_TICKS,
  actPhase,
  actSlot,
  actStunned,
  createRng,
  ENEMIES,
  ENEMY_KINDS,
  type EnemyDef,
  type EnemyKind,
  encodeAct,
  enemyStats,
  facingVector,
  LOS_RECHECK_TICKS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  TILE_SIZE,
  WAKE_SETTLE_TICKS,
} from "@game/shared";
import { describe, expect, it } from "vitest";
import {
  contactActive,
  createBrain,
  type EnemyBody,
  type EnemyBrain,
  type EnemyEvent,
  type EnemyHost,
  type HeroRef,
  hitEnemy,
  type Rect,
  stepEnemyAi,
  untargetable,
} from "../src/enemies";

/** One screen; tiles in `solid` (and everything outside the screen) block. */
const HOME: Rect = { x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
const COLS = SCREEN_WIDTH / TILE_SIZE;
const ROWS = SCREEN_HEIGHT / TILE_SIZE;

interface TestHost extends EnemyHost {
  heroes: HeroRef[];
  /** Solid tiles as "tx,ty" (mutable: tests open and close walls). */
  solid: Set<string>;
  dead: Set<string>;
}

/** A fake room: heroes standing where the test puts them, a mutable grid, a seeded generator. */
function makeHost(seed = 1, heroes: HeroRef[] = []): TestHost {
  const solid = new Set<string>();
  const grid: CollisionGrid = {
    width: COLS,
    height: ROWS,
    tileSize: TILE_SIZE,
    isSolid: (tx, ty) => tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || solid.has(`${tx},${ty}`),
  };
  const rng = createRng(seed);
  const host: TestHost = {
    heroes,
    solid,
    dead: new Set(),
    grid,
    rng,
    nearestHero(x, y, home, range) {
      if (range <= 0) return undefined;
      let best: HeroRef | undefined;
      let bestDist = range * range;
      for (const h of host.heroes) {
        if (h.x < home.x || h.y < home.y || h.x >= home.x + home.width || h.y >= home.y + home.height) continue;
        const d = (h.x - x) ** 2 + (h.y - y) ** 2;
        if (d <= bestDist) {
          bestDist = d;
          best = h;
        }
      }
      return best;
    },
    freeSpot(home, half, x, y, radius) {
      const margin = half + 2;
      for (let attempt = 0; attempt < 12; attempt++) {
        const sx = x + (rng() * 2 - 1) * radius;
        const sy = y + (rng() * 2 - 1) * radius;
        if (sx < home.x + margin || sy < home.y + margin) continue;
        if (sx > home.x + home.width - margin || sy > home.y + home.height - margin) continue;
        if (!boxHitsSolid(grid, sx, sy, margin)) return { x: sx, y: sy };
      }
      return undefined;
    },
    enemyAlive: (id) => !host.dead.has(id),
  };
  return host;
}

/** Fills tile columns/rows: `wall(host, tx0, ty0, tx1, ty1)` inclusive. */
function wall(host: TestHost, tx0: number, ty0: number, tx1 = tx0, ty1 = ty0) {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) host.solid.add(`${tx},${ty}`);
}

interface Mob {
  body: EnemyBody;
  brain: EnemyBrain;
}

function spawn(
  kind: EnemyKind,
  x: number,
  y: number,
  host: EnemyHost,
  options: { elite?: boolean; def?: Partial<EnemyDef> } = {},
): Mob {
  const def = { ...ENEMIES[kind], ...options.def };
  const stats = enemyStats(kind, 0, options.elite ?? false);
  const body: EnemyBody = {
    x,
    y,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    facing: 2,
    hurt: 0,
    act: 0,
    elite: options.elite ?? false,
  };
  return { body, brain: createBrain(kind, def, stats, 0, HOME, undefined, host.rng) };
}

/** Steps once; returns this tick's events. */
function step(mob: Mob, host: EnemyHost): EnemyEvent[] {
  const out: EnemyEvent[] = [];
  stepEnemyAi(mob.body, mob.brain, host, out);
  return out;
}

/** Only attack `slot` is ready (the others wait). */
function only(mob: Mob, slot: number) {
  mob.brain.attackCd = mob.brain.attackCd.map((_, i) => (i === slot ? 0 : 9999));
}

const shotsOf = (events: EnemyEvent[]) => events.filter((e) => e.type === "shots");

describe("enemy AI (enemies/)", () => {
  it("is deterministic: every kind against a moving target gives the same trace twice", () => {
    const run = () => {
      const trace: number[] = [];
      const events: string[] = [];
      for (const kind of ENEMY_KINDS) {
        const hero = { id: "h", x: 200, y: 90 };
        const host = makeHost(42, [hero]);
        wall(host, 9, 3, 9, 5);
        const mob = spawn(kind, 100, 90, host);
        for (let t = 0; t < 600; t++) {
          hero.x = 160 + Math.round(Math.cos(t / 40) * 100);
          hero.y = 88 + Math.round(Math.sin(t / 25) * 60);
          const out = step(mob, host);
          trace.push(mob.body.x, mob.body.y, mob.body.facing, mob.body.act);
          for (const e of out) events.push(JSON.stringify(e));
          if (t % 97 === 0) hitEnemy(mob.body, mob.brain, 1, hero.x, hero.y, 200);
        }
      }
      return { trace, events };
    };
    const a = run();
    expect(a.trace.every(Number.isFinite)).toBe(true);
    expect(a.events.length).toBeGreaterThan(20);
    expect(run()).toEqual(a);
  });

  it("wind-up: a skeleton shows its wind-up exactly windupTicks, fires on the action tick, recovers, then pauses", () => {
    const host = makeHost(1, [{ id: "h", x: 170, y: 90 }]);
    const mob = spawn("skeleton", 100, 90, host);
    const attack = mob.brain.def.attacks[0];
    if (attack?.type !== "aimed") throw new Error("skeleton throws");
    only(mob, 0);
    const acts: number[] = [];
    const fired: number[] = [];
    for (let t = 0; t < 40 && (t === 0 || mob.body.act !== 0); t++) {
      if (shotsOf(step(mob, host)).length > 0) fired.push(t);
      acts.push(mob.body.act);
    }
    const w = attack.windupTicks;
    const r = attack.recoverTicks;
    expect(acts.slice(0, w)).toEqual(Array(w).fill(encodeAct(0, ActPhase.windup)));
    expect(acts[w]).toBe(encodeAct(0, ActPhase.action));
    expect(fired).toEqual([w]);
    expect(acts.slice(w + 1, w + 1 + r)).toEqual(Array(r).fill(encodeAct(0, ActPhase.recover)));
    expect(acts[w + 1 + r]).toBe(0);
    expect(acts).toHaveLength(w + r + 2);
    expect(mob.brain.gap).toBe(ACT_GAP_TICKS);
  });

  it("aim lock: the shot flies where the target stood AIM_LOCK_TICKS before the release", () => {
    const hero = { id: "h", x: 170, y: 90 };
    const host = makeHost(1, [hero]);
    const mob = spawn("skeleton", 100, 90, host);
    only(mob, 0);
    let locked: number | undefined;
    let shot: number | undefined;
    for (let t = 0; t < 20 && shot === undefined; t++) {
      hero.y += 2; // sidesteps the whole wind-up
      const out = shotsOf(step(mob, host));
      if (mob.brain.actPhase === ActPhase.windup && mob.brain.actLeft === AIM_LOCK_TICKS)
        locked = Math.atan2(mob.brain.aimY, mob.brain.aimX);
      if (out[0]?.type === "shots") shot = out[0].angles[0];
    }
    expect(locked).toBeDefined();
    expect(shot).toBeCloseTo(locked as number, 10);
    const now = Math.atan2(hero.y - mob.body.y, hero.x - mob.body.x);
    expect(Math.abs((shot as number) - now)).toBeGreaterThan(0.05);
  });

  describe("priority and gates", () => {
    it("nothing starts outside `within`", () => {
      const host = makeHost(1, [{ id: "h", x: 120, y: 90 }]);
      const mob = spawn("axeman", 100, 90, host, { def: { behaviour: "guard" } });
      only(mob, 0);
      for (let t = 0; t < 60; t++) step(mob, host);
      expect(mob.brain.actSeq).toBe(0); // 20 px < 32
      host.heroes[0] = { id: "h", x: 160, y: 90 };
      step(mob, host);
      expect(actSlot(mob.body.act)).toBe(0);
    });

    it("a lancer lines up (one axis at a time) and charges only along its row or column", () => {
      const host = makeHost(1, [{ id: "h", x: 180, y: 100 }]);
      const mob = spawn("lancer", 60, 40, host);
      only(mob, 0);
      let started = false;
      for (let t = 0; t < 200 && !started; t++) {
        step(mob, host);
        expect(mob.brain.vx === 0 || mob.brain.vy === 0).toBe(true);
        if (mob.brain.actSeq > 0) {
          started = true;
          const hero = host.heroes[0] as HeroRef;
          expect(Math.min(Math.abs(hero.x - mob.body.x), Math.abs(hero.y - mob.body.y))).toBeLessThanOrEqual(6);
        }
      }
      expect(started).toBe(true);
      for (let t = 0; t < 40; t++) {
        step(mob, host);
        expect(mob.brain.vx === 0 || mob.brain.vy === 0).toBe(true);
      }
    });

    it("phase-gated attacks swap at phase2At", () => {
      const pick = (hpShare: number) => {
        const host = makeHost(1, [{ id: "h", x: 200, y: 90 }]);
        const mob = spawn("warden", 100, 90, host);
        mob.body.hp = Math.floor(mob.body.maxHp * hpShare);
        mob.brain.attackCd = mob.brain.attackCd.map((_, i) => (i === 2 || i === 3 ? 0 : 9999));
        step(mob, host);
        return actSlot(mob.body.act);
      };
      expect(pick(1)).toBe(2);
      expect(pick(0.5)).toBe(3);
    });

    it("no aimed start through a wall; the line is checked again after LOS_RECHECK_TICKS", () => {
      const host = makeHost(1, [{ id: "h", x: 180, y: 88 }]);
      wall(host, 8, 4, 8, 6); // a column between them
      const mob = spawn("skeleton", 100, 88, host, { def: { behaviour: "guard" } });
      only(mob, 0);
      for (let t = 0; t < 30; t++) step(mob, host);
      expect(mob.brain.actSeq).toBe(0);
      host.solid.clear();
      let waited = 0;
      while (mob.brain.actSeq === 0 && waited < 20) {
        step(mob, host);
        waited++;
      }
      expect(mob.brain.actSeq).toBe(1);
      expect(waited).toBeLessThanOrEqual(LOS_RECHECK_TICKS);
    });
  });

  it("cardinal: closes the smaller gap first (to under 3 px), then moves along the line, with no axis jitter", () => {
    const host = makeHost(1, [{ id: "h", x: 160, y: 90 }]);
    const mob = spawn("lancer", 100, 60, host, { def: { attacks: [] } });
    const axes: string[] = [];
    for (let t = 0; t < 80; t++) {
      step(mob, host);
      const { vx, vy } = mob.brain;
      expect(vx === 0 || vy === 0).toBe(true);
      if (vx !== 0 || vy !== 0) {
        const axis = vx !== 0 ? "x" : "y";
        if (axes.at(-1) !== axis) axes.push(axis);
        if (axis === "x") expect(Math.abs(90 - mob.body.y)).toBeLessThan(3);
      }
    }
    expect(axes).toEqual(["y", "x"]);
    expect(Math.abs(160 - mob.body.x)).toBeLessThanOrEqual(4 + 2);
  });

  it("lancer facing lags: a hero circling it is outside the guard often and lands an unguarded hit soon", () => {
    const hero = { id: "h", x: 140, y: 90 };
    const host = makeHost(1, [hero]);
    const mob = spawn("lancer", 100, 90, host, { def: { behaviour: "guard", attacks: [] } });
    mob.brain.stats = { ...mob.brain.stats, speed: 0 };
    mob.body.hp = mob.body.maxHp = 100000;
    let outside = 0;
    let firstOpen = -1;
    const ticks = 300;
    for (let t = 0; t < ticks; t++) {
      const angle = (t * 80) / 30 / 40;
      hero.x = 100 + Math.cos(angle) * 40;
      hero.y = 90 + Math.sin(angle) * 40;
      step(mob, host);
      const [fx, fy] = facingVector(mob.body.facing);
      if ((fx * (hero.x - 100) + fy * (hero.y - 90)) / 40 < 0.5) outside++;
      if (firstOpen < 0 && !hitEnemy(mob.body, mob.brain, 10, hero.x, hero.y, 0).blocked) firstOpen = t;
    }
    expect(outside / ticks).toBeGreaterThanOrEqual(0.3);
    expect(firstOpen).toBeGreaterThanOrEqual(0);
    expect(firstOpen).toBeLessThan(30);
  });

  it("pinned (guard, speed 0, cardinal kept): never moves and never yields NaN", () => {
    for (const kind of ["lancer", "scorpion", "lurker", "wolf", "spider", "archer"] as const) {
      const host = makeHost(1, [{ id: "h", x: 130, y: 90 }]);
      const mob = spawn(kind, 120, 90, host, { def: { behaviour: "guard", attacks: [] } });
      mob.brain.stats = { ...mob.brain.stats, speed: 0 };
      for (let t = 0; t < 300; t++) step(mob, host);
      expect([mob.body.x, mob.body.y]).toEqual([120, 90]);
    }
  });

  describe("kite", () => {
    it("holds [min-2, max+2] from a still target, keeps moving", () => {
      const host = makeHost(1, [{ id: "h", x: 160, y: 88 }]);
      const mob = spawn("archer", 80, 88, host, { def: { attacks: [] } });
      const kite = mob.brain.def.kite;
      if (!kite) throw new Error("archer kites");
      let still = 0;
      for (let t = 0; t < 600; t++) {
        const [x, y] = [mob.body.x, mob.body.y];
        step(mob, host);
        const d = Math.hypot(160 - mob.body.x, 88 - mob.body.y);
        expect(d).toBeGreaterThanOrEqual(kite.min - 2);
        expect(d).toBeLessThanOrEqual(kite.max + 2);
        still = mob.body.x === x && mob.body.y === y ? still + 1 : 0;
        expect(still).toBeLessThan(2);
      }
    });

    it("a hero walking at it pushes it to the edge, but it never leaves home nor stands still 2 ticks", () => {
      const hero = { id: "h", x: 160, y: 88 };
      const host = makeHost(3, [hero]);
      const mob = spawn("archer", 120, 88, host, { def: { attacks: [] } });
      let still = 0;
      for (let t = 0; t < 900; t++) {
        const dx = mob.body.x - hero.x;
        const dy = mob.body.y - hero.y;
        const d = Math.hypot(dx, dy);
        if (d > 12) {
          hero.x += (dx / d) * (80 / 30);
          hero.y += (dy / d) * (80 / 30);
        }
        const [x, y] = [mob.body.x, mob.body.y];
        step(mob, host);
        const half = mob.brain.stats.half;
        expect(mob.body.x).toBeGreaterThan(half);
        expect(mob.body.y).toBeGreaterThan(half);
        expect(mob.body.x).toBeLessThan(SCREEN_WIDTH - half);
        expect(mob.body.y).toBeLessThan(SCREEN_HEIGHT - half);
        still = mob.body.x === x && mob.body.y === y ? still + 1 : 0;
        expect(still).toBeLessThan(2);
      }
    });

    it("cobra (cardinal kite): stands still only lined up and inside [min, max]", () => {
      const host = makeHost(1, [{ id: "h", x: 200, y: 120 }]);
      const mob = spawn("cobra", 80, 40, host, { def: { attacks: [] } });
      const { kite, cardinal } = mob.brain.def;
      if (!kite || cardinal === undefined) throw new Error("cobra kites on lines");
      let stood = 0;
      for (let t = 0; t < 400; t++) {
        const [x, y] = [mob.body.x, mob.body.y];
        step(mob, host);
        if (mob.body.x !== x || mob.body.y !== y) continue;
        stood++;
        const dx = Math.abs(200 - x);
        const dy = Math.abs(120 - y);
        expect(Math.min(dx, dy)).toBeLessThanOrEqual(cardinal);
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(kite.min);
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(kite.max);
      }
      expect(stood).toBeGreaterThan(100);
    });
  });

  it("bounce: reflects off pillars and the home edge, stays diagonal and home; a hit sends it away", () => {
    const host = makeHost(5);
    wall(host, 5, 3, 6, 4);
    wall(host, 13, 6, 14, 7);
    wall(host, 9, 9);
    const mob = spawn("wisp", 60, 40, host);
    const r = Math.SQRT1_2;
    let lastFlipX = -9;
    let lastFlipY = -9;
    let flips = 0;
    for (let t = 0; t < 3000; t++) {
      const [dx, dy] = [mob.brain.dirX, mob.brain.dirY];
      step(mob, host);
      expect(Math.abs(mob.brain.dirX)).toBeCloseTo(r, 10);
      expect(Math.abs(mob.brain.dirY)).toBeCloseTo(r, 10);
      expect(boxHitsSolid(host.grid, mob.body.x, mob.body.y, mob.brain.stats.half)).toBe(false);
      if (mob.brain.dirX !== dx) {
        expect(t - lastFlipX).toBeGreaterThan(1);
        lastFlipX = t;
        flips++;
      }
      if (mob.brain.dirY !== dy) {
        expect(t - lastFlipY).toBeGreaterThan(1);
        lastFlipY = t;
        flips++;
      }
    }
    expect(flips).toBeGreaterThan(20);
    hitEnemy(mob.body, mob.brain, 1, mob.body.x - 10, mob.body.y - 5, 200);
    expect([mob.brain.dirX, mob.brain.dirY]).toEqual([r, r]);
    expect(mob.brain.knockTicks).toBe(0);
  });

  describe("hop", () => {
    it("a sleeping spider stays put with no hero around", () => {
      const host = makeHost(1);
      const mob = spawn("spider", 120, 90, host);
      for (let t = 0; t < 600; t++) step(mob, host);
      expect([mob.body.x, mob.body.y, mob.body.act]).toEqual([120, 90, 0]);
    });

    it("with a hero near, it crouches facing the hero, then jumps at it; awake never runs out mid-hop", () => {
      const host = makeHost(1, [{ id: "h", x: 120, y: 160 }]);
      const mob = spawn("spider", 120, 90, host);
      const hop = mob.brain.def.hop;
      if (!hop) throw new Error("spider hops");
      const acts: number[] = [];
      const ys: number[] = [];
      for (let t = 0; t < hop.crouch + hop.air; t++) {
        step(mob, host);
        acts.push(mob.body.act);
        ys.push(mob.body.y);
      }
      expect(acts.slice(0, hop.crouch)).toEqual(Array(hop.crouch).fill(encodeAct(ACT_MOVE, ActPhase.windup)));
      expect(mob.body.facing).toBe(2);
      expect(ys[hop.crouch - 1]).toBe(90);
      expect(ys.at(-1)).toBeGreaterThan(90 + 20);
      // The hero walks away: it finishes the hop before it dozes off.
      host.heroes.length = 0;
      for (let t = 0; t < WAKE_SETTLE_TICKS * 2; t++) {
        step(mob, host);
        if (mob.brain.actSlot === ACT_MOVE) expect(mob.brain.awake).toBeGreaterThan(0);
      }
      expect(mob.brain.awake).toBe(0);
    });

    it("a sleeping spider hit from range wakes up", () => {
      const host = makeHost(1, [{ id: "h", x: 120, y: 90 + 125 }]);
      const mob = spawn("spider", 120, 90, host);
      step(mob, host);
      expect(mob.brain.awake).toBe(0);
      hitEnemy(mob.body, mob.brain, 1, 120, 200, 0);
      expect(mob.brain.awake).toBe(WAKE_SETTLE_TICKS);
    });
  });

  /** A lancer at the right edge of its home charging into it. */
  function lancerAtWall() {
    const host = makeHost(1, [{ id: "h", x: 300, y: 88 }]);
    const mob = spawn("lancer", 240, 88, host);
    only(mob, 0);
    const charge = mob.brain.def.attacks[0];
    if (charge?.type !== "charge" || !charge.stunTicks) throw new Error("lancer charges");
    for (let t = 0; t < 60 && !mob.brain.stunned; t++) step(mob, host);
    return { host, mob, charge };
  }

  describe("charge", () => {
    it("into a wall: stunned for stunTicks (recover + the stunned bit)", () => {
      const { host, mob, charge } = lancerAtWall();
      expect(mob.brain.stunned).toBe(true);
      let n = 0;
      while (actStunned(mob.body.act) && n < 100) {
        expect(actPhase(mob.body.act)).toBe(ActPhase.recover);
        step(mob, host);
        n++;
      }
      expect(n).toBe(charge.stunTicks);
      expect(mob.body.act).toBe(0);
    });

    it("bounces count down with reflections", () => {
      const host = makeHost(1, [{ id: "h", x: 140, y: 88 }]);
      const mob = spawn("matriarch", 60, 88, host);
      mob.brain.home = { x: 0, y: 0, width: 200, height: SCREEN_HEIGHT };
      only(mob, 0);
      const seen: number[] = [];
      for (let t = 0; t < 80; t++) {
        step(mob, host);
        if (mob.brain.actPhase === ActPhase.action) seen.push(mob.brain.bounces * Math.sign(mob.brain.aimX));
      }
      expect(seen[0]).toBe(2);
      expect(seen).toContain(-1);
      expect(mob.body.x).toBeLessThan(150);
    });

    it("knockback cancels a normal kind's charge (full cooldown)", () => {
      const host = makeHost(1, [{ id: "h", x: 180, y: 88 }]);
      const mob = spawn("scorpion", 100, 88, host);
      only(mob, 0);
      while (mob.brain.actPhase !== ActPhase.action) step(mob, host);
      step(mob, host);
      hitEnemy(mob.body, mob.brain, 1, mob.body.x + 10, mob.body.y, 200);
      expect(mob.brain.actSlot).toBe(-1);
      expect(mob.brain.attackCd[0]).toBe(mob.brain.def.attacks[0]?.cooldownTicks);
      expect(mob.body.act).toBe(0);
    });
  });

  describe("leap", () => {
    function colossus(seed: number, hero: HeroRef) {
      const host = makeHost(seed, [hero]);
      const mob = spawn("colossus", 60, 88, host);
      only(mob, 1);
      return { host, mob };
    }

    it("in the air: no contact, untargetable; the area lands at the target's spot", () => {
      const { host, mob } = colossus(1, { id: "h", x: 180, y: 100 });
      const leap = mob.brain.def.attacks[1];
      if (leap?.type !== "leap") throw new Error("colossus leaps");
      let area: EnemyEvent | undefined;
      let airborne = 0;
      for (let t = 0; t < leap.windupTicks + leap.ticks + 2; t++) {
        const out = step(mob, host);
        if (untargetable(mob.brain)) {
          airborne++;
          expect(contactActive(mob.brain)).toBe(false);
        }
        area ??= out.find((e) => e.type === "area");
      }
      expect(airborne).toBe(leap.ticks - 1);
      expect(area).toMatchObject({ type: "area", x: 180, y: 100, radius: leap.radius });
      expect([mob.body.x, mob.body.y]).toEqual([180, 100]);
      expect(contactActive(mob.brain)).toBe(true);
    });

    it("never lands in a wall (target next to one, 200 seeds)", () => {
      for (let seed = 1; seed <= 200; seed++) {
        const r = createRng(seed);
        const tx = 8 + Math.floor(r() * 8);
        const ty = 2 + Math.floor(r() * 6);
        const hero = { id: "h", x: tx * TILE_SIZE - 6 - Math.floor(r() * 4), y: ty * TILE_SIZE + Math.floor(r() * 16) };
        const { host, mob } = colossus(seed, hero);
        wall(host, tx, ty, tx + 1, ty + 1);
        const leap = mob.brain.def.attacks[1];
        if (leap?.type !== "leap") throw new Error("colossus leaps");
        for (let t = 0; t <= leap.windupTicks; t++) step(mob, host);
        expect(boxHitsSolid(host.grid, mob.brain.destX, mob.brain.destY, mob.brain.stats.half)).toBe(false);
      }
    });

    it("with no free landing it goes straight to recover", () => {
      const { host, mob } = colossus(1, { id: "h", x: 170, y: 88 });
      wall(host, 6, 0, 13, ROWS - 1);
      const leap = mob.brain.def.attacks[1];
      if (leap?.type !== "leap") throw new Error("colossus leaps");
      const events: EnemyEvent[] = [];
      for (let t = 0; t <= leap.windupTicks; t++) events.push(...step(mob, host));
      expect(mob.brain.actPhase).toBe(ActPhase.recover);
      expect(events).toEqual([]);
      expect([mob.body.x, mob.body.y]).toEqual([60, 88]);
    });
  });

  describe("interrupt", () => {
    function windup(kind: EnemyKind, slot: number, elite = false) {
      const host = makeHost(1, [{ id: "h", x: 170, y: 90 }]);
      const mob = spawn(kind, 100, 90, host, { elite });
      mob.body.hp = mob.body.maxHp = 100000;
      only(mob, slot);
      step(mob, host);
      expect(actPhase(mob.body.act)).toBe(ActPhase.windup);
      return mob;
    }

    it("a blow in a normal enemy's wind-up cancels it (half cooldown)", () => {
      const mob = windup("skeleton", 0);
      hitEnemy(mob.body, mob.brain, 1, 120, 90, 200);
      expect(mob.body.act).toBe(0);
      expect(mob.brain.attackCd[0]).toBe(Math.floor((mob.brain.def.attacks[0]?.cooldownTicks ?? 0) / 2));
    });

    it("elites, mini-bosses and bosses keep going", () => {
      for (const [kind, slot, elite] of [
        ["skeleton", 0, true],
        ["hexer", 1, false],
        ["warden", 2, false],
      ] as const) {
        const mob = windup(kind, slot, elite);
        hitEnemy(mob.body, mob.brain, 1, 120, 90, 200);
        expect(actPhase(mob.body.act)).toBe(ActPhase.windup);
        expect(mob.brain.knockTicks).toBe(0);
      }
    });

    it("a lancer hit from the front is not cancelled (guarded: reduced, no knockback)", () => {
      const host = makeHost(1, [{ id: "h", x: 180, y: 90 }]);
      const mob = spawn("lancer", 100, 90, host);
      only(mob, 0);
      step(mob, host);
      expect(actPhase(mob.body.act)).toBe(ActPhase.windup);
      expect(mob.body.facing).toBe(0);
      const hp = mob.body.hp;
      const hit = hitEnemy(mob.body, mob.brain, 20, 150, 90, 200);
      expect(hit).toEqual({ amount: Math.round(20 * (mob.brain.def.block ?? 0)), blocked: true });
      expect(mob.body.hp).toBe(hp - hit.amount);
      expect(actPhase(mob.body.act)).toBe(ActPhase.windup);
      expect(mob.brain.knockTicks).toBe(0);
      // From behind: full damage, interrupted.
      expect(hitEnemy(mob.body, mob.brain, 20, 50, 90, 200)).toEqual({ amount: 20, blocked: false });
      expect(mob.body.act).toBe(0);
    });
  });

  describe("wake", () => {
    it("a bat dozes off WAKE_SETTLE_TICKS after the last hero left", () => {
      const host = makeHost(1, [{ id: "h", x: 130, y: 90 }]);
      const mob = spawn("bat", 120, 90, host);
      step(mob, host);
      expect(mob.brain.awake).toBe(WAKE_SETTLE_TICKS);
      host.heroes.length = 0;
      for (let t = 0; t < WAKE_SETTLE_TICKS; t++) step(mob, host);
      expect(mob.brain.awake).toBe(0);
      const at = [mob.body.x, mob.body.y];
      for (let t = 0; t < 60; t++) step(mob, host);
      expect([mob.body.x, mob.body.y]).toEqual(at);
    });

    it("a sleeping bat that is knocked back still slides, and the knockback runs out", () => {
      const host = makeHost(1);
      const mob = spawn("bat", 120, 90, host);
      mob.brain.knockX = 120;
      mob.brain.knockY = 0;
      mob.brain.knockTicks = 6;
      for (let t = 0; t < 10; t++) step(mob, host);
      expect(mob.body.x).toBeCloseTo(120 + (120 * 6) / 30, 6);
      expect(mob.brain.knockTicks).toBe(0);
      expect(mob.brain.awake).toBe(0);
    });
  });

  it("a stun survives blows: a stunned lancer is pushed but stays stunned for stunTicks", () => {
    const { host, mob, charge } = lancerAtWall();
    let n = 0;
    while (mob.brain.stunned && n < 100) {
      const hit = hitEnemy(mob.body, mob.brain, 1, mob.body.x + 8, mob.body.y, 200);
      expect(hit.blocked).toBe(false);
      expect(mob.brain.knockTicks).toBeGreaterThan(0);
      step(mob, host);
      n++;
    }
    expect(n).toBe(charge.stunTicks);
  });

  it("summon cap: no summon while `max` minions live; one dies, it summons again", () => {
    const host = makeHost(3, [{ id: "h", x: 200, y: 90 }]);
    const mob = spawn("warden", 100, 90, host);
    const slot = mob.brain.def.attacks.findIndex((a) => a.type === "summon");
    const summon = mob.brain.def.attacks[slot];
    if (summon?.type !== "summon") throw new Error("warden summons");
    only(mob, slot);
    for (let i = 0; i < summon.max; i++) mob.brain.minions.add(`m${i}`);
    for (let t = 0; t < 30; t++) step(mob, host);
    expect(mob.brain.actSeq).toBe(0);
    host.dead.add("m0");
    const events: EnemyEvent[] = [];
    for (let t = 0; t < 30; t++) events.push(...step(mob, host));
    expect(mob.brain.actSeq).toBe(1);
    expect(events).toEqual([{ type: "summon", kind: summon.kind, spots: [expect.any(Object)] }]);
    expect(mob.brain.minions.has("m0")).toBe(false);
  });

  it("stone: a blow that crosses a mark clamps HP there and turns the witch to stone (invulnerable)", () => {
    const host = makeHost(1, [{ id: "h", x: 200, y: 90 }]);
    const mob = spawn("witch", 160, 90, host);
    const stone = mob.brain.def.stone;
    if (!stone) throw new Error("witch stones");
    mob.body.hp = Math.round(mob.body.maxHp * 0.7);
    const hit = hitEnemy(mob.body, mob.brain, Math.round(mob.body.maxHp * 0.5), 200, 90, 200);
    const mark = Math.ceil((stone.marks[0] ?? 0) * mob.body.maxHp);
    expect(mob.body.hp).toBe(mark);
    expect(hit.amount).toBe(Math.round(mob.body.maxHp * 0.7) - mark);
    expect(mob.brain.stoneMarks).toEqual(stone.marks.slice(1));
    const events: EnemyEvent[] = [];
    for (let t = 0; t < 10; t++) events.push(...step(mob, host));
    expect(mob.brain.invuln).toBe(true);
    expect(hitEnemy(mob.body, mob.brain, 500, 200, 90, 200)).toEqual({ amount: 0, blocked: true });
    expect(mob.body.hp).toBe(mark);
    expect(events.some((e) => e.type === "summon")).toBe(true);
    for (let t = 0; t < stone.ticks; t++) events.push(...step(mob, host));
    expect(mob.brain.invuln).toBe(false);
    expect(events.some((e) => e.type === "shots" && e.angles.length === stone.endRing?.count)).toBe(true);
  });

  it("strikes need a clear line: a raider doesn't swing at a hero behind a 1-tile wall", () => {
    const run = (walled: boolean) => {
      const host = makeHost(5, [{ id: "h", x: 181, y: 88 }]);
      if (walled) wall(host, 10, 4, 10, 6);
      const mob = spawn("raider", 155, 88, host, { def: { behaviour: "guard" } });
      only(mob, 0);
      const events: EnemyEvent[] = [];
      for (let t = 0; t < 60; t++) events.push(...step(mob, host));
      return events.filter((e) => e.type === "area").length;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });

  it("stone: with a fractional mark (tier 1) each mark turns her to stone once, and she can die", () => {
    const host = makeHost(3, [{ id: "h", x: 200, y: 90 }]);
    const mob = spawn("witch", 160, 90, host);
    const stone = mob.brain.def.stone;
    if (!stone) throw new Error("witch stones");
    const maxHp = enemyStats("witch", 1, false).maxHp;
    mob.body.maxHp = maxHp;
    mob.body.hp = maxHp;
    const [first = 0, second = 0] = stone.marks;
    expect(Number.isInteger(first * maxHp)).toBe(false);
    let stones = 0;
    let blows = 0;
    while (mob.body.hp > 0 && blows < 400) {
      const seq = mob.brain.actSeq;
      const before = mob.body.hp;
      hitEnemy(mob.body, mob.brain, 37, 200, 90, 0);
      blows++;
      expect(mob.body.hp).toBeLessThanOrEqual(before);
      if (mob.brain.actSlot === ACT_STONE && mob.brain.actSeq !== seq) {
        stones++;
        expect([Math.ceil(first * maxHp), Math.ceil(second * maxHp)]).toContain(mob.body.hp);
        // Wait the stone out (it ignores blows), then keep hitting.
        for (let t = 0; t < 200 && mob.brain.actSlot === ACT_STONE; t++) step(mob, host);
      }
    }
    expect(stones).toBe(stone.marks.length);
    expect(mob.body.hp).toBeLessThanOrEqual(0);
  });
});
