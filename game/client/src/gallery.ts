/**
 * Enemy gallery (dev only, `apps/client/gallery.html`; not in the release
 * build): one EnemyView per kind and skin, driven by fake server states that
 * go through every act (wind-up, action, recover), hop, stone, hurt,
 * interrupt and death with the real timings, to review the animations
 * without a server. Patches are emulated at 20 Hz like the real room, and
 * shots are fired with their release message first.
 *
 * Query: `zoom=<int>` (canvas zoom), `facing=<0-7>` (fixed facing for acts),
 * `only=<kind,…>`, `debug` (collision boxes), and for screenshots
 * `seg=<idle|walk|hop|slot0…slot5|tell|stunned|stone|hurt|interrupt|death>&at=<ms>`:
 * every view plays that segment with the releases lined up, and the scene
 * freezes `at` ms after the release (negative: during the wind-up).
 *
 * `view=items` shows the loot instead (see ItemsView): every item icon, every
 * pickup, both chests, the shop pedestals with goods of each rarity and the
 * loot effects, on grass, sand and each dungeon floor; it freezes after one
 * chest cycle (2 s).
 */
import { animKey } from "@core/client";
import type { TiledMap, TiledTileLayer } from "@core/maps";
import type { CollisionGrid } from "@core/shared";
import {
  ACT_MOVE,
  ACT_STONE,
  ActPhase,
  angleFacing,
  areaAt,
  ENEMIES,
  ENEMY_KINDS,
  type EnemyKind,
  type EnemyShotMessage,
  encodeAct,
  enemyStats,
  type OfferItem,
  parseWorldInfo,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type ShotStyle,
  type ShotVolley,
  TILE_SIZE,
} from "@game/shared";
import Phaser from "phaser";
import { mapKey, preloadAssets, tilesetKey } from "./assets";
import { directionalAnim } from "./render/anim";
import { actorDepth, DEPTH } from "./render/depth";
import { EnemyView } from "./render/EnemyView";
import { actInfo, ENEMY_LOOKS, SKINS, TICK_MS } from "./render/enemyLooks";
import { burstFx, chestKey, OFFER_LAYOUT, PICKUP_SHADOW, rupeeTag } from "./render/itemArt";
import { Projectiles } from "./render/Projectiles";
import { createProceduralArt, rarityRingTexture, shadowTexture } from "./render/proceduralArt";
import iconFrames from "./ui/iconFrames.json";

const CELL_W = 80;
const CELL_H = 72;
const COLUMNS = 8;
/** Patches reach clients at 20 Hz; release messages at once. */
const PATCH_MS = 50;
/** Lerp smoothing of the views (GameScene: smoothMs 65) and its teleport snap. */
const SMOOTH_MS = 65;
const SNAP_PX = 48;
/** Moves in the gallery stay inside their cell. */
const MAX_SPEED = 48;
const SHOT_RANGE = 40;
/** Freeze mode: the releases line up this many ticks after the start. */
const ALIGN_TICKS = 45;
const FACINGS = [0, 2, 4, 6] as const;

interface Entry {
  kind: EnemyKind;
  elite: boolean;
  skin: string;
  label: string;
}

/** One server tick of a fake enemy. */
interface Tick {
  act: number;
  x: number;
  y: number;
  facing: number;
  fire?: { angles: number[]; style: ShotStyle; speed: number; range: number };
  hit?: boolean;
  die?: boolean;
}

interface Hook {
  ready: boolean;
  frozen: boolean;
  missing: string[];
  /** Freeze mode: when it froze (ms from the release) and the frame rate then. */
  frozenAt?: number;
  fps?: number;
}

const hook: Hook = { ready: false, frozen: false, missing: [] };
(window as unknown as { __gallery: Hook }).__gallery = hook;

const params = new URLSearchParams(location.search);
const zoom = Math.max(1, Math.round(Number(params.get("zoom") ?? 2)) || 2);
const fixedFacing = params.has("facing") ? Number(params.get("facing")) : undefined;
const only = params.get("only")?.split(",").filter(Boolean);
const seg = params.get("seg") ?? undefined;
const freezeAt = Number(params.get("at") ?? 0);
const debug = params.has("debug");
const itemsView = params.get("view") === "items";

