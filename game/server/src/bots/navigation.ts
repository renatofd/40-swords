import type { CollisionGrid } from "@core/shared";
import { type Portal, SCREEN_TILES_X, SCREEN_TILES_Y } from "@game/shared";

/** A block of tiles searched as one: a screen, or the whole arena. Tile coordinates. */
export interface Region {
  tx: number;
  ty: number;
  w: number;
  h: number;
}

/**
 * A way from one walkable part of a screen (a node) to another: an open
 * screen edge, or a portal (cave entrances and exits).
 */
export interface Exit {
  from: number;
  to: number;
  /** Screen of `to`. */
  screen: number;
  /** Tiles (map coordinates) to walk onto to take it: the edge tiles on this side, or the portal tiles. */
  tiles: [number, number][];
  /** On an edge tile, keep walking this way to cross (0, 0 for a portal). */
  pushX: number;
  pushY: number;
  /** Centre of the portal (px): stepping into it is enough. */
  portal?: { x: number; y: number };
}

/** Steps (4-neighbour) from each tile of a region to the nearest target tile; -1 where unreachable. */
export interface Field {
  region: Region;
  dist: Int16Array;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const AROUND: readonly (readonly [number, number])[] = [...NEIGHBOURS, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * How bots find their way. The world is cut into nodes, the walkable parts of
 * each screen (a river or a wall can split a screen in two), linked by open
 * edges and portals: routes are searched on that graph, and walking inside a
 * screen follows breadth-first distance fields over its tiles.
 * Static: build it once per map (see `navigationFor`).
 */
export class Navigation {
  readonly tileSize: number;
  /** Map size in tiles, and in screens. */
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  private readonly nodeOfTile: Int32Array;
  private readonly screenOfNode: number[] = [];
  private readonly exits: Exit[][] = [];
  private readonly exitFields = new Map<Exit, Field>();
  private readonly routes = new Map<number, Exit | null>();
  private readonly hopsFrom = new Map<number, Map<number, number>>();

  /**
   * @param danger how hard each screen is (bots keep to screens they can
   * handle, see BotBrain); screens not listed are 0
   */
  constructor(
    private readonly grid: CollisionGrid,
    portals: readonly Portal[],
    private readonly danger: ReadonlyMap<number, number> = new Map(),
  ) {
    this.tileSize = grid.tileSize;
    this.width = grid.width;
    this.height = grid.height;
    this.columns = Math.ceil(grid.width / SCREEN_TILES_X);
    this.rows = Math.ceil(grid.height / SCREEN_TILES_Y);
    this.nodeOfTile = new Int32Array(grid.width * grid.height).fill(-1);
    for (let s = 0; s < this.columns * this.rows; s++) this.label(s);
    this.linkEdges();
    this.linkPortals(portals);
  }

  get nodeCount() {
    return this.screenOfNode.length;
  }

  walkable(tx: number, ty: number) {
    return !this.grid.isSolid(tx, ty);
  }

  tileOf(x: number, y: number): [number, number] {
    return [Math.floor(x / this.tileSize), Math.floor(y / this.tileSize)];
  }

  screenAt(x: number, y: number) {
    const col = Math.floor(x / this.tileSize / SCREEN_TILES_X);
    const row = Math.floor(y / this.tileSize / SCREEN_TILES_Y);
    return row * this.columns + col;
  }

  screenRegion(screen: number): Region {
    const tx = (screen % this.columns) * SCREEN_TILES_X;
    const ty = Math.floor(screen / this.columns) * SCREEN_TILES_Y;
    return { tx, ty, w: Math.min(SCREEN_TILES_X, this.width - tx), h: Math.min(SCREEN_TILES_Y, this.height - ty) };
  }

  /** Tiles covered by a pixel rectangle (e.g. the arena). */
  regionOf(rect: { x: number; y: number; width: number; height: number }): Region {
    const ts = this.tileSize;
    const tx = Math.floor(rect.x / ts);
    const ty = Math.floor(rect.y / ts);
    return { tx, ty, w: Math.ceil((rect.x + rect.width) / ts) - tx, h: Math.ceil((rect.y + rect.height) / ts) - ty };
  }

  /** Node of the walkable part of a screen at (x, y) px, or -1 on a solid tile. */
  nodeAt(x: number, y: number) {
    const [tx, ty] = this.tileOf(x, y);
    return this.nodeAtTile(tx, ty);
  }

  nodeAtTile(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return -1;
    return this.nodeOfTile[ty * this.width + tx] as number;
  }

  screenOf(node: number) {
    return this.screenOfNode[node] ?? -1;
  }

  exitsOf(node: number): readonly Exit[] {
    return this.exits[node] ?? [];
  }

  dangerOf(screen: number) {
    return this.danger.get(screen) ?? 0;
  }

  /**
   * The exit to take now to go from a node to a screen (fewest screens on the
   * way), crossing no screen more dangerous than `maxDanger` nor in `avoid`
   * (the destination itself may be). Undefined when there is no such way.
   */
  route(
    from: number,
    toScreen: number,
    maxDanger = Number.POSITIVE_INFINITY,
    avoid?: ReadonlySet<number>,
  ): Exit | undefined {
    if (from < 0 || this.screenOf(from) === toScreen) return undefined;
    const limit = dangerKey(maxDanger);
    // Routes without screens to avoid are the same for everyone: kept.
    const key = (from * 4096 + toScreen) * 32 + limit;
    const shared = !avoid || avoid.size === 0;
    const cached = shared ? this.routes.get(key) : undefined;
    if (cached !== undefined) return cached ?? undefined;
    let found: Exit | undefined;
    const first = new Map<number, Exit>();
    const queue = [from];
    const seen = new Set(queue);
    search: for (let i = 0; i < queue.length; i++) {
      const node = queue[i] as number;
      for (const exit of this.exitsOf(node)) {
        if (seen.has(exit.to)) continue;
        seen.add(exit.to);
        const via = node === from ? exit : (first.get(node) as Exit);
        first.set(exit.to, via);
        if (exit.screen === toScreen) {
          found = via;
          break search;
        }
        if (dangerKey(this.dangerOf(exit.screen)) <= limit && !avoid?.has(exit.screen)) queue.push(exit.to);
      }
    }
    if (shared) this.routes.set(key, found ?? null);
    return found;
  }

  /**
   * Screens reachable from a node through screens no more dangerous than
   * `maxDanger`, with how many screens away each one is (0 for its own).
   */
  hops(from: number, maxDanger = Number.POSITIVE_INFINITY): ReadonlyMap<number, number> {
    const limit = dangerKey(maxDanger);
    const key = from * 32 + limit;
    let result = this.hopsFrom.get(key);
    if (result) return result;
    result = new Map();
    if (from >= 0) {
      const dist = new Map([[from, 0]]);
      const queue = [from];
      for (let i = 0; i < queue.length; i++) {
        const node = queue[i] as number;
        const d = dist.get(node) as number;
        const screen = this.screenOf(node);
        if (!result.has(screen)) result.set(screen, d);
        for (const exit of this.exitsOf(node))
          if (!dist.has(exit.to) && dangerKey(this.dangerOf(exit.screen)) <= limit) {
            dist.set(exit.to, d + 1);
            queue.push(exit.to);
          }
      }
    }
    this.hopsFrom.set(key, result);
    return result;
  }

  /** Distance field toward an exit, over the screen it leaves (kept for later). */
  exitField(exit: Exit): Field {
    let field = this.exitFields.get(exit);
    if (!field) {
      field = this.field(this.screenRegion(this.screenOf(exit.from)), exit.tiles);
      this.exitFields.set(exit, field);
    }
    return field;
  }

  /**
   * Breadth-first distances inside `region` from the given target tiles (map
   * coordinates). `blocked` tiles count as walls (e.g. shop offers to walk around).
   */
  field(
    region: Region,
    targets: readonly (readonly [number, number])[],
    blocked?: (tx: number, ty: number) => boolean,
  ): Field {
    const dist = new Int16Array(region.w * region.h).fill(-1);
    const open = (tx: number, ty: number) => this.walkable(tx, ty) && !blocked?.(tx, ty);
    const queue: number[] = [];
    for (const [tx, ty] of targets) {
      const lx = tx - region.tx;
      const ly = ty - region.ty;
      if (lx < 0 || ly < 0 || lx >= region.w || ly >= region.h || !open(tx, ty)) continue;
      const i = ly * region.w + lx;
      if (dist[i] === 0) continue;
      dist[i] = 0;
      queue.push(i);
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q] as number;
      const lx = i % region.w;
      const ly = (i - lx) / region.w;
      const d = (dist[i] as number) + 1;
      for (const [ox, oy] of NEIGHBOURS) {
        const nx = lx + ox;
        const ny = ly + oy;
        if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) continue;
        const n = ny * region.w + nx;
        if (dist[n] !== -1 || !open(region.tx + nx, region.ty + ny)) continue;
        dist[n] = d;
        queue.push(n);
      }
    }
    return { region, dist };
  }

