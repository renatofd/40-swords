import type { Client, CloseCode, StepContext } from "@colyseus/core";
import type { GameMap } from "@core/maps";
import { GameRoom, InputBudget, InterestManager, loadMap, type PositionedEntity } from "@core/server";
import { moveAxis } from "@core/shared";
import {
  createRng,
  type DamageMessage,
  ENEMIES,
  ENEMY_KNOCK_SPEED,
  ENEMY_KNOCK_TICKS,
  Enemy,
  type EnemyDef,
  type EnemyKind,
  facingFromDir,
  HIT_INVULN_TICKS,
  hitboxTouches,
  INTEREST_EVERY_TICKS,
  INTEREST_RADIUS,
  isClassId,
  type LevelUpMessage,
  MAX_LEVEL,
  MAX_PLAYERS_PER_ROOM,
  Msg,
  mitigate,
  PICKUP_LIFETIME_SECONDS,
  PICKUP_RADIUS,
  Pickup,
  PLAYER_HALF,
  PLAYER_KNOCK_SPEED,
  PLAYER_KNOCK_TICKS,
  Player,
  PlayerInput,
  PROTOCOL_VERSION,
  RESPAWN_SECONDS,
  type Rng,
  RosterEntry,
  rollHit,
  rollRupees,
  type Stats,
  screenOf,
  screenRect,
  statsFor,
  stepPlayer,
  swordHitbox,
  TICK_RATE,
  TILE_SIZE,
  type WorldJoinOptions,
  WorldState,
  xpToNext,
} from "@game/shared";
import { type EnemySpawn, loadEnemySpawns } from "../world/mapObjects";

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

interface PickupLife {
  expiresAt: number;
}

