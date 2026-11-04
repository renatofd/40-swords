import type { Client, CloseCode, StepContext } from "@colyseus/core";
import type { GameMap } from "@core/maps";
import { GameRoom, InputBudget, InterestManager, loadMap, type PositionedEntity } from "@core/server";
import { moveAxis } from "@core/shared";
import {
  CHEST_RESPAWN_SECONDS,
  Chest,
  computeStats,
  createRng,
  type DamageMessage,
  ENEMIES,
  ENEMY_KNOCK_SPEED,
  ENEMY_KNOCK_TICKS,
  Enemy,
  type EnemyDef,
  type EnemyKind,
  type EnemySpawn,
  facingFromDir,
  type GainMessage,
  HIT_INVULN_TICKS,
  type HitResult,
  hitboxTouches,
  INTEREST_EVERY_TICKS,
  INTEREST_RADIUS,
  isClassId,
  type LevelUpMessage,
  MAX_LEVEL,
  MAX_PLAYERS_PER_ROOM,
  Msg,
  mitigate,
  OFFER_SLOTS,
  type OfferItem,
  type OfferMessage,
  offerPosition,
  offerPrice,
  PASSIVE_IDS,
  PICKUP_LIFETIME_SECONDS,
  PICKUP_RADIUS,
  Pickup,
  PLAYER_HALF,
  PLAYER_KNOCK_SPEED,
  PLAYER_KNOCK_TICKS,
  Player,
  PlayerInput,
  PROTOCOL_VERSION,
  type ProjectileEndMessage,
  projectileKey,
  RELIC_IDS,
  RESPAWN_SECONDS,
  Relic,
  type RelicKind,
  type Rng,
  RosterEntry,
  rollHit,
  rollProjectileHit,
  rollRarity,
  rollRupees,
  SHOP_RESTOCK_SECONDS,
  type ShopFailMessage,
  type ShopMessage,
  type ShotMessage,
  type SimWorld,
  type Spot,
  type Stats,
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
  type WorldJoinOptions,
  type WorldObjects,
  WorldState,
  weaponCopies,
  weaponCountKey,
  xpToNext,
} from "@game/shared";
import { loadWorldObjects } from "../world/mapObjects";

export interface WorldCreateOptions {
  /** Set by the server in defineRoom (game/server/src/index.ts), never by clients. */
  mapId?: string;
}

/** Server-only enemy data (AI and knockback); the synced part lives in `Enemy`. */
interface EnemyBrain {
  def: EnemyDef;
  spawner: SpawnerState;
  dirX: number;
  dirY: number;
  /** Ticks until the wander AI picks a new direction. */
  turnIn: number;
  knockX: number;
  knockY: number;
  knockTicks: number;
  /** Enemies stay on the screen they spawned on. */
  home: { x: number; y: number; width: number; height: number };
}

interface SpawnerState extends EnemySpawn {
  enemyId?: string;
  /** Tick at which a new enemy appears (when `enemyId` is empty). */
  respawnAt: number;
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

/** A vendor's offers for one player, rolled with that player's luck. */
interface Shop {
  offers: OfferMessage[];
  rolledAt: number;
}

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)] as T;

