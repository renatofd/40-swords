import { Callbacks, type InputHandle } from "@colyseus/sdk";
import { Predict } from "@colyseus/sdk/predict";
import { type GameContext, h } from "@core/client";
import { type GameMap, parseTiledMap, type TiledMap } from "@core/maps";
import {
  type Chest,
  type DamageMessage,
  type Enemy,
  type GainMessage,
  isClassId,
  type LevelUpMessage,
  Msg,
  OFFER_SLOTS,
  type OfferMessage,
  offerPosition,
  type Pickup,
  type Player,
  type PlayerInput,
  type PlayerSimState,
  type ProjectileEndMessage,
  parseWorldObjects,
  type RosterEntry,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type ShopMessage,
  type ShotMessage,
  type SimWorld,
  type Spot,
  screenOf,
  statsFor,
  stepPlayer,
  TILE_SIZE,
  WEAPON_IDS,
  WEAPONS,
  type WorldState,
  weaponCountKey,
} from "@game/shared";
import Phaser from "phaser";
import { MUSIC_THEME, mapKey, SFX_JOIN, SFX_UI, tilesetKey } from "../assets";
import { EnemyView } from "../render/EnemyView";
import { PlayerView } from "../render/PlayerView";
import { Projectiles } from "../render/Projectiles";
import {
  createPlaceholderArt,
  rupeeTexture,
  TEX_CHEST,
  TEX_CHEST_OPEN,
  TEX_MERCHANT,
  TEX_PEDESTAL,
} from "../render/placeholderArt";
import { WorldLabels } from "../render/WorldLabels";
import { GainCards } from "../ui/gainCard";
import { ITEM_ICONS, itemEffect, itemName, rarityColor, rarityName } from "../ui/relicText";
import { StatusHud } from "../ui/statusHud";

export const GAME_SCENE_KEY = "game";
export const ACTION_ATTACK = "attack";
export const ACTION_STATS = "stats";

/** Analog input beyond this (per axis) counts as a full step in that direction. */
const AXIS_THRESHOLD = 0.38;
/** Camera slide between neighbouring screens, in ms. */
const SCREEN_PAN_MS = 320;
/** A position jump larger than this between two snapshots is a teleport (cave, respawn): cut, don't slide. */
const TELEPORT_PX = 48;
/** Within this distance of an offer, its card shows the details. */
const OFFER_DETAILS_PX = 26;

/** The reconciler fields: everything `stepPlayer` reads or writes (see PlayerSimState). */
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
  "speed",
  "swingCd",
  "cdPct",
  "vseq",
  "vmask",
  "warp",
  ...WEAPON_IDS.flatMap((id) => [`${id}N`, `${id}Cd`] as const),
] as const satisfies readonly (keyof PlayerSimState)[];

/**
 * The world scene: Tiled map shown one screen at a time, heroes, enemies,
 * projectiles, chests and cave vendors.
 *
 * The core starts it with a GameContext once the room is joined (the hero was
 * picked before joining, see ui/heroSelect.ts). Netcode (@colyseus/sdk/predict):
 *  - own hero: client-side prediction with the shared `stepPlayer` (movement,
 *    sword, weapon volleys, portals), reconciled against the server
 *  - other heroes and enemies: interpolated between server snapshots
 *  - projectiles: drawn from volleys (own: predicted; others: "shot" messages)
 */
