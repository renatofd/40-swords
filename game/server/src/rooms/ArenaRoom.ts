import type { Client, CloseCode, StepContext } from "@colyseus/core";
import type { GameMap } from "@core/maps";
import { GameRoom, InputBudget, InterestManager, loadMap } from "@core/server";
import {
  type ArenaJoinOptions,
  ArenaState,
  INTEREST_EVERY_TICKS,
  INTEREST_RADIUS,
  MAX_PLAYERS_PER_ROOM,
  MoveInput,
  PLAYER_COLORS,
  Player,
  PROTOCOL_VERSION,
  RosterEntry,
  SECONDS_PER_POINT,
  stepPlayer,
  TICK_RATE,
  TILE_SIZE,
} from "@game/shared";

export interface ArenaCreateOptions {
  /** Set by the server in defineRoom (game/server/src/index.ts), never by clients. */
  mapId?: string;
}

/**
 * EXAMPLE GAME: one .io match where players walk around a Tiled map.
 * Replace with your own game. In a future MMO this same shape becomes one zone.
 *
 * Authoritative: clients only send MoveInput frames; the server runs the shared
 * `stepPlayer` once per received input on a fixed timestep (at most about one
 * input per tick per player, see InputBudget) and syncs the result.
 * Version checks, auth, reconnection and flood protection come from GameRoom.
 */
export class ArenaRoom extends GameRoom<{ state: ArenaState; input: MoveInput }> {
  protected readonly protocolVersion = PROTOCOL_VERSION;
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override state = new ArenaState();

  /**
   * Per-client input buffer. `sanitize` clamps every field as it is decoded:
   * never trust the wire. ~2s of buffer at 30 Hz absorbs bursts after a stall.
   */
  override inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
  });

  private map!: GameMap;
  private spawnCursor = 0;
  private tick = 0;
  /** Seconds each player has walked since their last point. */
  private walked = new Map<string, number>();
  /** At most ~1 input per tick per player, so sending inputs faster doesn't move faster. */
  private inputBudget = new InputBudget();
  /** Area of interest: each client only receives nearby players. */
  private interest = new InterestManager<Player>({ radius: INTEREST_RADIUS });

  override messages = {
    // Movement arrives through the input buffer above. Register handlers here
    // only for things that are not per-tick inputs (chat, emotes, ...).
  };

  override onCreate(options: ArenaCreateOptions = {}) {
    const mapId = typeof options.mapId === "string" ? options.mapId : "arena";
    this.map = loadMap(mapId, { tileSize: TILE_SIZE });
    this.state.mapId = mapId;
    this.startSimulation((ctx) => this.step(ctx), TICK_RATE);
  }

  override onJoin(client: Client, options: ArenaJoinOptions) {
    const cursor = this.spawnCursor++;
    const spawn = this.map.spawns[cursor % this.map.spawns.length] ?? {
      x: this.map.pixelWidth / 2,
      y: this.map.pixelHeight / 2,
    };
    // Join options come from the client: accept only a valid colour index (bots send none).
    const picked = options?.color;
    const color =
      Number.isInteger(picked) && (picked as number) >= 0 && (picked as number) < PLAYER_COLORS.length
        ? (picked as number)
        : cursor % PLAYER_COLORS.length;
    this.state.players.set(
      client.sessionId,
      new Player({ name: this.identity(client).name, color, x: spawn.x, y: spawn.y, vx: 0, vy: 0 }),
    );
    this.state.roster.set(client.sessionId, new RosterEntry({ name: this.identity(client).name, score: 0 }));
    this.interest.addViewer(client);
    this.updateInterest();
  }

  override onLeave(client: Client, _code: CloseCode) {
    this.interest.removeViewer(client);
    this.state.players.delete(client.sessionId);
    this.state.roster.delete(client.sessionId);
    this.walked.delete(client.sessionId);
    this.inputBudget.delete(client.sessionId);
  }

  /**
   * One shared `stepPlayer` per received input, so the inputs the client
   * predicted are exactly the inputs the server applied.
   */
  private step(ctx: StepContext) {
    for (const [sessionId, player] of this.state.players) {
      const channel = this.inputs.get(sessionId);
      if (!channel) continue;
      const inputs = channel.take(this.inputBudget.refill(sessionId));
      this.inputBudget.spend(sessionId, inputs.length);
      for (const input of inputs) {
        stepPlayer(player, input, ctx.dt, this.map.collision);
        if (player.vx !== 0 || player.vy !== 0) this.awardWalking(sessionId, ctx.dt);
      }
      // No input this tick (tab hidden, connection dropped): the player stands still.
      if (inputs.length === 0) {
        player.vx = 0;
        player.vy = 0;
      }
    }
    if (++this.tick % INTEREST_EVERY_TICKS === 0) this.updateInterest();
  }

  /** EXAMPLE RULE: walking earns points. Replace with your game's scoring. */
  private awardWalking(sessionId: string, dt: number) {
    const total = (this.walked.get(sessionId) ?? 0) + dt;
    const points = Math.floor(total / SECONDS_PER_POINT);
    this.walked.set(sessionId, total - points * SECONDS_PER_POINT);
    const entry = this.state.roster.get(sessionId);
    if (entry && points > 0) entry.score += points;
  }

  private updateInterest() {
    // Each viewer sees players within INTEREST_RADIUS of its own player, and always itself.
    this.interest.update(this.state.players.entries(), (sessionId) => this.state.players.get(sessionId));
  }
}