function entries(): Entry[] {
  const list: Entry[] = [];
  for (const kind of ENEMY_KINDS) {
    if (only && !only.includes(kind)) continue;
    const skins = SKINS[kind]?.filter((s) => s !== ENEMY_LOOKS[kind].eliteSheet) ?? [ENEMY_LOOKS[kind].sheet];
    for (const skin of skins) list.push({ kind, elite: false, skin, label: skin === kind ? kind : skin });
  }
  for (const kind of ["slime", "goblin", "archer", "lancer"] as const) {
    if (only && !only.includes(kind)) continue;
    const skin = ENEMY_LOOKS[kind].eliteSheet ?? ENEMY_LOOKS[kind].sheet;
    list.push({ kind, elite: true, skin, label: `${kind} elite` });
  }
  return list;
}

const unit = (facing: number) => ({ x: Math.cos((facing * Math.PI) / 4), y: Math.sin((facing * Math.PI) / 4) });

/** Builds the fake server ticks of one kind's segments, from (x, y). */
class Script {
  readonly ticks: Tick[] = [];
  /** Index of the tick of each release (freeze mode lines them up). */
  release = -1;
  private x: number;
  private y: number;
  private facing = 2;

  constructor(
    private readonly kind: EnemyKind,
    private readonly hx: number,
    private readonly hy: number,
  ) {
    this.x = hx;
    this.y = hy;
  }

  private push(act: number, extra: Partial<Tick> = {}) {
    this.ticks.push({ act, x: this.x, y: this.y, facing: this.facing, ...extra });
  }

  idle(n: number) {
    for (let i = 0; i < n; i++) this.push(0);
  }

  /** Back to the cell centre (walking), then still. */
  home() {
    const spd = Math.min(MAX_SPEED, ENEMIES[this.kind].speed) / 30;
    while (Math.hypot(this.hx - this.x, this.hy - this.y) > spd) {
      const a = Math.atan2(this.hy - this.y, this.hx - this.x);
      this.x += Math.cos(a) * spd;
      this.y += Math.sin(a) * spd;
      this.facing = angleFacing(a);
      this.push(0);
    }
    this.x = this.hx;
    this.y = this.hy;
  }

  walk() {
    const spd = Math.min(MAX_SPEED, ENEMIES[this.kind].speed) / 30;
    for (const facing of FACINGS) {
      this.facing = facing;
      const u = unit(facing);
      for (let i = 0; i < 15; i++) {
        this.x += u.x * spd;
        this.y += u.y * spd;
        this.push(0);
      }
    }
    this.idle(10);
  }

  hop(facing: number) {
    const hop = ENEMIES[this.kind].hop;
    if (!hop) return;
    this.facing = facing;
    for (let i = 0; i < hop.crouch; i++) this.push(encodeAct(ACT_MOVE, ActPhase.windup));
    if (this.release < 0) this.release = this.ticks.length;
    const u = unit(facing);
    const step = Math.min(24, (ENEMIES[this.kind].speed * hop.air) / 30) / hop.air;
    for (let i = 0; i < hop.air; i++) {
      this.x += u.x * step;
      this.y += u.y * step;
      this.push(encodeAct(ACT_MOVE, ActPhase.action));
    }
    for (let i = 0; i < hop.land; i++) this.push(encodeAct(ACT_MOVE, ActPhase.recover));
    this.idle(20);
  }

