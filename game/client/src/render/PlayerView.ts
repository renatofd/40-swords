import { animKey } from "@core/client";
import { type ClassId, isClassId, PLAYER_HALF } from "@game/shared";
import Phaser from "phaser";
import { type Dir, facingDir, feetOrigin, playAnim, setFlipAnchored, spriteAnchor } from "./anim";
import { actorDepth, DEPTH } from "./depth";
import { heroRecolor, heroSheetKey } from "./heroPalettes";
import { shadowTexture } from "./placeholderArt";
import { addRecoloredSprite } from "./recolor";

/** Below this distance (px per frame) the player counts as standing still. */
const MOVING_EPSILON = 0.05;
/** How long the red "hurt" frame shows after a hit (the blink goes on while invulnerable). */
const HURT_MS = 160;
const DEAD_ALPHA = 0.5;
/** Smoke left behind when a hero falls or leaves. */
const PUFF = "fx-smoke-32";
/** Drawn at the feet of a webbed hero (the spider's projectile, still). */
const WEB = "hostile-web";

/** Hero sheets: 32x32 frames, feet line at y = 24 (see spriteAnchors.json). */
const HERO_FEET = spriteAnchor("knight")?.y ?? 24;
/** Box centre → top of the heroes' heads (helm, hair and mohawk end ~12 px above it). */
export const HERO_HEAD = 12;

/**
 * Weapon overlays (fx-slash-<class>, 48x48, attach point = centre) go on the
 * body frame's pixel (16,16), which is this far above the box centre.
 */
const WEAPON_Y = 16 - (HERO_FEET - PLAYER_HALF);
/**
 * Per attack frame nudges of the weapon against the body, measured from the
 * pack author's own baked slashes (left = right mirrored), so the grip stays
 * in the hand while the body lunges.
 */
const SWING_SHIFT: Readonly<Record<Exclude<Dir, "left">, readonly (readonly [number, number])[]>> = {
  right: [
    [-2, 0],
    [1, -1],
    [3, 0],
    [0, 1],
  ],
  down: [
    [0, 0],
    [1, -1],
    [0, 0],
    [0, 0],
  ],
  up: [
    [0, 1],
    [-2, -1],
    [0, 0],
    [0, 0],
  ],
};
/** The overlays are drawn facing right; a quarter turn is pixel-exact. */
const SWING_ANGLE: Readonly<Record<Dir, number>> = { right: 0, left: 0, down: 90, up: -90 };

export interface PlayerLook {
  facing: number;
  dead: boolean;
  /** Invulnerability ticks left: the sprite blinks while > 0. */
  invuln: number;
  /** Ticks of web slow left: a web holds its feet while > 0. */
  slow?: number;
}

/** Texture of a hero in a colour: its sheet, recoloured once into its own texture. */
function heroSheet(scene: Phaser.Scene, classId: ClassId, palette: number): string {
  const spec = heroRecolor(classId, palette);
  if (!spec) return classId;
  const key = heroSheetKey(classId, palette);
  return addRecoloredSprite(scene, classId, key, spec) ? key : classId;
}