export class GameScene extends Phaser.Scene {
  private ctx!: GameContext<WorldState>;
  private predict?: Predict;
  private input$?: InputHandle<PlayerInput>;
  private predicted?: PlayerSimState;
  private gameMap!: GameMap;
  private world!: SimWorld;
  private vendors: Spot[] = [];
  private players = new Map<string, PlayerView>();
  private lastSwing = new Map<string, number>();
  private enemies = new Map<string, EnemyView>();
  private pickups = new Map<string, Phaser.GameObjects.Image>();
  private chests = new Map<string, Phaser.GameObjects.Image>();
  private projectiles?: Projectiles;
  private status?: StatusHud;
  private labels?: WorldLabels;
  private gains?: GainCards;
  /** The last vendor offers received, by vendor id (only this player's). */
  private shops = new Map<string, OfferMessage[]>();
  private pedestals: Phaser.GameObjects.Image[] = [];
  private screenKey = "";
  private wasDead = false;
  /** An attack press waiting for the next simulation step (so quick taps are never lost). */
  private attackQueued = false;
  private lastVolley = 0;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(ctx: GameContext<WorldState>) {
    this.ctx = ctx;
    this.players = new Map();
    this.lastSwing = new Map();
    this.enemies = new Map();
    this.pickups = new Map();
    this.chests = new Map();
    this.shops = new Map();
    this.pedestals = [];
    this.predicted = undefined;
    this.screenKey = "";
    this.wasDead = false;
    this.attackQueued = false;
  }

  create() {
    const { room, hud, t } = this.ctx;
    createPlaceholderArt(this);
    this.buildMap(room.state.mapId);
    this.projectiles = new Projectiles(this, this.gameMap.collision);
    for (const v of this.vendors) this.add.image(v.x, v.y - 4, TEX_MERCHANT).setDepth(9);

    const predict = Predict.get(room);
    this.predict = predict;
    // Others: interpolate toward the latest snapshot; a big jump is a teleport (cut, don't slide).
    predict.attachAll("players", { mode: "lerp", fields: ["x", "y"], smoothMs: 65, snap: TELEPORT_PX });
    predict.attachAll("enemies", { mode: "lerp", fields: ["x", "y"], smoothMs: 65, snap: TELEPORT_PX });
    this.input$ = room.input<PlayerInput>({ mode: "reliable" });

    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (player: Player, id: string) => this.addPlayer(player, id));
    callbacks.onRemove("players", (_p: Player, id: string) => this.removePlayer(id));
    callbacks.onAdd("enemies", (enemy: Enemy, id: string) => this.addEnemy(enemy, id));
    callbacks.onRemove("enemies", (_e: Enemy, id: string) => this.removeEnemy(id));
    callbacks.onAdd("pickups", (pickup: Pickup, id: string) => this.addPickup(pickup, id));
    callbacks.onRemove("pickups", (_p: Pickup, id: string) => this.removePickup(id));
    callbacks.onAdd("chests", (chest: Chest, id: string) => this.addChest(chest, id));
    callbacks.onRemove("chests", (_c: Chest, id: string) => this.removeChest(id));

    room.onMessage(Msg.damage, (m: DamageMessage) =>
      this.labels?.damage(m.x, m.y, m.amount, m.crit, m.player, this.time.now),
    );
    room.onMessage(Msg.levelUp, (m: LevelUpMessage) => {
      this.ctx.ui.toast(t("toast.levelUp", { level: m.level }));
      this.ctx.audio.playSfx(SFX_JOIN, { rate: 1.3 });
    });
    room.onMessage(Msg.shot, (m: ShotMessage) => this.projectiles?.spawnVolley(m, this.time.now));
    room.onMessage(Msg.projectileEnd, (m: ProjectileEndMessage) => {
      for (const key of m.keys) this.projectiles?.end(key);
    });
    room.onMessage(Msg.gain, (m: GainMessage) => {
      this.gains?.show(m);
      this.ctx.audio.playSfx(SFX_JOIN, { rate: 1.6 });
    });
    room.onMessage(Msg.shop, (m: ShopMessage) => {
      this.shops.set(m.vendor, m.offers);
      this.renderShop(m.vendor);
    });
    room.onMessage(Msg.shopFail, () => this.ctx.ui.toast(t("shop.notEnough")));