  /** Attack `slot` aimed along `facing` (`stunned`: a charge that ends against a wall). */
  attack(slot: number, facing: number, stunned = false) {
    const def = ENEMIES[this.kind];
    const a = def.attacks[slot];
    if (!a) return;
    this.facing = def.cardinal !== undefined ? facing - (facing % 2) : facing;
    const aim = (this.facing * Math.PI) / 4;
    for (let i = 0; i < a.windupTicks; i++) this.push(encodeAct(slot, ActPhase.windup));
    if (this.release < 0) this.release = this.ticks.length;
    const u = unit(this.facing);
    let fire: Tick["fire"];
    if (a.type === "aimed") {
      const spread = (a.spreadDeg * Math.PI) / 180;
      const angles =
        a.count <= 1
          ? [aim]
          : Array.from({ length: a.count }, (_, i) => aim - spread / 2 + (i * spread) / (a.count - 1));
      fire = { angles, style: a.style, speed: a.speed, range: Math.min(SHOT_RANGE, a.range) };
    } else if (a.type === "ring") fire = this.ring(a);
    let recover = a.recoverTicks;
    if (a.type === "charge" || a.type === "leap") {
      const step = a.type === "leap" ? 28 / a.ticks : Math.min(MAX_SPEED, a.speed) / 30;
      const ticks = stunned ? Math.ceil(a.ticks / 2) : a.ticks;
      for (let i = 0; i < ticks; i++) {
        this.x += u.x * step;
        this.y += u.y * step;
        this.push(encodeAct(slot, ActPhase.action));
      }
      if (a.type === "leap" && a.ring) {
        const ring = this.ring(a.ring);
        this.push(encodeAct(slot, ActPhase.recover, false), { fire: ring });
        recover--;
      }
      if (stunned && a.type === "charge" && a.stunTicks) recover = a.stunTicks;
    } else {
      if (a.type === "blink") this.x += this.x > this.hx ? -28 : 28;
      this.push(encodeAct(slot, ActPhase.action), { fire });
    }
    for (let i = 0; i < recover; i++) this.push(encodeAct(slot, ActPhase.recover, stunned));
    this.idle(10);
  }

  stone() {
    const info = actInfo(this.kind, ACT_STONE);
    const end = ENEMIES[this.kind].stone?.endRing;
    if (!info) return;
    for (let i = 0; i < info.windupTicks; i++) this.push(encodeAct(ACT_STONE, ActPhase.windup));
    if (this.release < 0) this.release = this.ticks.length;
    for (let i = 0; i < Math.min(60, info.actionTicks); i++) this.push(encodeAct(ACT_STONE, ActPhase.action));
    this.push(encodeAct(ACT_STONE, ActPhase.recover), { fire: end ? this.ring(end) : undefined });
    for (let i = 1; i < info.recoverTicks; i++) this.push(encodeAct(ACT_STONE, ActPhase.recover));
    this.idle(10);
  }

  hurt() {
    if (this.release < 0) this.release = this.ticks.length;
    for (let i = 0; i < 3; i++) {
      this.push(0, { hit: true });
      this.idle(9);
    }
    this.idle(10);
  }

  /** A blow cancels a wind-up (humanoids show their stun pose). */
  interrupt(facing: number) {
    const a = ENEMIES[this.kind].attacks.findIndex((x) => x.type !== "blink");
    if (a < 0 || !ENEMY_LOOKS[this.kind].stun) return;
    this.facing = facing;
    for (let i = 0; i < 5; i++) this.push(encodeAct(a, ActPhase.windup));
    if (this.release < 0) this.release = this.ticks.length;
    this.push(0, { hit: true });
    this.idle(20);
  }

  death() {
    if (this.release < 0) this.release = this.ticks.length;
    this.push(0, { die: true });
    this.idle(45);
  }

  private ring(v: ShotVolley): Tick["fire"] {
    const angles = Array.from({ length: v.count }, (_, i) => (i * Math.PI * 2) / v.count);
    return { angles, style: v.style, speed: v.speed, range: Math.min(SHOT_RANGE, v.range) };
  }

  /** One full loop: idle, walk (or hops), every attack in each facing, stuns, stone, hurt, interrupt, death. */
  loop(round: number) {
    const def = ENEMIES[this.kind];
    const facing = fixedFacing ?? FACINGS[round % FACINGS.length] ?? 2;
    this.idle(15);
    if (def.hop) {
      this.hop(facing);
      this.hop((facing + 4) % 8);
    } else this.walk();
    this.home();
    def.attacks.forEach((a, slot) => {
      this.attack(slot, facing);
      if (a.type === "charge" && a.stunTicks) this.attack(slot, facing, true);
      this.home();
    });
    this.stone();
    this.hurt();
    this.interrupt(facing);
    this.death();
  }

