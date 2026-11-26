import type { Resolution } from "./phaserConfig";

/** How dark the line under each row of art pixels is. */
const LINE_ALPHA = 0.32;
/** Below this many screen pixels per art pixel a line would cover the whole row: no scanlines. */
const MIN_DEVICE_PX = 2;

/**
 * Retro CRT scanlines over the game canvas (not over the menus and HUD, so
 * text stays readable). A canvas the size of the game canvas in *device*
 * pixels draws a dark line under every row of art pixels, about a third of
 * the row high, so the lines line up with the pixel art at any whole zoom
 * and any devicePixelRatio. Redrawn when the window or the zoom changes.
 */
export class Scanlines {
  private readonly el = document.createElement("canvas");
  private enabled = false;
  private frame = 0;
  private readonly observer: ResizeObserver;

  constructor(
    private readonly game: HTMLCanvasElement,
    private readonly res: Resolution,
  ) {
    this.el.className = "ui-scanlines";
    this.el.setAttribute("aria-hidden", "true");
    this.el.hidden = true;
    game.after(this.el);
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(game);
    window.addEventListener("resize", this.schedule);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.schedule();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private schedule = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  };

  private draw() {
    const rect = this.game.getBoundingClientRect();
    const host = this.el.parentElement?.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    const perRow = height / this.res.height;
    if (!this.enabled || !host || width === 0 || perRow < MIN_DEVICE_PX) {
      this.el.hidden = true;
      return;
    }
    Object.assign(this.el.style, {
      left: `${rect.left - host.left}px`,
      top: `${rect.top - host.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    this.el.width = width;
    this.el.height = height;
    const ctx = this.el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(0, 0, 0, ${LINE_ALPHA})`;
    for (let row = 0; row < this.res.height; row++) {
      const top = Math.round(row * perRow);
      const bottom = Math.round((row + 1) * perRow);
      const line = Math.max(1, Math.round((bottom - top) / 3));
      ctx.fillRect(0, bottom - line, width, line);
    }
    this.el.hidden = false;
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener("resize", this.schedule);
    this.el.remove();
  }
}
