import {
  type EnemyRank,
  inRect,
  isPlayingPhase,
  isPvpPhase,
  MatchPhase,
  type OfferMessage,
  offerPosition,
  PICKUP_RADIUS,
  PLAYER_HALF,
  type Player,
  type PlayerInputLike,
  POTION_PRICE,
  projectileDamage,
  type Rng,
  type Spot,
  type Stats,
  scaledCooldown,
  TICK_RATE,
  TOUCH_RADIUS,
  WEAPON_IDS,
  WEAPONS,
  weaponCooldownKey,
  weaponCountKey,
} from "@game/shared";
import { axis, type Exit, type Field, type Navigation, type Region } from "./navigation";

/** A monster as a bot sees it. */
export interface BotEnemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  half: number;
  defense: number;
  /** Contact damage (0: harmless to touch). */
  damage: number;
  /** How hard it is (see `enemyDanger`). */
  danger: number;
  /** Goes after heroes (chases, hops at them or shoots); the others only hurt whoever walks into them. */
  aggressive: boolean;
}

/** Something to walk onto: a chest, a rupee or a heart. */
export interface BotSpot {
  id: string;
  x: number;
  y: number;
  /** Pickups: "rupee" or "heart"; props: "bush" or "pot". */
  kind?: string;
}

export interface BotRect {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * What bots see of the match. The room implements it and refreshes `tick`,
 * `phase` and `zone` every tick: bots read the same state players get, plus
 * their own shop offers.
 */
export interface BotView {
  tick: number;
  phase: number;
  /** Safe zone radius (px) around the arena centre. */
  zone: number;
  readonly nav: Navigation;
  readonly arena: BotRect | undefined;
  /** Screens with a vendor. */
  readonly vendorScreens: readonly number[];
  /** A hero still in the match. */
  hero(id: string): Player | undefined;
  /** Every hero still in the match (bots included). */
  heroes(): Iterable<[string, Player]>;
  enemy(id: string): BotEnemy | undefined;
  enemiesOn(screen: number): BotEnemy[];
  /** Closed chests. */
  chestsOn(screen: number): BotSpot[];
  pickupsOn(screen: number): BotSpot[];
  /** Tall grass and pots still whole. */
  propsOn(screen: number): BotSpot[];
  /** Whether a prop (by the id `propsOn` gave it) is still whole. */
  propWhole(id: string): boolean;
  vendorOn(screen: number): Spot | undefined;
  /** A bot's offers at a vendor (rolled when it walked onto the vendor's screen). */
  offers(id: string, vendor: Spot): readonly OfferMessage[] | undefined;
  stats(id: string): Stats;
}

/**
 * How hard a monster is: its tier, +4 for an elite (three times the health),
 * +6 for a mini-boss, +9 for a boss. Screens are rated by their strongest monster.
 */
export const enemyDanger = (rank: EnemyRank, tier: number, elite: boolean): number =>
  tier + (elite ? 4 : 0) + (rank === "boss" ? 9 : rank === "miniboss" ? 6 : 0);

/** What makes bots different from each other. */
export interface BotPersonality {
  /** Added to the danger it takes on (0 or 1). */
  boldness: number;
  /** PvP: picks a fight when its chances (see `edge`) are at least this; lower is more aggressive. */
  courage: number;
  /** Below this share of its health it plays safe (potions, easy monsters). */
  caution: number;
  /** Chance of taking an opening to swing on a given tick: players react a few ticks late too. */
  skill: number;
}

export function rollPersonality(rng: Rng): BotPersonality {
  return {
    boldness: rng() < 0.35 ? 1 : 0,
    courage: 1.2 + rng() * 0.6,
    caution: 0.3 + rng() * 0.2,
    skill: 0.25 + rng() * 0.35,
  };
}

/** Bots make up their minds 5 times a second (each on its own tick) and steer every tick. */
export const THINK_TICKS = 6;

const SECOND = TICK_RATE;
/** Bots fire their weapons at what they fight from up to this far (px). */
const SHOOT_RANGE = 110;
const IDLE: PlayerInputLike = { moveX: 0, moveY: 0, attack: 0 };

const OCTANTS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** The 8-way direction closest to (dx, dy). */
function octant(dx: number, dy: number): readonly [number, number] {
  const i = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return OCTANTS[(i + 8) % 8] ?? [0, 1];
}

/** True when (dx, dy) is within about 11° of one of the 8 directions (a volley would fly at it). */
function lined(dx: number, dy: number): boolean {
  const a = Math.atan2(dy, dx) / (Math.PI / 4);
  return Math.abs(a - Math.round(a)) < 0.25;
}

const move = (moveX: number, moveY: number): PlayerInputLike => ({ moveX, moveY, attack: 0 });
const toward = (me: { x: number; y: number }, x: number, y: number, dead: number) =>
  move(axis(x - me.x, dead), axis(y - me.y, dead));

/** Rough damage per tick a hero deals to a target with this defense (sword and weapons). */
function dps(hero: Player, stats: Stats, defense: number): number {
  const swing = Math.max(1, stats.damage * (1 + stats.critChance * (stats.critDamage - 1)) - defense);
  let total = swing / Math.max(1, stats.attackCooldownTicks);
  for (const weapon of WEAPON_IDS) {
    const copies = hero[weaponCountKey(weapon)];
    if (copies <= 0) continue;
    const def = WEAPONS[weapon];
    const hit = Math.max(1, projectileDamage(weapon, 0, stats) - defense);
    // About half the projectiles of a volley find their target.
    total += (0.5 * copies * def.perCopy * hit) / scaledCooldown(def.cooldownTicks, stats.cooldownPct);
  }
  return total;
}

type Mode = "idle" | "travel" | "walk" | "fight" | "cut" | "flee";

interface Walk {
  key: string;
  x: number;
  y: number;
  /** Close enough (px). */
  near: number;
  field: Field;
}

/**
 * A bot: a hero the server plays, one input per tick through the same
 * `stepPlayer` as everyone, seeing only what a player could see.
 *
 * Five times a second it picks what to do, in this order: in the arena, stay
 * inside the safe zone and fight the closest hero; in PvP, fight heroes it can
 * beat and run from the others; run from monsters too strong for it (and keep
 * away from their screen for a while); buy a potion when hurt; buy relics;
 * open chests; fight the monsters it can handle; pick up rupees; cut the tall
 * grass and break the pots close by (now and then); otherwise explore screens
 * it hasn't seen lately, harder ones as it grows. Every tick
 * it steers toward that goal (around walls, through screen edges and portals)
 * and fights hit-and-run.
 */
export class BotBrain {
  /** What it is doing now (tests and debugging). */
  mode: Mode = "idle";
  private nextThink: number;
  /** Screen it is heading to, until when, the danger it accepts on the way, the exit it takes next. */
  private goal = -1;
  private goalUntil = 0;
  private limit = Number.POSITIVE_INFINITY;
  private path: Exit | undefined;
  /** Running away: the exit, kept until `fleeUntil` (changing its mind every decision runs in circles). */
  private via: Exit | undefined;
  private fleeUntil = 0;
  /** Tick it was last on each screen. */
  private readonly visited = new Map<number, number>();
  /** Screens where it met monsters far too strong for it, avoided until a tick. */
  private readonly avoid = new Map<number, number>();
  private walk: Walk | undefined;
  private target = "";
  private targetHero = false;
  private fightUntil = 0;
  private fightRegion: Region = { tx: 0, ty: 0, w: 0, h: 0 };
  private chase: { key: string; field: Field } | undefined;
  private fleeFrom = { x: 0, y: 0 };
  /** What it gave up on (unreachable, taking too long), until a tick. */
  private readonly ignore = new Map<string, number>();
  private lastShop = Number.NEGATIVE_INFINITY;
  /** Healing up (below half health, until 85%): no fights it can avoid. */
  private recovering = false;
  /** Strolling: when to pick the next spot. */
  private roamUntil = 0;
  /** The tall grass or pot it is cutting, until a tick. */
  private prop: BotSpot | undefined;
  private cutUntil = 0;
  private stuck = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private tried = false;
  private unstick = 0;
  private unstickDir: readonly [number, number] = [0, 0];