  /** Freeze mode: just one segment, its release at ALIGN_TICKS. */
  segment(name: string) {
    const def = ENEMIES[this.kind];
    const facing = fixedFacing ?? 2;
    const slot = /^slot(\d)$/.exec(name);
    const body = new Script(this.kind, this.hx, this.hy);
    if (name === "idle") body.idle(10);
    else if (name === "walk") body.walk();
    else if (name === "hop") body.hop(facing);
    else if (slot) body.attack(Number(slot[1]), facing);
    else if (name === "tell") {
      // The first attack with a tell (else with an overlay, else the first).
      const acts = ENEMY_LOOKS[this.kind].acts;
      const i = [acts.findIndex((a) => a?.tell), acts.findIndex((a) => a?.overlay), 0].find((x) => x >= 0) ?? 0;
      body.attack(i, facing);
    } else if (name === "stunned") {
      const i = def.attacks.findIndex((a) => a.type === "charge" && a.stunTicks);
      if (i >= 0) body.attack(i, facing, true);
    } else if (name === "stone") body.stone();
    else if (name === "hurt") body.hurt();
    else if (name === "interrupt") body.interrupt(facing);
    else if (name === "death") body.death();
    const release = body.release < 0 ? 0 : body.release;
    this.facing = body.ticks[0]?.facing ?? facing;
    this.idle(Math.max(0, ALIGN_TICKS - release));
    this.ticks.push(...body.ticks);
    this.idle(60);
  }
}

class Actor {
  view: EnemyView;
  private readonly script: Script;
  private index = 0;
  /** Server state (per tick), the last patch the view got, and the drawn position. */
  private readonly server = { hp: 1, maxHp: 1, hurt: 0, facing: 2, act: 0, x: 0, y: 0 };
  private readonly patched = { ...this.server };
  private drawX: number;
  private drawY: number;
  private shots = 0;
  /** Its view died and was removed; a new one comes back shortly. */
  private gone = false;

  constructor(
    private readonly scene: GalleryScene,
    readonly entry: Entry,
    readonly hx: number,
    readonly hy: number,
  ) {
    this.script = new Script(entry.kind, hx, hy);
    if (seg) this.script.segment(seg);
    else for (let r = 0; r < FACINGS.length; r++) this.script.loop(r);
    const hp = enemyStats(entry.kind, 0, entry.elite).maxHp;
    Object.assign(this.server, { hp, maxHp: hp, x: hx, y: hy });
    Object.assign(this.patched, this.server);
    this.drawX = hx;
    this.drawY = hy;
    this.view = this.makeView();
  }

  private makeView() {
    return new EnemyView(this.scene, this.entry.kind, this.entry.elite, this.entry.skin);
  }

  /** One server tick: the next scripted state; shots go out at once (the release cue). */
  tick() {
    const t = this.script.ticks[this.index];
    this.index = (this.index + 1) % this.script.ticks.length;
    if (!t) return;
    const s = this.server;
    Object.assign(s, { act: t.act, x: t.x, y: t.y, facing: t.facing });
    if (t.hit) {
      s.hurt = (s.hurt + 6) % 250;
      s.hp = Math.max(1, s.hp - Math.ceil(s.maxHp * 0.15));
    }
    if (t.fire) {
      const m: EnemyShotMessage = {
        key: `${this.entry.label}:${this.shots++}`,
        from: this.entry.label,
        x: t.x,
        y: t.y,
        ...t.fire,
      };
      this.scene.projectiles?.spawnHostile(m, this.scene.time.now);
      if (!this.gone) this.view.fired(this.scene.time.now);
    }
    if (t.die && !this.gone) {
      // Removed like GameScene.removeEnemy does: the view plays its death and is no longer updated.
      this.view.destroy(true);
      this.gone = true;
      s.hp = s.maxHp;
      this.scene.time.delayedCall(1200, () => {
        this.view = this.makeView();
        this.gone = false;
      });
    }
  }

  patch() {
    Object.assign(this.patched, this.server);
  }

