import { Callbacks, type InputHandle } from "@colyseus/sdk";
import { Predict } from "@colyseus/sdk/predict";
import { type GameContext, h } from "@core/client";
import { type GameMap, parseTiledMap, type TiledMap } from "@core/maps";
import {
  type ClassId,
  type DamageMessage,
  type Enemy,
  isClassId,
  type LevelUpMessage,
  Msg,
  type Pickup,
  type Player,
  type PlayerInput,
  type PlayerSimState,
  type RosterEntry,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type SpawnMessage,
  screenOf,
  statsFor,
  stepPlayer,
  TILE_SIZE,
  type WorldState,
} from "@game/shared";
import Phaser from "phaser";
import { MUSIC_THEME, mapKey, SFX_JOIN, SFX_UI, tilesetKey } from "../assets";
import { EnemyView } from "../render/EnemyView";
import { PlayerView } from "../render/PlayerView";
import { createPlaceholderArt, rupeeTexture } from "../render/placeholderArt";
import { WorldLabels } from "../render/WorldLabels";
import { heroSelect } from "../ui/heroSelect";
import { StatusHud } from "../ui/statusHud";

export const GAME_SCENE_KEY = "game";
export const ACTION_ATTACK = "attack";

/** Analog input beyond this (per axis) counts as a full step in that direction. */
const AXIS_THRESHOLD = 0.38;
/** Camera slide between screens, in ms. */
const SCREEN_PAN_MS = 320;

/** The reconciler fields: everything `stepPlayer` reads or writes. */
const SIM_FIELDS = [
  "x",
  "y",
  "vx",
  "vy",
  "facing",
  "cooldown",
  "lock",
  "swing",
  "knockX",
  "knockY",
  "knockTicks",
  "dead",
] as const satisfies readonly (keyof PlayerSimState)[];

/**
 * The world scene: Tiled map shown one screen at a time, heroes, enemies and drops.
 *
 * The core starts this scene with a GameContext once the room is joined; the
 * player then picks a hero and a map (DOM overlay) and the server creates the body.
 * Netcode (from @colyseus/sdk/predict):
 *  - own hero: client-side prediction with the shared `stepPlayer`, reconciled against the server
 *  - other heroes and enemies: interpolated between server snapshots
 */
export class GameScene extends Phaser.Scene {
  private ctx!: GameContext<WorldState>;
  private predict?: Predict;
  private input$?: InputHandle<PlayerInput>;
  private predicted?: PlayerSimState;
  private gameMap!: GameMap;
  private players = new Map<string, PlayerView>();
  private lastSwing = new Map<string, number>();
  private enemies = new Map<string, EnemyView>();
  private pickups = new Map<string, Phaser.GameObjects.Image>();
  private status?: StatusHud;
  private labels?: WorldLabels;
  private screenKey = "";
  private wasDead = false;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(ctx: GameContext<WorldState>) {
    this.ctx = ctx;
    this.players = new Map();
    this.lastSwing = new Map();
    this.enemies = new Map();
    this.pickups = new Map();
    this.predicted = undefined;
    this.screenKey = "";
    this.wasDead = false;
  }

  create() {
    const { room } = this.ctx;
    createPlaceholderArt(this);
    this.gameMap = this.buildMap(room.state.mapId);

    const predict = Predict.get(room);
    this.predict = predict;
    // Others: interpolate toward the latest snapshot.
    predict.attachAll("players", { mode: "lerp", fields: ["x", "y"], smoothMs: 65 });
    predict.attachAll("enemies", { mode: "lerp", fields: ["x", "y"], smoothMs: 65 });
    this.input$ = room.input<PlayerInput>({ mode: "reliable" });

    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (player: Player, id: string) => this.addPlayer(player, id));
    callbacks.onRemove("players", (_p: Player, id: string) => this.removePlayer(id));
    callbacks.onAdd("enemies", (enemy: Enemy, id: string) => this.addEnemy(enemy, id));
    callbacks.onRemove("enemies", (_e: Enemy, id: string) => this.removeEnemy(id));
    callbacks.onAdd("pickups", (pickup: Pickup, id: string) => this.addPickup(pickup, id));
    callbacks.onRemove("pickups", (_p: Pickup, id: string) => this.removePickup(id));