  constructor(
    readonly id: string,
    private readonly rng: Rng,
    readonly personality: BotPersonality,
    /** Spreads the thinking of the bots over ticks. */
    offset = 0,
  ) {
    this.nextThink = offset;
  }

  /** This tick's input. */
  think(view: BotView, me: Player): PlayerInputLike {
    if (me.out || me.dead || !isPlayingPhase(view.phase) || view.phase === MatchPhase.prep) {
      this.mode = "idle";
      this.tried = false;
      return IDLE;
    }
    this.checkStuck(view, me);
    if (this.unstick > 0) {
      this.unstick--;
      this.tried = true;
      return move(this.unstickDir[0], this.unstickDir[1]);
    }
    if (view.tick >= this.nextThink) {
      this.nextThink = view.tick + THINK_TICKS;
      this.decide(view, me);
    }
    const input = this.act(view, me);
    // A swing roots the hero and knockback carries it: neither counts as being stuck.
    this.tried = (input.moveX !== 0 || input.moveY !== 0) && input.attack === 0 && me.lock === 0 && me.knockTicks === 0;
    return input;
  }

  /** The danger (see `enemyDanger`) of the screens it explores: grows with level and relics. */
  comfort(me: Player): number {
    return 1 + Math.floor(me.level / 2) + Math.floor(me.relics.length / 3) + this.personality.boldness;
  }

