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
  SLOW_FACTOR,
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

/**
 * Where a monster's attack (or a shot in flight) is about to hit, as bots read the tell.
 * A `lane` runs from (x, y) along the unit (dirX, dirY) for `length` px, `width` px wide;
 * a `zone` is a circle. `ticks` is how long until it starts to hurt; along a lane the
 * danger then travels at `speed` px per tick (0: the whole lane at once), so a point
 * `along` px down the lane is hit about `ticks + along / speed` ticks from now.
 * `key` names the act (enemy id + its act counter, + lane index for fans): bots decide once per key.
 */
export type Threat =
  | {
      kind: "lane";
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      length: number;
      width: number;
      ticks: number;
      speed: number;
      key: string;
    }
  | { kind: "zone"; x: number; y: number; radius: number; ticks: number; key: string };

/** A monster as a bot sees it. */
export interface BotEnemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  half: number;
  defense: number;
  /** Its strongest blow: max(contact, strongest attack), so `canBeat` stays conservative. */
  damage: number;
  /** How hard it is (see `enemyDanger`). */
  danger: number;
  /** Goes after heroes (chases, hops at them or shoots, and awake); the others only hurt whoever walks into them. */
  aggressive: boolean;
  /** Has aimed or ring shots. */
  ranged: boolean;
  /** Blows do nothing now (stone, a leap in the air). */
  invulnerable: boolean;
  /** Front block (lancer): unit facing of the guarded side; absent while it can't guard (stunned, attacking). */
  block?: { fx: number; fy: number };
  elite: boolean;
  /** A blow in its wind-up cancels the attack (normal kinds that aren't elites). */
  interruptible: boolean;
  /** In the recover of an act (or stunned): a free hit. */
  open: boolean;
  /** Velocity, px per tick (last tick). */
  vx: number;
  vy: number;
  /** Its attack about to land, if any (empty most of the time). */
  threats: readonly Threat[];
}

/** An enemy shot in flight. */
export interface BotHostile {
  key: string;
  /** Where it is now. */
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  /** px per tick. */
  speed: number;
  radius: number;
  /** px it can still fly. */
  left: number;
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
  enemiesOn(screen: number): readonly BotEnemy[];
  /** Enemy shots in flight within `r` px of (x, y). */
  hostilesNear(x: number, y: number, r: number): readonly BotHostile[];
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
 * +6 for a mini-boss, +9 for a boss, plus its kind's own `bonus` (EnemyDef.danger:
 * ranged and tricky kinds). Screens are rated by their strongest monster.
 */
export const enemyDanger = (rank: EnemyRank, tier: number, elite: boolean, bonus = 0): number =>
  tier + (elite ? 4 : 0) + (rank === "boss" ? 9 : rank === "miniboss" ? 6 : 0) + bonus;

/** Base chance (plus the bot's skill) that a bot reacts to a tell by stepping out of it. A balance knob. */
export const BOT_DODGE_BASE = 0.35;

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

/** Tells that start to hurt later than this (ticks) are not worth a step yet. */
const DODGE_HORIZON = 12;
/** A dodge looks this many ticks of walking ahead. */
const DODGE_LOOKAHEAD = 8;
/** Shots this close (px) are read as threats. */
const HOSTILE_SIGHT = 96;
/** Room around the hero's body when reading a threat (px). */
const THREAT_MARGIN = PLAYER_HALF + 2;
/** cos 60°: a lancer guards blows within ±60° of its facing. */
const BLOCK_COS = 0.5;
/** Around a target it can't hurt (stone, in the air): never closer than this (px). */
const ORBIT_MIN = 48;

/**
 * When a threat reaches (x, y) (a body `margin` px around it), in ticks from now; -1 when
 * it doesn't (outside the lane or zone).
 */
