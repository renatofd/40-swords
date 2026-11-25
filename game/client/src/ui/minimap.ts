import { type Area, areaAt, type Portal, screenOf, type WorldInfo } from "@game/shared";

const GRASS = "#6ab417";
/** Colour of each biome letter (see tools/world-gen/src/world.ts), from the pack palette. */
const BIOME_COLORS: Record<string, string> = {
  G: GRASS,
  F: "#376d03",
  R: "#ad4e1a",
  H: "#c59782",
  M: "#5c3c0d",
  L: "#024aca",
  W: "#939717",
  Y: "#71a6a1",
  B: "#e2d7b5",
  C: "#d7d7d7",
};
const UNSEEN = "#0d2030";
const CAVE = "#ffe737";
const DUNGEON = "#e03c28";
/** A screen is 6x6 canvas px plus a 1 px gap; the canvas is drawn at a whole number of art px (`--sw-u`). */
const CELL = 7;

/**
 * Overworld minimap drawn on a small canvas inside the DOM HUD: screens the
 * hero has seen, cave (yellow) and dungeon (red) entrances found, and where
 * the hero is (inside a cave or dungeon: its entrance blinks).
 */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private explored = new Set<string>();
  /** Overworld screen of each cave / dungeon entrance, by area id. */
  private entrances = new Map<string, { col: number; row: number; kind: Area["kind"] }>();
  private lastKey = "";

  constructor(
    private readonly info: WorldInfo,
    portals: readonly Portal[],
    label: string,
  ) {
    this.el = document.createElement("canvas");
    this.el.className = "sw-minimap";
    this.el.width = info.columns * CELL;
    this.el.height = info.rows * CELL;
    // One canvas px = one art px: an exact integer scale at every UI scale.
    this.el.style.inlineSize = `calc(${info.columns * CELL} * var(--sw-u))`;
    this.el.style.blockSize = `calc(${info.rows * CELL} * var(--sw-u))`;
    this.el.setAttribute("role", "img");
    this.el.setAttribute("aria-label", label);
    this.ctx = this.el.getContext("2d");
    for (const p of portals) {
      const from = screenOf(p.x, p.y);
      const to = screenOf(p.toX, p.toY);
      const area = areaAt(info.areas, to.col, to.row);
      if (area && from.row < info.rows) this.entrances.set(area.id, { ...from, kind: area.kind });
    }
  }

  /** Call every frame with the hero's position; redraws only when something changed. */
  update(x: number, y: number, time: number) {
    if (!this.ctx || this.info.columns === 0) return;
    let { col, row } = screenOf(x, y);
    if (row < this.info.rows) this.explored.add(`${col},${row}`);
    else {
      // Inside a cave or dungeon: show where its entrance is.
      const area = areaAt(this.info.areas, col, row);
      const entrance = area ? this.entrances.get(area.id) : undefined;
      if (!entrance) return;
      ({ col, row } = entrance);
    }
    const blink = Math.floor(time / 400) % 2 === 0;
    const key = `${col},${row},${blink},${this.explored.size}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.ctx;
    g.clearRect(0, 0, this.el.width, this.el.height);
    for (let r = 0; r < this.info.rows; r++)
      for (let c = 0; c < this.info.columns; c++) {
        const seen = this.explored.has(`${c},${r}`);
        g.fillStyle = seen ? (BIOME_COLORS[this.info.biomes[r * this.info.columns + c] ?? "G"] ?? GRASS) : UNSEEN;
        g.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
      }
    for (const e of this.entrances.values()) {
      if (!this.explored.has(`${e.col},${e.row}`)) continue;
      g.fillStyle = e.kind === "dungeon" ? DUNGEON : CAVE;
      g.fillRect(e.col * CELL + 2, e.row * CELL + 2, 3, 3);
    }
    if (blink) {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1;
      g.strokeRect(col * CELL + 0.5, row * CELL + 0.5, CELL - 2, CELL - 2);
    }
  }
}