  // ─── Deciding ─────────────────────────────────────────────────────────────

  private decide(view: BotView, me: Player) {
    const { nav, tick } = view;
    const screen = nav.screenAt(me.x, me.y);
    this.visited.set(screen, tick);
    if (this.ignore.size > 64) for (const [key, until] of this.ignore) if (until <= tick) this.ignore.delete(key);
    const stats = view.stats(this.id);
    const hurt = me.hp < me.maxHp * this.personality.caution;
    if (view.arena && inRect(view.arena, me.x, me.y)) {
      this.decideArena(view, view.arena, me, stats, hurt);
      return;
    }
    // Screens it explores: easier while hurt.
    const comfort = this.comfort(me) - (hurt ? 1 : 0);
    const region = nav.screenRegion(screen);
    const steps = nav.field(region, [nav.tileOf(me.x, me.y)]);
    const reachable = (x: number, y: number) => nav.distanceAt(steps, x, y) >= 0;

    // Other heroes (PvP): fight the ones it can beat, run from the others.
    if (isPvpPhase(view.phase)) {
      const foe = this.closestHero(view, me, screen, 120);
      if (foe) {
        const edge = this.edge(view, me, stats, foe.id, foe.hero);
        if (
          !hurt &&
          edge >= this.personality.courage &&
          !this.ignored(foe.id, tick) &&
          reachable(foe.hero.x, foe.hero.y)
        ) {
          this.fight(view, foe.id, true, region);
          return;
        }
        if (foe.dist < 90 && edge < 1) {
          this.flee(view, me, foe.hero.x, foe.hero.y, comfort);
          return;
        }
      }
    }

    // Monsters: after the ones it can handle, away from the others. The ones coming after
    // heroes nearby fight together: each fight is judged against all of them.
    const enemies = view.enemiesOn(screen);
    const near = enemies.filter((e) => e.aggressive && Math.hypot(e.x - me.x, e.y - me.y) < 140);
    let prey: BotEnemy | undefined;
    let preyDist = Number.POSITIVE_INFINITY;
    let threat: BotEnemy | undefined;
    let threatDist = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
      const pack = enemy.aggressive && d < 140 ? near.length : near.length + 1;
      // Monsters it can beat with the health it has now (even hurt, the weak ones: hearts and levels heal).
      if (enemy.danger <= comfort + 2 && this.canBeat(me, stats, enemy, pack)) {
        if (d < preyDist && !this.ignored(enemy.id, tick) && reachable(enemy.x, enemy.y)) [prey, preyDist] = [enemy, d];
      } else if ((enemy.aggressive || d < 32) && d < threatDist) {
        // Too strong: worth running from if it comes after heroes, or is about to touch.
        [threat, threatDist] = [enemy, d];
      }
    }
    if (threat && threatDist < (hurt ? 110 : 80)) {
      // Too much for it: away from the pack, and around this screen for a while.
      this.avoid.set(screen, tick + 40 * SECOND);
      const pack = near.length > 0 ? near : [threat];
      const x = pack.reduce((sum, e) => sum + e.x, 0) / pack.length;
      const y = pack.reduce((sum, e) => sum + e.y, 0) / pack.length;
      this.flee(view, me, x, y, comfort);
      return;
    }

    // Hurt: a heart lying on this screen, else heal up away from fights, else a potion
    // (here or at the nearest vendor).
    const pickups = view.pickupsOn(screen);
    if (me.hp < me.maxHp * 0.8) {
      const heart = this.closest(
        pickups.filter((p) => p.kind === "heart"),
        me,
        reachable,
        tick,
        200,
      );
      if (heart) {
        this.walkTo(view, heart.spot.id, heart.spot.x, heart.spot.y, PICKUP_RADIUS - 3, region);
        return;
      }
    }
    if (me.hp >= me.maxHp * 0.85) this.recovering = false;
    else if (me.hp < me.maxHp * 0.5) this.recovering = true;
    const quiet =
      !enemies.some((e) => e.aggressive && Math.hypot(e.x - me.x, e.y - me.y) < 160) &&
      !(isPvpPhase(view.phase) && this.closestHero(view, me, screen, 200));
    if (this.recovering && quiet) {
      this.recover(view, me, screen, region, steps, comfort, enemies, reachable);
      return;
    }
    if (hurt && me.rupees >= POTION_PRICE) {
      if (this.shop(view, me, screen, reachable, true)) return;
      const vendor = this.nearestVendor(view, me, screen);
      if (vendor !== undefined) {
        this.travel(view, vendor, 90, comfort + 1);
        return;
      }
    }
    if (this.shop(view, me, screen, reachable, false)) return;