export function threatEta(t: Threat, x: number, y: number, margin = THREAT_MARGIN): number {
  if (t.kind === "zone") return Math.hypot(x - t.x, y - t.y) < t.radius + margin ? t.ticks : -1;
  const rx = x - t.x;
  const ry = y - t.y;
  const along = rx * t.dirX + ry * t.dirY;
  if (along < 0 || along > t.length) return -1;
  if (Math.abs(rx * t.dirY - ry * t.dirX) >= t.width / 2 + margin) return -1;
  return t.ticks + (t.speed > 0 ? along / t.speed : 0);
}

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
 * and fights hit-and-run; when it reads a monster's tell (a wind-up about to end,
 * a shot on its way) it may step out of it first (see `dodge`).
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
  /**
   * Back-and-forth across one border: the screen it last ran out of, until when running back
   * into it counts as a turn back, and how many turn backs in a row. A hero chasing it to the
   * edge could keep it (and the chaser) crossing the same border for a minute; after two turn
   * backs it runs on instead (only then: a single turn back is often the right way out).
   */
  private fledScreen = -1;
  private fledUntil = 0;
  private turnBacks = 0;
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
  /** Dodges started (balance runs read it). */
  dodges = 0;
  /** Threats it rolled for (by key): whether it steps out of them, and when it rolled. */
  private readonly decided = new Map<string, { go: boolean; at: number }>();
  private lastPrune = 0;
  private dodgeUntil = 0;
  private dodgeDir: readonly [number, number] = [0, 1];
  /** Last way it walked (dodges try it first). */
  private heading: readonly [number, number] = [0, 1];
  /** Circling a target it can't hurt: which way round. */
  private orbit: 1 | -1 = 1;
  private readonly threats: Threat[] = [];
  /** Monsters on its screen this tick (a dodge never steps into one). */
  private bodies: readonly BotEnemy[] = [];

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
    const input = this.dodge(view, me) ?? this.act(view, me);
    if (input.moveX !== 0 || input.moveY !== 0) this.heading = [input.moveX, input.moveY];
    // A swing roots the hero and knockback carries it: neither counts as being stuck.
    this.tried = (input.moveX !== 0 || input.moveY !== 0) && input.attack === 0 && me.lock === 0 && me.knockTicks === 0;
    return input;
  }

  /** Whether it is stepping out of a threat now (balance runs). */
  isDodging(tick: number): boolean {
    return tick < this.dodgeUntil;
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
        // Nothing to win against stone or a monster in the air: its adds first (it keeps circling one it fights).
        const busy = enemy.invulnerable && !(this.mode === "fight" && this.target === enemy.id);
        if (d < preyDist && !busy && !this.ignored(enemy.id, tick) && reachable(enemy.x, enemy.y))
          [prey, preyDist] = [enemy, d];
      } else if ((enemy.aggressive || d < 32) && d < threatDist) {
        // Too strong: worth running from if it comes after heroes, or is about to touch.
        [threat, threatDist] = [enemy, d];
      }
    }
    // Webbed, it can't outrun much: it runs earlier.
    const runAt = me.slow > 0 ? (hurt ? 140 : 100) : hurt ? 110 : 80;
    if (threat && threatDist < runAt) {
      // Too much for it: away from the pack, and around this screen for a while.
      this.avoid.set(screen, tick + 40 * SECOND);
      const pack = near.length > 0 ? near : [threat];
      const x = pack.reduce((sum, e) => sum + e.x, 0) / pack.length;
      const y = pack.reduce((sum, e) => sum + e.y, 0) / pack.length;
      this.flee(view, me, x, y, comfort);
      return;
    }
    // Just ran from something: keep going for a moment (until across), not back as soon as it is out of range.
    if (this.mode === "travel" && this.via !== undefined && tick < this.fleeUntil && screen !== this.goal) return;

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
      const vendor = this.nearestVendor(view, me, screen, comfort + 1);
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
    // Tall grass and pots close by: rupees, sometimes a heart (not every one: it has places to go;
    // and hardly any before its first level: monsters first).
    const prop =
      this.mode === "cut" || (me.level === 1 && this.rng() < 0.7)
        ? undefined
        : this.closest(view.propsOn(screen), me, reachable, tick, 72);
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
      const vendor = this.nearestVendor(view, me, screen, comfort + 1);
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
      const pingPong = this.turnBacks >= 2 && exit.screen === this.fledScreen && tick < this.fledUntil;
      const score =
        (theirs < 0 ? 40 : theirs) - mine - harder - (worse ? 60 : 0) - (trap ? 40 : 0) - (pingPong ? 80 : 0);
      if (score > bestScore) [best, bestScore] = [exit, score];
    }
    if (best) {
      this.travel(view, best.screen, 8, Number.POSITIVE_INFINITY, best);
      this.fleeUntil = tick + 2 * SECOND;
      this.turnBacks = best.screen === this.fledScreen && tick < this.fledUntil ? this.turnBacks + 1 : 0;
      this.fledScreen = nav.screenAt(me.x, me.y);
      this.fledUntil = tick + 10 * SECOND;
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

  /**
   * The closest vendor screen (in screens to cross) other than this one, through screens no
   * harder than `limit`: the same limit `travel` gets, or it could pick a vendor it has no way
   * to and stand there deciding to go again every tick.
   */
  private nearestVendor(view: BotView, me: Player, screen: number, limit: number): number | undefined {
    const hops = view.nav.hops(view.nav.nodeAt(me.x, me.y), limit);
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
   * (hit-and-run, so not every cooldown), and about one blow every 1.5 s
   * meanwhile from each of the `pack` monsters coming after it (one more from a
   * monster that shoots: it hits on the way in too).
   */
  private canBeat(me: Player, stats: Stats, enemy: BotEnemy, pack = 1): boolean {
    const swings = Math.ceil(enemy.hp / Math.max(1, stats.damage - enemy.defense));
    const ticks = swings * stats.attackCooldownTicks * 1.5;
    const blows = 1 + ticks / 45 + (enemy.ranged ? 1 : 0);
    const taken = Math.max(1, enemy.damage - stats.defense) * blows * Math.max(1, pack);
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

  /**
   * Hit-and-run: swing when in reach and ready, keep clear while the sword recovers. Against a
   * lancer facing it, from the side; a monster in its recover (or stunned) is a free hit; one
   * it can't hurt (stone, in the air) it circles at a distance.
   */
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
    if (enemy?.invulnerable) return this.orbitInput(view, me, dx, dy, d);
    const [ox, oy] = octant(dx, dy);
    // The sword reaches about `reach` in the direction faced, whichever of the 8 (see swordHitbox).
    const reach = stats.reach + half;
    const guard = enemy?.block;
    if (guard && d > 0 && -(guard.fx * dx + guard.fy * dy) / d >= BLOCK_COS) {
      // In front of its guard: round to its side first (it turns slowly).
      const side = -(-guard.fy * dx + guard.fx * dy) >= 0 ? 1 : -1;
      const off = half + stats.reach * 0.7;
      const fx = target.x - guard.fy * side * off;
      const fy = target.y + guard.fx * side * off;
      return this.approach(view, me, fx, fy, Math.hypot(fx - me.x, fy - me.y));
    }
    const sharp = this.rng() < this.personality.skill;
    if (me.cooldown === 0 && d <= reach && sharp) return { moveX: ox, moveY: oy, attack: 1 };
    if (d <= SHOOT_RANGE && sharp && this.canShoot(me) && lined(dx, dy)) return { moveX: ox, moveY: oy, attack: 1 };
    // While the sword recovers, keep clear of the monster's body or the other hero's sword
    // (not of a monster wide open: stay on it for the next swing).
    const open = enemy?.open === true && d <= reach + 20;
    const keep = enemy
      ? enemy.damage > 0
        ? half + PLAYER_HALF + 6
        : 0
      : view.stats(this.target).reach + PLAYER_HALF + 4;
    if (me.cooldown > 3 && d < keep && !open) return move(-ox, -oy);
    if (d > reach * 0.75) return this.approach(view, me, target.x, target.y, d);
    return IDLE;
  }

  /** Circles a target it can't hurt now, out of its reach, never standing still. */
  private orbitInput(view: BotView, me: Player, dx: number, dy: number, d: number): PlayerInputLike {
    if (this.stuck >= 3) this.orbit = this.orbit === 1 ? -1 : 1;
    const away = octant(-dx, -dy);
    const round = octant(-dy * this.orbit, dx * this.orbit);
    const back = octant(dy * this.orbit, -dx * this.orbit);
    for (const dir of d < ORBIT_MIN ? [away, round, back] : [round, back, away]) {
      if (!this.clear(view, me, dir)) continue;
      if (dir === back) this.orbit = this.orbit === 1 ? -1 : 1;
      return move(dir[0], dir[1]);
    }
    const free = OCTANTS.find((dir) => this.clear(view, me, dir)) ?? away;
    return move(free[0], free[1]);
  }

  /** Whether a few steps in `dir` stay on open ground. */
  private clear(view: BotView, me: Player, dir: readonly [number, number]): boolean {
    const { nav } = view;
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const step = PLAYER_HALF + 6;
    const [tx, ty] = nav.tileOf(me.x + (dir[0] / len) * step, me.y + (dir[1] / len) * step);
    return nav.walkable(tx, ty);
  }

  // ─── Dodging ──────────────────────────────────────────────────────────────

  /**
   * Steps out of a monster's tell (a charge lane, a strike or landing zone, a fan of shots,
   * a hop at it) or a shot flying at it, when it notices: it rolls once per threat
   * (BOT_DODGE_BASE + skill). Moves every tick while a threat it reacted to is on; else
   * undefined (its plan goes on).
   */
  private dodge(view: BotView, me: Player): PlayerInputLike | undefined {
    const { tick } = view;
    if (tick - this.lastPrune >= SECOND) {
      this.lastPrune = tick;
      for (const [key, d] of this.decided) if (tick - d.at > 3 * SECOND) this.decided.delete(key);
    }
    const threats = this.threatsAround(view, me);
    if (threats.length === 0) {
      this.dodgeUntil = 0;
      return undefined;
    }
    const interrupt = this.interruptInput(view, me);
    if (interrupt) return interrupt;
    let held = false;
    let hit = false;
    let latest = 0;
    for (const t of threats) {
      const known = this.decided.get(t.key);
      if (known?.go) held = true;
      // It reads the tell itself (a wind-up about to end, a shot on its way), wherever it stands in it.
      if (t.ticks > DODGE_HORIZON || threatEta(t, me.x, me.y) < 0) continue;
      let d = known;
      if (!d) {
        d = { go: this.rng() < BOT_DODGE_BASE + this.personality.skill, at: tick };
        this.decided.set(t.key, d);
      }
      if (d.go) {
        hit = true;
        held = true;
        latest = Math.max(latest, t.ticks);
      }
    }
    if (!held) {
      this.dodgeUntil = 0;
      return undefined;
    }
    if (tick < this.dodgeUntil && this.clear(view, me, this.dodgeDir)) return this.dodgeInput(view, me, this.dodgeDir);
    if (!hit) {
      // Out of it already: back to the plan (it rolls again for anything new).
      this.dodgeUntil = 0;
      return undefined;
    }
    const dir = this.dodgeDirection(view, me, threats);
    if (!dir) return undefined;
    this.dodges++;
    this.dodgeDir = dir;
    this.dodgeUntil = tick + Math.min(10, Math.ceil(latest) + 4);
    return this.dodgeInput(view, me, dir);
  }

  /**
   * Its fight target winding up within sword reach while the sword is ready: a blow now cancels
   * the attack (what a player does), unless the target can't be interrupted or guards its front.
   */
  private interruptInput(view: BotView, me: Player): PlayerInputLike | undefined {
    if (me.cooldown > 0) return undefined;
    const enemy = this.fightTarget(view)?.enemy;
    if (!enemy?.interruptible || enemy.block || enemy.invulnerable) return undefined;
    if (!enemy.threats.some((t) => t.ticks > 1)) return undefined;
    const dx = enemy.x - me.x;
    const dy = enemy.y - me.y;
    if (Math.hypot(dx, dy) > view.stats(this.id).reach + enemy.half) return undefined;
    const [ox, oy] = octant(dx, dy);
    return { moveX: ox, moveY: oy, attack: 1 };
  }

  /** Every threat on its screen (monsters never leave theirs) and the shots flying near it. */
  private threatsAround(view: BotView, me: Player): readonly Threat[] {
    const out = this.threats;
    out.length = 0;
    this.bodies = view.enemiesOn(view.nav.screenAt(me.x, me.y));
    for (const e of this.bodies) for (const t of e.threats) out.push(t);
    for (const h of view.hostilesNear(me.x, me.y, HOSTILE_SIGHT))
      out.push({
        kind: "lane",
        x: h.x,
        y: h.y,
        dirX: h.dirX,
        dirY: h.dirY,
        length: h.left,
        width: 2 * h.radius + 2,
        ticks: 0,
        speed: h.speed,
        key: h.key,
      });
    return out;
  }

  /**
   * The open way (8 directions, the one it walks first) where the fewest threats still
   * reach it after DODGE_LOOKAHEAD ticks of walking, not into a monster, toward its fight on a tie.
   */
  private dodgeDirection(view: BotView, me: Player, threats: readonly Threat[]): readonly [number, number] | undefined {
    const { nav } = view;
    const pace = view.stats(this.id).speed * (me.slow > 0 ? SLOW_FACTOR : 1);
    const far = (pace * DODGE_LOOKAHEAD) / SECOND;
    const target = this.fightTarget(view);
    const tl = target ? Math.hypot(target.x - me.x, target.y - me.y) || 1 : 1;
    const tx = target ? (target.x - me.x) / tl : 0;
    const ty = target ? (target.y - me.y) / tl : 0;
    let best: readonly [number, number] | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = -1; i < OCTANTS.length; i++) {
      const dir = i < 0 ? this.heading : (OCTANTS[i] ?? this.heading);
      const len = Math.hypot(dir[0], dir[1]) || 1;
      const ux = dir[0] / len;
      const uy = dir[1] / len;
      const px = me.x + ux * far;
      const py = me.y + uy * far;
      const [ex, ey] = nav.tileOf(px, py);
      const [hx, hy] = nav.tileOf(me.x + (ux * far) / 2, me.y + (uy * far) / 2);
      if (!nav.walkable(ex, ey) || !nav.walkable(hx, hy)) continue;
      let still = 0;
      for (const t of threats) if (threatEta(t, px, py) >= 0) still++;
      let bump = 0;
      for (const e of this.bodies) {
        if (e.damage <= 0) continue;
        const touch = e.half + PLAYER_HALF + 4;
        if (
          Math.hypot(px - e.x, py - e.y) < touch ||
          Math.hypot(me.x + (ux * far) / 2 - e.x, me.y + (uy * far) / 2 - e.y) < touch
        )
          bump++;
      }
      const score = still * 100 + bump * 60 - (ux * tx + uy * ty) * 2;
      if (score < bestScore) [best, bestScore] = [dir, score];
    }
    return best;
  }

  /** Walks `dir`; swings at its fight target on the way when the target is in reach that way. */
  private dodgeInput(view: BotView, me: Player, dir: readonly [number, number]): PlayerInputLike {
    const target = this.fightTarget(view);
    if (target && me.cooldown === 0 && !(target.enemy?.invulnerable ?? false)) {
      const dx = target.x - me.x;
      const dy = target.y - me.y;
      const [ox, oy] = octant(dx, dy);
      const reach = view.stats(this.id).reach + (target.enemy ? target.enemy.half : PLAYER_HALF);
      if (ox === dir[0] && oy === dir[1] && Math.hypot(dx, dy) <= reach && this.rng() < this.personality.skill)
        return { moveX: dir[0], moveY: dir[1], attack: 1 };
    }
    return move(dir[0], dir[1]);
  }

  /** What it is fighting, if anything. */
  private fightTarget(view: BotView): { x: number; y: number; enemy?: BotEnemy } | undefined {
    if (this.mode !== "fight") return undefined;
    if (this.targetHero) return view.hero(this.target);
    const enemy = view.enemy(this.target);
    return enemy ? { x: enemy.x, y: enemy.y, enemy } : undefined;
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
