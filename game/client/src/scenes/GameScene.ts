import { Callbacks, type InputHandle } from "@colyseus/sdk";
import { Predict } from "@colyseus/sdk/predict";
import { type GameContext, h } from "@core/client";
import { type GameMap, parseTiledMap, type TiledMap } from "@core/maps";
import {
  type ArenaState,
  type MoveInput,
  PLAYER_COLORS,
  type Player,
  type RosterEntry,
  stepPlayer,
  TILE_SIZE,
} from "@game/shared";
import Phaser from "phaser";
import { MUSIC_THEME, mapKey, SFX_JOIN, SPRITE_PLAYER, tilesetKey } from "../assets";
import { PlayerView } from "../render/PlayerView";

export const GAME_SCENE_KEY = "game";

/** Analog input beyond this (per axis) counts as a full step in that direction. */
const AXIS_THRESHOLD = 0.38;

/**
 * EXAMPLE GAME scene: renders the Tiled map and players.
 *
 * The core starts this scene with a GameContext once the room is joined and
 * stops it when the match ends; menus, reconnection and errors are handled by
 * the core. Netcode (from @colyseus/sdk/predict):
 *  - own player: client-side prediction with the shared `stepPlayer`, reconciled against the server
 *  - other players: interpolated between server snapshots
 */
export class GameScene extends Phaser.Scene {
  private ctx!: GameContext<ArenaState>;
  private predict?: Predict;
  private moveInput?: InputHandle<MoveInput>;
  private views = new Map<string, PlayerView>();

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(ctx: GameContext<ArenaState>) {
    this.ctx = ctx;
    this.views = new Map();
  }

  create() {
    const { room } = this.ctx;
    const gameMap = this.buildMap(room.state.mapId);

    const predict = Predict.get(room);
    this.predict = predict;
    // Other players: interpolate toward the latest snapshot. smoothMs trades a
    // little display lag for continuous motion on a rough connection.
    predict.attachAll("players", { mode: "lerp", fields: ["x", "y"], smoothMs: 65 });

    const input = room.input<MoveInput>({ mode: "reliable" });
    this.moveInput = input;

    const self = room.state.players.get(room.sessionId);
    if (self) {
      predict.reconciler(self, {
        input,
        fields: ["x", "y", "vx", "vy"],
        // The exact function the server runs; determinism is the whole contract.
        step: (stepCtx, predicted, command) => stepPlayer(predicted, command, stepCtx.dt, gameMap.collision),
      });
    }

    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (player: Player, sessionId: string) => this.addPlayer(player, sessionId));
    callbacks.onRemove("players", (_player: Player, sessionId: string) => this.removePlayer(sessionId));

    this.showControlsHint();
    this.ctx.audio.playMusic(MUSIC_THEME);
    this.watchRoster();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const view of this.views.values()) view.destroy();
      this.views.clear();
      this.predict = undefined;
      this.moveInput = undefined;
    });
  }

  /** Renders the Tiled map and returns the parsed collision data used for prediction. */
  private buildMap(mapId: string): GameMap {
    const key = mapKey(mapId);
    // Same .tmj the server parsed, so client-side collision matches exactly.
    const raw = this.cache.tilemap.get(key)?.data as TiledMap | undefined;
    if (!raw) throw new Error(`Map "${mapId}" not found: add content/maps/${mapId}.tmj`);

    const map = this.make.tilemap({ key });
    const tilesets = raw.tilesets
      .map((ts) => map.addTilesetImage(ts.name ?? "", tilesetKey(ts.image ?? "")))
      .filter((t): t is Phaser.Tilemaps.Tileset => t !== null);

    for (const layer of map.layers) map.createLayer(layer.name, tilesets);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setRoundPixels(true);

    return parseTiledMap(raw, { tileSize: TILE_SIZE });
  }

  /**
   * Roster → core scoreboard / player list (Tab), plus a toast and a sound when
   * someone joins or leaves. The roster is not AoI-filtered, so everyone is listed.
   */
  private watchRoster() {
    const { room, ui, t, audio } = this.ctx;
    const refresh = () =>
      ui.setScores(
        [...room.state.roster.entries()].map(([id, r]) => ({ id, name: r.name, score: r.score })),
        room.sessionId,
      );
    refresh();
    this.time.addEvent({ delay: 500, loop: true, callback: refresh });

    // Callbacks fire for entries already present too; only announce players arriving later.
    const known = new Set(room.state.roster.keys());
    const callbacks = Callbacks.get(room);
    callbacks.onAdd("roster", (entry: RosterEntry, id: string) => {
      if (known.has(id)) return;
      known.add(id);
      ui.toast(t("toast.joined", { name: entry.name }));
      audio.playSfx(SFX_JOIN, { rate: 0.95 + Math.random() * 0.1 });
      refresh();
    });
    callbacks.onRemove("roster", (entry: RosterEntry, id: string) => {
      known.delete(id);
      if (id !== room.sessionId) ui.toast(t("toast.left", { name: entry.name }));
      refresh();
    });
  }

  /** Example of a game-owned DOM HUD widget: a hint that fades after a few seconds. */
  private showControlsHint() {
    const hint = h("div", { className: "arena-hint" }, this.ctx.t("controls.hint"));
    this.ctx.hud.append(hint);
    this.time.delayedCall(4000, () => hint.remove());
  }

  private addPlayer(player: Player, sessionId: string) {
    if (this.views.has(sessionId)) return;
    const isSelf = sessionId === this.ctx.room.sessionId;
    const view = new PlayerView(this, SPRITE_PLAYER, player.name, PLAYER_COLORS[player.color] ?? 0xffffff, isSelf);
    view.setPosition(player.x, player.y);
    this.views.set(sessionId, view);
    if (isSelf) this.cameras.main.startFollow(view.container, true);
  }

  private removePlayer(sessionId: string) {
    this.views.get(sessionId)?.destroy();
    this.views.delete(sessionId);
  }

  override update(time: number) {
    const { predict, moveInput } = this;
    if (!predict || !moveInput) return;
    const { room, input } = this.ctx;

    // Drives prediction, interpolation and reconciliation, and returns how many
    // fixed steps came due, so we send exactly one input per simulation step.
    const steps = predict.tick(time);
    const move = input.move;
    for (let i = 0; i < steps; i++) {
      moveInput.data.moveX = toAxis(move.x);
      moveInput.data.moveY = toAxis(move.y);
      moveInput.send();
    }

    for (const [sessionId, player] of room.state.players) {
      this.views.get(sessionId)?.setPosition(predict.value(player, "x"), predict.value(player, "y"));
    }
  }
}

/** Quantizes an analog axis to the -1|0|1 the server accepts (8-way movement). */
function toAxis(v: number): -1 | 0 | 1 {
  return v > AXIS_THRESHOLD ? 1 : v < -AXIS_THRESHOLD ? -1 : 0;
}