    const chest = this.closest(view.chestsOn(screen), me, reachable, tick, Number.POSITIVE_INFINITY);
    if (chest && chest.d < preyDist + 48) {
      this.walkTo(view, chest.spot.id, chest.spot.x, chest.spot.y, TOUCH_RADIUS - 3, region);
      return;
    }
    if (prey) {
      this.fight(view, prey.id, false, region);
      return;
    }
    const coin = this.closest(
      pickups.filter((p) => p.kind !== "heart"),
      me,
      reachable,
      tick,
      160,
    );
    if (coin) {
      this.walkTo(view, coin.spot.id, coin.spot.x, coin.spot.y, PICKUP_RADIUS - 3, region);
      return;
    }
    // Tall grass and pots close by: rupees, sometimes a heart (not every one: it has places to go).
    const prop = this.mode === "cut" ? undefined : this.closest(view.propsOn(screen), me, reachable, tick, 72);
    if (prop) {
      if (this.rng() < 0.6) {
        this.cut(view, prop.spot, region);
        return;
      }
      this.ignore.set(prop.spot.id, tick + 30 * SECOND);
    }
    if (this.mode === "cut" && this.prop && view.propWhole(this.prop.id)) return;

    // Now and then, go spend the rupees.
    if (me.rupees >= 40 && tick - this.lastShop > 150 * SECOND) {
      const vendor = this.nearestVendor(view, me, screen);
      if (vendor !== undefined) {
        this.lastShop = tick;
        this.travel(view, vendor, 120, comfort + 1);
        return;
      }
    }
    if (this.goal < 0 || this.goal === screen || tick > this.goalUntil || this.avoided(this.goal, tick))
      this.explore(view, me, comfort, region, steps);
    else this.mode = "travel";
  }

  /**
   * Heals up away from fights. Heroes heal out of combat even while walking, so
   * it never just stands there: on a calm screen it cuts the tall grass and
   * breaks the pots (a heart may be inside) or strolls around, else it heads
   * for the closest easy screen (the start square and caves have no monsters).
   */
  private recover(
    view: BotView,
    me: Player,
    screen: number,
    region: Region,
    steps: Field,
    comfort: number,
    enemies: readonly BotEnemy[],
    reachable: (x: number, y: number) => boolean,
  ) {
    const { nav, tick } = view;
    const easy = Math.max(0, comfort - 2);
    if (nav.dangerOf(screen) <= easy || !enemies.some((e) => e.aggressive)) {
      if (this.mode === "cut" && this.prop && view.propWhole(this.prop.id)) return;
      const prop = this.closest(view.propsOn(screen), me, reachable, tick, 240);
      if (prop) this.cut(view, prop.spot, region);
      else this.roam(view, region, steps);
      return;
    }
    const hops = nav.hops(nav.nodeAt(me.x, me.y), comfort + 1);
    let best: number | undefined;
    let bestHops = Number.POSITIVE_INFINITY;
    for (const [s, h] of hops)
      if (h > 0 && h < bestHops && nav.dangerOf(s) <= easy && !this.avoided(s, tick)) [best, bestHops] = [s, h];
    if (best === undefined) this.roam(view, region, steps);
    else if (this.goal !== best || this.mode !== "travel") this.travel(view, best, 60, comfort + 1);
  }

  /**
   * Strolls to a random open spot of this screen, away from its edges, and
   * lingers there a moment (healing, or nothing better to do: never a statue
   * in a doorway).
   */
  private roam(view: BotView, region: Region, steps: Field) {
    const { nav, tick } = view;
    if (this.mode === "walk" && this.walk?.key.startsWith("roam:") && tick < this.roamUntil) return;
    const ts = nav.tileSize;
    for (let attempt = 0; attempt < 16; attempt++) {
      const tx = region.tx + 2 + Math.floor(this.rng() * Math.max(1, region.w - 4));
      const ty = region.ty + 2 + Math.floor(this.rng() * Math.max(1, region.h - 4));
      const x = (tx + 0.5) * ts;
      const y = (ty + 0.5) * ts;
      if (nav.distanceAt(steps, x, y) < 3) continue;
      this.walkTo(view, `roam:${tx},${ty}`, x, y, 4, region);
      this.roamUntil = tick + (2 + Math.floor(this.rng() * 3)) * SECOND;
      return;
    }
    this.mode = "idle";
  }