  /** Steps left at (x, y) px, or -1 outside the region or where the target can't be reached. */
  distanceAt(field: Field, x: number, y: number): number {
    const { region } = field;
    const [tx, ty] = this.tileOf(x, y);
    const lx = tx - region.tx;
    const ly = ty - region.ty;
    if (lx < 0 || ly < 0 || lx >= region.w || ly >= region.h) return -1;
    return field.dist[ly * region.w + lx] as number;
  }

  /**
   * Which way to walk from (x, y) to go down the field: toward the centre of
   * the neighbouring tile closest to the target, without cutting corners past
   * walls. Undefined off the field; [0, 0] on a target tile.
   */
  steer(field: Field, x: number, y: number): [number, number] | undefined {
    const { region, dist } = field;
    const ts = this.tileSize;
    const [tx, ty] = this.tileOf(x, y);
    const here = this.distanceAt(field, x, y);
    if (here < 0) return undefined;
    if (here === 0) return [0, 0];
    let best = here;
    let bestX = 0;
    let bestY = 0;
    for (const [ox, oy] of AROUND) {
      const nx = tx + ox - region.tx;
      const ny = ty + oy - region.ty;
      if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) continue;
      const d = dist[ny * region.w + nx] as number;
      if (d < 0 || d >= best) continue;
      // Diagonal only when both sides are open (the hero's box would catch the corner).
      if (ox !== 0 && oy !== 0 && (!this.walkable(tx + ox, ty) || !this.walkable(tx, ty + oy))) continue;
      best = d;
      bestX = ox;
      bestY = oy;
    }
    if (best === here) return undefined;
    // Head for the centre of that tile, so the hero lines up with doorways.
    const cx = (tx + bestX + 0.5) * ts;
    const cy = (ty + bestY + 0.5) * ts;
    return [axis(cx - x, 2), axis(cy - y, 2)];
  }

  /**
   * Which way to walk from (x, y) to get to a screen, by the shortest route.
   * [0, 0] once there; undefined when it can't be reached from here.
   */
  walkToward(x: number, y: number, toScreen: number): [number, number] | undefined {
    const node = this.nodeAt(x, y);
    if (node < 0) return undefined;
    if (this.screenOf(node) === toScreen) return [0, 0];
    const exit = this.route(node, toScreen);
    return exit && this.stepToward(x, y, exit);
  }

  /**
   * Which way to walk from (x, y) to take an exit of the screen part it is in:
   * down the field to it, then across the border or into the portal.
   * Undefined when the exit can't be reached from here.
   */
  stepToward(x: number, y: number, exit: Exit): [number, number] | undefined {
    const dir = this.steer(this.exitField(exit), x, y);
    if (!dir) return undefined;
    if (dir[0] !== 0 || dir[1] !== 0) return dir;
    if (exit.portal) return [axis(exit.portal.x - x, 0.5), axis(exit.portal.y - y, 0.5)];
    // On the border: cross it, keeping to the middle of the tile (openings can be one tile wide).
    const ts = this.tileSize;
    const cx = (Math.floor(x / ts) + 0.5) * ts;
    const cy = (Math.floor(y / ts) + 0.5) * ts;
    return [exit.pushX || axis(cx - x, 1), exit.pushY || axis(cy - y, 1)];
  }

  /** Labels the connected walkable parts of a screen as nodes. */
  private label(screen: number) {
    const r = this.screenRegion(screen);
    for (let ty = r.ty; ty < r.ty + r.h; ty++)
      for (let tx = r.tx; tx < r.tx + r.w; tx++) {
        if (this.nodeAtTile(tx, ty) !== -1 || !this.walkable(tx, ty)) continue;
        const node = this.screenOfNode.length;
        this.screenOfNode.push(screen);
        this.exits.push([]);
        const queue = [ty * this.width + tx];
        this.nodeOfTile[ty * this.width + tx] = node;
        for (let q = 0; q < queue.length; q++) {
          const i = queue[q] as number;
          const x = i % this.width;
          const y = (i - x) / this.width;
          for (const [ox, oy] of NEIGHBOURS) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < r.tx || ny < r.ty || nx >= r.tx + r.w || ny >= r.ty + r.h) continue;
            const n = ny * this.width + nx;
            if (this.nodeOfTile[n] !== -1 || !this.walkable(nx, ny)) continue;
            this.nodeOfTile[n] = node;
            queue.push(n);
          }
        }
      }
  }

  /** Open borders between neighbouring screens: both tiles across the border walkable. */
  private linkEdges() {
    const byPair = new Map<number, Exit>();
    const add = (from: number, to: number, tx: number, ty: number, pushX: number, pushY: number) => {
      const key = from * 65536 + to;
      let exit = byPair.get(key);
      if (!exit) {
        exit = { from, to, screen: this.screenOf(to), tiles: [], pushX, pushY };
        byPair.set(key, exit);
        this.exits[from]?.push(exit);
      }
      exit.tiles.push([tx, ty]);
    };
    const link = (ax: number, ay: number, bx: number, by: number) => {
      const a = this.nodeAtTile(ax, ay);
      const b = this.nodeAtTile(bx, by);
      if (a < 0 || b < 0) return;
      add(a, b, ax, ay, bx - ax, by - ay);
      add(b, a, bx, by, ax - bx, ay - by);
    };
    for (let x = SCREEN_TILES_X; x < this.width; x += SCREEN_TILES_X)
      for (let y = 0; y < this.height; y++) link(x - 1, y, x, y);
    for (let y = SCREEN_TILES_Y; y < this.height; y += SCREEN_TILES_Y)
      for (let x = 0; x < this.width; x++) link(x, y - 1, x, y);
  }

  private linkPortals(portals: readonly Portal[]) {
    const ts = this.tileSize;
    for (const p of portals) {
      const tiles: [number, number][] = [];
      for (let ty = Math.floor(p.y / ts); ty * ts < p.y + p.height; ty++)
        for (let tx = Math.floor(p.x / ts); tx * ts < p.x + p.width; tx++)
          if (this.walkable(tx, ty)) tiles.push([tx, ty]);
      const start = tiles[0];
      if (!start) continue;
      const from = this.nodeAtTile(start[0], start[1]);
      const to = this.nodeAt(p.toX, p.toY);
      if (from < 0 || to < 0 || from === to) continue;
      this.exits[from]?.push({
        from,
        to,
        screen: this.screenOf(to),
        tiles: tiles.filter(([tx, ty]) => this.nodeAtTile(tx, ty) === from),
        pushX: 0,
        pushY: 0,
        portal: { x: p.x + p.width / 2, y: p.y + p.height / 2 },
      });
    }
  }
}

/** Danger limits are cached in 32 steps (0..31; anything higher counts as no limit). */
const dangerKey = (danger: number) => Math.max(0, Math.min(31, Math.floor(danger)));

/** -1, 0 or 1: the sign of `delta`, or 0 within `dead` of it. */
export const axis = (delta: number, dead: number): -1 | 0 | 1 => (delta > dead ? 1 : delta < -dead ? -1 : 0);

const cache = new Map<string, Navigation>();

/** The navigation graph of a map, built once per process (maps don't change while it runs). */
export function navigationFor(
  mapId: string,
  grid: CollisionGrid,
  portals: readonly Portal[],
  danger: ReadonlyMap<number, number>,
): Navigation {
  let nav = cache.get(mapId);
  if (!nav) {
    nav = new Navigation(grid, portals, danger);
    cache.set(mapId, nav);
  }
  return nav;
}
