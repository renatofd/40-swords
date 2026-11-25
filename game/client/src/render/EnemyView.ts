import { animKey } from "@core/client";
import { ENEMIES, type EnemyKind, type EnemyRank, enemyStats, isEnemyKind } from "@game/shared";
import Phaser from "phaser";
import { directionalAnim, facingDir, feetOrigin, playAnim, setFlipAnchored, spriteAnchor } from "./anim";
import { actorDepth } from "./depth";
import {
  angleFacing,
  ENEMY_LOOKS,
  type EnemyAct,
  type EnemyLook,
  goldRecolor,
  isCharging,
  STILL_SPEED,
  sideFlip,
  volleyShape,
} from "./enemyLooks";
import { playFx } from "./fx";
import { shadowTexture, TEX_ELITE_GLOW } from "./placeholderArt";
import { addRecoloredSprite, textureColors } from "./recolor";

/** What the server tells about an enemy each frame (the schema fields the view draws). */
export interface EnemyState {
  hp: number;
  maxHp: number;
  /** Ticks left of the hurt flash (rises on every hit). */
  hurt: number;
  facing: number;
}

/** White flash on a hit: small enemies longer, bosses briefly (they are hit all the time). */
const FLASH_MS = 120;
const BOSS_FLASH_MS = 70;
/** How long a sheet's own hurt frame shows after a hit (bosses: BOSS_FLASH_MS)... */
const HURT_FRAME_MS = 160;
/** ...and how often a boss may show it at most, so its moves and tells stay readable under constant blows. */
const BOSS_HURT_GAP_MS = 250;
/** Faster than this (px/s) between two frames is a teleport (the server's blink), not a walk. */
const BLINK_SPEED = 300;
/** Smoothing of the speed estimate (ms): interpolated positions jitter a little. */
const SPEED_SMOOTH_MS = 90;
/** Explosions of a falling boss or mini-boss, and the time between them. */
const BOSS_BLASTS = 7;
const MINIBOSS_BLASTS = 4;
const BLAST_MS = 150;
/** Weapon overlays are drawn facing right; a quarter turn is pixel-exact. */
const OVERLAY_ANGLE = { right: 0, left: 0, down: 90, up: -90 } as const;

/** Sheet of an elite: the pack's gold variant, or a gold palette swap made once. */
function eliteSheet(scene: Phaser.Scene, look: EnemyLook): string {
  if (look.eliteSheet && scene.textures.exists(look.eliteSheet)) return look.eliteSheet;
  const key = `${look.sheet}~gold`;
  if (scene.textures.exists(key)) return key;
  const spec = goldRecolor(textureColors(scene, look.sheet));
  return addRecoloredSprite(scene, look.sheet, key, spec) ? key : look.sheet;
}