  /** In the arena: inside the safe zone, at the closest hero. */
  private decideArena(view: BotView, arena: BotRect, me: Player, stats: Stats, hurt: boolean) {
    const region = view.nav.regionOf(arena);
    const { centerX: cx, centerY: cy } = arena;
    const safe = Math.max(12, view.zone - 28);
    if (Math.hypot(me.x - cx, me.y - cy) > safe) {
      this.walkTo(view, "zone", cx, cy, 16, region, undefined, 2);
      return;
    }
    let foe: [string, Player] | undefined;
    let foeDist = Number.POSITIVE_INFINITY;
    for (const entry of view.heroes()) {
      const [id, hero] = entry;
      if (id === this.id || !inRect(arena, hero.x, hero.y)) continue;
      // Heroes out in the storm can be left to it.
      if (Math.hypot(hero.x - cx, hero.y - cy) > view.zone) continue;
      const d = Math.hypot(hero.x - me.x, hero.y - me.y);
      if (d < foeDist) [foe, foeDist] = [entry, d];
    }
    if (!foe) {
      this.walkTo(view, "zone", cx, cy, 16, region, undefined, 2);
      return;
    }
    if (hurt && foeDist < 100 && this.edge(view, me, stats, foe[0], foe[1]) < 1) {
      // Back off, but stay in the safe zone.
      let x = me.x + ((me.x - foe[1].x) / (foeDist || 1)) * 64;
      let y = me.y + ((me.y - foe[1].y) / (foeDist || 1)) * 64;
      const r = Math.hypot(x - cx, y - cy);
      if (r > safe) {
        x = cx + ((x - cx) * safe) / r;
        y = cy + ((y - cy) * safe) / r;
      }
      const [tx, ty] = view.nav.tileOf(x, y);
      this.walkTo(view, `back:${tx},${ty}`, x, y, 10, region, undefined, 1);
      return;
    }
    this.fight(view, foe[0], true, region);
  }

  /** Picks a screen to go to: not seen lately, close, with monsters it can handle (the harder the better). */
  private explore(view: BotView, me: Player, comfort: number, region: Region, steps: Field) {
    const { nav, tick } = view;
    const node = nav.nodeAt(me.x, me.y);
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestHops = 1;
    for (const [screen, hops] of nav.hops(node, comfort + 1)) {
      const danger = nav.dangerOf(screen);
      if (hops === 0 || danger > comfort || this.avoided(screen, tick)) continue;
      const seen = this.visited.get(screen);
      const age = seen === undefined ? 300 : Math.min(300, (tick - seen) / SECOND);
      if (age < 60) continue;
      const score = age / 100 - hops * 0.5 - (comfort - danger) * 0.6 + this.rng() * 1.5;
      if (score > bestScore) [best, bestScore, bestHops] = [screen, score, hops];
    }
    if (best < 0) {
      // Everything it can handle was seen lately: anywhere next door, but not back into trouble
      // (out of a cave it fled into, the only way is back where the monster is: stroll a little).
      const exits = nav.exitsOf(node).filter((e) => !this.avoided(e.screen, tick));
      const exit = exits[Math.floor(this.rng() * exits.length)];
      if (!exit) {
        this.roam(view, region, steps);
        return;
      }
      best = exit.screen;
    }
    this.travel(view, best, 20 + bestHops * 10, comfort + 1);
  }