  draw(time: number, delta: number) {
    const p = this.patched;
    if (Math.hypot(p.x - this.drawX, p.y - this.drawY) > SNAP_PX) {
      this.drawX = p.x;
      this.drawY = p.y;
    } else {
      const k = Math.min(1, delta / SMOOTH_MS);
      this.drawX += (p.x - this.drawX) * k;
      this.drawY += (p.y - this.drawY) * k;
    }
    if (!this.gone) this.view.update(this.drawX, this.drawY, p, time);
  }
}

class GalleryScene extends Phaser.Scene {
  projectiles?: Projectiles;
  private items?: ItemsView;
  private actors: Actor[] = [];
  private acc = 0;
  private patchAcc = 0;
  /** Server ticks run so far. */
  private ticks = 0;

  constructor() {
    super("gallery");
  }

  preload() {
    preloadAssets(this);
  }

  create() {
    createProceduralArt(this);
    if (itemsView) {
      this.items = new ItemsView(this);
      hook.missing = [...new Set(this.items.missing)];
      hook.ready = true;
      return;
    }
    const list = entries();
    const { width, height } = this.scale;
    const grid: CollisionGrid = {
      width: Math.ceil(width / 16),
      height: Math.ceil(height / 16),
      tileSize: 16,
      isSolid: (tx, ty) => tx < 0 || ty < 0 || tx >= Math.ceil(width / 16) || ty >= Math.ceil(height / 16),
    };
    this.projectiles = new Projectiles(this, grid);
    (window as unknown as { __actors: Actor[] }).__actors = this.actors;
    const g = this.add.graphics().setDepth(-1);
    const labels = document.getElementById("labels");
    list.forEach((entry, i) => {
      const cx = (i % COLUMNS) * CELL_W;
      const cy = Math.floor(i / COLUMNS) * CELL_H;
      const dungeon = /-(blue|brown|black|cyan|skeleton)$/.test(entry.skin) || entry.skin === "wisp";
      g.fillStyle(dungeon ? 0x4a4458 : 0x6a9a4a).fillRect(cx, cy, CELL_W, CELL_H);
      g.fillStyle(0x000000, 0.25).fillRect(cx, cy, CELL_W, 1).fillRect(cx, cy, 1, CELL_H);
      const hx = cx + CELL_W / 2;
      const hy = cy + CELL_H / 2 + 8;
      this.actors.push(new Actor(this, entry, hx, hy));
      if (debug) {
        const half = enemyStats(entry.kind, 0, entry.elite).half;
        g.lineStyle(1, 0xff3030, 0.8).strokeRect(hx - half + 0.5, hy - half + 0.5, half * 2 - 1, half * 2 - 1);
      }
      if (labels) {
        const el = document.createElement("div");
        el.className = "label";
        el.textContent = entry.label;
        el.style.insetInlineStart = `${cx * zoom + 2}px`;
        el.style.insetBlockStart = `${cy * zoom + 1}px`;
        labels.append(el);
      }
      this.checkAssets(entry);
    });
    hook.missing = [...new Set(hook.missing)];
    hook.ready = true;
  }

  /** Every texture and tag the view of `entry` will ask for exists. */
  private checkAssets(entry: Entry) {
    const look = ENEMY_LOOKS[entry.kind];
    if (!this.textures.exists(entry.skin)) hook.missing.push(entry.skin);
    const acts = [...look.acts, actInfo(entry.kind, ACT_MOVE)?.look, actInfo(entry.kind, ACT_STONE)?.look];
    const tags = [look.walk, look.idle, look.hurt, look.stun, look.rest?.tag, look.death?.tag];
    for (const act of acts) {
      if (!act) continue;
      tags.push(act.windup, act.action, act.recover, act.stunned?.tag, act.stunned?.next);
      for (const key of [act.overlay, act.held, act.stunned?.fx, ...(act.fx ?? []).map((f) => f.key)])
        if (key && !this.textures.exists(key)) hook.missing.push(key);
    }
    for (const tag of tags) {
      if (!tag) continue;
      for (const facing of look.facing === "rows" ? FACINGS : [2]) {
        const { anim } = directionalAnim(this, entry.skin, tag, facing);
        if (!this.anims.exists(anim)) hook.missing.push(`${entry.skin}:${tag}:${facing}`);
      }
    }
    for (const [fx, tag] of [
      ["fx-shine", "play"],
      ["fx-spark", "play"],
      ["fx-spark", "twinkle"],
    ] as const)
      if (!this.anims.exists(animKey(fx, tag))) hook.missing.push(`${fx}:${tag}`);
  }