    this.labels = new WorldLabels(this);
    this.status = new StatusHud(t);
    this.gains = new GainCards(t);
    hud.append(this.labels.el, this.status.el, this.gains.el);
    this.ctx.audio.playMusic(MUSIC_THEME);
    this.watchRoster();
    this.showControlsHint();
    this.lookAtScreen(this.gameMap.pixelWidth / 2, this.gameMap.pixelHeight / 2, false);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const view of this.players.values()) view.destroy();
      for (const view of this.enemies.values()) view.destroy();
      this.projectiles?.destroy();
      this.players.clear();
      this.enemies.clear();
      this.pickups.clear();
      this.chests.clear();
      this.predict = undefined;
      this.input$ = undefined;
      this.predicted = undefined;
    });
  }

  /** Renders the Tiled map and keeps what prediction needs (collision, portals). */
  private buildMap(mapId: string) {
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
    this.gameMap = parseTiledMap(raw, { tileSize: TILE_SIZE });
    const objects = parseWorldObjects(raw);
    this.world = { grid: this.gameMap.collision, portals: objects.portals };
    this.vendors = objects.vendors;
  }

  /** A hint that fades after a few seconds. */
  private showControlsHint() {
    const hint = h("div", { className: "sw-hint" }, this.ctx.t("controls.hint"));
    this.ctx.hud.append(hint);
    this.time.delayedCall(6000, () => hint.remove());
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
    const reconciler = predict.reconciler(self, {
      input: input$,
      fields: SIM_FIELDS,
      snap: TELEPORT_PX,
      step: (stepCtx, state, command) => stepPlayer(state, command, stepCtx.dt, this.world),
    });
    this.predicted = reconciler.state as PlayerSimState;
    this.lastVolley = self.vseq;
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

  private addChest(chest: Chest, id: string) {
    if (this.chests.has(id)) return;
    this.chests.set(id, this.add.image(chest.x, chest.y, chest.open ? TEX_CHEST_OPEN : TEX_CHEST).setDepth(7));
  }

  private removeChest(id: string) {
    this.chests.get(id)?.destroy();
    this.chests.delete(id);
  }

  // ─── Vendors ──────────────────────────────────────────────────────────────

  /** Pedestals and price cards of a vendor's offers (this player's offers only). */
  private renderShop(vendorId: string) {
    const vendor = this.vendors.find((v) => v.id === vendorId);
    const offers = this.shops.get(vendorId);
    this.labels?.removeAll("offer:");
    for (const p of this.pedestals) p.destroy();
    this.pedestals = [];
    if (!vendor || !offers) return;
    const { t } = this.ctx;
    offers.slice(0, OFFER_SLOTS).forEach((offer, slot) => {
      const at = offerPosition(vendor, slot);
      this.pedestals.push(this.add.image(at.x, at.y + 4, TEX_PEDESTAL).setDepth(6));
      this.labels?.anchor(`offer:${vendorId}:${slot}`, at.x, at.y + 1, () =>
        h(
          "div",
          {
            className: offer.sold ? "sw-offer sw-offer-sold" : "sw-offer",
            style: `--sw-rarity: ${rarityColor(offer.rarity)}`,
            "data-offer": String(slot),
          },
          h(
            "div",
            { className: "sw-offer-details" },
            h("strong", {}, itemName(t, offer.kind)),
            offer.kind !== "potion" && h("span", { className: "sw-rarity" }, rarityName(t, offer.rarity)),
            h("span", {}, itemEffect(t, offer.kind, offer.rarity)),
          ),
          h("span", { className: "sw-offer-icon" }, ITEM_ICONS[offer.kind]),
          h(
            "span",
            { className: "sw-offer-price" },
            ...(offer.sold ? [t("shop.sold")] : [h("span", { className: "sw-rupee-icon" }), String(offer.price)]),
          ),
        ),
      );
    });
  }

  /** Keeps the offer cards on their pedestals; the one the hero stands next to shows its details. */
  private updateShopCards(x: number, y: number) {
    for (const vendor of this.vendors) {
      for (let slot = 0; slot < OFFER_SLOTS; slot++) {
        const at = offerPosition(vendor, slot);
        const card = this.labels?.move(`offer:${vendor.id}:${slot}`, at.x, at.y + 1);
        card?.classList.toggle("sw-offer-near", Math.hypot(at.x - x, at.y - y) <= OFFER_DETAILS_PX);
      }
    }
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

  /** Classic flip-screen camera: slides to a neighbouring screen, cuts to a far one (caves). */
  private lookAtScreen(x: number, y: number, animate: boolean) {
    const { col, row } = screenOf(x, y);
    const key = `${col},${row}`;
    if (key === this.screenKey) return;
    const [oldCol = col, oldRow = row] = this.screenKey.split(",").map(Number);
    const neighbour = Math.abs(oldCol - col) + Math.abs(oldRow - row) === 1;
    this.screenKey = key;
    const cx = col * SCREEN_WIDTH + SCREEN_WIDTH / 2;
    const cy = row * SCREEN_HEIGHT + SCREEN_HEIGHT / 2;
    const cam = this.cameras.main;
    if (animate && neighbour) cam.pan(cx, cy, SCREEN_PAN_MS, "Sine.easeInOut", true);
    else {
      cam.panEffect.reset();
      cam.centerOn(cx, cy);
    }
  }

  // ─── Frame ────────────────────────────────────────────────────────────────

  override update(time: number) {
    const { predict, input$ } = this;
    if (!predict || !input$) return;
    const { room, input } = this.ctx;
    const now = this.time.now;

    if (input.wasPressed(ACTION_STATS)) this.status?.toggle();
    // A tap shorter than a frame still swings: it waits for the next simulation step.
    if (input.wasPressed(ACTION_ATTACK)) this.attackQueued = true;

    // Drives prediction, interpolation and reconciliation, and returns how many
    // fixed steps came due, so we send exactly one input per simulation step.
    const steps = predict.tick(time);
    this.labels?.beginFrame(now);
    const self = room.state.players.get(room.sessionId);
    const sim = this.predicted;
    if (self && sim) {
      const move = input.move;
      for (let i = 0; i < steps; i++) {
        input$.data.moveX = toAxis(move.x);
        input$.data.moveY = toAxis(move.y);
        input$.data.attack = input.isDown(ACTION_ATTACK) || this.attackQueued ? 1 : 0;
        this.attackQueued = false;
        input$.send(); // steps the prediction right away
        if (sim.vseq !== this.lastVolley) {
          this.lastVolley = sim.vseq;
          this.projectiles?.spawnVolley(
            {
              owner: room.sessionId,
              volley: sim.vseq,
              mask: sim.vmask,
              x: sim.x,
              y: sim.y,
              facing: sim.facing,
              counts: WEAPON_IDS.map((id) => sim[weaponCountKey(id)] * WEAPONS[id].perCopy),
            },
            now,
          );
        }
      }
    }
    this.projectiles?.update(now);

    for (const [id, player] of room.state.players) {
      const view = this.players.get(id);
      if (!view) continue;
      const isSelf = id === room.sessionId;
      const state = isSelf && sim ? sim : player;
      const x = predict.value(player, "x");
      const y = predict.value(player, "y");
      this.labels?.name(id, player.name, x, y - 9, isSelf);
      view.update(x, y, { facing: state.facing, dead: state.dead, invuln: player.invuln }, time);
      // Own swings come from prediction (instant feedback); others' from the server.
      if (state.swing !== this.lastSwing.get(id)) {
        this.lastSwing.set(id, state.swing);
        view.playSwing(state.facing, statsFor(isClassId(player.classId) ? player.classId : "knight", 1).reach);
      }
    }

    for (const [id, enemy] of room.state.enemies) {
      this.enemies
        .get(id)
        ?.update(predict.value(enemy, "x"), predict.value(enemy, "y"), enemy.hp, enemy.maxHp, enemy.hurt, time);
    }
    for (const [id, chest] of room.state.chests) {
      const image = this.chests.get(id);
      const texture = chest.open ? TEX_CHEST_OPEN : TEX_CHEST;
      if (image && image.texture.key !== texture) image.setTexture(texture);
    }

    if (self) {
      const x = predict.value(self, "x");
      const y = predict.value(self, "y");
      this.lookAtScreen(x, y, true);
      this.updateShopCards(x, y);
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
