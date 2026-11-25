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
 */
import { animKey } from "@core/client";
import type { CollisionGrid } from "@core/shared";
import {
  ACT_MOVE,
  ACT_STONE,
  ActPhase,
  angleFacing,
  ENEMIES,
  ENEMY_KINDS,
  type EnemyKind,
  type EnemyShotMessage,
  encodeAct,
  enemyStats,
  type ShotStyle,
  type ShotVolley,
} from "@game/shared";
import Phaser from "phaser";
import { preloadAssets } from "./assets";
import { directionalAnim } from "./render/anim";
import { EnemyView } from "./render/EnemyView";
import { actInfo, ENEMY_LOOKS, SKINS, TICK_MS } from "./render/enemyLooks";
import { Projectiles } from "./render/Projectiles";
import { createPlaceholderArt } from "./render/placeholderArt";

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
    createPlaceholderArt(this);
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

/** Starts the gallery in `#gallery` (see apps/client/gallery.html). */
export function startGallery() {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "gallery",
    width: COLUMNS * CELL_W,
    height: Math.ceil(entries().length / COLUMNS) * CELL_H,
    backgroundColor: "#101018",
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, zoom },
    input: { keyboard: false },
    scene: [GalleryScene],
  });
}
