/**
 * Remembers which actions were pressed between two frames, so a tap shorter than
 * a frame (key down and up before the game looks) still counts once.
 *
 * Devices call `press(id)` when a press starts; the input manager calls
 * `update()` once per frame; the game asks `wasPressed(id)` during that frame.
 * Pure (no DOM), so it is unit-tested on its own.
 */
export class PressTracker {
  /** Presses since the last update; they become visible at the next one. */
  private pending = new Set<string>();
  /** Presses visible during the current frame. */
  private frame = new Set<string>();

  press(id: string) {
    this.pending.add(id);
  }

  /** Call once per frame, before the game reads input. */
  update() {
    const visible = this.pending;
    this.pending = this.frame;
    this.pending.clear();
    this.frame = visible;
  }

  /** True during the frame that follows a press of `id`. */
  wasPressed(id: string): boolean {
    return this.frame.has(id);
  }

  clear() {
    this.pending.clear();
    this.frame.clear();
  }
}