/** Visual for one player (the name tag is DOM, see WorldLabels). Holds no game state: it only draws what it is given. */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Sprite;
  private weapon: Phaser.GameObjects.Sprite;
  private readonly web: Phaser.GameObjects.Image;
  private readonly sheet: string;
  /** Unflipped horizontal origins of the body and the weapon (mirrored with the flip, see setFlipAnchored). */
  private readonly bodyOriginX: number;
  private readonly weaponOriginX: number;
  /** Frame names of the weapon overlay, one per attack frame. */
  private readonly weaponFrames: (string | number)[];
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastInvuln = 0;
  private hurtUntil = 0;
  /** Direction of the swing being shown (undefined: not swinging). */
  private swingDir?: Dir;
  /** Animation key of the swing being shown. */
  private swingAnim?: string;
  /** Drawn at least once (a hero first seen already out leaves no smoke). */
  private shown = false;

  constructor(
    private readonly scene: Phaser.Scene,
    classId: string,
    private readonly isSelf: boolean,
    /** Hero colour (PALETTES index). */
    palette = 0,
  ) {
    const cls: ClassId = isClassId(classId) ? classId : "knight";
    this.sheet = heroSheet(scene, cls, palette);
    const shadow = scene.add.image(0, PLAYER_HALF - 1, shadowTexture(scene, 12));
    const [ox, oy] = feetOrigin(cls, PLAYER_HALF);
    this.bodyOriginX = ox;
    this.body = scene.add.sprite(0, 0, this.sheet).setOrigin(ox, oy);
    playAnim(this.body, animKey(this.sheet, "idle-down"));
    const weapon = `fx-slash-${cls}`;
    const [wx, wy] = feetOrigin(weapon, 0);
    this.weaponOriginX = wx;
    this.weapon = scene.add.sprite(0, WEAPON_Y, weapon).setOrigin(wx, wy).setVisible(false);
    this.weaponFrames = scene.anims.get(animKey(weapon, "slash-right"))?.frames.map((f) => f.textureFrame) ?? [];
    // Just over the shadow, under the body.
    this.web = scene.add.image(0, PLAYER_HALF - 1, WEB).setVisible(false);
    this.container = scene.add.container(0, 0, [shadow, this.web, this.body, this.weapon]);
  }

  /** Moves the view; picks the animation from how far it moved since the last frame. */
  update(x: number, y: number, look: PlayerLook, time: number) {
    const moving =
      !Number.isNaN(this.lastX) &&
      (Math.abs(x - this.lastX) > MOVING_EPSILON || Math.abs(y - this.lastY) > MOVING_EPSILON);
    this.lastX = x;
    this.lastY = y;
    this.shown = true;
    // Whole pixels keep the art crisp; lower feet are drawn in front.
    this.container.setPosition(Math.round(x), Math.round(y)).setDepth(actorDepth(y, PLAYER_HALF, this.isSelf));

    // A new hit restarts the invulnerability count.
    if (look.invuln > this.lastInvuln) this.hurtUntil = time + HURT_MS;
    this.lastInvuln = look.invuln;

    if (look.dead) this.swingDir = undefined;
    if (!this.updateSwing()) {
      const { dir, flipX } = facingDir(look.facing);
      const anim = look.dead ? "stun" : time < this.hurtUntil ? "hurt" : moving ? "walk" : "idle";
      playAnim(this.body, animKey(this.sheet, `${anim}-${dir}`));
      setFlipAnchored(this.body, flipX, this.bodyOriginX);
    }
    this.web.setVisible((look.slow ?? 0) > 0 && !look.dead && this.scene.textures.exists(WEB));
    const alpha = look.dead ? DEAD_ALPHA : look.invuln > 0 && Math.floor(time / 70) % 2 === 0 ? 0.3 : 1;
    this.body.setAlpha(alpha);
    this.weapon.setAlpha(alpha);
  }

  /** Keeps the weapon overlay on the body's attack frame; false once the swing is over. */
  private updateSwing(): boolean {
    const dir = this.swingDir;
    const anims = this.body.anims;
    if (!dir || !anims.isPlaying || anims.currentAnim?.key !== this.swingAnim) {
      this.swingDir = undefined;
      this.weapon.setVisible(false);
      return false;
    }
    const i = Math.max(0, (anims.currentFrame?.index ?? 1) - 1);
    const frame = this.weaponFrames[i];
    if (frame !== undefined) this.weapon.setFrame(frame);
    const [dx, dy] = SWING_SHIFT[dir === "left" ? "right" : dir][i] ?? [0, 0];
    this.weapon.setPosition(this.body.flipX ? -dx : dx, WEAPON_Y + dy);
    return true;
  }

  /** Hides or shows the hero; `puff` leaves smoke where a visible hero disappears (it fell). */
  setVisible(visible: boolean, puff = false) {
    if (this.container.visible === visible) return;
    if (!visible && puff) this.puff();
    this.container.setVisible(visible);
  }

  /** Swings the class weapon in the given facing: the body's attack frames with the weapon in step. */
  playSwing(facing: number) {
    const { dir, flipX } = facingDir(facing);
    const anim = animKey(this.sheet, `attack-${dir}`);
    if (!this.scene.anims.exists(anim)) return;
    this.swingDir = dir;
    this.swingAnim = anim;
    setFlipAnchored(this.body, flipX, this.bodyOriginX);
    this.body.play(anim);
    setFlipAnchored(this.weapon.setVisible(true), flipX, this.weaponOriginX);
    this.weapon.setAngle(SWING_ANGLE[dir]);
    // Swinging up, the weapon is behind the hero's back.
    if (dir === "up") this.container.moveBelow(this.weapon, this.body);
    else this.container.moveAbove(this.weapon, this.body);
    this.updateSwing();
  }

  /** A puff of smoke over the hero (it fell or left), unless it was never on screen. */
  private puff() {
    if (!this.shown || !this.container.visible || !this.scene.anims.exists(animKey(PUFF, "play"))) return;
    const smoke = this.scene.add.sprite(this.container.x, this.container.y - 4, PUFF).setDepth(DEPTH.fx);
    smoke.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => smoke.destroy());
    smoke.play(animKey(PUFF, "play"));
  }

  /** Removes the view; `puff` leaves smoke behind (a hero leaving the match, not the scene closing). */
  destroy(puff = false) {
    if (puff) this.puff();
    this.container.destroy();
  }
}
