import type { Translate } from "../i18n";
import { GamepadSource } from "./GamepadSource";
import { KeyboardSource } from "./KeyboardSource";
import { PressTracker } from "./PressTracker";
import { TouchControls } from "./TouchControls";
import type { ActionBinding, Vec2 } from "./types";

/**
 * True on phones/tablets: the primary pointer is coarse. Touchscreen laptops report a
 * fine primary pointer, so they keep the desktop layout (touch controls still appear
 * after the first touch). Without matchMedia, any touch point counts.
 */
export function isTouchDevice(): boolean {
  if (typeof window.matchMedia === "function") return window.matchMedia("(pointer: coarse)").matches;
  return navigator.maxTouchPoints > 0;
}

/**
 * Unified input: keyboard + gamepad + touch, merged into one movement vector and
 * a set of named actions. Games read this instead of any specific device.
 *
 *   const { x, y } = ctx.input.move;      // -1..1 each, length <= 1
 *   if (ctx.input.isDown("shield")) ...   // held right now
 *   if (ctx.input.wasPressed("dash")) ... // pressed since the last frame (even a quick tap)
 */
export class InputManager {
  private keyboard: KeyboardSource;
  private gamepad = new GamepadSource();
  private touch: TouchControls;
  private actions: Map<string, ActionBinding>;
  private current: Vec2 = { x: 0, y: 0 };
  private active = false;
  private presses = new PressTracker();
  /** Actions whose gamepad button was down at the last poll (gamepads are polled, not evented). */
  private padDown = new Set<string>();
  /** Whether touch controls are shown while playing. Switches on at the first touch. */
  private touchMode = isTouchDevice();

  constructor(uiRoot: HTMLElement, actions: ActionBinding[], t: Translate) {
    this.actions = new Map(actions.map((a) => [a.id, a]));
    const onPress = (id: string) => this.presses.press(id);
    this.keyboard = new KeyboardSource(actions, onPress);
    this.touch = new TouchControls(uiRoot, actions, t, onPress);
    window.addEventListener("touchstart", this.onFirstTouch, { passive: true, once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
  }

  /** Current movement direction. Length is at most 1 (analog sticks give partial values). */
  get move(): Vec2 {
    return this.current;
  }

  /** True while the action is held. A tap shorter than a frame can be missed: use `wasPressed` for one-shot actions. */
  isDown(actionId: string): boolean {
    const action = this.actions.get(actionId);
    if (!action || !this.active) return false;
    return this.keyboard.isDown(action) || this.gamepad.isDown(action) || this.touch.isDown(action);
  }

  /**
   * True during the frame after the action was pressed, even if it was released
   * again before that frame (a quick tap). Use it for one-shot actions (attack,
   * jump, open a panel). Each press counts once; holding doesn't repeat.
   */
  wasPressed(actionId: string): boolean {
    return this.active && this.presses.wasPressed(actionId);
  }

  /** Enables capture while a match is running; disabled in menus so typing works normally. */
  setActive(active: boolean) {
    this.active = active;
    this.keyboard.enabled = active;
    this.touch.setVisible(active && this.touchMode);
    if (!active) this.reset();
  }

  /** Re-renders touch button labels after a language change. */
  refreshLabels() {
    this.touch.refreshLabels();
  }

  /** Call once per frame before the game reads input. */
  update() {
    if (!this.active) {
      this.current = { x: 0, y: 0 };
      this.presses.clear();
      return;
    }
    this.gamepad.poll();
    for (const action of this.actions.values()) {
      const down = this.gamepad.isDown(action);
      if (down && !this.padDown.has(action.id)) this.presses.press(action.id);
      if (down) this.padDown.add(action.id);
      else this.padDown.delete(action.id);
    }
    this.presses.update();
    const sources = [this.keyboard.move(), this.gamepad.move(), this.touch.move()];
    let x = 0;
    let y = 0;
    for (const s of sources) {
      x += s.x;
      y += s.y;
    }
    const length = Math.hypot(x, y);
    this.current = length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  reset() {
    this.keyboard.reset();
    this.touch.reset();
    this.presses.clear();
    this.current = { x: 0, y: 0 };
  }

  private onFirstTouch = () => {
    this.touchMode = true;
    if (this.active) this.touch.setVisible(true);
  };
}