  override update(time: number, delta: number) {
    if (!hook.ready) return;
    if (this.items) {
      // Freezes after one chest cycle (the cycling chests then show their empty frame).
      if (this.items.elapsed + delta >= ITEMS_FREEZE_MS && !hook.frozen) {
        hook.frozen = true;
        hook.frozenAt = Math.round(this.items.elapsed);
        hook.fps = Math.round(this.game.loop.actualFps);
        this.scene.pause();
        return;
      }
      this.items.update(delta);
      return;
    }
    this.acc += delta;
    this.patchAcc += delta;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.ticks++;
      for (const a of this.actors) a.tick();
    }
    if (this.patchAcc >= PATCH_MS) {
      this.patchAcc %= PATCH_MS;
      for (const a of this.actors) a.patch();
    }
    for (const a of this.actors) a.draw(time, delta);
    this.projectiles?.update(time);
    // Script time (ticks run), not the clock: the first frames after create can be long.
    const scriptMs = this.ticks * TICK_MS + this.acc;
    if (seg && !hook.frozen && scriptMs >= ALIGN_TICKS * TICK_MS + freezeAt) {
      hook.frozen = true;
      hook.frozenAt = Math.round(scriptMs - ALIGN_TICKS * TICK_MS);
      hook.fps = Math.round(this.game.loop.actualFps);
      this.scene.pause();
    }
  }
}

// ─── Items view ─────────────────────────────────────────────────────────────

/** Columns of the items view: one ground each (biome letter or dungeon id, see the map's world info). */
const ITEM_GROUNDS = [
  { label: "grass", biome: "G" },
  { label: "sand", biome: "B" },
  { label: "crypt", dungeon: "crypt" },
  { label: "lair", dungeon: "lair" },
  { label: "tomb", dungeon: "tomb" },
  { label: "hall", dungeon: "hall" },
] as const;
const ITEMS_COL_W = 176;
const ITEMS_H = 272;
/** Chests cycle closed → open → empty this often; the view freezes after one cycle. */
const CHEST_CYCLE_MS = 2000;
const CHEST_OPEN_AT = 800;
const ITEMS_FREEZE_MS = CHEST_CYCLE_MS;
/** One-shot pickups and effects replay this often. */
const REPLAY_MS = 1000;
/** Rows (y of the sprites' bottoms or spots) inside a column. */
const ROW = { icons: 30, pickups: 136, chests: 166, offers: 204, fx: 236, frames: 262 } as const;
const ICONS_PER_ROW = 8;
const ICON_STEP = 20;
/** Every shop offer the view shows: each rarity of a relic, a weapon, a potion and a sold one. */
const OFFERS: { kind: OfferItem; rarity: number; sold?: boolean }[] = [
  { kind: "boots", rarity: 0 },
  { kind: "shield", rarity: 1 },
  { kind: "fireball", rarity: 2 },
  { kind: "eye", rarity: 3 },
  { kind: "haste", rarity: 4 },
  { kind: "potion", rarity: 0 },
  { kind: "mark", rarity: 2, sold: true },
];
/** Sheets the view needs (tools/art manifest.ts). */
const ITEM_SHEETS = [
  "items",
  "pickups",
  "chest",
  "chest-gold",
  "pedestal",
  "fx-burst-gold",
  "fx-burst-purple",
  "fx-glint",
] as const;

