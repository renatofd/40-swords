import { type Area, areaAt, type Portal, screenOf, type WorldInfo } from "@game/shared";

/** Colour of each biome letter (see tools/world-gen/src/world.ts). */
const BIOME_COLORS: Record<string, string> = {
  G: "#4f9a3c",
  F: "#2f6b34",
  H: "#7a8a4a",
  M: "#7a6a58",
  L: "#2f6fb8",
  D: "#d9c27a",
  W: "#4a5a33",
  Y: "#3a4a42",
  B: "#e6d394",
  C: "#c8c8d0",
};
const CELL = 8;

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
        g.fillStyle = seen
          ? (BIOME_COLORS[this.info.biomes[r * this.info.columns + c] ?? "G"] ?? "#4f9a3c")
          : "#1a1a24";
        g.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
      }
    for (const e of this.entrances.values()) {
      if (!this.explored.has(`${e.col},${e.row}`)) continue;
      g.fillStyle = e.kind === "dungeon" ? "#ff4040" : "#ffd040";
      g.fillRect(e.col * CELL + 2, e.row * CELL + 2, 3, 3);
    }
    if (blink) {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 3, CELL - 3);
    }
  }
}
