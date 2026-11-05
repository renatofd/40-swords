import type { ActionBinding, Vec2 } from "./types";

const UP = ["KeyW", "ArrowUp"];
const DOWN = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const MOVE_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]);

/** Keyboard state from DOM events (layout-independent `code`s: WASD works on AZERTY too). */
export class KeyboardSource {
  private down = new Set<string>();
  private gameKeys: Set<string>;
  /** Action ids bound to each key code. */
  private actionsByKey = new Map<string, string[]>();
  /** When false, keys are not captured (e.g. while the menu has focus). */
  enabled = false;

  /** @param onPress called when a key of an action goes down (auto-repeat excluded). */
  constructor(
    actions: ActionBinding[],
    private readonly onPress: (actionId: string) => void = () => {},
  ) {
    this.gameKeys = new Set([...MOVE_KEYS, ...actions.flatMap((a) => a.keys ?? [])]);
    for (const action of actions)
      for (const code of action.keys ?? [])
        this.actionsByKey.set(code, [...(this.actionsByKey.get(code) ?? []), action.id]);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.reset);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled || isTyping(e.target)) return;
    this.down.add(e.code);
    if (!e.repeat) for (const id of this.actionsByKey.get(e.code) ?? []) this.onPress(id);
    // Stop arrows/space from scrolling the page or the portal around the game iframe.
    if (this.gameKeys.has(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  reset = () => {
    this.down.clear();
  };

  move(): Vec2 {
    const any = (codes: string[]) => codes.some((c) => this.down.has(c));
    return { x: Number(any(RIGHT)) - Number(any(LEFT)), y: Number(any(DOWN)) - Number(any(UP)) };
  }

  isDown(action: ActionBinding): boolean {
    return (action.keys ?? []).some((c) => this.down.has(c));
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.reset);
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}