/**
 * The open world of one match. Authoritative: clients only send PlayerInput
 * frames (and a one-off "spawn" message to pick a class); the server runs the
 * shared `stepPlayer` once per received input, then enemies, combat and drops.
 *
 * Stage 1: PvE only (players never hurt each other).
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
  private tick = 0;
  private spawnCursor = 0;
  private nextId = 1;
  private spawners: SpawnerState[] = [];
  private brains = new Map<string, EnemyBrain>();
  private pickupLife = new Map<string, PickupLife>();
  /** Last swing counter seen per player: a change means a new swing to resolve. */
  private lastSwing = new Map<string, number>();
  /** Tick at which a dead player comes back. */
  private respawnAt = new Map<string, number>();
  private inputBudget = new InputBudget();
  /** One manager for every `.view()` collection; ids are prefixed per collection. */
  private interest = new InterestManager<PositionedEntity>({ radius: INTEREST_RADIUS });

  override onCreate(options: WorldCreateOptions = {}) {
    const mapId = typeof options.mapId === "string" ? options.mapId : "overworld";
    this.map = loadMap(mapId, { tileSize: TILE_SIZE });
    this.state.mapId = mapId;
    this.spawners = loadEnemySpawns(mapId).map((s) => ({ ...s, respawnAt: 0 }));
    this.onMessage(Msg.spawn, (client: Client, data: unknown) => this.spawnPlayer(client, data));
    this.startSimulation((ctx) => this.step(ctx), TICK_RATE);
  }

  override onJoin(client: Client, _options: WorldJoinOptions) {
    // The player is in the room but not in the world until they pick a class.
    this.interest.addViewer(client);
  }

  override onLeave(client: Client, _code: CloseCode) {
    const id = client.sessionId;
    this.interest.removeViewer(client);
    this.state.players.delete(id);
    this.state.roster.delete(id);
    this.lastSwing.delete(id);
    this.respawnAt.delete(id);
    this.inputBudget.delete(id);
  }

  private spawnPlayer(client: Client, data: unknown) {
    const id = client.sessionId;
    const classId = (data as { classId?: unknown } | null)?.classId;
    if (this.state.players.has(id) || !isClassId(classId)) return;
    const stats = statsFor(classId, 1);
    const spawn = this.nextSpawn();
    const name = this.identity(client).name;
    this.state.players.set(
      id,
      new Player({
        name,
        classId,
        x: spawn.x,
        y: spawn.y,
        facing: 2,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        level: 1,
      }),
    );
    this.state.roster.set(id, new RosterEntry({ name, classId, level: 1 }));
    this.lastSwing.set(id, 0);
    this.updateInterest();
  }

  private nextSpawn() {
    return (
      this.map.spawns[this.spawnCursor++ % this.map.spawns.length] ?? {
        x: this.map.pixelWidth / 2,
        y: this.map.pixelHeight / 2,
      }
    );
  }

  // ─── Simulation ───────────────────────────────────────────────────────────

  private step(ctx: StepContext) {
    this.tick++;
    for (const [id, player] of this.state.players) this.stepPlayerTick(id, player, ctx.dt);
    for (const [id, enemy] of this.state.enemies) this.stepEnemy(id, enemy, ctx.dt);
    this.stepPickups();
    this.stepSpawners();
    if (this.tick % INTEREST_EVERY_TICKS === 0) this.updateInterest();
  }

  private stepPlayerTick(id: string, player: Player, dt: number) {
    if (player.invuln > 0) player.invuln--;
    if (player.dead && this.tick >= (this.respawnAt.get(id) ?? 0)) this.revive(id, player);

    const stats = this.statsOf(player);
    const channel = this.inputs.get(id);
    const inputs = channel ? channel.take(this.inputBudget.refill(id)) : [];
    this.inputBudget.spend(id, inputs.length);
    for (const input of inputs) {
      stepPlayer(player, input, dt, this.map.collision, stats);
      if (player.swing !== this.lastSwing.get(id)) {
        this.lastSwing.set(id, player.swing);
        this.resolveSwing(id, player, stats);
      }
    }
    // No input this tick (tab hidden, connection dropped): the player stands still.
    if (inputs.length === 0) {
      player.vx = 0;
      player.vy = 0;
    }
  }

  private statsOf(player: Player): Stats {
    return statsFor(isClassId(player.classId) ? player.classId : "knight", player.level);
  }

  /** Sword hits every enemy in the hitbox once. PvP is off in stage 1. */
  private resolveSwing(id: string, player: Player, stats: Stats) {
    const box = swordHitbox(player.x, player.y, player.facing, stats.reach);
    for (const [enemyId, enemy] of this.state.enemies) {
      const brain = this.brains.get(enemyId);
      if (!brain || !hitboxTouches(box, enemy.x, enemy.y, brain.def.half)) continue;
      const hit = rollHit(stats, brain.def.defense, this.rng);
      enemy.hp -= hit.amount;
      enemy.hurt = 6;
      this.knockEnemy(brain, enemy.x - player.x, enemy.y - player.y);
      if (hit.heal > 0) player.hp = Math.min(player.maxHp, player.hp + hit.heal);
      this.sendDamage({ x: enemy.x, y: enemy.y, amount: hit.amount, crit: hit.crit, player: false });
      if (enemy.hp <= 0) this.killEnemy(enemyId, enemy, brain, id, player);
    }
  }

  private knockEnemy(brain: EnemyBrain, dx: number, dy: number) {
    const len = Math.hypot(dx, dy) || 1;
    brain.knockX = (dx / len) * ENEMY_KNOCK_SPEED;
    brain.knockY = (dy / len) * ENEMY_KNOCK_SPEED;
    brain.knockTicks = ENEMY_KNOCK_TICKS;
  }

  private killEnemy(enemyId: string, enemy: Enemy, brain: EnemyBrain, killerId: string, killer: Player) {
    const stats = this.statsOf(killer);
    const rupees = rollRupees(brain.def.rupees, stats.luck, this.rng);
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
    // Level up: new max HP and a full heal.
    player.maxHp = this.statsOf(player).maxHp;
    player.hp = player.maxHp;
    const entry = this.state.roster.get(id);
    if (entry) entry.level = player.level;
    const message: LevelUpMessage = { level: player.level };
    this.clientOf(id)?.send(Msg.levelUp, message);
  }

  private hurtPlayer(id: string, player: Player, raw: number, fromX: number, fromY: number) {
    if (player.dead || player.invuln > 0) return;
    const amount = mitigate(raw, this.statsOf(player).defense);
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
        const pick = Math.floor(this.rng() * 10);
        const angle = (pick * Math.PI) / 4;
        brain.dirX = pick < 8 ? Math.cos(angle) : 0;
        brain.dirY = pick < 8 ? Math.sin(angle) : 0;
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
    this.pickupLife.set(id, { expiresAt: this.tick + PICKUP_LIFETIME_SECONDS * TICK_RATE });
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
      if (taken || this.tick >= (this.pickupLife.get(id)?.expiresAt ?? 0)) {
        this.state.pickups.delete(id);
        this.pickupLife.delete(id);
      }
    }
  }

  // ─── Networking helpers ───────────────────────────────────────────────────

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  /** Damage numbers go only to players who can see the spot. */
  private sendDamage(message: DamageMessage) {
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (p && (p.x - message.x) ** 2 + (p.y - message.y) ** 2 <= r2) client.send(Msg.damage, message);
    }
  }

  private *entities(): Iterable<[string, PositionedEntity]> {
    for (const [id, p] of this.state.players) yield [`p:${id}`, p];
    for (const [id, e] of this.state.enemies) yield [`e:${id}`, e];
    for (const [id, r] of this.state.pickups) yield [`r:${id}`, r];
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