/**
 * Visual for one enemy, from its sheet (see enemyLooks.ts): feet on the bottom
 * of its box, facing, walk / idle / charge / hop cycles from how it moves,
 * attack poses when it fires, hurt flashes, a small HP bar once damaged and
 * smoke or explosions when it dies. Elites are gold with a glow; bosses show
 * their HP in the HUD instead.
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
  private readonly sheet: string;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly barY: number;
  private readonly lift: number;
  private readonly walkSpeed: number;
  /** Unflipped horizontal origins of the body and the staff (mirrored with the flip, see setFlipAnchored). */
  private readonly bodyOriginX: number;
  private overlayOriginX = 0.5;
  /** Staff of the hexer: kept on the body's attack frame. */
  private overlay?: Phaser.GameObjects.Sprite;
  private overlayFrames: (string | number)[] = [];
  private lastTime = Number.NaN;
  private speed = 0;
  private moving = false;
  private charging = false;
  private flip = false;
  private facing = 2;
  private lastHurt = 0;
  private flashUntil = 0;
  private hurtUntil = 0;
  private hurtAt = Number.NEGATIVE_INFINITY;
  /** One-shot animation being shown (an attack, a blink) and how long it holds at least. */
  private actAnim?: string;
  private actUntil = 0;
  /** Resolved animation keys by "<tag>|<facing>|<flip>": the same few are asked for every frame. */
  private readonly keys = new Map<string, { anim: string; flipX: boolean }>();
  private blinkAt = Number.NEGATIVE_INFINITY;
  /** Phase of the flyers' bob, so a flock doesn't move in step. */
  private readonly seed = Math.random() * 10;
  private shown = false;
  private dying = false;

  constructor(
    private readonly scene: Phaser.Scene,
    kind: string,
    private readonly elite: boolean,
  ) {
    this.kind = isEnemyKind(kind) ? kind : "slime";
    this.rank = ENEMIES[this.kind].rank;
    // Size and speed as the server has them (the tier changes neither).
    const stats = enemyStats(this.kind, 0, elite);
    this.half = stats.half;
    this.walkSpeed = stats.speed;
    this.look = ENEMY_LOOKS[this.kind];
    this.lift = this.look.lift ?? 0;
    this.sheet = elite ? eliteSheet(scene, this.look) : this.look.sheet;

    const feet = this.half;
    const parts: Phaser.GameObjects.GameObject[] = [
      scene.add.image(0, feet - 1, shadowTexture(scene, this.look.shadow)),
    ];
    if (elite) parts.push(scene.add.image(0, feet - 1, TEX_ELITE_GLOW));
    const [ox, oy] = feetOrigin(this.look.sheet, this.half);
    this.bodyOriginX = ox;
    this.body = scene.add.sprite(0, -this.lift, this.sheet).setOrigin(ox, oy);
    parts.push(this.body);
    const overlay = [this.look.aimed, this.look.ring].find((a) => a?.overlay)?.overlay;
    if (overlay && scene.textures.exists(overlay)) {
      // The overlay's attach point goes on the body frame's pixel (16,16), as for heroes' weapons.
      const anchorY = spriteAnchor(this.look.sheet)?.y ?? 24;
      const [wx, wy] = feetOrigin(overlay, 0);
      this.overlayOriginX = wx;
      this.overlay = scene.add
        .sprite(0, 16 - (anchorY - this.half), overlay)
        .setOrigin(wx, wy)
        .setVisible(false);
      this.overlayFrames = scene.anims.get(animKey(overlay, "cast-right"))?.frames.map((f) => f.textureFrame) ?? [];
      parts.push(this.overlay);
    }
    this.bar = scene.add.graphics();
    this.barY = feet - this.look.top - 4;
    parts.push(this.bar);
    this.container = scene.add.container(0, 0, parts);
    this.play(this.look.idle);
  }

  update(x: number, y: number, state: EnemyState, time: number) {
    if (this.dying) return;
    const dt = Number.isNaN(this.lastTime) ? 0 : time - this.lastTime;
    if (dt > 0 && !Number.isNaN(this.x)) {
      const instant = Math.hypot(x - this.x, y - this.y) / (dt / 1000);
      if (this.look.blink && instant > BLINK_SPEED && time - this.blinkAt > 400) this.blink(this.x, this.y, x, y, time);
      else if (instant <= BLINK_SPEED * 2) this.speed += (instant - this.speed) * Math.min(1, dt / SPEED_SMOOTH_MS);
    }
    this.lastTime = time;
    this.x = x;
    this.y = y;
    this.hp = state.hp;
    this.shown = true;
    // Whole pixels keep the art crisp; lower feet are drawn in front.
    this.container.setPosition(Math.round(x), Math.round(y)).setDepth(actorDepth(y, this.half));

    // A new hit: the sheet's hurt frame, or a white flash. It also marks this enemy as just hit (see GameScene.removeEnemy).
    if (state.hurt > this.lastHurt) {
      this.lastHitAt = time;
      if (!this.look.hurt) this.flashUntil = time + (this.rank === "normal" ? FLASH_MS : BOSS_FLASH_MS);
      else if (this.rank === "normal") this.hurtUntil = time + HURT_FRAME_MS;
      else if (time - this.hurtAt >= BOSS_HURT_GAP_MS) {
        this.hurtAt = time;
        this.hurtUntil = time + BOSS_FLASH_MS;
      }
    }
    this.lastHurt = state.hurt;
    this.facing = state.facing;
    if (this.look.facing === "side") this.flip = sideFlip(state.facing, this.flip);

    const wasMoving = this.moving;
    const wasCharging = this.charging;
    this.moving = this.speed > STILL_SPEED;
    this.charging = Boolean(this.look.charge) && isCharging(this.speed, this.walkSpeed);
    this.animate(time, wasMoving, wasCharging);
    this.syncOverlay();

    if (this.lift > 0) this.body.y = -this.lift + Math.round(Math.sin(time / 220 + this.seed));
    if (time < this.flashUntil) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);

    this.bar.clear();
    if (state.hp < state.maxHp && this.rank === "normal") {
      const w = 12;
      this.bar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, this.barY, w + 2, 3);
      this.bar.fillStyle(0xe04040).fillRect(-w / 2, this.barY + 1, Math.max(0, (state.hp / state.maxHp) * w), 1);
    }
  }

  /** It fired (Msg.enemyShot came from where it stands): its attack pose, aimed where the volley goes. */
  fired(angles: readonly number[], time: number) {
    if (this.dying) return;
    const { ring, aim } = volleyShape(angles);
    const act = ring ? (this.look.ring ?? this.look.aimed) : (this.look.aimed ?? this.look.ring);
    if (act) this.act(act, time, ring ? undefined : angleFacing(aim));
  }

  /** Where blows and explosions land: the middle of the art (world px). */
  centre(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y + this.half - Math.round(this.look.top / 2) };
  }

  /** Removes the view; `death` plays smoke (explosions for bosses) where it was, if it was ever drawn. */
  destroy(death = false) {
    if (this.dying) return;
    if (!death || !this.shown) {
      this.container.destroy();
      return;
    }
    const { scene } = this;
    const { x, y } = this.centre();
    if (this.rank === "normal") {
      playFx(scene, this.elite ? "fx-explosion" : "fx-smoke-16", x, y);
      if (this.elite) playFx(scene, "fx-shine", x, y - 4, { delay: 120 });
      this.container.destroy();
      return;
    }
    // Bosses: the body freezes and flashes while explosions go off over it, then it is gone.
    this.dying = true;
    this.bar.clear();
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

  // ─── Animation ────────────────────────────────────────────────────────────

  private animate(time: number, wasMoving: boolean, wasCharging: boolean) {
    if (this.acting(time)) return;
    this.actAnim = undefined;
    this.overlay?.setVisible(false);
    const anims = this.body.anims;
    anims.timeScale = 1;
    const { look } = this;
    if (look.hurt && time < this.hurtUntil) {
      this.play(look.hurt);
      return;
    }
    if (this.charging && look.charge) {
      const { start, anim, timeScale = 1 } = look.charge;
      if (start && !wasCharging) this.play(start, true);
      const starting = start && anims.isPlaying && anims.currentAnim?.key === this.key(start).anim;
      if (!starting) {
        this.play(anim);
        anims.timeScale = timeScale;
      }
      return;
    }
    if (look.hop) {
      const { jump, land } = look.hop;
      if (this.moving && !wasMoving) this.play(jump, true);
      else if (land && !this.moving && wasMoving) this.play(land, true);
      else {
        const current = anims.currentAnim?.key;
        const busy =
          anims.isPlaying &&
          (current === this.key(jump).anim || (land !== undefined && current === this.key(land).anim));
        if (!busy) this.play(look.idle);
      }
      return;
    }
    if (this.moving) this.play(look.walk);
    else if (look.holdIdle) this.hold(look.walk);
    else {
      this.play(look.idle);
      anims.timeScale = look.idleScale ?? 1;
    }
  }

  /** Still in a one-shot pose (attack, blink) that should not be cut. */
  private acting(time: number): boolean {
    if (!this.actAnim) return false;
    const anims = this.body.anims;
    return time < this.actUntil || (anims.isPlaying && anims.currentAnim?.key === this.actAnim);
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

  /** Plays an attack or blink pose; `facing` turns it toward where it fires first. */
  private act(act: EnemyAct, time: number, facing?: number) {
    if (act.fx) {
      const { x, y } = this.centre();
      playFx(this.scene, act.fx, x, act.fx === "fx-dust-burst" ? this.container.y + this.half - 20 : y);
    }
    if (!act.anim) return;
    if (facing !== undefined) {
      this.facing = facing;
      if (this.look.facing === "side") this.flip = sideFlip(facing, this.flip);
    }
    const { anim, flipX } = this.key(act.anim);
    if (!this.scene.anims.exists(anim)) return;
    this.body.anims.timeScale = 1;
    setFlipAnchored(this.body, flipX, this.bodyOriginX);
    this.body.play({ key: anim, startFrame: act.from ?? 0 });
    this.actAnim = anim;
    this.actUntil = time + (act.holdMs ?? 0);
    if (act.overlay && this.overlay) {
      const { dir, flipX: overlayFlip } = facingDir(this.facing);
      setFlipAnchored(this.overlay.setVisible(true), overlayFlip, this.overlayOriginX);
      this.overlay.setAngle(OVERLAY_ANGLE[dir]);
      // Facing up, the staff is behind the caster.
      if (dir === "up") this.container.moveBelow(this.overlay, this.body);
      else this.container.moveAbove(this.overlay, this.body);
      this.syncOverlay();
    }
  }

  /** Keeps the staff on the body's attack frame. */
  private syncOverlay() {
    const overlay = this.overlay;
    if (!overlay?.visible) return;
    const i = Math.max(0, (this.body.anims.currentFrame?.index ?? 1) - 1);
    const frame = this.overlayFrames[i];
    if (frame !== undefined) overlay.setFrame(frame);
  }

  /** It vanished from one spot and appeared at another: smoke at both, and its blink pose. */
  private blink(fromX: number, fromY: number, toX: number, toY: number, time: number) {
    this.blinkAt = time;
    const act = this.look.blink;
    if (!act) return;
    const dy = this.half - Math.round(this.look.top / 2);
    if (act.fx) {
      playFx(this.scene, act.fx, fromX, fromY + dy);
      playFx(this.scene, act.fx, toX, toY + dy);
    }
    if (act.anim) this.act({ ...act, fx: undefined }, time);
  }
}