  /**
   * Runs from (x, y): off the screen (monsters never leave theirs) by the exit
   * it gets to well before the threat does, and not into worse trouble.
   */
  private flee(view: BotView, me: Player, x: number, y: number, comfort: number) {
    const { nav, tick } = view;
    const node = nav.nodeAt(me.x, me.y);
    if (this.mode === "travel" && this.via?.from === node && tick < this.fleeUntil) return;
    let best: Exit | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const exit of nav.exitsOf(node)) {
      const field = nav.exitField(exit);
      const mine = nav.distanceAt(field, me.x, me.y);
      if (mine < 0) continue;
      const theirs = nav.distanceAt(field, x, y);
      const worse = nav.dangerOf(exit.screen) > comfort + 1 || this.avoided(exit.screen, tick);
      // Not back into a dead end it just came out of (a cave): the monster would be waiting at the door.
      const seen = this.visited.get(exit.screen);
      const trap = nav.exitsOf(exit.to).length <= 1 && seen !== undefined && tick - seen < 30 * SECOND;
      // Toward easier screens: it can't see what waits on the other side.
      const harder = Math.max(0, nav.dangerOf(exit.screen) - (comfort - 2)) * 6;
      const score = (theirs < 0 ? 40 : theirs) - mine - harder - (worse ? 60 : 0) - (trap ? 40 : 0);
      if (score > bestScore) [best, bestScore] = [exit, score];
    }
    if (best) {
      this.travel(view, best.screen, 8, Number.POSITIVE_INFINITY, best);
      this.fleeUntil = tick + 2 * SECOND;
      return;
    }
    this.fleeFrom = { x, y };
    this.mode = "flee";
  }

  private travel(view: BotView, screen: number, seconds: number, limit: number, via?: Exit) {
    this.mode = "travel";
    this.goal = screen;
    this.goalUntil = view.tick + seconds * SECOND;
    this.limit = limit;
    this.via = via;
    this.path = undefined;
  }

  private avoided(screen: number, tick: number) {
    return (this.avoid.get(screen) ?? 0) > tick;
  }

  private walkTo(
    view: BotView,
    key: string,
    x: number,
    y: number,
    near: number,
    region: Region,
    blocked?: (tx: number, ty: number) => boolean,
    /** Also accept tiles this many tiles around the target (when it may be a wall). */
    spread = 0,
  ) {
    this.mode = "walk";
    if (this.walk?.key === key) return;
    const { nav } = view;
    const [tx, ty] = nav.tileOf(x, y);
    const targets: [number, number][] = [];
    for (let oy = -spread; oy <= spread; oy++)
      for (let ox = -spread; ox <= spread; ox++) targets.push([tx + ox, ty + oy]);
    this.walk = { key, x, y, near, field: nav.field(region, targets, blocked) };
  }

  private fight(view: BotView, id: string, hero: boolean, region: Region) {
    if (this.mode !== "fight" || this.target !== id) {
      this.fightUntil = view.tick + (hero ? 25 : 20) * SECOND;
      this.chase = undefined;
    }
    this.mode = "fight";
    this.target = id;
    this.targetHero = hero;
    this.fightRegion = region;
  }

  /** Cuts tall grass or breaks a pot: up to it, then a swing at it. */
  private cut(view: BotView, spot: BotSpot, region: Region) {
    if (this.mode !== "cut" || this.prop?.id !== spot.id) {
      this.cutUntil = view.tick + 6 * SECOND;
      this.chase = undefined;
    }
    this.mode = "cut";
    this.prop = spot;
    this.fightRegion = region;
  }

  /** Buys from the vendor on this screen: a potion when hurt, else the dearest relic it can afford. */
  private shop(
    view: BotView,
    me: Player,
    screen: number,
    reachable: (x: number, y: number) => boolean,
    potionOnly: boolean,
  ): boolean {
    const vendor = view.vendorOn(screen);
    const offers = vendor ? view.offers(this.id, vendor) : undefined;
    if (!vendor || !offers) return false;
    let slot = -1;
    let worth = 0;
    offers.forEach((offer, i) => {
      if (offer.sold || offer.price > me.rupees) return;
      const value = offer.kind === "potion" ? (me.hp < me.maxHp * 0.6 ? 1000 : 0) : potionOnly ? 0 : offer.price;
      if (value > worth) [slot, worth] = [i, value];
    });
    if (slot < 0) return false;
    const key = `o${vendor.id}:${slot}`;
    const at = offerPosition(vendor, slot);
    if (this.ignored(key, view.tick) || !reachable(at.x, at.y)) return false;
    // Stepping onto an offer buys it: walk around the others.
    const { nav } = view;
    const [mx, my] = nav.tileOf(me.x, me.y);
    const others = offers.flatMap((offer, i) => {
      const spot = offerPosition(vendor, i);
      return i === slot || offer.sold ? [] : [nav.tileOf(spot.x, spot.y)];
    });
    const blocked = (tx: number, ty: number) =>
      (tx !== mx || ty !== my) && others.some(([ox, oy]) => ox === tx && oy === ty);
    this.walkTo(view, key, at.x, at.y, TOUCH_RADIUS - 4, nav.screenRegion(screen), blocked);
    this.lastShop = view.tick;
    return true;
  }

  /** The closest vendor screen (in screens to cross) other than this one. */
  private nearestVendor(view: BotView, me: Player, screen: number): number | undefined {
    const hops = view.nav.hops(view.nav.nodeAt(me.x, me.y));
    let best: number | undefined;
    let bestHops = Number.POSITIVE_INFINITY;
    for (const vendor of view.vendorScreens) {
      const h = hops.get(vendor);
      if (vendor !== screen && h !== undefined && h < bestHops) [best, bestHops] = [vendor, h];
    }
    return best;
  }

  private closest(
    spots: readonly BotSpot[],
    me: Player,
    reachable: (x: number, y: number) => boolean,
    tick: number,
    range: number,
  ) {
    let best: BotSpot | undefined;
    let bestDist = range;
    for (const spot of spots) {
      const d = Math.hypot(spot.x - me.x, spot.y - me.y);
      if (d >= bestDist || this.ignored(spot.id, tick) || !reachable(spot.x, spot.y)) continue;
      [best, bestDist] = [spot, d];
    }
    return best ? { spot: best, d: bestDist } : undefined;
  }

  private closestHero(view: BotView, me: Player, screen: number, range: number) {
    let best: { id: string; hero: Player; dist: number } | undefined;
    for (const [id, hero] of view.heroes()) {
      if (id === this.id || view.nav.screenAt(hero.x, hero.y) !== screen) continue;
      const dist = Math.hypot(hero.x - me.x, hero.y - me.y);
      if (dist <= range && (!best || dist < best.dist)) best = { id, hero, dist };
    }
    return best;
  }

  /**
   * Whether it beats a monster with health to spare: the swings it needs
   * (hit-and-run, so not every cooldown), and about one touch every 1.5 s
   * meanwhile from each of the `pack` monsters coming after it.
   */
  private canBeat(me: Player, stats: Stats, enemy: BotEnemy, pack = 1): boolean {
    const swings = Math.ceil(enemy.hp / Math.max(1, stats.damage - enemy.defense));
    const ticks = swings * stats.attackCooldownTicks * 1.5;
    const taken = Math.max(1, enemy.damage - stats.defense) * (1 + ticks / 45) * Math.max(1, pack);
    return taken < me.hp * 0.6;
  }

  /** Its chances against another hero: the time the other needs to beat it over the time it needs (> 1: it should win). */
  private edge(view: BotView, me: Player, stats: Stats, otherId: string, other: Player): number {
    const theirs = view.stats(otherId);
    const mine = dps(me, stats, theirs.defense);
    const them = dps(other, theirs, stats.defense);
    return me.hp / them / Math.max(1, other.hp / mine);
  }

  private ignored(key: string, tick: number) {
    return (this.ignore.get(key) ?? 0) > tick;
  }

  // ─── Acting (every tick) ──────────────────────────────────────────────────

  private act(view: BotView, me: Player): PlayerInputLike {
    switch (this.mode) {
      case "travel":
        return this.travelInput(view, me);
      case "walk":
        return this.walkInput(view, me);
      case "fight":
        return this.fightInput(view, me);
      case "cut":
        return this.cutInput(view, me);
      case "flee": {
        const [x, y] = octant(me.x - this.fleeFrom.x, me.y - this.fleeFrom.y);
        return move(x, y);
      }
      default:
        return IDLE;
    }
  }

  private travelInput(view: BotView, me: Player): PlayerInputLike {
    const { nav, tick } = view;
    const node = nav.nodeAt(me.x, me.y);
    if (node < 0 || nav.screenOf(node) === this.goal) return this.soon(view);
    // The next exit, worked out again on each new screen: no screen too hard or avoided on the way.
    if (this.path?.from !== node) {
      const avoid = new Set<number>();
      for (const [screen, until] of this.avoid) if (until > tick && screen !== this.goal) avoid.add(screen);
      // (Avoided screens are a preference: when the only way goes through one, take it.)
      this.path =
        this.via?.from === node
          ? this.via
          : (nav.route(node, this.goal, this.limit, avoid) ?? nav.route(node, this.goal, this.limit));
    }
    const dir = this.path && nav.stepToward(me.x, me.y, this.path);
    if (!dir) {
      // No safe way there from here: somewhere else (and not there again for a while).
      this.visited.set(this.goal, tick);
      this.goal = -1;
      this.path = undefined;
      return this.soon(view);
    }
    return move(dir[0], dir[1]);
  }

  private walkInput(view: BotView, me: Player): PlayerInputLike {
    const { walk } = this;
    if (!walk) return this.soon(view);
    if (Math.hypot(walk.x - me.x, walk.y - me.y) <= walk.near) return IDLE;
    const dir = view.nav.steer(walk.field, me.x, me.y);
    if (!dir) {
      this.ignore.set(walk.key, view.tick + 20 * SECOND);
      this.walk = undefined;
      this.mode = "idle";
      return this.soon(view);
    }
    if (dir[0] === 0 && dir[1] === 0) return toward(me, walk.x, walk.y, 0.5);
    return move(dir[0], dir[1]);
  }

  /** Hit-and-run: swing when in reach and ready, keep clear while the sword recovers. */
  private fightInput(view: BotView, me: Player): PlayerInputLike {
    const enemy = this.targetHero ? undefined : view.enemy(this.target);
    const target = enemy ?? (this.targetHero ? view.hero(this.target) : undefined);
    if (!target || view.tick > this.fightUntil) {
      // Beaten, gone, or taking too long: on to something else.
      if (target) this.ignore.set(this.target, view.tick + 20 * SECOND);
      this.mode = "idle";
      return this.soon(view);
    }
    const stats = view.stats(this.id);
    const half = enemy ? enemy.half : PLAYER_HALF;
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const d = Math.hypot(dx, dy);
    const [ox, oy] = octant(dx, dy);
    // The sword reaches about `reach` in the direction faced, whichever of the 8 (see swordHitbox).
    const reach = stats.reach + half;
    const sharp = this.rng() < this.personality.skill;
    if (me.cooldown === 0 && d <= reach && sharp) return { moveX: ox, moveY: oy, attack: 1 };
    if (d <= SHOOT_RANGE && sharp && this.canShoot(me) && lined(dx, dy)) return { moveX: ox, moveY: oy, attack: 1 };
    // While the sword recovers, keep clear of the monster's body or the other hero's sword.
    const keep = enemy
      ? enemy.damage > 0
        ? half + PLAYER_HALF + 6
        : 0
      : view.stats(this.target).reach + PLAYER_HALF + 4;
    if (me.cooldown > 3 && d < keep) return move(-ox, -oy);
    if (d > reach * 0.75) return this.approach(view, me, target.x, target.y, d);
    return IDLE;
  }

  private cutInput(view: BotView, me: Player): PlayerInputLike {
    const { prop } = this;
    if (!prop || !view.propWhole(prop.id) || view.tick > this.cutUntil) {
      // Done, or taking too long (something in the way): on to something else.
      if (prop && view.propWhole(prop.id)) this.ignore.set(prop.id, view.tick + 60 * SECOND);
      this.prop = undefined;
      this.mode = "idle";
      return this.soon(view);
    }
    const dx = prop.x - me.x;
    const dy = prop.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d <= view.stats(this.id).reach) {
      if (me.cooldown > 0) return IDLE;
      const [ox, oy] = octant(dx, dy);
      return { moveX: ox, moveY: oy, attack: 1 };
    }
    return this.approach(view, me, prop.x, prop.y, d);
  }

  private approach(view: BotView, me: Player, x: number, y: number, d: number): PlayerInputLike {
    if (d < 28) return toward(me, x, y, 1);
    const { nav } = view;
    const [tx, ty] = nav.tileOf(x, y);
    const key = `${tx},${ty}`;
    if (this.chase?.key !== key) this.chase = { key, field: nav.field(this.fightRegion, [[tx, ty]]) };
    const dir = nav.steer(this.chase.field, me.x, me.y);
    if (!dir || (dir[0] === 0 && dir[1] === 0)) return toward(me, x, y, 1);
    return move(dir[0], dir[1]);
  }

  private canShoot(me: Player): boolean {
    return WEAPON_IDS.some((w) => me[weaponCountKey(w)] > 0 && me[weaponCooldownKey(w)] === 0);
  }

  /** Nothing to do this tick: think again on the next one. */
  private soon(view: BotView): PlayerInputLike {
    this.nextThink = Math.min(this.nextThink, view.tick + 1);
    return IDLE;
  }

  /** Walking into a wall for half a second: drop the plan and try another way for a moment. */
  private checkStuck(view: BotView, me: Player) {
    const moved = Math.abs(me.x - this.lastX) + Math.abs(me.y - this.lastY) > 0.25;
    this.lastX = me.x;
    this.lastY = me.y;
    if (!this.tried) return;
    this.stuck = moved ? Math.max(0, this.stuck - 2) : this.stuck + 1;
    if (this.stuck < 15) return;
    this.stuck = 0;
    const key =
      this.mode === "walk"
        ? this.walk?.key
        : this.mode === "fight"
          ? this.target
          : this.mode === "cut"
            ? this.prop?.id
            : undefined;
    if (key) this.ignore.set(key, view.tick + 20 * SECOND);
    if (this.mode === "travel") this.goal = -1;
    this.walk = undefined;
    this.via = undefined;
    this.path = undefined;
    this.mode = "idle";
    this.unstickDir = OCTANTS[Math.floor(this.rng() * 8)] ?? [0, 1];
    this.unstick = 8 + Math.floor(this.rng() * 10);
    this.nextThink = view.tick + this.unstick;
  }
}