/** The loot, laid out on each ground the game puts it on. */
class ItemsView {
  readonly missing: string[] = [];
  elapsed = 0;
  private readonly cycling: { sprite: Phaser.GameObjects.Sprite; key: string }[] = [];
  private readonly replays: { sprite: Phaser.GameObjects.Sprite; anim: string }[] = [];
  private lastCycle = -1;
  private opened = false;
  private lastReplay = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (const key of ITEM_SHEETS) if (!scene.textures.exists(key)) this.missing.push(key);
    this.drawGrounds();
    const labels = document.getElementById("labels");
    ITEM_GROUNDS.forEach((ground, i) => {
      const x0 = i * ITEMS_COL_W;
      this.column(x0);
      if (labels) {
        const el = document.createElement("div");
        el.className = "label";
        el.textContent = ground.label;
        el.style.insetInlineStart = `${x0 * zoom + 2}px`;
        el.style.insetBlockStart = "1px";
        labels.append(el);
      }
    });
  }

  /** The most common ground tile of each column's place in the real map, as a tilemap under everything. */
  private drawGrounds() {
    const raw = this.scene.cache.tilemap.get(mapKey("overworld"))?.data as TiledMap | undefined;
    const ground = raw?.layers.find((l): l is TiledTileLayer => l.type === "tilelayer" && l.name === "ground");
    const tileset = raw?.tilesets[0];
    if (!raw || !Array.isArray(ground?.data) || !tileset) {
      this.missing.push("map:overworld");
      return;
    }
    const info = parseWorldInfo(raw);
    const tilesX = SCREEN_WIDTH / TILE_SIZE;
    const tilesY = SCREEN_HEIGHT / TILE_SIZE;
    const data = ground.data;
    const floorOf = (col: number, row: number) => {
      const count = new Map<number, number>();
      for (let y = row * tilesY; y < (row + 1) * tilesY; y++)
        for (let x = col * tilesX; x < (col + 1) * tilesX; x++) {
          const gid = data[y * raw.width + x] ?? 0;
          count.set(gid, (count.get(gid) ?? 0) + 1);
        }
      return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    };
    const gids = ITEM_GROUNDS.map((g) => {
      if ("dungeon" in g) {
        const area = info.areas.find((a) => a.id === g.dungeon);
        return area && areaAt(info.areas, area.col, area.row) ? floorOf(area.col, area.row) : 0;
      }
      const i = info.biomes.indexOf(g.biome);
      return i < 0 ? 0 : floorOf(i % info.columns, Math.floor(i / info.columns));
    });
    const colTiles = ITEMS_COL_W / TILE_SIZE;
    const rows = Array.from({ length: Math.ceil(ITEMS_H / TILE_SIZE) }, () =>
      gids.flatMap((gid) => Array.from({ length: colTiles }, () => gid - tileset.firstgid)),
    );
    const map = this.scene.make.tilemap({ data: rows, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const set = map.addTilesetImage(
      "ground",
      tilesetKey(tileset.image ?? ""),
      TILE_SIZE,
      TILE_SIZE,
      tileset.margin ?? 0,
      tileset.spacing ?? 0,
    );
    if (!set) this.missing.push("tileset");
    else map.createLayer(0, set, 0, 0)?.setDepth(DEPTH.ground);
  }

  private anim(key: string, tag: string): string {
    const anim = animKey(key, tag);
    if (!this.scene.anims.exists(anim)) this.missing.push(`${key}:${tag}`);
    return anim;
  }

  private sprite(x: number, y: number, key: string, tag: string, origin: [number, number] = [0.5, 0.5]) {
    const anim = this.anim(key, tag);
    const sprite = this.scene.add.sprite(x, y, key).setOrigin(...origin);
    if (this.scene.anims.exists(anim)) sprite.play(anim);
    return sprite;
  }

  /** A sprite on frame `index` of a tag (to show every frame of a one-shot at once). */
  private still(x: number, y: number, key: string, tag: string, index: number) {
    const anim = this.scene.anims.get(this.anim(key, tag));
    const frame = anim?.frames[index]?.frame;
    if (!frame) this.missing.push(`${key}:${tag}:${index}`);
    return this.scene.add.sprite(x, y, key, frame?.name).setDepth(DEPTH.fx);
  }

  private column(x0: number) {
    // Every icon of the items sheet (the compass turns), standing on its bottom like goods.
    Object.keys(iconFrames.icons).forEach((tag, i) => {
      const x = x0 + 18 + (i % ICONS_PER_ROW) * ICON_STEP;
      const y = ROW.icons + Math.floor(i / ICONS_PER_ROW) * ICON_STEP;
      this.sprite(x, y, "items", tag, [0.5, 1]);
    });
    // Pickups with their shadows: each rupee tier, the heart, and the heart vanishing.
    const pickups = [...[1, 5, 20, 50].map(rupeeTag), "heart", "heart-vanish"];
    pickups.forEach((tag, i) => {
      const x = x0 + 18 + i * 24;
      const y = ROW.pickups;
      this.scene.add
        .image(x, y + PICKUP_SHADOW.dy, shadowTexture(this.scene, PICKUP_SHADOW.width))
        .setDepth(actorDepth(y, 4) - 1e-5);
      const sprite = this.sprite(x, y, "pickups", tag).setDepth(actorDepth(y, 4));
      if (tag === "heart-vanish") this.replays.push({ sprite, anim: animKey("pickups", tag) });
    });
    // Chests: closed, half open, empty, and one cycling; wooden then gold.
    [false, true].forEach((gold, m) => {
      const key = chestKey(gold);
      const x = x0 + 18 + m * 84;
      const y = ROW.chests;
      this.sprite(x, y, key, "closed");
      this.still(x + 20, y, key, "open", 2).setDepth(DEPTH.actors);
      this.sprite(x + 40, y, key, "empty");
      this.cycling.push({ sprite: this.sprite(x + 60, y, key, "closed"), key });
    });
    // Shop offers: pedestal, rarity ring (relics and weapons above common), goods; a sold one is bare.
    OFFERS.forEach((offer, i) => {
      const x = x0 + 16 + i * 24;
      const y = ROW.offers;
      this.sprite(x, y + OFFER_LAYOUT.pedestalDy, "pedestal", "idle", [0.5, 1]).setDepth(DEPTH.pedestal);
      if (offer.sold) return;
      if (offer.rarity >= 1 && offer.kind !== "potion")
        this.scene.add
          .image(x, y + OFFER_LAYOUT.ringDy, rarityRingTexture(this.scene, offer.rarity))
          .setDepth(DEPTH.pedestal + 0.1);
      this.sprite(x, y, "items", offer.kind, [0.5, 1]).setDepth(actorDepth(y, 0));
    });
    // Loot effects, replaying: the bursts (gold up to rare, purple for epic+) and the glint; then each frame.
    [burstFx(0), burstFx(4), "fx-glint"].forEach((key, i) => {
      const sprite = this.sprite(x0 + 18 + i * 24, ROW.fx, key, "play").setDepth(DEPTH.fx);
      this.replays.push({ sprite, anim: animKey(key, "play") });
    });
    for (const f of [0, 1]) this.still(x0 + 98 + f * 24, ROW.fx, "fx-glint", "play", f);
    ["fx-burst-gold", "fx-burst-purple"].forEach((key, k) => {
      for (let f = 0; f < 5; f++) this.still(x0 + 10 + (k * 5 + f) * 16, ROW.frames, key, "play", f);
    });
  }

  /** Chests cycle closed → open → empty; one-shots replay. */
  update(delta: number) {
    this.elapsed += delta;
    const cycle = Math.floor(this.elapsed / CHEST_CYCLE_MS);
    if (cycle !== this.lastCycle) {
      this.lastCycle = cycle;
      this.opened = false;
      for (const c of this.cycling) c.sprite.play(animKey(c.key, "closed"));
    }
    if (!this.opened && this.elapsed % CHEST_CYCLE_MS >= CHEST_OPEN_AT) {
      this.opened = true;
      for (const c of this.cycling) {
        c.sprite.play(animKey(c.key, "open"));
        c.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => c.sprite.play(animKey(c.key, "empty")));
      }
    }
    if (this.elapsed - this.lastReplay >= REPLAY_MS) {
      this.lastReplay = this.elapsed;
      for (const r of this.replays) r.sprite.play(r.anim);
    }
  }
}

/** Starts the gallery in `#gallery` (see apps/client/gallery.html). */
export function startGallery() {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "gallery",
    width: itemsView ? ITEM_GROUNDS.length * ITEMS_COL_W : COLUMNS * CELL_W,
    height: itemsView ? ITEMS_H : Math.ceil(entries().length / COLUMNS) * CELL_H,
    backgroundColor: "#101018",
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, zoom },
    input: { keyboard: false },
    scene: [GalleryScene],
  });
}