    room.onMessage(Msg.damage, (m: DamageMessage) =>
      this.labels?.damage(m.x, m.y, m.amount, m.crit, m.player, this.time.now),
    );
    room.onMessage(Msg.levelUp, (m: LevelUpMessage) => {
      this.ctx.ui.toast(this.ctx.t("toast.levelUp", { level: m.level }));
      this.ctx.audio.playSfx(SFX_JOIN, { rate: 1.3 });
    });

    this.labels = new WorldLabels(this);
    this.status = new StatusHud(this.ctx.t);
    this.ctx.hud.append(this.labels.el, this.status.el);
    this.ctx.audio.playMusic(MUSIC_THEME);
    this.watchRoster();
    this.lookAtScreen(this.gameMap.pixelWidth / 2, this.gameMap.pixelHeight / 2, false);
    if (!room.state.players.has(room.sessionId)) this.showHeroSelect();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const view of this.players.values()) view.destroy();
      for (const view of this.enemies.values()) view.destroy();
      this.players.clear();
      this.enemies.clear();
      this.pickups.clear();
      this.predict = undefined;
      this.input$ = undefined;
      this.predicted = undefined;
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

  // ─── Hero selection ───────────────────────────────────────────────────────

  private showHeroSelect() {
    const { t, hud, room } = this.ctx;
    const overlay = heroSelect({
      t,
      onDone: (classId) => {
        overlay.remove();
        this.ctx.audio.playSfx(SFX_UI);
        const message: SpawnMessage = { classId };
        room.send(Msg.spawn, message);
        this.showControlsHint();
      },
    });
    hud.append(overlay);
  }

  /** A hint that fades after a few seconds. */
  private showControlsHint() {
    const hint = h("div", { className: "sw-hint" }, this.ctx.t("controls.hint"));
    this.ctx.hud.append(hint);
    this.time.delayedCall(5000, () => hint.remove());
  }

  // ─── Entities ─────────────────────────────────────────────────────────────

  private addPlayer(player: Player, id: string) {
    if (this.players.has(id)) return;
    const isSelf = id === this.ctx.room.sessionId;
    const view = new PlayerView(this, player.classId, isSelf);
    this.players.set(id, view);
    this.lastSwing.set(id, player.swing);
    if (isSelf) this.startPrediction(player);
  }

  /** Own hero: predict with the exact step the server runs (determinism is the whole contract). */
  private startPrediction(self: Player) {
    const { predict, input$ } = this;
    if (!predict || !input$) return;
    const classId: ClassId = isClassId(self.classId) ? self.classId : "knight";
    // Speed and swing cooldown don't change with level, so the class is enough.
    const stats = statsFor(classId, 1);
    const reconciler = predict.reconciler(self, {
      input: input$,
      fields: SIM_FIELDS,
      step: (stepCtx, state, command) => stepPlayer(state, command, stepCtx.dt, this.gameMap.collision, stats),
    });
    this.predicted = reconciler.state as PlayerSimState;
    this.lookAtScreen(self.x, self.y, false);
  }

  private removePlayer(id: string) {
    this.players.get(id)?.destroy();
    this.players.delete(id);
    this.lastSwing.delete(id);
    this.labels?.removeName(id);
  }

  private addEnemy(enemy: Enemy, id: string) {
    if (this.enemies.has(id)) return;
    this.enemies.set(id, new EnemyView(this, enemy.kind));
  }

  private removeEnemy(id: string) {
    this.enemies.get(id)?.destroy();
    this.enemies.delete(id);
  }

  private addPickup(pickup: Pickup, id: string) {
    if (this.pickups.has(id)) return;
    const image = this.add.image(pickup.x, pickup.y, rupeeTexture(pickup.value)).setDepth(8);
    this.tweens.add({ targets: image, y: pickup.y - 2, yoyo: true, repeat: -1, duration: 500, ease: "Sine.easeInOut" });
    this.pickups.set(id, image);
  }

  private removePickup(id: string) {
    const image = this.pickups.get(id);
    if (!image) return;
    this.tweens.killTweensOf(image);
    image.destroy();
    this.pickups.delete(id);
  }

  /**
   * Roster → core scoreboard / player list (Tab), plus a toast and a sound when
   * someone joins or leaves. The roster is not AoI-filtered, so everyone is listed.
   */
  private watchRoster() {
    const { room, ui, t, audio } = this.ctx;
    const refresh = () =>
      ui.setScores(
        [...room.state.roster.entries()].map(([id, r]) => ({ id, name: r.name, score: r.level })),
        room.sessionId,
      );
    refresh();
    this.time.addEvent({ delay: 500, loop: true, callback: refresh });

    const known = new Set(room.state.roster.keys());
    const callbacks = Callbacks.get(room);
    callbacks.onAdd("roster", (entry: RosterEntry, id: string) => {
      if (known.has(id)) return;
      known.add(id);
      if (id !== room.sessionId) {
        ui.toast(t("toast.joined", { name: entry.name }));
        audio.playSfx(SFX_JOIN, { rate: 0.95 + Math.random() * 0.1 });
      }
      refresh();
    });
    callbacks.onRemove("roster", (entry: RosterEntry, id: string) => {
      known.delete(id);
      if (id !== room.sessionId) ui.toast(t("toast.left", { name: entry.name }));
      refresh();
    });
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  /** Classic flip-screen camera: shows the screen containing (x, y), sliding when it changes. */
  private lookAtScreen(x: number, y: number, animate: boolean) {
    const { col, row } = screenOf(x, y);
    const key = `${col},${row}`;
    if (key === this.screenKey) return;
    this.screenKey = key;
    const cx = col * SCREEN_WIDTH + SCREEN_WIDTH / 2;
    const cy = row * SCREEN_HEIGHT + SCREEN_HEIGHT / 2;
    const cam = this.cameras.main;
    if (animate) cam.pan(cx, cy, SCREEN_PAN_MS, "Sine.easeInOut", true);
    else cam.centerOn(cx, cy);
  }

  // ─── Frame ────────────────────────────────────────────────────────────────

  override update(time: number) {
    const { predict, input$ } = this;
    if (!predict || !input$) return;
    const { room, input } = this.ctx;

    // Drives prediction, interpolation and reconciliation, and returns how many
    // fixed steps came due, so we send exactly one input per simulation step.
    const steps = predict.tick(time);
    this.labels?.beginFrame(this.time.now);
    const self = room.state.players.get(room.sessionId);
    if (self && this.predicted) {
      const move = input.move;
      for (let i = 0; i < steps; i++) {
        input$.data.moveX = toAxis(move.x);
        input$.data.moveY = toAxis(move.y);
        input$.data.attack = input.isDown(ACTION_ATTACK) ? 1 : 0;
        input$.send();
      }
    }

    for (const [id, player] of room.state.players) {
      const view = this.players.get(id);
      if (!view) continue;
      const isSelf = id === room.sessionId;
      const sim = isSelf && this.predicted ? this.predicted : player;
      const x = predict.value(player, "x");
      const y = predict.value(player, "y");
      this.labels?.name(id, player.name, x, y - 9, isSelf);
      view.update(x, y, { facing: sim.facing, dead: sim.dead, invuln: player.invuln }, time);
      // Own swings come from prediction (instant feedback); others' from the server.
      if (sim.swing !== this.lastSwing.get(id)) {
        this.lastSwing.set(id, sim.swing);
        view.playSwing(sim.facing, statsFor(isClassId(player.classId) ? player.classId : "knight", 1).reach);
      }
    }

    for (const [id, enemy] of room.state.enemies) {
      this.enemies
        .get(id)
        ?.update(predict.value(enemy, "x"), predict.value(enemy, "y"), enemy.hp, enemy.maxHp, enemy.hurt, time);
    }

    if (self) {
      this.lookAtScreen(predict.value(self, "x"), predict.value(self, "y"), true);
      this.status?.update(self);
      if (self.dead && !this.wasDead) this.ctx.ui.toast(this.ctx.t("toast.died"));
      this.wasDead = self.dead;
    }
  }
}

/** Quantizes an analog axis to the -1|0|1 the server accepts (8-way movement). */
function toAxis(v: number): -1 | 0 | 1 {
  return v > AXIS_THRESHOLD ? 1 : v < -AXIS_THRESHOLD ? -1 : 0;
}
