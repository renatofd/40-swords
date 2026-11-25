import type { Client, CloseCode, StepContext } from "@colyseus/core";
import type { GameMap } from "@core/maps";
import { GameRoom, InputBudget, InterestManager, loadMap, type PositionedEntity } from "@core/server";
import { boxHitsSolid } from "@core/shared";
import {
  ARENA_PREP_SECONDS,
  areaAt,
  arenaRect,
  BOSS_CHEST_RARITY,
  type BossDownMessage,
  type BotsMessage,
  CHEST_RESPAWN_SECONDS,
  Chest,
  CLASS_IDS,
  computeStats,
  createRng,
  type DamageMessage,
  DROPPED_CHEST_LIFETIME_SECONDS,
  DROPPED_CHEST_OPEN_SECONDS,
  ELITE_CHANCE,
  ELITE_CHANCE_DUNGEON,
  ELITE_CHEST_CHANCE,
  ENEMIES,
  ENEMY_KNOCK_SPEED,
  Enemy,
  type EnemyKind,
  type EnemyShotMessage,
  enemyStats,
  type GainMessage,
  HEART_DROP_CHANCE,
  HEART_DROP_CHANCE_ELITE,
  HEART_HEAL,
  HIT_INVULN_TICKS,
  type Hitbox,
  type HitResult,
  hitboxTouches,
  INTEREST_EVERY_TICKS,
  INTEREST_RADIUS,
  isClassId,
  isLobbyPhase,
  isPlayingPhase,
  isPvpPhase,
  type KillMessage,
  type LevelUpMessage,
  MAX_LEVEL,
  MAX_PLAYERS_PER_ROOM,
  MatchPhase,
  type MatchTimes,
  MINIBOSS_CHEST_RARITY,
  Msg,
  mitigate,
  OFFER_SLOTS,
  type OfferItem,
  type OfferMessage,
  offerPosition,
  offerPrice,
  PALETTES,
  PASSIVE_IDS,
  PICKUP_LIFETIME_SECONDS,
  PICKUP_RADIUS,
  type PickedMessage,
  Pickup,
  type PickupKind,
  PLAYER_HALF,
  PLAYER_KNOCK_SPEED,
  PLAYER_KNOCK_TICKS,
  Player,
  PlayerInput,
  type PlayerInputLike,
  PROP_HALF,
  PROP_KINDS,
  PROPS,
  PROTOCOL_VERSION,
  type ProjectileEndMessage,
  type Prop,
  PVP_DAMAGE_FACTOR,
  projectileKey,
  REGEN_DELAY_SECONDS,
  REGEN_PER_SECOND,
  RELIC_IDS,
  RESULTS_SECONDS,
  type ReadyMessage,
  Relic,
  type RelicKind,
  type Rng,
  RosterEntry,
  rollHit,
  rollProjectileHit,
  rollPropDrop,
  rollRarity,
  rollRupees,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SHOP_RESTOCK_SECONDS,
  SHOT_DEFS,
  type ShopFailMessage,
  type ShopMessage,
  type ShotMessage,
  type SimWorld,
  SLOW_IMMUNE_TICKS,
  type Spot,
  START_COUNTDOWN_SECONDS,
  type Stats,
  type SummaryMessage,
  sanitizeMatchTimes,
  sanitizePalette,
  screenOf,
  screenRect,
  stepPlayer,
  sweptHit,
  swordHitbox,
  TICK_RATE,
  TILE_SIZE,
  TOUCH_RADIUS,
  travelDistance,
  volleyAngles,
  WEAPON_IDS,
  WEAPONS,
  type WeaponId,
  type WorldInfo,
  type WorldJoinOptions,
  type WorldObjects,
  WorldState,
  weaponCopies,
  weaponCountKey,
  xpToNext,
  ZONE_DAMAGE_PER_SECOND,
  zoneRadius,
} from "@game/shared";
import {
  BotBrain,
  type BotEnemy,
  type BotHostile,
  type BotSpot,
  type BotView,
  enemyDanger,
  rollPersonality,
  THINK_TICKS,
} from "../bots/BotBrain";
import { botName } from "../bots/names";
import { type Navigation, navigationFor } from "../bots/navigation";
import {
  contactActive,
  createBrain,
  type EnemyBrain,
  type EnemyEvent,
  type EnemyHost,
  type HeroRef,
  hitEnemy,
  type Rect,
  type SpawnerState,
  stepEnemyAi,
  untargetable,
} from "../enemies";
import { botEnemyOf } from "../enemies/botView";
import { loadProps, loadWorldInfo, loadWorldObjects } from "../world/mapObjects";

/** Bots see props as spots with this id (no clash with monsters, chests and pickups). */
const PROP_SPOT_PREFIX = "prop:";
const propSpotId = (id: number) => `${PROP_SPOT_PREFIX}${id}`;

export interface WorldCreateOptions {
  /** Set by the server in defineRoom (game/server/src/index.ts), never by clients. */
  mapId?: string;
  /** Match timings, also set by the server (from the environment, see config.ts). */
  match?: Partial<MatchTimes>;
}

/** A weapon projectile in flight. Clients draw it from the "shot" message; only the server checks hits. */
interface Projectile {
  key: string;
  owner: string;
  weapon: WeaponId;
  rarity: number;
  x0: number;
  y0: number;
  dirX: number;
  dirY: number;
  dist: number;
  maxDist: number;
  pierceLeft: number;
  hits: Set<string>;
}

/** An enemy projectile in flight; it hurts the first hero it touches. */
interface Hostile {
  key: string;
  x0: number;
  y0: number;
  dirX: number;
  dirY: number;
  dist: number;
  maxDist: number;
  speed: number;
  radius: number;
  damage: number;
  /** Kind of the enemy that fired it (it may be gone when the shot lands). */
  kind: EnemyKind;
  /** Webs: ticks of slow on the hero it hits (SHOT_DEFS). */
  slowTicks: number;
}

/** A vendor's offers for one player, rolled with that player's luck. */
interface Shop {
  offers: OfferMessage[];
  rolledAt: number;
}

/** Extra data of a chest: its lowest rarity, and whether it was dropped (one-shot) or is part of the map. */
interface ChestMeta {
  floor: number;
  dropped: boolean;
  /** Map chests: tick it refills. Dropped chests: tick it disappears. */
  at: number;
}

/** What a hero did in the current match (for the summary its player gets at the end). */
interface HeroStats {
  kills: number;
  monsters: number;
  bosses: number;
  chests: number;
  /** The summary went out already (it is sent once: when the hero falls or the match ends). */
  sent: boolean;
}

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)] as T;

/**
 * The open world of one match. Authoritative: clients only send PlayerInput
 * frames; the server runs the shared `stepPlayer` once per received input,
 * then projectiles, enemies (only on screens near a hero), chests, shops and drops.
 *
 * The match (see match.ts): a waiting room until everyone is ready, then one
 * life each: PvE first, PvP after a few minutes (the winner of a fight takes
 * one relic and every rupee of the loser), the battle royale arena at 30
 * minutes. Whoever falls watches; the last hero standing wins, at any moment.
 * Bots (bots/BotBrain.ts) fill each match up to MAX_PLAYERS_PER_ROOM heroes
 * unless the waiting room switched them off.
 */
export class WorldRoom extends GameRoom<{ state: WorldState; input: PlayerInput }> {
  protected readonly protocolVersion = PROTOCOL_VERSION;
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override state = new WorldState();

