import type { Translate } from "../i18n";
import type { ActionBinding, Vec2 } from "./types";

/** Joystick radius in CSS pixels. */
const RADIUS = 56;
const DEADZONE = 0.15;

/**
 * On-screen controls for touch devices, drawn in the DOM (crisp at any zoom):
 *  - floating joystick: touch anywhere on the left half, the stick appears under the thumb
 *  - one button per action with a `touchLabel`, bottom-right
 * Multi-touch: the joystick and buttons track separate pointers.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private zone: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private stickPointer: number | null = null;
  private origin: Vec2 = { x: 0, y: 0 };
  private vector: Vec2 = { x: 0, y: 0 };
  private pressed = new Set<string>();
  private buttons: { action: ActionBinding; el: HTMLButtonElement }[] = [];

  /** @param onPress called when an action button is pressed. */
  constructor(
    parent: HTMLElement,
    actions: ActionBinding[],
    private readonly t: Translate,
    private readonly onPress: (actionId: string) => void = () => {},
  ) {
    this.root = el("div", "touch-controls");
    this.zone = el("div", "touch-stick-zone");
    this.base = el("div", "touch-stick-base");
    this.knob = el("div", "touch-stick-knob");
    this.base.append(this.knob);
    this.zone.append(this.base);
    this.root.append(this.zone);

    const buttonBar = el("div", "touch-buttons");
    for (const action of actions) {
      if (!action.touchLabel) continue;
      const button = document.createElement("button");
      button.className = "touch-button";
      button.type = "button";
      this.bindButton(button, action.id);
      buttonBar.append(button);
      this.buttons.push({ action, el: button });
    }
    this.root.append(buttonBar);
    this.refreshLabels();

    this.zone.addEventListener("pointerdown", this.onStickDown);
    this.zone.addEventListener("pointermove", this.onStickMove);
    this.zone.addEventListener("pointerup", this.onStickUp);
    this.zone.addEventListener("pointercancel", this.onStickUp);
    parent.append(this.root);
    this.setVisible(false);
  }

  refreshLabels() {
    for (const { action, el: button } of this.buttons) button.textContent = this.t(action.touchLabel ?? action.id);
  }

  setVisible(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) this.reset();
  }

  move(): Vec2 {
    return this.vector;
  }

  isDown(action: ActionBinding): boolean {
    return this.pressed.has(action.id);
  }

  reset() {
    this.stickPointer = null;
    this.vector = { x: 0, y: 0 };
    this.pressed.clear();
    this.base.classList.remove("active");
  }

  private onStickDown = (e: PointerEvent) => {
    if (this.stickPointer !== null) return;
    this.stickPointer = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    const rect = this.zone.getBoundingClientRect();
    this.origin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX - rect.left}px`;
    this.base.style.top = `${e.clientY - rect.top}px`;
    this.base.classList.add("active");
    this.updateStick(e);
  };

  private onStickMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) this.updateStick(e);
  };

  private onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.vector = { x: 0, y: 0 };
    this.knob.style.transform = "";
    this.base.classList.remove("active");
  };

  private updateStick(e: PointerEvent) {
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const magnitude = Math.min(dist, RADIUS) / RADIUS;
    this.vector = magnitude < DEADZONE ? { x: 0, y: 0 } : { x: dx / RADIUS, y: dy / RADIUS };
  }

  private bindButton(button: HTMLButtonElement, id: string) {
    const release = () => {
      this.pressed.delete(id);
      button.classList.remove("pressed");
    };
    button.addEventListener("pointerdown", (e) => {
      button.setPointerCapture(e.pointerId);
      this.pressed.add(id);
      this.onPress(id);
      button.classList.add("pressed");
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  }
}

function el(tag: "div", className: string): HTMLDivElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
