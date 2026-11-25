import { animKey } from "@core/client";
import {
  ActPhase,
  actPhase,
  actSlot,
  actStunned,
  ENEMIES,
  type EnemyKind,
  type EnemyRank,
  enemyStats,
  isEnemyKind,
  PLAYER_HALF,
} from "@game/shared";
import Phaser from "phaser";
import { directionalAnim, facingDir, feetOrigin, playAnim, setFlipAnchored, spriteAnchor } from "./anim";
import { actorDepth, DEPTH } from "./depth";
import {
  type ActFx,
  type ActInfo,
  actInfo,
  ENEMY_LOOKS,
  type EnemyLook,
  fitScale,
  goldRecolor,
  OVERLAY_FRAMES,
  overlayFrame,
  STILL_SPEED,
  sideFlip,
  TICK_MS,
  tellDelayMs,
  tellOffset,
} from "./enemyLooks";
import { playFx } from "./fx";
import { ellipseRing } from "./pixelEllipse";
import { shadowTexture, TEX_ELITE_GLOW } from "./placeholderArt";
import { addRecoloredSprite, textureColors } from "./recolor";

/** What the server tells about an enemy each frame (the schema fields the view draws). */
export interface EnemyState {
  hp: number;
  maxHp: number;
  /** Ticks left of the hurt flash (rises on every hit). */
  hurt: number;
  facing: number;
  /** Enemy.act (encodeAct): the act it is in and its phase. */
  act: number;
  /** Latest server position (not interpolated): the leap marker reads the flight from it. */
  x?: number;
  y?: number;
}

/** White flash on a hit: small enemies longer, bosses briefly (they are hit all the time). */
const FLASH_MS = 120;
const BOSS_FLASH_MS = 70;
/** How long a sheet's own hurt frame shows after a hit (bosses: BOSS_FLASH_MS)... */
const HURT_FRAME_MS = 160;
/** ...and how often a boss may show it at most, so its moves and tells stay readable under constant blows. */
const BOSS_HURT_GAP_MS = 250;
/** A humanoid whose wind-up a blow cancelled shows its stun pose this long... */
const STUN_MS = 200;
/** ...when the blow landed this close before the cancel. */
const INTERRUPT_HIT_MS = 100;
/** Faster than this (px/s) between two frames is a teleport (the server's blink), not a walk. */
const BLINK_SPEED = 300;
/** Smoothing of the speed estimate (ms): interpolated positions jitter a little. */
const SPEED_SMOOTH_MS = 90;
/**
 * Fitted wind-ups end this much before the server's release: the release
 * message comes at once while the wind-up start waits for a patch (20 Hz).
 */
const FIT_LEAD_MS = 25;
/** Explosions of a falling boss or mini-boss, and the time between them. */
const BOSS_BLASTS = 7;
const MINIBOSS_BLASTS = 4;
const BLAST_MS = 150;
/** Weapon overlays are drawn facing right; a quarter turn is pixel-exact. */
const OVERLAY_ANGLE = { right: 0, left: 0, down: 90, up: -90 } as const;
/** Gap between the art top and a held item, and between the art top and the stun sparks. */
const HELD_GAP = 2;
const SPARK_GAP = 4;
/**
 * The looping stun sparks: fx-spark's `twinkle` (small yellow sparkles, without the big white
 * cross of its first frame, which is the tell's shape), so "hit it now" never reads as "attack coming".
 */
const SPARK_TAG = "twinkle";
/** Landing marker of a leap: a red ring (and a faint inside) over the whole zone that gets hurt. */
const MARKER_COLOR = 0xe04040;
const MARKER_BAND_ALPHA = 0.85;
const MARKER_INSIDE_ALPHA = 0.16;

/** Sheet of an elite: the pack's gold variant (enemySkin), or a gold palette swap of its skin made once. */
function goldSheet(scene: Phaser.Scene, sheet: string): string {
  const key = `${sheet}~gold`;
  if (scene.textures.exists(key)) return key;
  const spec = goldRecolor(textureColors(scene, sheet));
  return addRecoloredSprite(scene, sheet, key, spec) ? key : sheet;
}

/**
 * The ground a leap hurts, `size` px across: the server hurts every hero whose centre is within
 * the landing radius plus a hero's half, a circle in the top-down plane (not a squashed ellipse).
 */