  /** `sanitize` clamps every field as it is decoded: never trust the wire. */
  override inputs = this.defineInput(PlayerInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-1, 1], moveY: [-1, 1], attack: [0, 1] },
  });

  /** Combat and drop randomness. Seeded so tests can make it reproducible. */
  protected rng: Rng = createRng(Math.floor(Math.random() * 2 ** 32));
  /** When PvP and the arena start (from defineRoom options; never from clients). */
  protected times: MatchTimes = sanitizeMatchTimes(undefined);

  private map!: GameMap;
  private objects!: WorldObjects;
  private info!: WorldInfo;
  private world!: SimWorld;
  private screenColumns = 1;
  private tick = 0;
  private spawnCursor = 0;
  private nextId = 1;
  private spawners: SpawnerState[] = [];
  private brains = new Map<string, EnemyBrain>();
  private enemyHost!: EnemyHost;
  /** Events of the enemy being stepped (reused every tick). */
  private enemyEvents: EnemyEvent[] = [];
  /** Screens with a hero on or next to them; enemies elsewhere wait (they can't leave their screen). */
  private active = new Set<number>();
  /** Enemy ids per active screen, rebuilt every tick (hit tests only look at nearby enemies). */
  private buckets = new Map<number, string[]>();
  private pickupExpiry = new Map<string, number>();
  /** Tick each hero last took damage (out of combat, heroes slowly heal). */
  private lastHurt = new Map<string, number>();
  /** Per hero: tick before which no new web slows it (SLOW_IMMUNE_TICKS after the last one ends). */
  private slowImmuneUntil = new Map<string, number>();
  /** Heroes in the current match and what they did in it. */
  private heroStats = new Map<string, HeroStats>();
  private projectiles: Projectile[] = [];
  private hostiles: Hostile[] = [];
  /** Attributes of each hero (class, level and relics), recomputed when one of them changes. */
  private stats = new Map<string, Stats>();
  /** Last swing / volley counters seen per player: a change means a new swing or volley to resolve. */
  private lastSwing = new Map<string, number>();
  private lastVolley = new Map<string, number>();
  private chestMeta = new Map<string, ChestMeta>();
  /** Tall grass and pots by id (tile index), and the ones on each screen (for the bots). */
  private props = new Map<number, Prop>();
  private propsByScreen = new Map<number, Prop[]>();
  /** Broken props, by id: the tick each one may come back at. */
  private regrowAt = new Map<number, number>();
  /** Vendor on each screen. */
  private vendorByScreen = new Map<number, Spot>();
  /** Per player: offers of each vendor, the screen they stand on and the offers they are touching. */
  private shops = new Map<string, Map<string, Shop>>();
  private screenOfPlayer = new Map<string, number>();
  private touching = new Map<string, Set<number>>();
  private inputBudget = new InputBudget();
  /** Tick the current match (or waiting room) started at, and the arena fight. */
  private matchStart = 0;
  private fightStart = 0;
  /** Heroes at the start of the match (a match started alone ends only when that hero falls or wins the arena). */
  private startedWith = 0;
  /** Radius of the safe zone when the fight starts (reaches the arena corners). */
  private zoneStart = 0;
  private arena?: NonNullable<ReturnType<typeof arenaRect>>;
  /** Arena spawns sorted around the centre, so heroes start spread out. */
  private arenaSpawns: { x: number; y: number }[] = [];
  /** One manager for every `.view()` collection; ids are prefixed per collection. */
  private interest = new InterestManager<PositionedEntity>({ radius: INTEREST_RADIUS });
  /** Heroes the server plays, by id (`bot:N`, never a session id); they leave when the match ends. */
  private bots = new Map<string, BotBrain>();
  private botSerial = 0;
  private nav!: Navigation;
  private botView!: BotView;
  /** What bots see of each enemy and screen, worked out once per tick (every bot shares it). */
  private botMemoTick = -1;
  private botEnemies = new Map<string, BotEnemy | undefined>();
  private botScreens = new Map<number, BotEnemy[]>();
  /** Server only: the kind of monster that last hurt each hero (balance runs read it when a hero falls). */
  private lastMonsterHit = new Map<string, EnemyKind>();

  override onCreate(options: WorldCreateOptions = {}) {
    const mapId = typeof options.mapId === "string" ? options.mapId : "overworld";
    this.map = loadMap(mapId, { tileSize: TILE_SIZE });
    this.objects = loadWorldObjects(mapId);
    this.info = loadWorldInfo(mapId);
    this.times = sanitizeMatchTimes(options.match);
    this.arena = arenaRect(this.info);
    const arena = this.arena;
    if (arena) {
      const angle = (p: { x: number; y: number }) => Math.atan2(p.y - arena.centerY, p.x - arena.centerX);
      this.arenaSpawns = [...this.objects.arenaSpawns].sort((a, b) => angle(a) - angle(b));
      this.zoneStart = Math.ceil(Math.hypot(arena.width, arena.height) / 2);
    }
    this.world = { grid: this.map.collision, portals: this.objects.portals };
    this.enemyHost = this.createEnemyHost();
    this.screenColumns = Math.max(1, Math.ceil(this.map.pixelWidth / SCREEN_WIDTH));
    this.state.mapId = mapId;
    this.spawners = this.objects.enemies.map((s) => ({ ...s, respawnAt: 0 }));
    for (const c of this.objects.chests) {
      // Chests deep in dungeons hold at least uncommon relics, and look gold.
      const { col, row } = screenOf(c.x, c.y);
      const floor = areaAt(this.info.areas, col, row)?.kind === "dungeon" ? 1 : 0;
      this.state.chests.set(c.id, new Chest({ x: c.x, y: c.y, open: false, gold: floor >= 1 }));
      this.chestMeta.set(c.id, { floor, dropped: false, at: 0 });
    }
    for (const v of this.objects.vendors) this.vendorByScreen.set(this.screenIndexAt(v.x, v.y), v);
    for (const prop of loadProps(mapId).props) {
      this.props.set(prop.id, prop);
      const screen = this.screenIndexAt(prop.x, prop.y);
      const list = this.propsByScreen.get(screen);
      if (list) list.push(prop);
      else this.propsByScreen.set(screen, [prop]);
    }
    // How hard each screen is for the bots: its strongest monster.
    const danger = new Map<number, number>();
    for (const s of this.spawners) {
      const screen = this.screenIndexAt(s.x, s.y);
      const def = ENEMIES[s.kind];
      danger.set(screen, Math.max(danger.get(screen) ?? 0, enemyDanger(def.rank, s.tier, false, def.danger ?? 0)));
    }
    this.nav = navigationFor(mapId, this.map.collision, this.objects.portals, danger);
    this.botView = this.createBotView();
    // The room opens as a waiting room (phase "lobby").
    this.onMessage(Msg.ready, (client: Client, message: unknown) => this.setReady(client.sessionId, message));
    this.onMessage(Msg.watchNext, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.out) this.pickWatch(client.sessionId, player);
    });
    this.onMessage(Msg.bots, (_client: Client, message: unknown) => this.setBots(message));
    this.startSimulation((ctx) => this.step(ctx), TICK_RATE);
  }

  override onJoin(client: Client, options: WorldJoinOptions) {
    const id = client.sessionId;
    // The hero was picked before joining (beforeJoin); join options are untrusted.
    const classId = isClassId(options?.classId) ? options.classId : "knight";
    const spawn = this.nextSpawn();
    const name = this.identity(client).name;
    // Colours are unlocked by the player's career, kept in their browser: cosmetic, so any known one goes.
    const palette = sanitizePalette(options?.palette);
    const player = new Player({ name, classId, palette, x: spawn.x, y: spawn.y, facing: 2, level: 1 });
    this.state.players.set(id, player);
    this.state.roster.set(id, new RosterEntry({ name, classId, level: 1 }));
    this.applyStats(id, player);
    player.hp = player.maxHp;
    // The room closes when a match starts, but a seat reserved just before can still land
    // here: too late for this match, watch until the next one.
    if (!isLobbyPhase(this.state.phase)) this.knockOut(id, player);
    this.lastSwing.set(id, player.swing);
    this.lastVolley.set(id, player.vseq);
    this.interest.addViewer(client);
    this.updateInterest();
  }

  override onLeave(client: Client, _code: CloseCode) {
    this.interest.removeViewer(client);
    this.forget(client.sessionId);
  }

  /** Drops everything the room keeps about a hero (a player who left, or a bot at the end of the match). */
  private forget(id: string) {
    this.state.players.delete(id);
    this.state.roster.delete(id);
    this.stats.delete(id);
    this.lastSwing.delete(id);
    this.lastVolley.delete(id);
    this.shops.delete(id);
    this.screenOfPlayer.delete(id);
    this.touching.delete(id);
    this.inputBudget.delete(id);
    this.bots.delete(id);
    this.lastHurt.delete(id);
    this.slowImmuneUntil.delete(id);
    this.lastMonsterHit.delete(id);
    this.heroStats.delete(id);
  }

  /** A dropped connection keeps its seat for a while (GameRoom); meanwhile the waiting room doesn't wait for it. */
  override onDrop(client: Client, code?: CloseCode) {
    super.onDrop(client, code);
    this.setAway(client.sessionId, true);
  }

  override onReconnect(client: Client) {
    this.setAway(client.sessionId, false);
  }

  private setAway(id: string, away: boolean) {
    const entry = this.state.roster.get(id);
    if (entry) entry.away = away;
  }

  private isAway(id: string) {
    return this.state.roster.get(id)?.away === true;
  }

  private nextSpawn() {
    return (
      this.map.spawns[this.spawnCursor++ % this.map.spawns.length] ?? {
        x: this.map.pixelWidth / 2,
        y: this.map.pixelHeight / 2,
      }
    );
  }

  private screenIndex(col: number, row: number) {
    return row * this.screenColumns + col;
  }

  private screenIndexAt(x: number, y: number) {
    return this.screenIndex(Math.floor(x / SCREEN_WIDTH), Math.floor(y / SCREEN_HEIGHT));
  }

  /** Recomputes a hero's attributes (class, level, relics) and the simulation fields derived from them. */
  private applyStats(id: string, player: Player) {
    const stats = computeStats(isClassId(player.classId) ? player.classId : "knight", player.level, player.relics);
    this.stats.set(id, stats);
    const gained = stats.maxHp - player.maxHp;
    player.maxHp = stats.maxHp;
    if (gained > 0 && !player.dead) player.hp += gained;
    player.hp = Math.min(player.hp, player.maxHp);
    player.speed = stats.speed;
    player.swingCd = stats.attackCooldownTicks;
    player.cdPct = stats.cooldownPct;
    for (const weapon of WEAPON_IDS) player[weaponCountKey(weapon)] = weaponCopies(player.relics, weapon).length;
  }

  private statsOf(id: string): Stats {
    return this.stats.get(id) ?? computeStats("knight", 1, []);
  }

  // ─── Simulation ───────────────────────────────────────────────────────────

  private step(ctx: StepContext) {
    this.tick++;
    this.stepMatch();
    // Outside a match (waiting room, results) the world is frozen: nothing hurts, nothing can be taken.
    const playing = isPlayingPhase(this.state.phase);
    this.updateActive();
    const view = this.botView;
    view.tick = this.tick;
    view.phase = this.state.phase;
    view.zone = this.state.zone;
    for (const [id, player] of this.state.players) this.stepPlayerTick(id, player, ctx.dt);
    this.stepProjectiles(ctx.dt);
    this.stepHostiles(ctx.dt);
    if (playing) {
      for (const [id, enemy] of this.state.enemies) this.stepEnemy(id, enemy);
      this.stepPickups();
      this.stepRegen();
      this.stepChests();
      this.stepProps();
      for (const [id, player] of this.state.players) this.stepShop(id, player);
    }
    this.stepSpawners();
    this.stepWatchers();
    if (playing) this.checkMatchEnd();
    if (this.tick % INTEREST_EVERY_TICKS === 0) this.updateInterest();
  }

  /** Marks the screens around each hero as active and buckets the enemies on them. */
  private updateActive() {
    this.active.clear();
    // Heroes out of the match don't count: players who are out stand next to the hero they watch.
    for (const p of this.state.players.values()) {
      if (p.out) continue;
      const col = Math.floor(p.x / SCREEN_WIDTH);
      const row = Math.floor(p.y / SCREEN_HEIGHT);
      this.active.add(this.screenIndex(col, row));
      this.active.add(this.screenIndex(col + 1, row));
      this.active.add(this.screenIndex(col - 1, row));
      this.active.add(this.screenIndex(col, row + 1));
      this.active.add(this.screenIndex(col, row - 1));
    }
    this.buckets.clear();
    for (const [id, enemy] of this.state.enemies) {
      const index = this.screenIndexAt(enemy.x, enemy.y);
      if (!this.active.has(index)) continue;
      const bucket = this.buckets.get(index);
      if (bucket) bucket.push(id);
      else this.buckets.set(index, [id]);
    }
  }

  /** Enemies on the screens containing the given points (deduplicated). */
  private enemiesNear(...points: [number, number][]): string[] {
    const screens = new Set(points.map(([x, y]) => this.screenIndexAt(x, y)));
    return [...screens].flatMap((s) => this.buckets.get(s) ?? []);
  }

  private stepPlayerTick(id: string, player: Player, dt: number) {
    if (player.invuln > 0) player.invuln--;

    // A bot: one input per tick from its brain, like a player with a perfect connection.
    const bot = this.bots.get(id);
    if (bot) {
      this.applyInput(id, player, bot.think(this.botView, player), dt);
      return;
    }
    const channel = this.inputs.get(id);
    const inputs = channel ? channel.take(this.inputBudget.refill(id)) : [];
    this.inputBudget.spend(id, inputs.length);
    for (const input of inputs) this.applyInput(id, player, input, dt);
    // No input this tick (tab hidden, connection dropped): the player stands still.
    if (inputs.length === 0) {
      player.vx = 0;
      player.vy = 0;
    }
  }

  private applyInput(id: string, player: Player, input: PlayerInputLike, dt: number) {
    stepPlayer(player, input, dt, this.world);
    if (player.swing !== this.lastSwing.get(id)) {
      this.lastSwing.set(id, player.swing);
      this.resolveSwing(id, player);
    }
    if (player.vseq !== this.lastVolley.get(id)) {
      this.lastVolley.set(id, player.vseq);
      this.fireVolley(id, player);
    }
  }

  /** Sword hits every enemy in the hitbox once, tall grass and pots, and other heroes while PvP is on. */
  private resolveSwing(id: string, player: Player) {
    if (!isPlayingPhase(this.state.phase)) return;
    const stats = this.statsOf(id);
    const box = swordHitbox(player.x, player.y, player.facing, stats.reach);
    for (const enemyId of this.enemiesNear([player.x, player.y], [box.x, box.y])) {
      const enemy = this.state.enemies.get(enemyId);
      const brain = this.brains.get(enemyId);
      // A leaping enemy is in the air: the blade passes under it.
      if (!enemy || !brain || untargetable(brain) || !hitboxTouches(box, enemy.x, enemy.y, brain.stats.half)) continue;
      const hit = rollHit(stats, brain.stats.defense, this.rng);
      this.damageEnemy(enemyId, enemy, brain, id, player, hit, player.x, player.y, ENEMY_KNOCK_SPEED);
    }
    this.breakProps(box, stats.luck);
    if (!isPvpPhase(this.state.phase)) return;
    for (const [otherId, other] of this.state.players) {
      if (otherId === id || !this.canBeHurt(other) || !hitboxTouches(box, other.x, other.y, PLAYER_HALF)) continue;
      const hit = rollHit(stats, this.statsOf(otherId).defense, this.rng);
      this.pvpHit(id, player, otherId, other, hit, player.x, player.y);
    }
  }

  /** Spawns the projectiles of the weapons that just fired (`vmask`): `perCopy` per copy owned. */
  private fireVolley(id: string, player: Player) {
    const counts = WEAPON_IDS.map(() => 0);
    WEAPON_IDS.forEach((weapon, w) => {
      if ((player.vmask & (1 << w)) === 0) return;
      const def = WEAPONS[weapon];
      const copies = weaponCopies(player.relics, weapon);
      const total = copies.length * def.perCopy;
      counts[w] = total;
      volleyAngles(weapon, total, player.facing).forEach((angle, i) => {
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        this.projectiles.push({
          key: projectileKey(id, player.vseq, w, i),
          owner: id,
          weapon,
          rarity: copies[i % copies.length] ?? 0,
          x0: player.x,
          y0: player.y,
          dirX,
          dirY,
          dist: 0,
          maxDist: travelDistance(this.map.collision, player.x, player.y, dirX, dirY, def.range),
          pierceLeft: def.pierce,
          hits: new Set(),
        });
      });
    });
    const message: ShotMessage = {
      owner: id,
      volley: player.vseq,
      mask: player.vmask,
      x: player.x,
      y: player.y,
      facing: player.facing,
      counts,
    };
    // The shooter predicted this volley already.
    this.sendNear(player.x, player.y, Msg.shot, message, id);
  }

  private stepProjectiles(dt: number) {
    const ended: { key: string; x: number; y: number }[] = [];
    this.projectiles = this.projectiles.filter((p) => {
      const owner = this.state.players.get(p.owner);
      if (!owner) return false; // the shooter left
      const def = WEAPONS[p.weapon];
      const ax = p.x0 + p.dirX * p.dist;
      const ay = p.y0 + p.dirY * p.dist;
      p.dist = Math.min(p.maxDist, p.dist + def.speed * dt);
      const bx = p.x0 + p.dirX * p.dist;
      const by = p.y0 + p.dirY * p.dist;
      // Outside a match projectiles only fly (nothing to hit).
      if (!isPlayingPhase(this.state.phase)) return p.dist < p.maxDist;
      for (const enemyId of this.enemiesNear([ax, ay], [bx, by])) {
        const enemy = this.state.enemies.get(enemyId);
        const brain = this.brains.get(enemyId);
        if (!enemy || !brain || p.hits.has(enemyId) || untargetable(brain)) continue;
        if (!sweptHit(ax, ay, bx, by, def.radius, enemy.x, enemy.y, brain.stats.half)) continue;
        p.hits.add(enemyId);
        const hit = rollProjectileHit(p.weapon, p.rarity, this.statsOf(p.owner), brain.stats.defense, this.rng);
        this.damageEnemy(enemyId, enemy, brain, p.owner, owner, hit, ax, ay, def.knock);
        if (p.pierceLeft-- <= 0) {
          ended.push({ key: p.key, x: bx, y: by });
          return false;
        }
      }
      if (isPvpPhase(this.state.phase))
        for (const [otherId, other] of this.state.players) {
          const key = `p:${otherId}`;
          if (otherId === p.owner || p.hits.has(key) || !this.canBeHurt(other)) continue;
          if (!sweptHit(ax, ay, bx, by, def.radius, other.x, other.y, PLAYER_HALF)) continue;
          p.hits.add(key);
          const defense = this.statsOf(otherId).defense;
          const hit = rollProjectileHit(p.weapon, p.rarity, this.statsOf(p.owner), defense, this.rng);
          this.pvpHit(p.owner, owner, otherId, other, hit, ax, ay);
          if (p.pierceLeft-- <= 0) {
            ended.push({ key: p.key, x: bx, y: by });
            return false;
          }
        }
      return p.dist < p.maxDist;
    });
    this.sendEnded(ended);
  }

  /** Tells nearby clients which projectiles stopped early (the others end on their own at a wall or their range). */
  private sendEnded(ended: { key: string; x: number; y: number }[]) {
    if (ended.length === 0) return;
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const client of this.clients) {
      const viewer = this.state.players.get(client.sessionId);
      if (!viewer) continue;
      const keys = ended.filter((e) => (e.x - viewer.x) ** 2 + (e.y - viewer.y) ** 2 <= r2).map((e) => e.key);
      if (keys.length === 0) continue;
      const message: ProjectileEndMessage = { keys };
      client.send(Msg.projectileEnd, message);
    }
  }

  private damageEnemy(
    enemyId: string,
    enemy: Enemy,
    brain: EnemyBrain,
    attackerId: string,
    attacker: Player,
    hit: HitResult,
    fromX: number,
    fromY: number,
    knockSpeed: number,
  ) {
    // The AI decides what the blow does: stone, front block, stone marks, interrupt, knockback.
    const outcome = hitEnemy(enemy, brain, hit.amount, fromX, fromY, knockSpeed);
    if (outcome.amount > 0 && hit.heal > 0 && !attacker.dead)
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + hit.heal);
    const message: DamageMessage = { x: enemy.x, y: enemy.y, amount: outcome.amount, crit: hit.crit, player: false };
    if (outcome.blocked) message.blocked = true;
    this.sendDamage(message);
    if (enemy.hp <= 0) this.killEnemy(enemyId, enemy, brain, attackerId, attacker);
  }

  private killEnemy(enemyId: string, enemy: Enemy, brain: EnemyBrain, killerId: string, killer: Player) {
    const rupees = rollRupees(brain.stats.rupees, this.statsOf(killerId).luck, this.rng);
    this.dropPickup("rupee", rupees, enemy.x, enemy.y);
    const { rank } = brain.def;
    const heart = rank !== "normal" ? 1 : enemy.elite ? HEART_DROP_CHANCE_ELITE : HEART_DROP_CHANCE;
    if (this.rng() < heart) this.dropPickup("heart", 1, enemy.x + 8, enemy.y);
    if (rank !== "normal") {
      this.dropChest(enemy.x, enemy.y, rank === "boss" ? BOSS_CHEST_RARITY : MINIBOSS_CHEST_RARITY);
      const message: BossDownMessage = { kind: brain.kind, by: killer.name };
      this.broadcast(Msg.bossDown, message);
    } else if (enemy.elite && this.rng() < ELITE_CHEST_CHANCE) {
      this.dropChest(enemy.x, enemy.y, 0);
    }
    this.removeEnemy(enemyId);
    if (brain.spawner) brain.spawner.respawnAt = this.tick + brain.def.respawnSeconds * TICK_RATE;
    this.giveXp(killerId, killer, brain.stats.xp);
    const stats = this.heroStats.get(killerId);
    if (stats) {
      stats.monsters++;
      if (rank !== "normal") stats.bosses++;
    }
  }

  /** Removes an enemy (and the minions it summoned) without drops. */
  private removeEnemy(enemyId: string) {
    const brain = this.brains.get(enemyId);
    this.state.enemies.delete(enemyId);
    this.brains.delete(enemyId);
    if (!brain) return;
    if (brain.spawner?.enemyId === enemyId) brain.spawner.enemyId = undefined;
    for (const minion of brain.minions) this.removeEnemy(minion);
  }

  private giveXp(id: string, player: Player, xp: number) {
    if (player.level >= MAX_LEVEL) return;
    player.xp += xp;
    let leveled = false;
    while (player.level < MAX_LEVEL && player.xp >= xpToNext(player.level)) {
      player.xp -= xpToNext(player.level);
      player.level++;
      leveled = true;
    }
    if (player.level >= MAX_LEVEL) player.xp = 0;
    if (!leveled) return;
    // Level up: better attributes and a full heal.
    this.applyStats(id, player);
    player.hp = player.maxHp;
    const entry = this.state.roster.get(id);
    if (entry) entry.level = player.level;
    const message: LevelUpMessage = { level: player.level };
    this.clientOf(id)?.send(Msg.levelUp, message);
  }

  private canBeHurt(player: Player) {
    return !player.dead && player.invuln === 0;
  }

  /** Monster damage (contact, strikes, landings or shots) from a monster of kind `source`, through the hero's defense. */
  private hurtPlayer(id: string, player: Player, raw: number, fromX: number, fromY: number, source: EnemyKind) {
    if (!this.canBeHurt(player)) return;
    this.lastMonsterHit.set(id, source);
    this.damagePlayer(id, player, mitigate(raw, this.statsOf(id).defense), false, fromX, fromY, "monster");
  }

  /**
   * A hero hit by another hero (PvP phases): PVP_DAMAGE_FACTOR of the damage, life steal
   * for the attacker, loot if it was the last blow.
   */
  private pvpHit(
    attackerId: string,
    attacker: Player,
    victimId: string,
    victim: Player,
    hit: HitResult,
    fromX: number,
    fromY: number,
  ) {
    const amount = Math.max(1, Math.round(hit.amount * PVP_DAMAGE_FACTOR));
    const heal = hit.heal * PVP_DAMAGE_FACTOR;
    if (heal > 0 && !attacker.dead) attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    this.damagePlayer(victimId, victim, amount, hit.crit, fromX, fromY, "hero", attackerId);
  }

  private damagePlayer(
    id: string,
    player: Player,
    amount: number,
    crit: boolean,
    fromX: number,
    fromY: number,
    cause: KillMessage["cause"],
    attackerId?: string,
  ) {
    player.hp = Math.max(0, player.hp - amount);
    player.invuln = HIT_INVULN_TICKS;
    this.lastHurt.set(id, this.tick);
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    player.knockX = (dx / len) * PLAYER_KNOCK_SPEED;
    player.knockY = (dy / len) * PLAYER_KNOCK_SPEED;
    player.knockTicks = PLAYER_KNOCK_TICKS;
    player.lock = 0;
    this.sendDamage({ x: player.x, y: player.y, amount, crit, player: true });
    if (player.hp <= 0) this.heroDown(id, player, cause, attackerId);
  }

  /**
   * A hero fell and is out of the match (one life each). Beaten by another
   * hero: the winner takes one random relic and every rupee.
   */
  private heroDown(id: string, player: Player, cause: KillMessage["cause"], killerId?: string) {
    const killer = killerId ? this.state.players.get(killerId) : undefined;
    let relic: KillMessage["relic"];
    let rupees = 0;
    if (killer && killerId) {
      const index = Math.floor(this.rng() * player.relics.length);
      const taken = player.relics.length > 0 ? player.relics[index] : undefined;
      if (taken) {
        relic = { kind: taken.kind as RelicKind, rarity: taken.rarity };
        player.relics.splice(index, 1);
        this.applyStats(id, player);
        this.giveRelic(killerId, killer, relic.kind, relic.rarity, "loot");
      }
      rupees = player.rupees;
      player.rupees = 0;
      killer.rupees += rupees;
      const stats = this.heroStats.get(killerId);
      if (stats) stats.kills++;
      const entry = this.state.roster.get(killerId);
      if (entry) entry.kills++;
    }
    // Watch the hero who did it, if any.
    this.knockOut(id, player, killer && !killer.out ? killerId : undefined);
    player.place = this.aliveCount() + 1;
    this.sendSummary(id, player, player.place);
    const message: KillMessage = {
      cause,
      killer: killer && killerId ? killerId : "",
      killerName: killer?.name ?? "",
      victim: id,
      victimName: player.name,
      relic,
      rupees,
      place: player.place,
    };
    this.broadcast(Msg.kill, message);
  }

  /** Out until the next match: hidden, and the server keeps it next to the hero it watches. */
  private knockOut(id: string, player: Player, watch?: string) {
    player.dead = true;
    player.out = true;
    player.hp = 0;
    player.vx = 0;
    player.vy = 0;
    player.knockTicks = 0;
    player.slow = 0;
    const entry = this.state.roster.get(id);
    if (entry) entry.out = true;
    player.watch = "";
    // Bots have nobody to show the match to: they stay where they fell (hidden).
    if (!this.bots.has(id)) this.pickWatch(id, player, watch);
  }

  /** Who an out hero watches: `preferred` if still in, else the next hero still in the match. */
  private pickWatch(id: string, player: Player, preferred?: string) {
    const standing = [...this.state.players.entries()]
      .filter(([other, p]) => other !== id && !p.out)
      .map(([other]) => other)
      .sort();
    if (preferred && standing.includes(preferred)) player.watch = preferred;
    else player.watch = standing.find((other) => other > player.watch) ?? standing[0] ?? "";
  }

  /** Out heroes move with the hero they watch, so they see (and are sent) what is around it. */
  private stepWatchers() {
    for (const [id, player] of this.state.players) {
      if (!player.out || this.bots.has(id)) continue;
      let target = this.state.players.get(player.watch);
      if (!target || target.out) {
        this.pickWatch(id, player);
        target = this.state.players.get(player.watch);
      }
      if (target && (player.x !== target.x || player.y !== target.y)) {
        player.x = target.x;
        player.y = target.y;
      }
    }
  }

  /** Moves a hero server-side (match start, arena, waiting room); the owner's prediction snaps to it. */
  private teleport(player: Player, x: number, y: number) {
    player.x = x;
    player.y = y;
    player.vx = 0;
    player.vy = 0;
    player.knockTicks = 0;
    player.slow = 0;
    player.lock = 0;
  }

  // ─── The match ────────────────────────────────────────────────────────────

  /** Advances the match clock and phases (several in one tick if the clock jumped). */
  private stepMatch() {
    const s = this.state;
    const clock = Math.floor((this.tick - this.matchStart) / TICK_RATE);
    if (s.clock !== clock) s.clock = clock;
    if (isLobbyPhase(s.phase)) {
      // Everyone connected must be ready (a dropped player doesn't hold the others up).
      let total = 0;
      let ready = 0;
      for (const [id, p] of s.players) {
        if (this.isAway(id)) continue;
        total++;
        if (p.ready) ready++;
      }
      const everyone = total > 0 && ready === total;
      if (s.phase === MatchPhase.lobby && everyone) this.setPhase(MatchPhase.starting, clock + START_COUNTDOWN_SECONDS);
      // Someone changed their mind, or a newcomer isn't ready yet.
      else if (s.phase === MatchPhase.starting && !everyone) this.setPhase(MatchPhase.lobby, 0);
      else if (s.phase === MatchPhase.starting && clock >= s.phaseEnds) this.startMatch();
      return;
    }
    if (s.phase === MatchPhase.calm && clock >= this.times.pvpAfter)
      this.setPhase(MatchPhase.pvp, this.times.arenaAfter);
    if (s.phase === MatchPhase.pvp && clock >= this.times.arenaAfter) this.startArena();
    if (s.phase === MatchPhase.prep && clock >= s.phaseEnds) {
      this.setPhase(MatchPhase.arena, 0);
      this.fightStart = this.tick;
    }
    if (s.phase === MatchPhase.arena) this.stepStorm();
    if (s.phase === MatchPhase.ended && clock >= s.phaseEnds) this.openLobby();
  }

  private setPhase(phase: MatchPhase, endsAt: number) {
    this.state.phase = phase;
    this.state.phaseEnds = endsAt;
  }

  /** Waiting room: ready (or not) for the next match. */
  private setReady(id: string, message: unknown) {
    const player = this.state.players.get(id);
    if (!player || !isLobbyPhase(this.state.phase)) return;
    const wanted = (message as Partial<ReadyMessage> | null)?.ready;
    const ready = typeof wanted === "boolean" ? wanted : !player.ready;
    player.ready = ready;
    const entry = this.state.roster.get(id);
    if (entry) entry.ready = ready;
  }

  /** Waiting room: whether bots fill the next match (anyone in the room can switch it). */
  private setBots(message: unknown) {
    const on = (message as Partial<BotsMessage> | null)?.on;
    if (isLobbyPhase(this.state.phase) && typeof on === "boolean") this.state.bots = on;
  }

  /** A hero the server plays (bots/BotBrain.ts), at the start like everyone. */
  private addBot() {
    const serial = ++this.botSerial;
    const id = `bot:${serial}`;
    const name = botName(this.rng, new Set([...this.state.players.values()].map((p) => p.name)));
    const classId = pick(CLASS_IDS, this.rng);
    const palette = Math.floor(this.rng() * PALETTES.length);
    const spawn = this.nextSpawn();
    const player = new Player({ name, classId, palette, x: spawn.x, y: spawn.y, facing: 2, level: 1 });
    this.state.players.set(id, player);
    this.state.roster.set(id, new RosterEntry({ name, classId, level: 1, bot: true }));
    this.applyStats(id, player);
    player.hp = player.maxHp;
    this.lastSwing.set(id, player.swing);
    this.lastVolley.set(id, player.vseq);
    const seed = Math.floor(this.rng() * 2 ** 32);
    this.bots.set(id, new BotBrain(id, createRng(seed), rollPersonality(this.rng), serial % THINK_TICKS));
  }

  /** What bots see (refreshed every tick in `step`). */
  private createBotView(): BotView {
    const { state } = this;
    return {
      tick: 0,
      phase: 0,
      zone: 0,
      nav: this.nav,
      arena: this.arena,
      vendorScreens: [...this.vendorByScreen.keys()],
      hero: (id) => {
        const p = state.players.get(id);
        return p && !p.out ? p : undefined;
      },
      heroes: () => this.standing(),
      enemy: (id) => this.botEnemy(id),
      enemiesOn: (screen) => {
        this.botMemo();
        let list = this.botScreens.get(screen);
        if (!list) {
          list = (this.buckets.get(screen) ?? []).flatMap((id) => this.botEnemy(id) ?? []);
          this.botScreens.set(screen, list);
        }
        return list;
      },
      hostilesNear: (x, y, r) => this.hostilesNear(x, y, r),
      chestsOn: (screen) => {
        const found: BotSpot[] = [];
        for (const [id, c] of state.chests)
          if (!c.open && this.screenIndexAt(c.x, c.y) === screen) found.push({ id, x: c.x, y: c.y });
        return found;
      },
      pickupsOn: (screen) => {
        const found: BotSpot[] = [];
        for (const [id, p] of state.pickups)
          if (this.screenIndexAt(p.x, p.y) === screen) found.push({ id, x: p.x, y: p.y, kind: p.kind });
        return found;
      },
      propsOn: (screen) =>
        (this.propsByScreen.get(screen) ?? []).flatMap((p) =>
          this.regrowAt.has(p.id) ? [] : [{ id: propSpotId(p.id), x: p.x, y: p.y, kind: p.kind }],
        ),
      propWhole: (id) => {
        const prop = this.props.get(Number(id.slice(PROP_SPOT_PREFIX.length)));
        return id.startsWith(PROP_SPOT_PREFIX) && prop !== undefined && !this.regrowAt.has(prop.id);
      },
      vendorOn: (screen) => this.vendorByScreen.get(screen),
      offers: (id, vendor) => this.shops.get(id)?.get(vendor.id)?.offers,
      stats: (id) => this.statsOf(id),
    };
  }

  /** Heroes still in the match. */
  private *standing(): Iterable<[string, Player]> {
    for (const entry of this.state.players) if (!entry[1].out) yield entry;
  }

  /** Starts a new tick's worth of bot views (enemies move between ticks). */
  private botMemo() {
    if (this.botMemoTick === this.tick) return;
    this.botMemoTick = this.tick;
    this.botEnemies.clear();
    this.botScreens.clear();
  }

  private botEnemy(id: string): BotEnemy | undefined {
    this.botMemo();
    if (this.botEnemies.has(id)) return this.botEnemies.get(id);
    const enemy = this.state.enemies.get(id);
    const brain = this.brains.get(id);
    const seen = enemy && brain ? botEnemyOf(id, enemy, brain, this.map.collision) : undefined;
    this.botEnemies.set(id, seen);
    return seen;
  }

  /** Enemy shots in flight within `r` px of (x, y), where they are now. */
  private hostilesNear(x: number, y: number, r: number): BotHostile[] {
    const found: BotHostile[] = [];
    for (const h of this.hostiles) {
      const hx = h.x0 + h.dirX * h.dist;
      const hy = h.y0 + h.dirY * h.dist;
      if ((hx - x) ** 2 + (hy - y) ** 2 > r * r) continue;
      found.push({
        key: h.key,
        x: hx,
        y: hy,
        dirX: h.dirX,
        dirY: h.dirY,
        speed: h.speed / TICK_RATE,
        radius: h.radius,
        left: h.maxDist - h.dist,
      });
    }
    return found;
  }

  /** Everyone was ready: the room closes and the match starts, everyone at the centre. */
  private startMatch() {
    void this.lock();
    this.spawnCursor = 0;
    const absent: [string, Player][] = [];
    for (const [id, player] of this.state.players) {
      // Dropped and not back yet: not in this match (watches it if they come back).
      if (this.isAway(id)) {
        absent.push([id, player]);
        continue;
      }
      const spawn = this.nextSpawn();
      this.teleport(player, spawn.x, spawn.y);
      player.hp = player.maxHp;
      player.invuln = 0;
      player.ready = false;
      const entry = this.state.roster.get(id);
      if (entry) entry.ready = false;
    }
    for (const [id, player] of absent) this.knockOut(id, player);
    const playing = this.state.players.size - absent.length;
    if (this.state.bots) for (let n = playing; n < MAX_PLAYERS_PER_ROOM; n++) this.addBot();
    this.startedWith = playing + this.bots.size;
    this.heroStats.clear();
    this.slowImmuneUntil.clear();
    for (const [id, player] of this.standing())
      if (!player.out) this.heroStats.set(id, { kills: 0, monsters: 0, bosses: 0, chests: 0, sent: false });
    this.matchStart = this.tick;
    this.state.clock = 0;
    this.state.alive = this.startedWith;
    this.setPhase(MatchPhase.calm, this.times.pvpAfter);
  }

  /** The heroes still standing go to the arena, spread around it and healed. */
  private startArena() {
    const { arena } = this;
    if (!arena) {
      // A map without an arena: the match ends here, without a winner.
      this.endMatch(undefined);
      return;
    }
    this.setPhase(MatchPhase.prep, this.times.arenaAfter + ARENA_PREP_SECONDS);
    // Whatever is still flying stays behind.
    this.projectiles = [];
    this.hostiles = [];
    const ids = [...this.state.players.entries()].filter(([, p]) => !p.out).map(([id]) => id);
    ids.forEach((id, i) => {
      const player = this.state.players.get(id);
      if (!player) return;
      const spot = this.arenaSpawns[Math.floor((i * this.arenaSpawns.length) / ids.length)] ?? {
        x: arena.centerX,
        y: arena.centerY,
      };
      this.teleport(player, spot.x, spot.y);
      player.hp = player.maxHp;
      player.invuln = 0;
    });
    this.state.zone = this.zoneStart;
    this.state.alive = ids.length;
  }

  /** The safe zone closes; outside it heroes lose a share of their max HP every second. */
  private stepStorm() {
    const { arena } = this;
    if (!arena) return;
    const ticks = this.tick - this.fightStart;
    const radius = zoneRadius(this.zoneStart, ticks / TICK_RATE);
    this.state.zone = Math.ceil(radius);
    if (ticks === 0 || ticks % TICK_RATE !== 0) return;
    for (const [id, player] of this.state.players) {
      if (player.dead || Math.hypot(player.x - arena.centerX, player.y - arena.centerY) <= radius) continue;
      const amount = Math.max(1, Math.round(player.maxHp * ZONE_DAMAGE_PER_SECOND));
      player.hp = Math.max(0, player.hp - amount);
      this.sendDamage({ x: player.x, y: player.y, amount, crit: false, player: true });
      if (player.hp <= 0) this.heroDown(id, player, "storm");
    }
  }

  private aliveCount() {
    let alive = 0;
    for (const p of this.state.players.values()) if (!p.out) alive++;
    return alive;
  }

  /**
   * The last hero standing wins, at any moment (nobody, if the last ones fell
   * together). A match started alone ends when that hero falls, or wins the arena.
   */
  private checkMatchEnd() {
    const standing = [...this.state.players.entries()].filter(([, p]) => !p.out);
    this.state.alive = standing.length;
    const over =
      this.startedWith > 1
        ? standing.length <= 1
        : standing.length === 0 || (this.state.phase === MatchPhase.arena && standing.length <= 1);
    if (over) this.endMatch(standing.length === 1 ? standing[0] : undefined);
  }

  private endMatch(winner: [string, Player] | undefined) {
    this.setPhase(MatchPhase.ended, this.state.clock + RESULTS_SECONDS);
    this.state.winner = winner?.[0] ?? "";
    this.state.winnerName = winner?.[1].name ?? "";
    this.projectiles = [];
    this.hostiles = [];
    if (winner) {
      const entry = this.state.roster.get(winner[0]);
      if (entry) entry.wins++;
    }
    // Whoever is still standing gets the summary now (the fallen got theirs when they fell).
    const standing = [...this.standing()];
    for (const [id, player] of standing) this.sendSummary(id, player, winner ? 1 : standing.length);
  }

  /** How the match went for one hero, sent once to its player (bots have no one to tell). */
  private sendSummary(id: string, player: Player, place: number) {
    const stats = this.heroStats.get(id);
    const client = this.clientOf(id);
    if (!stats || stats.sent || !client) return;
    stats.sent = true;
    const message: SummaryMessage = {
      place,
      heroes: this.startedWith,
      kills: stats.kills,
      monsters: stats.monsters,
      bosses: stats.bosses,
      chests: stats.chests,
      level: player.level,
      relics: player.relics.length,
      relicList: player.relics.map((r) => ({ kind: r.kind, rarity: r.rarity })),
      seconds: Math.floor((this.tick - this.matchStart) / TICK_RATE),
    };
    client.send(Msg.summary, message);
  }

  /** Back to the waiting room: the world refills, every hero starts over at level 1 in the centre, and the room reopens. */
  private openLobby() {
    const s = this.state;
    this.matchStart = this.tick;
    s.clock = 0;
    this.setPhase(MatchPhase.lobby, 0);
    s.zone = 0;
    s.alive = 0;
    s.winner = "";
    s.winnerName = "";
    this.startedWith = 0;
    for (const id of [...this.bots.keys()]) this.forget(id);

    for (const id of [...s.enemies.keys()]) this.removeEnemy(id);
    for (const spawner of this.spawners) {
      spawner.enemyId = undefined;
      spawner.respawnAt = 0;
    }
    s.pickups.clear();
    this.pickupExpiry.clear();
    s.brokenProps.clear();
    this.regrowAt.clear();
    for (const [id, meta] of this.chestMeta) {
      const chest = s.chests.get(id);
      if (meta.dropped || !chest) {
        s.chests.delete(id);
        this.chestMeta.delete(id);
      } else {
        chest.open = false;
        meta.at = 0;
      }
    }
    this.projectiles = [];
    this.hostiles = [];
    this.slowImmuneUntil.clear();
    this.lastMonsterHit.clear();
    this.shops.clear();
    this.touching.clear();
    this.screenOfPlayer.clear();

    this.spawnCursor = 0;
    for (const [id, player] of s.players) {
      player.relics.clear();
      player.level = 1;
      player.xp = 0;
      player.rupees = 0;
      player.out = false;
      player.dead = false;
      player.place = 0;
      player.watch = "";
      player.ready = false;
      this.applyStats(id, player);
      player.hp = player.maxHp;
      player.invuln = 0;
      const spawn = this.nextSpawn();
      this.teleport(player, spawn.x, spawn.y);
      const entry = s.roster.get(id);
      if (entry) {
        entry.level = 1;
        entry.ready = false;
        entry.out = false;
      }
    }
    void this.unlock();
  }

  // ─── Relics, chests and shops ─────────────────────────────────────────────

  private giveRelic(id: string, player: Player, kind: RelicKind, rarity: number, source: GainMessage["source"]) {
    player.relics.push(new Relic({ kind, rarity }));
    this.applyStats(id, player);
    const message: GainMessage = { kind, rarity, source };
    this.clientOf(id)?.send(Msg.gain, message);
  }

  /** A one-shot chest (bosses, elites): at least `floor` rarity; gold from uncommon up; gone a while after it is opened. */
  private dropChest(x: number, y: number, floor: number) {
    const id = `d${this.nextId++}`;
    this.state.chests.set(id, new Chest({ x, y, open: false, gold: floor >= 1 }));
    this.chestMeta.set(id, { floor, dropped: true, at: this.tick + DROPPED_CHEST_LIFETIME_SECONDS * TICK_RATE });
  }

  /** Walking onto a closed chest opens it: a random relic, its rarity rolled with the opener's luck. */
  private stepChests() {
    const r2 = TOUCH_RADIUS * TOUCH_RADIUS;
    for (const [chestId, chest] of this.state.chests) {
      const meta = this.chestMeta.get(chestId) ?? { floor: 0, dropped: false, at: 0 };
      if (meta.dropped && this.tick >= meta.at) {
        this.state.chests.delete(chestId);
        this.chestMeta.delete(chestId);
        continue;
      }
      if (chest.open) {
        if (!meta.dropped && this.tick >= meta.at) chest.open = false;
        continue;
      }
      for (const [id, player] of this.state.players) {
        if (player.dead || (player.x - chest.x) ** 2 + (player.y - chest.y) ** 2 > r2) continue;
        chest.open = true;
        meta.at = this.tick + (meta.dropped ? DROPPED_CHEST_OPEN_SECONDS : CHEST_RESPAWN_SECONDS) * TICK_RATE;
        this.chestMeta.set(chestId, meta);
        const rarity = rollRarity(this.statsOf(id).luck, this.rng, meta.floor);
        this.giveRelic(id, player, pick(RELIC_IDS, this.rng), rarity, "chest");
        const stats = this.heroStats.get(id);
        if (stats) stats.chests++;
        break;
      }
    }
  }

  /** A vendor's offers for this player, rolled with the player's luck; restocked after a while. */
  private shopFor(id: string, vendor: Spot): Shop {
    const shops = this.shops.get(id) ?? new Map<string, Shop>();
    this.shops.set(id, shops);
    let shop = shops.get(vendor.id);
    if (!shop || this.tick - shop.rolledAt >= SHOP_RESTOCK_SECONDS * TICK_RATE) {
      const luck = this.statsOf(id).luck;
      const offer = (kind: OfferItem, rarity: number): OfferMessage => ({
        kind,
        rarity,
        price: offerPrice(kind, rarity),
        sold: false,
      });
      shop = {
        rolledAt: this.tick,
        // A passive relic, a weapon and a potion.
        offers: [
          offer(pick(PASSIVE_IDS, this.rng), rollRarity(luck, this.rng)),
          offer(pick(WEAPON_IDS, this.rng), rollRarity(luck, this.rng)),
          offer("potion", 0),
        ].slice(0, OFFER_SLOTS),
      };
      shops.set(vendor.id, shop);
    }
    return shop;
  }

  private sendShop(id: string, vendor: Spot, shop: Shop) {
    const message: ShopMessage = { vendor: vendor.id, offers: shop.offers.map((o) => ({ ...o })) };
    this.clientOf(id)?.send(Msg.shop, message);
  }

  /** Vendors sell by walking onto an offer (each step onto it is one attempt). */
  private stepShop(id: string, player: Player) {
    const screen = this.screenIndexAt(player.x, player.y);
    const vendor = this.vendorByScreen.get(screen);
    if (this.screenOfPlayer.get(id) !== screen) {
      this.screenOfPlayer.set(id, screen);
      this.touching.delete(id);
      if (vendor) this.sendShop(id, vendor, this.shopFor(id, vendor));
    }
    if (!vendor || player.dead) return;
    const shop = this.shops.get(id)?.get(vendor.id);
    if (!shop) return;

    const before = this.touching.get(id) ?? new Set<number>();
    const now = new Set<number>();
    shop.offers.forEach((offer, slot) => {
      const at = offerPosition(vendor, slot);
      if ((player.x - at.x) ** 2 + (player.y - at.y) ** 2 > TOUCH_RADIUS * TOUCH_RADIUS) return;
      now.add(slot);
      if (offer.sold || before.has(slot)) return;
      if (player.rupees < offer.price) {
        const message: ShopFailMessage = { reason: "rupees" };
        this.clientOf(id)?.send(Msg.shopFail, message);
        return;
      }
      player.rupees -= offer.price;
      offer.sold = true;
      if (offer.kind === "potion") {
        player.hp = player.maxHp;
        const message: GainMessage = { kind: "potion", rarity: 0, source: "shop" };
        this.clientOf(id)?.send(Msg.gain, message);
      } else {
        this.giveRelic(id, player, offer.kind, offer.rarity, "shop");
      }
      this.sendShop(id, vendor, shop);
    });
    this.touching.set(id, now);
  }

  // ─── Enemies ──────────────────────────────────────────────────────────────

  private stepSpawners() {
    for (const spawner of this.spawners) {
      if (spawner.enemyId || this.tick < spawner.respawnAt) continue;
      // Don't pop an enemy right on top of someone.
      if (this.anyPlayerNear(spawner.x, spawner.y, 40)) continue;
      this.spawnEnemy(spawner.kind, spawner.x, spawner.y, spawner.tier, spawner.dungeon, spawner);
    }
  }

  /** Creates an enemy. Regular enemies may come out as elites; summoned minions never do. */
  private spawnEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    tier: number,
    dungeon: boolean,
    spawner?: SpawnerState,
    summoned = false,
  ): string {
    const def = ENEMIES[kind];
    const chance = dungeon ? ELITE_CHANCE_DUNGEON : ELITE_CHANCE;
    const elite = def.rank === "normal" && !summoned && this.rng() < chance;
    const stats = enemyStats(kind, tier, elite, !dungeon);
    const id = `e${this.nextId++}`;
    const { col, row } = screenOf(x, y);
    this.state.enemies.set(id, new Enemy({ kind, x, y, hp: stats.maxHp, maxHp: stats.maxHp, elite }));
    this.brains.set(id, createBrain(kind, def, stats, tier, screenRect(col, row), spawner, this.enemyHost.rng));
    if (spawner) spawner.enemyId = id;
    return id;
  }

  private stepEnemy(id: string, enemy: Enemy) {
    const brain = this.brains.get(id);
    if (!brain || !this.active.has(this.screenIndexAt(enemy.x, enemy.y))) return;
    const events = this.enemyEvents;
    events.length = 0;
    stepEnemyAi(enemy, brain, this.enemyHost, events);
    for (const ev of events) this.applyEnemyEvent(id, enemy, brain, ev);
    if (contactActive(brain)) this.contactDamage(enemy, brain);
  }

  /** What the enemy AI (enemies/) sees of the room. */
  private createEnemyHost(): EnemyHost {
    return {
      grid: this.map.collision,
      // Read through `this.rng` on every roll: tests swap the room's generator.
      rng: () => this.rng(),
      nearestHero: (x, y, home, range) => this.nearestHero(x, y, home, range),
      freeSpot: (home, half, x, y, radius) => this.freeSpot(home, half, x, y, radius),
      enemyAlive: (id) => this.state.enemies.has(id),
    };
  }

  /** Carries out a side effect the enemy AI asked for this tick. */
  private applyEnemyEvent(id: string, enemy: Enemy, brain: EnemyBrain, ev: EnemyEvent) {
    switch (ev.type) {
      case "shots":
        this.fireHostile(id, brain.kind, ev);
        break;
      case "area": {
        // A strike or a landing: every hero standing in the circle (pushed away from the enemy).
        // A strike doesn't reach through a wall: the hero must be in sight of the enemy's body.
        for (const [playerId, player] of this.state.players) {
          if (player.out) continue;
          const reach = ev.radius + PLAYER_HALF;
          if ((player.x - ev.x) ** 2 + (player.y - ev.y) ** 2 > reach * reach) continue;
          if (ev.walls) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const d = Math.hypot(dx, dy);
            if (d > 4 && travelDistance(this.map.collision, enemy.x, enemy.y, dx / d, dy / d, d) < d - 4) continue;
          }
          this.hurtPlayer(playerId, player, ev.damage, enemy.x, enemy.y, brain.kind);
        }
        break;
      }
      case "summon": {
        const tier = brain.spawner?.tier ?? 0;
        for (const spot of ev.spots)
          brain.minions.add(this.spawnEnemy(ev.kind, spot.x, spot.y, tier, true, undefined, true));
        break;
      }
    }
  }

  /** Touching an enemy hurts. */
  private contactDamage(enemy: Enemy, brain: EnemyBrain) {
    const reach = brain.stats.half + PLAYER_HALF;
    for (const [playerId, player] of this.state.players) {
      if (Math.abs(player.x - enemy.x) < reach && Math.abs(player.y - enemy.y) < reach)
        this.hurtPlayer(playerId, player, brain.stats.damage, enemy.x, enemy.y, brain.kind);
    }
  }

  /** A random open spot within `radius` of (x, y) on the `home` screen, for a body of `half` (plus 2 px). */
  private freeSpot(home: Rect, half: number, x: number, y: number, radius: number) {
    const margin = half + 2;
    for (let attempt = 0; attempt < 12; attempt++) {
      const sx = x + (this.rng() * 2 - 1) * radius;
      const sy = y + (this.rng() * 2 - 1) * radius;
      if (
        sx < home.x + margin ||
        sy < home.y + margin ||
        sx > home.x + home.width - margin ||
        sy > home.y + home.height - margin
      )
        continue;
      // Every tile under the box, not just its corners: a 16 px pillar fits between two corners.
      if (!boxHitsSolid(this.map.collision, sx, sy, margin)) return { x: sx, y: sy };
    }
    return undefined;
  }

  /** Fires enemy projectiles; clients draw them from the message. */
  private fireHostile(from: string, kind: EnemyKind, shots: Extract<EnemyEvent, { type: "shots" }>) {
    const { x, y, angles, speed, range, damage, style } = shots;
    const key = `h${this.nextId++}`;
    angles.forEach((angle, i) => {
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      this.hostiles.push({
        key: `${key}:${i}`,
        x0: x,
        y0: y,
        dirX,
        dirY,
        dist: 0,
        maxDist: travelDistance(this.map.collision, x, y, dirX, dirY, range),
        speed,
        radius: SHOT_DEFS[style].radius,
        damage,
        kind,
        slowTicks: SHOT_DEFS[style].slowTicks ?? 0,
      });
    });
    const message: EnemyShotMessage = { key, from, x, y, angles, speed, range, style };
    this.sendNear(x, y, Msg.enemyShot, message);
  }

  private stepHostiles(dt: number) {
    const ended: { key: string; x: number; y: number }[] = [];
    this.hostiles = this.hostiles.filter((h) => {
      const ax = h.x0 + h.dirX * h.dist;
      const ay = h.y0 + h.dirY * h.dist;
      h.dist = Math.min(h.maxDist, h.dist + h.speed * dt);
      const bx = h.x0 + h.dirX * h.dist;
      const by = h.y0 + h.dirY * h.dist;
      for (const [id, player] of this.state.players) {
        if (player.dead || player.invuln > 0) continue;
        if (!sweptHit(ax, ay, bx, by, h.radius, player.x, player.y, PLAYER_HALF)) continue;
        this.hurtPlayer(id, player, h.damage, ax, ay, h.kind);
        // A web: slowed for a while, then immune to webs for SLOW_IMMUNE_TICKS.
        if (h.slowTicks > 0 && !player.dead && this.tick >= (this.slowImmuneUntil.get(id) ?? 0)) {
          player.slow = h.slowTicks;
          this.slowImmuneUntil.set(id, this.tick + h.slowTicks + SLOW_IMMUNE_TICKS);
        }
        ended.push({ key: h.key, x: bx, y: by });
        return false;
      }
      return h.dist < h.maxDist;
    });
    this.sendEnded(ended);
  }

  /** The nearest hero still up within `range` of (x, y), on the `home` screen (enemies never leave theirs). */
  private nearestHero(x: number, y: number, home: Rect, range: number): HeroRef | undefined {
    if (range <= 0) return undefined;
    let best: Player | undefined;
    let bestId = "";
    let bestDist = range * range;
    for (const [id, player] of this.state.players) {
      if (player.dead) continue;
      if (player.x < home.x || player.y < home.y || player.x >= home.x + home.width || player.y >= home.y + home.height)
        continue;
      const d = (player.x - x) ** 2 + (player.y - y) ** 2;
      if (d <= bestDist) {
        bestDist = d;
        best = player;
        bestId = id;
      }
    }
    // One small object per call that finds someone (callers keep it through the tick).
    return best && { id: bestId, x: best.x, y: best.y };
  }

  private anyPlayerNear(x: number, y: number, radius: number) {
    for (const p of this.state.players.values())
      if (!p.out && (p.x - x) ** 2 + (p.y - y) ** 2 < radius * radius) return true;
    return false;
  }

  // ─── Props ────────────────────────────────────────────────────────────────

  /** The sword cuts tall grass and breaks pots in its hitbox; some hold rupees or a heart. */
  private breakProps(box: Hitbox, luck: number) {
    const reach = box.r + PROP_HALF;
    const columns = this.map.collision.width;
    const x0 = Math.max(0, Math.floor((box.x - reach) / TILE_SIZE));
    const x1 = Math.min(columns - 1, Math.floor((box.x + reach) / TILE_SIZE));
    const y0 = Math.floor((box.y - reach) / TILE_SIZE);
    const y1 = Math.floor((box.y + reach) / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const prop = this.props.get(ty * columns + tx);
        if (!prop || this.regrowAt.has(prop.id) || !hitboxTouches(box, prop.x, prop.y, PROP_HALF)) continue;
        this.state.brokenProps.set(String(prop.id), PROP_KINDS.indexOf(prop.kind));
        this.regrowAt.set(prop.id, this.tick + PROPS[prop.kind].regrowSeconds * TICK_RATE);
        const drop = rollPropDrop(prop.kind, luck, this.rng);
        if (drop) this.dropPickup(drop.kind, drop.value, prop.x, prop.y);
      }
  }

  /** Once a second, broken props come back when their time is up, unless a hero is on their screen to see it. */
  private stepProps() {
    if (this.tick % TICK_RATE !== 0 || this.regrowAt.size === 0) return;
    const watched = new Set<number>();
    for (const p of this.state.players.values()) if (!p.out) watched.add(this.screenIndexAt(p.x, p.y));
    for (const [id, at] of this.regrowAt) {
      const prop = this.props.get(id);
      if (this.tick < at || (prop && watched.has(this.screenIndexAt(prop.x, prop.y)))) continue;
      this.regrowAt.delete(id);
      this.state.brokenProps.delete(String(id));
    }
  }

  // ─── Pickups ──────────────────────────────────────────────────────────────

  private dropPickup(kind: PickupKind, value: number, x: number, y: number) {
    if (value <= 0) return;
    const id = `r${this.nextId++}`;
    this.state.pickups.set(id, new Pickup({ kind, value, x, y }));
    this.pickupExpiry.set(id, this.tick + PICKUP_LIFETIME_SECONDS * TICK_RATE);
  }

  /** Once a second, heroes out of combat for a while heal a little (not in the arena: the storm decides there). */
  private stepRegen() {
    const phase = this.state.phase;
    if (this.tick % TICK_RATE !== 0 || phase === MatchPhase.prep || phase === MatchPhase.arena) return;
    for (const [id, player] of this.state.players) {
      if (player.dead || player.hp >= player.maxHp) continue;
      if (this.tick - (this.lastHurt.get(id) ?? 0) < REGEN_DELAY_SECONDS * TICK_RATE) continue;
      player.hp = Math.min(player.maxHp, player.hp + Math.max(1, Math.round(player.maxHp * REGEN_PER_SECOND)));
    }
  }

  /** Rupees go to whoever touches them; a heart only to a hurt hero (it stays for the others). */
  private stepPickups() {
    for (const [id, pickup] of this.state.pickups) {
      let taken = false;
      for (const [playerId, player] of this.state.players) {
        if (player.dead) continue;
        if ((player.x - pickup.x) ** 2 + (player.y - pickup.y) ** 2 > PICKUP_RADIUS * PICKUP_RADIUS) continue;
        let message: PickedMessage;
        if (pickup.kind === "heart") {
          if (player.hp >= player.maxHp) continue;
          const heal = Math.min(player.maxHp - player.hp, Math.round(player.maxHp * HEART_HEAL));
          player.hp += heal;
          message = { kind: "heart", value: heal };
        } else {
          player.rupees += pickup.value;
          message = { kind: "rupee", value: pickup.value };
        }
        this.clientOf(playerId)?.send(Msg.picked, message);
        taken = true;
        break;
      }
      if (taken || this.tick >= (this.pickupExpiry.get(id) ?? 0)) {
        this.state.pickups.delete(id);
        this.pickupExpiry.delete(id);
      }
    }
  }

  // ─── Networking helpers ───────────────────────────────────────────────────

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  /** Sends to every client whose hero can see (x, y), except `except`. */
  private sendNear(x: number, y: number, type: string, message: unknown, except?: string) {
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const client of this.clients) {
      if (client.sessionId === except) continue;
      const p = this.state.players.get(client.sessionId);
      if (p && (p.x - x) ** 2 + (p.y - y) ** 2 <= r2) client.send(type, message);
    }
  }

  /** Damage numbers go only to players who can see the spot. */
  private sendDamage(message: DamageMessage) {
    this.sendNear(message.x, message.y, Msg.damage, message);
  }

  private *entities(): Iterable<[string, PositionedEntity]> {
    for (const [id, p] of this.state.players) yield [`p:${id}`, p];
    for (const [id, e] of this.state.enemies) yield [`e:${id}`, e];
    for (const [id, r] of this.state.pickups) yield [`r:${id}`, r];
    for (const [id, c] of this.state.chests) yield [`c:${id}`, c];
  }

  private updateInterest() {
    // Each viewer sees what is within INTEREST_RADIUS of its own player, and always itself.
    this.interest.update(
      this.entities(),
      (sessionId) => this.state.players.get(sessionId),
      (sessionId) => `p:${sessionId}`,
    );
  }
}