/**
 * The open world of one match. Authoritative: clients only send PlayerInput
 * frames; the server runs the shared `stepPlayer` once per received input,
 * then projectiles, enemies, chests, shops and drops.
 *
 * Stage 2: PvE only (players never hurt each other).
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
  /** Ticks a dead player waits before coming back. */
  protected respawnTicks = RESPAWN_SECONDS * TICK_RATE;

  private map!: GameMap;
  private objects!: WorldObjects;
  private world!: SimWorld;
  private tick = 0;
  private spawnCursor = 0;
  private nextId = 1;
  private spawners: SpawnerState[] = [];
  private brains = new Map<string, EnemyBrain>();
  private pickupExpiry = new Map<string, number>();
  private projectiles: Projectile[] = [];
  /** Attributes of each hero (class, level and relics), recomputed when one of them changes. */
  private stats = new Map<string, Stats>();
  /** Last swing / volley counters seen per player: a change means a new swing or volley to resolve. */
  private lastSwing = new Map<string, number>();
  private lastVolley = new Map<string, number>();
  /** Tick at which a dead player comes back. */
  private respawnAt = new Map<string, number>();
  private chestReopenAt = new Map<string, number>();
  /** Vendor on each screen ("col,row"). */
  private vendorByScreen = new Map<string, Spot>();
  /** Per player: offers of each vendor, the screen they stand on and the offers they are touching. */
  private shops = new Map<string, Map<string, Shop>>();
  private screenOfPlayer = new Map<string, string>();
  private touching = new Map<string, Set<number>>();
  private inputBudget = new InputBudget();
  /** One manager for every `.view()` collection; ids are prefixed per collection. */
  private interest = new InterestManager<PositionedEntity>({ radius: INTEREST_RADIUS });

  override onCreate(options: WorldCreateOptions = {}) {
    const mapId = typeof options.mapId === "string" ? options.mapId : "overworld";
    this.map = loadMap(mapId, { tileSize: TILE_SIZE });
    this.objects = loadWorldObjects(mapId);
    this.world = { grid: this.map.collision, portals: this.objects.portals };
    this.state.mapId = mapId;
    this.spawners = this.objects.enemies.map((s) => ({ ...s, respawnAt: 0 }));
    for (const c of this.objects.chests) this.state.chests.set(c.id, new Chest({ x: c.x, y: c.y, open: false }));
    for (const v of this.objects.vendors) {
      const { col, row } = screenOf(v.x, v.y);
      this.vendorByScreen.set(`${col},${row}`, v);
    }
    this.startSimulation((ctx) => this.step(ctx), TICK_RATE);
  }

  override onJoin(client: Client, options: WorldJoinOptions) {
    const id = client.sessionId;
    // The hero was picked before joining (beforeJoin); join options are untrusted.
    const classId = isClassId(options?.classId) ? options.classId : "knight";
    const spawn = this.nextSpawn();
    const name = this.identity(client).name;
    const player = new Player({ name, classId, x: spawn.x, y: spawn.y, facing: 2, level: 1 });
    this.state.players.set(id, player);
    this.applyStats(id, player);
    player.hp = player.maxHp;
    this.state.roster.set(id, new RosterEntry({ name, classId, level: 1 }));
    this.lastSwing.set(id, player.swing);
    this.lastVolley.set(id, player.vseq);
    this.interest.addViewer(client);
    this.updateInterest();
  }

  override onLeave(client: Client, _code: CloseCode) {
    const id = client.sessionId;
    this.interest.removeViewer(client);
    this.state.players.delete(id);
    this.state.roster.delete(id);
    this.stats.delete(id);
    this.lastSwing.delete(id);
    this.lastVolley.delete(id);
    this.respawnAt.delete(id);
    this.shops.delete(id);
    this.screenOfPlayer.delete(id);
    this.touching.delete(id);
    this.inputBudget.delete(id);
  }

  private nextSpawn() {
    return (
      this.map.spawns[this.spawnCursor++ % this.map.spawns.length] ?? {
        x: this.map.pixelWidth / 2,
        y: this.map.pixelHeight / 2,
      }
    );
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
    for (const [id, player] of this.state.players) this.stepPlayerTick(id, player, ctx.dt);
    this.stepProjectiles(ctx.dt);
    for (const [id, enemy] of this.state.enemies) this.stepEnemy(id, enemy, ctx.dt);
    this.stepPickups();
    this.stepChests();
    for (const [id, player] of this.state.players) this.stepShop(id, player);
    this.stepSpawners();
    if (this.tick % INTEREST_EVERY_TICKS === 0) this.updateInterest();
  }

  private stepPlayerTick(id: string, player: Player, dt: number) {
    if (player.invuln > 0) player.invuln--;
    if (player.dead && this.tick >= (this.respawnAt.get(id) ?? 0)) this.revive(id, player);

    const channel = this.inputs.get(id);
    const inputs = channel ? channel.take(this.inputBudget.refill(id)) : [];
    this.inputBudget.spend(id, inputs.length);
    for (const input of inputs) {
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
    // No input this tick (tab hidden, connection dropped): the player stands still.
    if (inputs.length === 0) {
      player.vx = 0;
      player.vy = 0;
    }
  }

  /** Sword hits every enemy in the hitbox once. PvP is off for now. */
  private resolveSwing(id: string, player: Player) {
    const stats = this.statsOf(id);
    const box = swordHitbox(player.x, player.y, player.facing, stats.reach);
    for (const [enemyId, enemy] of this.state.enemies) {
      const brain = this.brains.get(enemyId);
      if (!brain || !hitboxTouches(box, enemy.x, enemy.y, brain.def.half)) continue;
      const hit = rollHit(stats, brain.def.defense, this.rng);
      this.damageEnemy(enemyId, enemy, brain, id, player, hit, player.x, player.y, ENEMY_KNOCK_SPEED);
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
      for (const [enemyId, enemy] of this.state.enemies) {
        const brain = this.brains.get(enemyId);
        if (!brain || p.hits.has(enemyId)) continue;
        if (!sweptHit(ax, ay, bx, by, def.radius, enemy.x, enemy.y, brain.def.half)) continue;
        p.hits.add(enemyId);
        const hit = rollProjectileHit(p.weapon, p.rarity, this.statsOf(p.owner), brain.def.defense, this.rng);
        this.damageEnemy(enemyId, enemy, brain, p.owner, owner, hit, ax, ay, def.knock);
        if (p.pierceLeft-- <= 0) {
          ended.push({ key: p.key, x: bx, y: by });
          return false;
        }
      }
      return p.dist < p.maxDist;
    });
    if (ended.length === 0) return;
    // Clients drop these early; the ones that reach a wall or their range end on their own.
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
    enemy.hp -= hit.amount;
    enemy.hurt = 6;
    if (knockSpeed > 0) this.knockEnemy(brain, enemy.x - fromX, enemy.y - fromY, knockSpeed);
    if (hit.heal > 0 && !attacker.dead) attacker.hp = Math.min(attacker.maxHp, attacker.hp + hit.heal);
    this.sendDamage({ x: enemy.x, y: enemy.y, amount: hit.amount, crit: hit.crit, player: false });
    if (enemy.hp <= 0) this.killEnemy(enemyId, enemy, brain, attackerId, attacker);
  }

  private knockEnemy(brain: EnemyBrain, dx: number, dy: number, speed: number) {
    const len = Math.hypot(dx, dy) || 1;
    brain.knockX = (dx / len) * speed;
    brain.knockY = (dy / len) * speed;
    brain.knockTicks = ENEMY_KNOCK_TICKS;
  }

  private killEnemy(enemyId: string, enemy: Enemy, brain: EnemyBrain, killerId: string, killer: Player) {
    const rupees = rollRupees(brain.def.rupees, this.statsOf(killerId).luck, this.rng);
    this.dropPickup("rupee", rupees, enemy.x, enemy.y);
    this.state.enemies.delete(enemyId);
    this.brains.delete(enemyId);
    brain.spawner.enemyId = undefined;
    brain.spawner.respawnAt = this.tick + brain.def.respawnSeconds * TICK_RATE;
    this.giveXp(killerId, killer, brain.def.xp);
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

  private hurtPlayer(id: string, player: Player, raw: number, fromX: number, fromY: number) {
    if (player.dead || player.invuln > 0) return;
    const amount = mitigate(raw, this.statsOf(id).defense);
    player.hp = Math.max(0, player.hp - amount);
    player.invuln = HIT_INVULN_TICKS;
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    player.knockX = (dx / len) * PLAYER_KNOCK_SPEED;
    player.knockY = (dy / len) * PLAYER_KNOCK_SPEED;
    player.knockTicks = PLAYER_KNOCK_TICKS;
    player.lock = 0;
    this.sendDamage({ x: player.x, y: player.y, amount, crit: false, player: true });
    if (player.hp <= 0) {
      player.dead = true;
      player.knockTicks = 0;
      this.respawnAt.set(id, this.tick + this.respawnTicks);
    }
  }

  private revive(id: string, player: Player) {
    const spawn = this.nextSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.dead = false;
    player.hp = player.maxHp;
    player.invuln = HIT_INVULN_TICKS * 2;
    player.knockTicks = 0;
    this.respawnAt.delete(id);
  }

  // ─── Relics, chests and shops ─────────────────────────────────────────────

  private giveRelic(id: string, player: Player, kind: RelicKind, rarity: number, source: GainMessage["source"]) {
    player.relics.push(new Relic({ kind, rarity }));
    this.applyStats(id, player);
    const message: GainMessage = { kind, rarity, source };
    this.clientOf(id)?.send(Msg.gain, message);
  }

  /** Walking onto a closed chest opens it: a random relic, its rarity rolled with the opener's luck. */
  private stepChests() {
    const r2 = TOUCH_RADIUS * TOUCH_RADIUS;
    for (const [chestId, chest] of this.state.chests) {
      if (chest.open) {
        if (this.tick >= (this.chestReopenAt.get(chestId) ?? 0)) chest.open = false;
        continue;
      }
      for (const [id, player] of this.state.players) {
        if (player.dead || (player.x - chest.x) ** 2 + (player.y - chest.y) ** 2 > r2) continue;
        chest.open = true;
        this.chestReopenAt.set(chestId, this.tick + CHEST_RESPAWN_SECONDS * TICK_RATE);
        this.giveRelic(id, player, pick(RELIC_IDS, this.rng), rollRarity(this.statsOf(id).luck, this.rng), "chest");
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
    const { col, row } = screenOf(player.x, player.y);
    const screen = `${col},${row}`;
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
      this.spawnEnemy(spawner, spawner.kind);
    }
  }

  private spawnEnemy(spawner: SpawnerState, kind: EnemyKind) {
    const def = ENEMIES[kind];
    const id = `e${this.nextId++}`;
    const { col, row } = screenOf(spawner.x, spawner.y);
    this.state.enemies.set(id, new Enemy({ kind, x: spawner.x, y: spawner.y, hp: def.maxHp, maxHp: def.maxHp }));
    this.brains.set(id, {
      def,
      spawner,
      dirX: 0,
      dirY: 0,
      turnIn: 0,
      knockX: 0,
      knockY: 0,
      knockTicks: 0,
      home: screenRect(col, row),
    });
    spawner.enemyId = id;
  }

  private stepEnemy(id: string, enemy: Enemy, dt: number) {
    const brain = this.brains.get(id);
    if (!brain) return;
    const { def } = brain;
    if (enemy.hurt > 0) enemy.hurt--;

    let vx = 0;
    let vy = 0;
    if (brain.knockTicks > 0) {
      brain.knockTicks--;
      vx = brain.knockX;
      vy = brain.knockY;
    } else {
      const target = def.behaviour === "chase" ? this.nearestPlayer(enemy, brain, def.aggroRange) : undefined;
      if (target) {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const len = Math.hypot(dx, dy) || 1;
        brain.dirX = dx / len;
        brain.dirY = dy / len;
      } else if (--brain.turnIn <= 0) {
        // Wander: pick one of 8 directions or rest for a while.
        const choice = Math.floor(this.rng() * 10);
        const angle = (choice * Math.PI) / 4;
        brain.dirX = choice < 8 ? Math.cos(angle) : 0;
        brain.dirY = choice < 8 ? Math.sin(angle) : 0;
        brain.turnIn = 30 + Math.floor(this.rng() * 60);
      }
      vx = brain.dirX * def.speed;
      vy = brain.dirY * def.speed;
      const facing = facingFromDir(Math.round(brain.dirX), Math.round(brain.dirY));
      if (facing >= 0) enemy.facing = facing;
    }

    const { home } = brain;
    const grid = this.map.collision;
    const clampX = (x: number) => Math.min(home.x + home.width - def.half - 1, Math.max(home.x + def.half + 1, x));
    const clampY = (y: number) => Math.min(home.y + home.height - def.half - 1, Math.max(home.y + def.half + 1, y));
    const nextX = clampX(moveAxis(grid, "x", enemy.x, enemy.y, def.half, vx * dt));
    const nextY = clampY(moveAxis(grid, "y", nextX, enemy.y, def.half, vy * dt));
    // Bumped into something while wandering: turn soon.
    if ((nextX === enemy.x && vx !== 0) || (nextY === enemy.y && vy !== 0)) brain.turnIn = Math.min(brain.turnIn, 5);
    enemy.x = nextX;
    enemy.y = nextY;

    // Contact damage.
    const reach = def.half + PLAYER_HALF;
    for (const [playerId, player] of this.state.players) {
      if (Math.abs(player.x - enemy.x) < reach && Math.abs(player.y - enemy.y) < reach)
        this.hurtPlayer(playerId, player, def.damage, enemy.x, enemy.y);
    }
  }

  private nearestPlayer(enemy: Enemy, brain: EnemyBrain, range: number): Player | undefined {
    let best: Player | undefined;
    let bestDist = range * range;
    const { home } = brain;
    for (const player of this.state.players.values()) {
      if (player.dead) continue;
      if (player.x < home.x || player.y < home.y || player.x >= home.x + home.width || player.y >= home.y + home.height)
        continue;
      const d = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
      if (d <= bestDist) {
        bestDist = d;
        best = player;
      }
    }
    return best;
  }

  private anyPlayerNear(x: number, y: number, radius: number) {
    for (const p of this.state.players.values()) if ((p.x - x) ** 2 + (p.y - y) ** 2 < radius * radius) return true;
    return false;
  }

  // ─── Pickups ──────────────────────────────────────────────────────────────

  private dropPickup(kind: string, value: number, x: number, y: number) {
    if (value <= 0) return;
    const id = `r${this.nextId++}`;
    this.state.pickups.set(id, new Pickup({ kind, value, x, y }));
    this.pickupExpiry.set(id, this.tick + PICKUP_LIFETIME_SECONDS * TICK_RATE);
  }

  private stepPickups() {
    for (const [id, pickup] of this.state.pickups) {
      let taken = false;
      for (const player of this.state.players.values()) {
        if (player.dead) continue;
        if ((player.x - pickup.x) ** 2 + (player.y - pickup.y) ** 2 > PICKUP_RADIUS * PICKUP_RADIUS) continue;
        if (pickup.kind === "rupee") player.rupees += pickup.value;
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