function markerTexture(scene: Phaser.Scene, size: number): string {
  const key = `fx:marker-${size}`;
  if (scene.textures.exists(key)) return key;
  const { band, inside } = ellipseRing(size, size);
  const g = scene.make.graphics({}, false);
  g.fillStyle(MARKER_COLOR, MARKER_INSIDE_ALPHA);
  for (const r of inside) g.fillRect(r.x0, r.y, r.x1 - r.x0, 1);
  g.fillStyle(MARKER_COLOR, MARKER_BAND_ALPHA);
  for (const r of band) g.fillRect(r.x0, r.y, r.x1 - r.x0, 1);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Total length (ms) of an animation, from its frames' own durations. */
function animMs(scene: Phaser.Scene, key: string): number {
  const anim = scene.anims.get(key);
  if (!anim) return 0;
  return anim.frames.reduce((sum, f) => sum + (f.duration || anim.msPerFrame), 0);
}

/** The act being shown: which slot, its phase as the view plays it, and when things happen. */
interface ShownAct {
  slot: number;
  info: ActInfo;
  phase: ActPhase;
  /** When the shown phase began (scene time). */
  at: number;
  /** The release has been shown (by `fired` or a patch): never twice per act. */
  released: boolean;
  tellAt: number;
  /** The one-shot action tag plays until then; the recover tag waits for it. */
  actionUntil: number;
  recoverPending: boolean;
  /** Phase length (ms) the overlay spreads its frames over. */
  phaseMs: number;
}

/** A leap in the air: where it took off, and the landing spot once the flight shows it. */
interface Leap {
  fromX: number;
  fromY: number;
  /** Server positions seen during the flight, and the smallest step between two of them (one tick). */
  lastX: number;
  lastY: number;
  step: number;
  /** Steps seen: from two on, the smallest is one tick (patches carry one or two ticks). */
  steps: number;
  marker?: Phaser.GameObjects.Image;
}

/**
 * Visual for one enemy, from its sheet (see enemyLooks.ts): feet on the bottom
 * of its box, facing, walk / idle cycles from how it moves, and every act the
 * server sends in Enemy.act (wind-up with its tell, action, recover, stun),
 * hurt flashes, a small HP bar once damaged and smoke or explosions when it
 * dies. Elites are gold with a glow; bosses show their HP in the HUD instead.
 */
export class EnemyView {
  readonly container: Phaser.GameObjects.Container;
  readonly kind: EnemyKind;
  readonly rank: EnemyRank;
  /** Half-extent of its box (feet at y + half). */
  readonly half: number;
  /** Last drawn position (box centre). */
  x = Number.NaN;
  y = Number.NaN;
  /** Last health seen: removal at 0 is a death. */
  hp = 1;
  /** When a blow last landed on it (scene time); removal right after one is a death. */
  lastHitAt = Number.NEGATIVE_INFINITY;
  private readonly look: EnemyLook;
  /** Sheet drawn (its skin, gold for elites) and the key its tags and anchor come from. */
  private readonly sheet: string;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly barY: number;
  private readonly lift: number;
  /** Unflipped horizontal origin of the body (mirrored with the flip, see setFlipAnchored). */
  private readonly bodyOriginX: number;
  /** Where weapon overlays attach: the body frame's pixel (16,16), relative to the box centre. */
  private readonly overlayY: number;
  private readonly overlays = new Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; originX: number; frames: (string | number)[] }
  >();
  private overlay?: { sprite: Phaser.GameObjects.Sprite; originX: number; frames: (string | number)[] };
  private held?: Phaser.GameObjects.Sprite;
  private spark?: Phaser.GameObjects.Sprite;
  /** The tell's shine while it plays: it goes when the blow comes or the act is cancelled. */
  private shine?: Phaser.GameObjects.Sprite;
  /** Effect of the kind's blink, played where it leaves and where it lands. */
  private readonly blinkFx?: string;
  private lastTime = Number.NaN;
  private speed = 0;
  private moving = false;
  private flip = false;
  private facing = 2;
  private lastHurt = 0;
  private flashUntil = 0;
  private hurtUntil = 0;
  private hurtAt = Number.NEGATIVE_INFINITY;
  /** Last act value patched by the server, and the act shown. */
  private act = 0;
  private shown?: ShownAct;
  /** A one-shot action still playing after its act ended (movement waits for it). */
  private actionUntil = 0;
  private stunUntil = 0;
  /** Since when it has stood still with no act (rest poses). */
  private stillSince = 0;
  private leap?: Leap;
  /** Take-off point of a leap being wound up (the enemy stands still in its wind-up). */
  private leapFrom?: { x: number; y: number };
  /** Dormant pose shown (a perched bat: lower, no bob). */
  private resting = false;
  /** Tag of the act phase being shown (kept on its row when the facing turns), and its held frame. */
  private phaseTag?: string;
  private phaseFrame?: number;
  /** Render frames counted for the wind-up shake. */
  private frame = 0;
  /** Resolved animation keys by "<tag>|<facing>|<flip>": the same few are asked for every frame. */
  private readonly keys = new Map<string, { anim: string; flipX: boolean }>();
  private blinkAt = Number.NEGATIVE_INFINITY;
  /** Phase of the flyers' bob, so a flock doesn't move in step. */
  private readonly seed = Math.random() * 10;
  private drawn = false;
  private dying = false;

  constructor(
    private readonly scene: Phaser.Scene,
    kind: string,
    private readonly elite: boolean,
    /** Sheet for where it lives (enemySkin); default: the kind's own. */
    skin?: string,
  ) {
    this.kind = isEnemyKind(kind) ? kind : "slime";
    this.rank = ENEMIES[this.kind].rank;
    // Size as the server has it (the tier doesn't change it).
    this.half = enemyStats(this.kind, 0, elite).half;
    this.look = ENEMY_LOOKS[this.kind];
    this.lift = this.look.lift ?? 0;
    const base = skin && scene.textures.exists(skin) ? skin : this.look.sheet;
    this.sheet = elite && base !== this.look.eliteSheet ? goldSheet(scene, base) : base;
    this.blinkFx = this.look.acts.flatMap((a) => a?.fx ?? []).find((f) => f.at === "both-spots")?.key;

    const feet = this.half;
    const parts: Phaser.GameObjects.GameObject[] = [
      scene.add.image(0, feet - 1, shadowTexture(scene, this.look.shadow)),
    ];
    if (elite) parts.push(scene.add.image(0, feet - 1, TEX_ELITE_GLOW));
    // Skins share the default sheet's frame layout and anchor.
    const anchorKey = spriteAnchor(base) ? base : this.look.sheet;
    const [ox, oy] = feetOrigin(anchorKey, this.half);
    this.bodyOriginX = ox;
    this.body = scene.add.sprite(0, -this.lift, this.sheet).setOrigin(ox, oy);
    parts.push(this.body);
    this.overlayY = 16 - ((spriteAnchor(anchorKey)?.y ?? 24) - this.half);
    for (const act of this.look.acts) {
      const key = act?.overlay;
      if (!key || this.overlays.has(key) || !scene.textures.exists(key)) continue;
      const [wx, wy] = feetOrigin(key, 0);
      const sprite = scene.add.sprite(0, this.overlayY, key).setOrigin(wx, wy).setVisible(false);
      const frames = scene.anims.get(animKey(key, "cast-right"))?.frames.map((f) => f.textureFrame) ?? [];
      this.overlays.set(key, { sprite, originX: wx, frames });
      parts.push(sprite);
    }
    this.bar = scene.add.graphics();
    this.barY = feet - this.look.top - 4;
    parts.push(this.bar);
    this.container = scene.add.container(0, 0, parts);
    this.play(this.look.idle);
  }

  update(x: number, y: number, state: EnemyState, time: number) {
    if (this.dying) return;
    this.frame++;
    const dt = Number.isNaN(this.lastTime) ? 0 : time - this.lastTime;
    if (dt > 0 && !Number.isNaN(this.x)) {
      const instant = Math.hypot(x - this.x, y - this.y) / (dt / 1000);
      // A short blink is smoothed, not cut: the arrival smoke goes where the server put it.
      if (this.blinkFx && instant > BLINK_SPEED && time - this.blinkAt > 400)
        this.blink(this.x, this.y, state.x ?? x, state.y ?? y, time);
      else if (instant <= BLINK_SPEED * 2) this.speed += (instant - this.speed) * Math.min(1, dt / SPEED_SMOOTH_MS);
    }
    this.lastTime = time;
    this.x = x;
    this.y = y;
    this.hp = state.hp;
    this.drawn = true;
    // Whole pixels keep the art crisp; lower feet are drawn in front (a leaping colossus over everything).
    this.container
      .setPosition(Math.round(x), Math.round(y))
      .setDepth(this.leap ? DEPTH.shots - 1 : actorDepth(y, this.half));

    // A new hit: the sheet's hurt frame, or a white flash. It also marks this enemy as just hit (see GameScene.removeEnemy).
    if (state.hurt > this.lastHurt) this.onHit(time);
    this.lastHurt = state.hurt;
    this.facing = state.facing;
    if (this.look.facing === "side") this.flip = sideFlip(state.facing, this.flip);

    if (state.act !== this.act) {
      const prev = this.act;
      this.act = state.act;
      this.onAct(prev, state.act, time, state);
    }
    if (this.leap) {
      this.followLeap(state);
      // The landing spot blinks: whatever stands there is about to be crushed.
      this.leap?.marker?.setAlpha(Math.floor(time / 120) % 2 ? 1 : 0.5);
    }

    const wasMoving = this.moving;
    this.moving = this.speed > STILL_SPEED;
    if (this.moving !== wasMoving || this.shown) this.stillSince = time;
    this.animate(time);
    this.place(time);

    if (time < this.flashUntil) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);

    this.bar.clear();
    if (state.hp < state.maxHp && this.rank === "normal") {
      const w = 12;
      this.bar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, this.barY, w + 2, 3);
      this.bar.fillStyle(0xe04040).fillRect(-w / 2, this.barY + 1, Math.max(0, (state.hp / state.maxHp) * w), 1);
    }
  }

  /**
   * It fired (Msg.enemyShot from this enemy): the release of an aimed volley
   * or a ring, or the ring that ends the witch's stone. Messages beat the
   * patches, so this is usually the first sign of the release.
   */
  fired(time: number) {
    const shown = this.shown;
    if (this.dying || !shown) return;
    const { type } = shown.info;
    if ((type === "aimed" || type === "ring") && shown.phase === ActPhase.windup) this.release(time);
    else if (type === "stone" && shown.phase === ActPhase.action) this.enterRecover(time, false);
  }

  /** Where blows and explosions land: the middle of the art (world px). */
  centre(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y + this.half - Math.round(this.look.top / 2) };
  }

  /** Removes the view; `death` plays smoke (explosions for bosses) where it was, if it was ever drawn. */
  destroy(death = false) {
    if (this.dying) return;
    this.leap?.marker?.destroy();
    this.clearShine();
    if (!death || !this.drawn) {
      this.container.destroy();
      return;
    }
    const { scene } = this;
    const { x, y } = this.centre();
    if (this.rank === "normal") {
      const smoke = () => {
        playFx(scene, this.elite ? "fx-explosion" : "fx-smoke-16", x, y);
        // Not fx-shine: the shine only ever means "attack coming".
        if (this.elite) playFx(scene, "fx-spark", x, y - 4, { delay: 120, tag: "twinkle" });
        this.container.destroy();
      };
      const fall = this.look.death;
      if (!fall || !scene.anims.exists(this.key(fall.tag).anim)) {
        smoke();
        return;
      }
      // Its own death pose first (the lurker folds), then the smoke.
      this.dying = true;
      this.bar.clear();
      this.hideActParts();
      this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      this.play(fall.tag, true);
      scene.time.delayedCall(fall.ms, smoke);
      return;
    }
    // Bosses: the body freezes and flashes while explosions go off over it, then it is gone.
    this.dying = true;
    this.bar.clear();
    this.hideActParts();
    this.body.anims.pause();
    const blasts = this.rank === "boss" ? BOSS_BLASTS : MINIBOSS_BLASTS;
    const w = this.look.shadow / 2;
    const h = this.look.top / 2;
    for (let i = 0; i < blasts; i++) {
      const bx = x + (i === blasts - 1 ? 0 : (Math.random() * 2 - 1) * w);
      const by = y + (i === blasts - 1 ? 0 : (Math.random() * 2 - 1) * h);
      playFx(scene, i === blasts - 1 || i % 3 === 0 ? "fx-explosion-big" : "fx-explosion", bx, by, {
        delay: i * BLAST_MS,
      });
    }
    let on = false;
    const end = (blasts - 1) * BLAST_MS + 60;
    const flash = scene.time.addEvent({
      delay: 60,
      repeat: Math.floor(end / 60) - 2,
      callback: () => {
        on = !on;
        if (on) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      },
    });
    scene.time.delayedCall(end, () => {
      flash.remove();
      playFx(scene, "fx-smoke-32", x, y + h / 2);
      this.container.destroy();
    });
  }

  // ─── Acts ─────────────────────────────────────────────────────────────────

  private onHit(time: number) {
    this.lastHitAt = time;
    // A hurt frame would cut an act's pose short: acts flash white instead.
    if (!this.look.hurt || this.shown) this.flashUntil = time + (this.rank === "normal" ? FLASH_MS : BOSS_FLASH_MS);
    else if (this.rank === "normal") this.hurtUntil = time + HURT_FRAME_MS;
    else if (time - this.hurtAt >= BOSS_HURT_GAP_MS) {
      this.hurtAt = time;
      this.hurtUntil = time + BOSS_FLASH_MS;
    }
  }

  /** The server's act changed: start, advance or end what is shown. */
  private onAct(prev: number, act: number, time: number, state: EnemyState) {
    const slot = actSlot(act);
    const phase = actPhase(act);
    const shown = this.shown;
    if (phase === ActPhase.none) {
      // A blow cancelled a humanoid's wind-up: its stun pose.
      if (
        shown?.phase === ActPhase.windup &&
        this.look.stun &&
        actPhase(prev) === ActPhase.windup &&
        time - this.lastHitAt <= INTERRUPT_HIT_MS
      )
        this.stunUntil = time + STUN_MS;
      this.endAct(time);
      return;
    }
    if (!shown || shown.slot !== slot || phase === ActPhase.windup) {
      if (shown) this.endAct(time);
      const info = actInfo(this.kind, slot);
      if (!info) return;
      this.shown = {
        slot,
        info,
        phase: ActPhase.none,
        at: time,
        released: false,
        tellAt: Number.POSITIVE_INFINITY,
        actionUntil: 0,
        recoverPending: false,
        phaseMs: 0,
      };
      if (phase === ActPhase.windup) {
        this.enterWindup(time, state);
        return;
      }
      // Seen mid-act (it just came into view): no wind-up to show.
      this.shown.released = true;
    }
    if (phase === ActPhase.action) {
      if (!this.shown?.released) this.release(time);
    } else if (phase === ActPhase.recover) {
      if (!this.shown?.released) this.release(time);
      this.enterRecover(time, actStunned(act));
    }
  }

  private enterWindup(time: number, state: EnemyState) {
    const shown = this.shown;
    if (!shown) return;
    const { look, windupTicks } = shown.info;
    shown.phase = ActPhase.windup;
    shown.at = time;
    shown.phaseMs = Math.max(1, windupTicks * TICK_MS - FIT_LEAD_MS);
    const tag = look.windup ?? this.look.idle;
    const anim = this.key(tag).anim;
    const scale = look.fit ? fitScale(animMs(this.scene, anim), windupTicks, FIT_LEAD_MS) : (look.timeScale ?? 1);
    this.playPhase(tag, scale);
    if (look.tell) shown.tellAt = time + Math.max(0, tellDelayMs(windupTicks) - FIT_LEAD_MS);
    if (look.held && this.scene.textures.exists(look.held)) {
      if (!this.held) {
        this.held = this.scene.add.sprite(0, 0, look.held).setOrigin(0.5, 1);
        this.container.add(this.held);
      } else this.held.setTexture(look.held);
      this.held.setFrame(0).setVisible(true);
    }
    this.showOverlay(look.overlay);
    if (shown.info.type === "leap") {
      this.leap = undefined;
      this.leapFrom = { x: state.x ?? this.x, y: state.y ?? this.y };
    }
  }

  /** The release: the action tag, its effects; a leap takes off. */
  private release(time: number) {
    const shown = this.shown;
    if (!shown || shown.released) return;
    shown.released = true;
    shown.phase = ActPhase.action;
    shown.at = time;
    shown.tellAt = Number.POSITIVE_INFINITY;
    this.clearShine();
    this.held?.setVisible(false);
    const { look, type } = shown.info;
    const tag = look.action ?? this.look.idle;
    const anim = this.key(tag).anim;
    const scale = look.actionScale ?? 1;
    const ms = animMs(this.scene, anim) / scale;
    shown.phaseMs = Math.max(1, ms);
    this.playPhase(tag, scale, look.actionFrame);
    shown.actionUntil = look.loop || look.actionFrame !== undefined ? 0 : time + ms;
    this.actionUntil = shown.actionUntil;
    if (!this.overlay?.sprite.visible) this.showOverlay(look.overlay);
    this.playActFx(look.fx, "action");
    if (type === "leap" && this.leapFrom) {
      const from = this.leapFrom;
      this.leap = {
        fromX: from.x,
        fromY: from.y,
        lastX: from.x,
        lastY: from.y,
        step: Number.POSITIVE_INFINITY,
        steps: 0,
      };
    }
  }

  private enterRecover(time: number, stunned: boolean) {
    const shown = this.shown;
    if (!shown || shown.phase === ActPhase.recover) return;
    const wasAction = shown.phase === ActPhase.action;
    shown.phase = ActPhase.recover;
    shown.at = time;
    const { look, type } = shown.info;
    if (this.leap) {
      this.leap.marker?.destroy();
      this.leap = undefined;
      this.playActFx(look.fx, "land");
    }
    if (type === "stone" && wasAction) {
      const fx = this.look.stone?.endFx;
      if (fx) {
        const { x, y } = this.centre();
        playFx(this.scene, fx, x, y);
      }
    }
    if (stunned && look.stunned) {
      this.hideOverlay();
      this.playPhase(look.stunned.tag, 1);
      this.showSpark(look.stunned.fx);
      return;
    }
    // A one-shot action plays to its last frame before the recover tag; loops stop at once.
    if (time < shown.actionUntil) shown.recoverPending = true;
    else this.startRecoverTag();
  }

  private startRecoverTag() {
    const shown = this.shown;
    if (!shown) return;
    shown.recoverPending = false;
    this.hideOverlay();
    this.playPhase(shown.info.look.recover ?? this.look.idle, 1);
  }

  /** The act is over (or was cancelled): back to moving, once a one-shot action has played out. */
  private endAct(time: number) {
    const shown = this.shown;
    this.shown = undefined;
    this.leapFrom = undefined;
    this.clearShine();
    if (this.leap) {
      this.leap.marker?.destroy();
      this.leap = undefined;
    }
    this.held?.setVisible(false);
    this.hideSpark();
    this.body.x = 0;
    if (!shown || shown.phase !== ActPhase.action || time >= this.actionUntil) {
      this.actionUntil = 0;
      this.hideOverlay();
    }
    this.stillSince = time;
  }

  /** The stunned stance stays until the act ends (the stun sparks loop over its head). */
  private showSpark(fx?: string) {
    if (!fx) return;
    const anim = animKey(fx, SPARK_TAG);
    if (!this.scene.anims.exists(anim)) return;
    if (!this.spark) {
      this.spark = this.scene.add.sprite(0, 0, fx);
      this.container.add(this.spark);
    }
    this.spark.setVisible(true).play({ key: anim, repeat: -1 });
  }

  private hideSpark() {
    this.spark?.anims.stop();
    this.spark?.setVisible(false);
  }

  private showOverlay(key?: string) {
    const overlay = key ? this.overlays.get(key) : undefined;
    if (overlay !== this.overlay) this.overlay?.sprite.setVisible(false);
    this.overlay = overlay;
    if (overlay) overlay.sprite.setVisible(true);
  }

  private hideOverlay() {
    this.overlay?.sprite.setVisible(false);
    this.overlay = undefined;
  }

  private hideActParts() {
    this.hideOverlay();
    this.held?.setVisible(false);
    this.hideSpark();
  }

  private playActFx(fx: readonly ActFx[] | undefined, at: ActFx["at"]) {
    if (!fx) return;
    for (const f of fx) {
      if (f.at !== at) continue;
      // On the ground: the effect's frame stands on the feet line.
      if (f.where === "feet")
        playFx(
          this.scene,
          f.key,
          this.container.x + (f.dx ?? 0),
          this.container.y + this.half - Math.round((spriteAnchor(f.key)?.h ?? 0) / 2),
          f.under ? { depth: this.container.depth - 2e-5 } : {},
        );
      else {
        const { x, y } = this.centre();
        playFx(this.scene, f.key, x, y);
      }
    }
  }

  /**
   * A leap's flight: the server moves it evenly from take-off to the landing
   * spot, one step per tick, so the smallest step seen between two positions
   * is one tick and the landing spot is `ticks` steps out. The marker goes there.
   */
  private followLeap(state: EnemyState) {
    const leap = this.leap;
    const shown = this.shown;
    if (!leap || !shown || state.x === undefined || state.y === undefined) return;
    if (state.x === leap.lastX && state.y === leap.lastY) return;
    const d = Math.hypot(state.x - leap.lastX, state.y - leap.lastY);
    leap.lastX = state.x;
    leap.lastY = state.y;
    if (d < 0.5) return;
    leap.step = Math.min(leap.step, d);
    leap.steps++;
    if (leap.marker || leap.steps < 2) return;
    // Share of the flight done: the steps flown out of the act's ticks.
    const k = Math.hypot(state.x - leap.fromX, state.y - leap.fromY) / (leap.step * shown.info.actionTicks);
    if (k <= 0) return;
    const destX = Math.round(leap.fromX + (state.x - leap.fromX) / k);
    const destY = Math.round(leap.fromY + (state.y - leap.fromY) / k);
    const attack = ENEMIES[this.kind].attacks[shown.slot];
    const reach = attack?.type === "leap" ? attack.radius + PLAYER_HALF : this.look.shadow / 2;
    // Centred on the landing spot (heroes are hit by distance from their centre to it).
    leap.marker = this.scene.add
      .image(destX, destY, markerTexture(this.scene, 2 * Math.round(reach)))
      .setDepth(DEPTH.groundShadow);
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  private animate(time: number) {
    const { look } = this;
    const anims = this.body.anims;
    const shown = this.shown;
    if (time < this.stunUntil && look.stun) {
      this.playPhase(look.stun, 1);
      return;
    }
    if (look.hurt && time < this.hurtUntil && !shown) {
      this.play(look.hurt);
      anims.timeScale = 1;
      return;
    }
    if (shown) {
      if (shown.tellAt <= time) {
        shown.tellAt = Number.POSITIVE_INFINITY;
        this.tell(shown);
      }
      if (shown.recoverPending && time >= shown.actionUntil) this.startRecoverTag();
      // The stunned brute rolls to a stop, then stands.
      const stunned = shown.info.look.stunned;
      if (stunned?.next && this.spark?.visible && !anims.isPlaying && this.phaseTag === stunned.tag)
        this.playPhase(stunned.next, 1);
      this.followRow();
      return;
    }
    // A one-shot action still finishing after its act ended.
    if (time < this.actionUntil && !this.moving) {
      this.followRow();
      return;
    }
    this.actionUntil = 0;
    this.hideOverlay();
    this.phaseTag = undefined;
    anims.timeScale = 1;
    const rest = look.rest;
    this.resting = rest !== undefined && !this.moving && time - this.stillSince >= rest.afterMs;
    if (rest && this.resting) {
      this.play(rest.tag);
      anims.timeScale = rest.timeScale ?? 1;
      return;
    }
    if (this.moving) this.play(look.walk);
    else if (look.holdIdle) this.hold(look.walk);
    else {
      this.play(look.idle);
      anims.timeScale = look.idleScale ?? 1;
    }
  }

  /** Plays the tag of an act phase from its start (`frame`: that frame only, still). */
  private playPhase(tag: string, timeScale: number, frame?: number) {
    const { anim, flipX } = this.key(tag);
    this.phaseTag = tag;
    this.phaseFrame = frame;
    setFlipAnchored(this.body, flipX, this.bodyOriginX);
    if (!this.scene.anims.exists(anim)) return;
    this.body.play({ key: anim, startFrame: frame ?? 0 });
    this.body.anims.timeScale = timeScale;
    if (frame !== undefined) this.body.anims.pause();
  }

  /** The facing turned during an act (the aim tracks its target): same tag and frame, on the new row. */
  private followRow() {
    const tag = this.phaseTag;
    if (!tag) return;
    const { anim, flipX } = this.key(tag);
    const anims = this.body.anims;
    if (anims.currentAnim?.key === anim && this.body.flipX === flipX) return;
    if (!this.scene.anims.exists(anim)) return;
    setFlipAnchored(this.body, flipX, this.bodyOriginX);
    if (anims.currentAnim?.key === anim) return;
    const index = Math.max(0, (anims.currentFrame?.index ?? 1) - 1);
    const playing = anims.isPlaying;
    const scale = anims.timeScale;
    const frames = this.scene.anims.get(anim)?.frames.length ?? 1;
    this.body.play({ key: anim, startFrame: this.phaseFrame ?? Math.min(index, frames - 1) });
    anims.timeScale = scale;
    if (!playing || this.phaseFrame !== undefined) anims.pause();
  }

  /** Positions what moves with the body: lift and bob, the leap arc, the shake, overlays, the held item, sparks. */
  private place(time: number) {
    const shown = this.shown;
    const restLift = this.look.rest?.lift;
    let y = -this.lift;
    if (this.resting && !shown && restLift !== undefined) y = -restLift;
    else if (this.lift > 0) y += Math.round(Math.sin(time / 220 + this.seed));
    const air = shown?.info.look;
    if (shown?.phase === ActPhase.action && air && (air.arc || air.airLift)) {
      const k = Math.max(0, Math.min(1, (time - shown.at) / Math.max(1, shown.info.actionTicks * TICK_MS)));
      y -= (air.airLift ?? 0) + Math.round(4 * (air.arc ?? 0) * k * (1 - k));
    }
    this.body.y = y;
    const shaking = shown?.phase === ActPhase.windup && shown.info.look.shake === true;
    this.body.x = shaking ? Math.floor(this.frame / 2) % 2 : 0;
    const feet = this.half + y;
    if (this.held?.visible)
      this.held.setPosition(this.body.x, feet - this.look.top - HELD_GAP).setFlipX(this.body.flipX);
    if (this.spark?.visible) this.spark.setPosition(0, feet - this.look.top - SPARK_GAP);
    this.syncOverlay(time);
  }

  /** Keeps the weapon overlay on the body's frame: its wind-up frames, then its action frames. */
  private syncOverlay(time: number) {
    const overlay = this.overlay;
    const shown = this.shown;
    if (!overlay) return;
    const look = shown?.info.look;
    const phase = shown ? shown.phase : ActPhase.action;
    const groups = look?.overlayFrames ?? OVERLAY_FRAMES;
    const frames = phase === ActPhase.windup ? groups.windup : groups.action;
    const anims = this.body.anims;
    const bodyFrames = anims.currentAnim?.frames.length ?? 1;
    const bodyIndex = Math.max(0, (anims.currentFrame?.index ?? 1) - 1);
    const progress = shown ? (time - shown.at) / shown.phaseMs : 1;
    const frame = overlay.frames[overlayFrame(frames, bodyIndex, bodyFrames, progress)];
    if (frame !== undefined) overlay.sprite.setFrame(frame);
    const { dir, flipX } = facingDir(this.facing);
    setFlipAnchored(overlay.sprite, flipX, overlay.originX);
    overlay.sprite.setAngle(OVERLAY_ANGLE[dir]).setPosition(this.body.x, this.overlayY + this.body.y + this.lift);
    // Facing up, the weapon is behind the body.
    if (dir === "up") this.container.moveBelow(overlay.sprite, this.body);
    else this.container.moveAbove(overlay.sprite, this.body);
  }

  /** The "attack coming" shine at the act's tell point for the current row. */
  private tell(shown: ShownAct) {
    const tell = shown.info.look.tell;
    if (!tell) return;
    const rows = this.look.facing === "rows";
    const { dir } = rows ? facingDir(this.facing) : { dir: "right" as const };
    const [px, py] = tellOffset(tell, dir, rows ? facingDir(this.facing).flipX : this.flip);
    this.clearShine();
    this.shine = playFx(this.scene, "fx-shine", this.container.x + px, this.container.y + this.half + this.body.y + py);
  }

  private clearShine() {
    if (this.shine?.active) this.shine.destroy();
    this.shine = undefined;
  }

  /** Animation key of a tag for the current facing, and whether to mirror it. */
  private key(tag: string): { anim: string; flipX: boolean } {
    const rows = this.look.facing === "rows";
    const id = rows ? `${tag}|${this.facing}` : `${tag}|${this.flip}`;
    let key = this.keys.get(id);
    if (!key) {
      key = rows
        ? directionalAnim(this.scene, this.sheet, tag, this.facing)
        : { anim: animKey(this.sheet, tag), flipX: this.look.facing === "side" && this.flip };
      this.keys.set(id, key);
    }
    return key;
  }

  /** Plays a tag in the current facing (`restart`: even if it is the one playing). */
  private play(tag: string, restart = false) {
    const { anim, flipX } = this.key(tag);
    setFlipAnchored(this.body, flipX, this.bodyOriginX);
    if (restart && this.scene.anims.exists(anim)) this.body.play(anim);
    else playAnim(this.body, anim);
  }

  /** Shows the first frame of a tag, still (sheets without a standing pose). */
  private hold(tag: string) {
    const { anim, flipX } = this.key(tag);
    setFlipAnchored(this.body, flipX, this.bodyOriginX);
    const anims = this.body.anims;
    if (anims.currentAnim?.key === anim && !anims.isPlaying) return;
    if (!this.scene.anims.exists(anim)) return;
    this.body.play(anim);
    anims.pause();
  }

  /** It vanished from one spot and appeared at another (a blink): smoke at both. */
  private blink(fromX: number, fromY: number, toX: number, toY: number, time: number) {
    this.blinkAt = time;
    const fx = this.blinkFx;
    if (!fx) return;
    const dy = this.half - Math.round(this.look.top / 2);
    playFx(this.scene, fx, fromX, fromY + dy);
    playFx(this.scene, fx, toX, toY + dy);
  }
}
