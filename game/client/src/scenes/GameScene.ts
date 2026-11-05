import { Callbacks, type InputHandle } from "@colyseus/sdk";
import { Predict } from "@colyseus/sdk/predict";
import { type GameContext, h, type SfxOptions } from "@core/client";
import { type GameMap, parseTiledMap, type TiledMap } from "@core/maps";
import {
  areaAt,
  arenaRect,
  type BossDownMessage,
  type BotsMessage,
  type Chest,
  type DamageMessage,
  ENEMIES,
  type Enemy,
  type EnemyShotMessage,
  type GainMessage,
  inRect,
  isClassId,
  isEnemyKind,
  isLobbyPhase,
  isPvpPhase,
  type KillMessage,
  type LevelUpMessage,
  MatchPhase,
  Msg,
  OFFER_SLOTS,
  type OfferMessage,
  offerPosition,
  type PickedMessage,
  type Pickup,
  type Player,
  type PlayerInput,
  type PlayerSimState,
  type Portal,
  PROPS_LAYER,
  type ProjectileEndMessage,
  type Prop,
  type PropKind,
  parseProps,
  parseWorldInfo,
  parseWorldObjects,
  type ReadyMessage,
  type RosterEntry,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type ShopMessage,
  type ShotMessage,
  type SimWorld,
  type Spot,
  type SummaryMessage,
  screenOf,
  statsFor,
  stepPlayer,
  TILE_SIZE,
  WEAPON_IDS,
  WEAPONS,
  type WorldInfo,
  type WorldState,
  weaponCountKey,
} from "@game/shared";
import Phaser from "phaser";
import {
  MUSIC_THEME,
  mapKey,
  SFX_BREAK,
  SFX_CHEST,
  SFX_COIN,
  SFX_CUT,
  SFX_FALL,
  SFX_HEART,
  SFX_HIT,
  SFX_HURT,
  SFX_JOIN,
  SFX_LEVEL,
  SFX_SHOOT,
  SFX_SWING,
  SFX_UI,
  SFX_WIN,
  tilesetKey,
} from "../assets";
import { recordMatch } from "../career";
import { EnemyView } from "../render/EnemyView";
import { PlayerView } from "../render/PlayerView";
import { Projectiles } from "../render/Projectiles";
import {
  createPlaceholderArt,
  rupeeTexture,
  TEX_CHEST,
  TEX_CHEST_OPEN,
  TEX_HEART,
  TEX_LEAF,
  TEX_MERCHANT,
  TEX_PEDESTAL,
  TEX_SHARD,
} from "../render/placeholderArt";
import { WorldLabels } from "../render/WorldLabels";
import { BossBar } from "../ui/bossBar";
import { GainCards } from "../ui/gainCard";
import { type LobbyEntry, LobbyPanel } from "../ui/lobby";
import { MatchHud } from "../ui/matchHud";
import { Minimap } from "../ui/minimap";
import { ITEM_ICONS, itemEffect, itemName, rarityColor, rarityName } from "../ui/relicText";
import { StatusHud } from "../ui/statusHud";
import { SummaryPanel } from "../ui/summary";

export const GAME_SCENE_KEY = "game";
export const ACTION_ATTACK = "attack";
export const ACTION_STATS = "stats";
/** Ready / not ready in the waiting room (the panel also has a button). */
export const ACTION_READY = "ready";

/** Analog input beyond this (per axis) counts as a full step in that direction. */
const AXIS_THRESHOLD = 0.38;
/** Camera slide between neighbouring screens, in ms. */
const SCREEN_PAN_MS = 320;
/** A position jump larger than this between two snapshots is a teleport (cave, respawn): cut, don't slide. */
const TELEPORT_PX = 48;
/** Within this distance of an offer, its card shows the details. */
const OFFER_DETAILS_PX = 26;
/** Sides of the polygon drawing the arena storm. */
const ZONE_SEGMENTS = 96;

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
 * projectiles, chests, cave vendors, and tall grass and pots (tile layer
 * "props": the server says which are broken).
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
  /** Tall grass and pots: their tile layer, tiles, and each one by id (tile index). */
  private propsLayer?: Phaser.Tilemaps.TilemapLayer;
  private propTiles: Partial<Record<PropKind, { whole: number; broken: number }>> = {};
  private props = new Map<number, Prop>();
  /** Until then, props reported broken are drawn so without bits flying (the state as we joined). */
  private quietPropsUntil = 0;
  private projectiles?: Projectiles;
  private status?: StatusHud;
  private labels?: WorldLabels;
  private gains?: GainCards;
  private bossBar?: BossBar;
  private minimap?: Minimap;
  private match?: MatchHud;
  private info!: WorldInfo;
  private arena?: ReturnType<typeof arenaRect>;
  /** Flip-screen in the world; a following camera inside the (bigger) arena. */
  private cameraMode: "screens" | "arena" = "screens";
  private zone?: Phaser.GameObjects.Graphics;
  /** Zone radius last drawn (-1: none). */
  private zoneDrawn = -1;
  private lastPhase = -1;
  /** Countdown warnings already shown in this match. */
  private warned = new Set<number>();
  private lobby?: LobbyPanel;
  private summary?: SummaryPanel;
  private portals: readonly Portal[] = [];
  /** Cave or dungeon the hero is in (to announce dungeons on entry). */
  private areaId = "";
  /** The last vendor offers received, by vendor id (only this player's). */
  private shops = new Map<string, OfferMessage[]>();
  private pedestals: Phaser.GameObjects.Image[] = [];
  private screenKey = "";
  /** An attack press waiting for the next simulation step (so quick taps are never lost). */
  private attackQueued = false;
  private lastVolley = 0;
  /** Own health last frame (a drop means a hit: sound and shake); -1 before the first frame. */
  private lastHp = -1;
  /** When each sound effect last played (busy fights would otherwise be noise). */
  private sfxAt = new Map<string, number>();

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
    this.props = new Map();
    this.propsLayer = undefined;
    this.shops = new Map();
    this.pedestals = [];
    this.predicted = undefined;
    this.screenKey = "";
    this.areaId = "";
    this.attackQueued = false;
    this.cameraMode = "screens";
    this.zoneDrawn = -1;
    this.lastPhase = -1;
    this.warned = new Set();
  }

  create() {
    const { room, hud, t } = this.ctx;
    createPlaceholderArt(this);
    this.buildMap(room.state.mapId);
    this.projectiles = new Projectiles(this, this.gameMap.collision);
    for (const v of this.vendors) this.add.image(v.x, v.y - 4, TEX_MERCHANT).setDepth(9);
    // The storm tints the ground outside the safe zone (players stay on top).
    this.zone = this.add.graphics().setDepth(5);

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
    this.quietPropsUntil = this.time.now + 1000;
    callbacks.onAdd("brokenProps", (_kind: number, id: string) => this.setPropBroken(Number(id), true));
    callbacks.onRemove("brokenProps", (_kind: number, id: string) => this.setPropBroken(Number(id), false));

    room.onMessage(Msg.damage, (m: DamageMessage) => {
      this.labels?.damage(m.x, m.y, m.amount, m.crit, m.player, this.time.now);
      // Blows landing on monsters in view (the hero's own hurt sound comes from its health, see update).
      if (!m.player && this.cameras.main.worldView.contains(m.x, m.y))
        this.sfx(SFX_HIT, { volume: m.crit ? 0.9 : 0.55, rate: m.crit ? 0.85 : 1 }, 50);
    });
    room.onMessage(Msg.levelUp, (m: LevelUpMessage) => {
      this.ctx.ui.toast(t("toast.levelUp", { level: m.level }));
      this.sfx(SFX_LEVEL);
    });
    // The match is over for this hero: how it went, into the career saved in this browser.
    room.onMessage(Msg.summary, (m: SummaryMessage) => {
      const { career, unlocked } = recordMatch(m);
      this.summary?.show(m, career, unlocked);
    });
    room.onMessage(Msg.picked, (m: PickedMessage) => {
      if (m.kind === "heart") {
        this.sfx(SFX_HEART);
        const self = room.state.players.get(room.sessionId);
        if (self) this.labels?.heal(self.x, self.y - 6, m.value, this.time.now);
      } else this.sfx(SFX_COIN, { volume: 0.6 }, 40);
    });
    room.onMessage(Msg.shot, (m: ShotMessage) => this.projectiles?.spawnVolley(m, this.time.now));
    room.onMessage(Msg.enemyShot, (m: EnemyShotMessage) => this.projectiles?.spawnHostile(m, this.time.now));
    room.onMessage(Msg.bossDown, (m: BossDownMessage) => {
      this.ctx.ui.toast(t("toast.bossDown", { boss: t(`enemy.${m.kind}`), name: m.by }), 4000);
      this.sfx(SFX_CHEST, { rate: 0.75 });
    });
    room.onMessage(Msg.projectileEnd, (m: ProjectileEndMessage) => {
      for (const key of m.keys) this.projectiles?.end(key);
    });
    room.onMessage(Msg.gain, (m: GainMessage) => {
      this.gains?.show(m);
      if (m.kind === "potion") this.sfx(SFX_HEART, { rate: 0.85 });
      else if (m.source === "shop") this.sfx(SFX_COIN, { rate: 0.8 });
      else this.sfx(SFX_CHEST, { rate: m.source === "loot" ? 1.15 : 1 });
    });
    room.onMessage(Msg.shop, (m: ShopMessage) => {
      this.shops.set(m.vendor, m.offers);
      this.renderShop(m.vendor);
    });
    room.onMessage(Msg.shopFail, () => this.ctx.ui.toast(t("shop.notEnough")));
    room.onMessage(Msg.kill, (m: KillMessage) => {
      this.match?.kill(m);
      const loot = this.match?.lootText(m, room.sessionId);
      if (loot) this.ctx.ui.toast(loot, 4000);
      if (m.killer === room.sessionId) this.sfx(SFX_LEVEL, { rate: 1.2 });
      else if (m.victim === room.sessionId) this.sfx(SFX_FALL);
    });

    this.labels = new WorldLabels(this);
    this.status = new StatusHud(t);
    this.gains = new GainCards(t);
    this.bossBar = new BossBar();
    this.minimap = new Minimap(this.info, this.portals, t("hud.map"));
    this.status.addWidget(this.minimap.el);
    this.match = new MatchHud(t);
    this.summary = new SummaryPanel(t);
    this.lobby = new LobbyPanel(
      t,
      () => this.toggleReady(),
      () => this.toggleBots(),
    );
    hud.append(
      this.lobby.el,
      this.labels.el,
      this.status.el,
      this.gains.el,
      this.bossBar.el,
      this.match.timer,
      this.match.feed,
      this.match.banner,
      this.summary.el,
    );
    this.lastPhase = room.state.phase;
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
    for (const layer of map.layers) {
      const created = map.createLayer(layer.name, tilesets);
      if (layer.name === PROPS_LAYER && created instanceof Phaser.Tilemaps.TilemapLayer) this.propsLayer = created;
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setRoundPixels(true);
    this.gameMap = parseTiledMap(raw, { tileSize: TILE_SIZE });
    const objects = parseWorldObjects(raw);
    const props = parseProps(raw);
    this.propTiles = props.tiles;
    this.props = new Map(props.props.map((p) => [p.id, p]));
    this.world = { grid: this.gameMap.collision, portals: objects.portals };
    this.vendors = objects.vendors;
    this.portals = objects.portals;
    this.info = parseWorldInfo(raw);
    this.arena = arenaRect(this.info);
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
    const view = new PlayerView(this, player.classId, isSelf, player.palette);
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
    const boss = isEnemyKind(enemy.kind) && ENEMIES[enemy.kind].rank !== "normal";
    this.enemies.set(id, new EnemyView(this, enemy.kind, enemy.elite, boss));
  }

  private removeEnemy(id: string) {
    this.enemies.get(id)?.destroy();
    this.enemies.delete(id);
  }

  private addPickup(pickup: Pickup, id: string) {
    if (this.pickups.has(id)) return;
    const texture = pickup.kind === "heart" ? TEX_HEART : rupeeTexture(pickup.value);
    const image = this.add.image(pickup.x, pickup.y, texture).setDepth(8);
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

  // ─── Tall grass and pots ──────────────────────────────────────────────────

  /** Shows a prop broken (bits fly off it if the hero can see it) or whole again. */
  private setPropBroken(id: number, broken: boolean) {
    const prop = this.props.get(id);
    const tiles = prop && this.propTiles[prop.kind];
    if (!prop || !tiles || !this.propsLayer) return;
    const tx = Math.floor(prop.x / TILE_SIZE);
    const ty = Math.floor(prop.y / TILE_SIZE);
    this.propsLayer.putTileAt(broken ? tiles.broken : tiles.whole, tx, ty);
    if (!broken || this.time.now < this.quietPropsUntil || !this.cameras.main.worldView.contains(prop.x, prop.y))
      return;
    const pot = prop.kind === "pot";
    this.sfx(pot ? SFX_BREAK : SFX_CUT, { volume: pot ? 0.8 : 0.6 }, 40, "props");
    // Bits fly out (over what dropped, under the heroes) and fade at the end of their flight.
    for (let i = 0; i < (pot ? 6 : 7); i++) {
      const angle = ((i + Math.random() * 0.6) / (pot ? 6 : 7)) * Math.PI * 2;
      const dist = 10 + Math.random() * 10;
      const bit = this.add
        .image(prop.x, prop.y - 3, pot ? TEX_SHARD : TEX_LEAF)
        .setDepth(9.5)
        .setAngle(Math.random() * 360);
      this.tweens.add({
        targets: bit,
        x: prop.x + Math.cos(angle) * dist,
        y: prop.y - 3 + Math.sin(angle) * dist * 0.7 + (pot ? 4 : 0),
        angle: bit.angle + (Math.random() < 0.5 ? -1 : 1) * 240,
        alpha: { value: 0, ease: "Cubic.easeIn" },
        duration: 480 + Math.random() * 220,
        ease: "Quad.easeOut",
        onComplete: () => bit.destroy(),
      });
    }
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
      // Bots all arrive when the match starts and leave when it ends: no toast for each one.
      if (id !== room.sessionId && !entry.bot) {
        ui.toast(t("toast.joined", { name: entry.name }));
        audio.playSfx(SFX_JOIN, { rate: 0.95 + Math.random() * 0.1 });
      }
      refresh();
    });
    callbacks.onRemove("roster", (entry: RosterEntry, id: string) => {
      known.delete(id);
      if (id !== room.sessionId && !entry.bot) ui.toast(t("toast.left", { name: entry.name }));
      refresh();
    });
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  /** Follows (x, y) inside the arena; flip-screen everywhere else. */
  private updateCamera(x: number, y: number) {
    const cam = this.cameras.main;
    const { arena } = this;
    if (arena && inRect(arena, x, y)) {
      if (this.cameraMode !== "arena") {
        this.cameraMode = "arena";
        cam.panEffect.reset();
        cam.setBounds(arena.x, arena.y, arena.width, arena.height);
        this.screenKey = "";
      }
      cam.centerOn(x, y);
      return;
    }
    if (this.cameraMode === "arena") {
      this.cameraMode = "screens";
      cam.setBounds(0, 0, this.gameMap.pixelWidth, this.gameMap.pixelHeight);
    }
    this.lookAtScreen(x, y, true);
  }

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

  // ─── Bosses and areas ─────────────────────────────────────────────────────

  /** Health of the boss or mini-boss on the hero's screen, if any. */
  private updateBossBar(x: number, y: number) {
    const { col, row } = screenOf(x, y);
    let found: Enemy | undefined;
    for (const enemy of this.ctx.room.state.enemies.values()) {
      if (!isEnemyKind(enemy.kind) || ENEMIES[enemy.kind].rank === "normal") continue;
      const at = screenOf(enemy.x, enemy.y);
      if (at.col === col && at.row === row) found = enemy;
    }
    this.bossBar?.update(
      found && isEnemyKind(found.kind)
        ? {
            name: this.ctx.t(`enemy.${found.kind}`),
            hp: found.hp,
            maxHp: found.maxHp,
            mini: ENEMIES[found.kind].rank === "miniboss",
          }
        : undefined,
    );
  }

  /** Names a dungeon when the hero walks in. */
  private announceArea(x: number, y: number) {
    const { col, row } = screenOf(x, y);
    const area = areaAt(this.info.areas, col, row);
    const id = area?.id ?? "";
    if (id === this.areaId) return;
    this.areaId = id;
    if (area?.kind === "dungeon") this.ctx.ui.toast(this.ctx.t(`dungeon.${area.id}`), 3000);
  }

  // ─── The match ────────────────────────────────────────────────────────────

  /** Toasts and sounds when the phase changes, and a warning a minute before PvP and the arena. */
  private watchPhase() {
    const { phase, clock, phaseEnds } = this.ctx.room.state;
    const { ui, t, audio } = this.ctx;
    if (phase !== this.lastPhase) {
      const was = this.lastPhase;
      this.lastPhase = phase;
      if (phase === MatchPhase.calm) {
        ui.toast(t("toast.matchStart"), 5000);
        this.warned.clear();
        this.summary?.hide();
        // The countdown to PvP, big in the middle first (it then slides to its corner).
        if (was === MatchPhase.starting) this.match?.intro();
      } else if (phase === MatchPhase.pvp) ui.toast(t("toast.pvpOn"), 6000);
      else if (phase === MatchPhase.prep) ui.toast(t("toast.arena"), 4000);
      else if (phase === MatchPhase.arena) ui.toast(t("toast.fight"), 2000);
      else if (phase === MatchPhase.lobby && was === MatchPhase.ended) {
        ui.toast(t("toast.lobby"), 5000);
        // The waiting room panel takes its place.
        this.summary?.hide();
      }
      // No sound for a countdown that got cancelled or started.
      if (phase === MatchPhase.ended && this.ctx.room.state.winner === this.ctx.room.sessionId) audio.playSfx(SFX_WIN);
      else if (was >= 0 && phase !== MatchPhase.lobby && phase !== MatchPhase.starting)
        audio.playSfx(SFX_UI, { rate: phase === MatchPhase.ended ? 0.7 : 1 });
    }
    if (
      (phase === MatchPhase.calm || phase === MatchPhase.pvp) &&
      phaseEnds - clock === 60 &&
      !this.warned.has(phase)
    ) {
      this.warned.add(phase);
      ui.toast(t(phase === MatchPhase.calm ? "toast.pvpSoon" : "toast.arenaSoon"), 4000);
    }
  }

  /** Waiting room: ready / not ready (button, R key or Start). */
  private toggleReady() {
    const { room } = this.ctx;
    const self = room.state.players.get(room.sessionId);
    if (!self || !isLobbyPhase(room.state.phase)) return;
    const message: ReadyMessage = { ready: !self.ready };
    room.send(Msg.ready, message);
    this.ctx.audio.playSfx(SFX_UI);
  }

  /** Waiting room: whether bots fill the next match (anyone can switch it; everyone sees the change). */
  private toggleBots() {
    const { room } = this.ctx;
    if (!isLobbyPhase(room.state.phase)) return;
    const message: BotsMessage = { on: !room.state.bots };
    room.send(Msg.bots, message);
    this.ctx.audio.playSfx(SFX_UI);
  }

  /**
   * Plays a sound effect with a slight random pitch. With `gapMs`, at most once
   * per that many ms on `channel` (a busy fight would otherwise be noise).
   */
  private sfx(key: string, options: SfxOptions = {}, gapMs = 0, channel = key) {
    const now = this.time.now;
    if (gapMs > 0 && now - (this.sfxAt.get(channel) ?? Number.NEGATIVE_INFINITY) < gapMs) return;
    this.sfxAt.set(channel, now);
    this.ctx.audio.playSfx(key, { ...options, rate: (options.rate ?? 1) * (0.95 + Math.random() * 0.1) });
  }

  /** The own hero got hurt: a sound and a camera shake as strong as the blow. */
  private watchHealth(self: Player) {
    const drop = this.lastHp - self.hp;
    this.lastHp = self.hp;
    if (drop <= 0.5 || self.dead || self.maxHp <= 0) return;
    this.sfx(SFX_HURT, {}, 80);
    this.cameras.main.shake(140, Math.min(0.012, 0.003 + (drop / self.maxHp) * 0.04));
  }

  /** Who is in the waiting room, and who is ready (the roster reaches everyone, unlike the AoI-filtered players). */
  private lobbyEntries(): LobbyEntry[] {
    return [...this.ctx.room.state.roster.entries()]
      .filter(([, r]) => !r.bot)
      .map(([id, r]) => ({
        id,
        name: r.name,
        ready: r.ready,
        away: r.away,
        wins: r.wins,
      }));
  }

  /** The storm: a red tint outside the safe zone, redrawn only when the radius changes. */
  private drawZone() {
    const g = this.zone;
    const { arena } = this;
    const { phase, zone } = this.ctx.room.state;
    // During the countdown and the fight, and on the results of a match decided in the arena.
    const show =
      Boolean(arena) &&
      (phase === MatchPhase.prep || phase === MatchPhase.arena || (phase === MatchPhase.ended && zone > 0));
    const key = show ? zone : -1;
    if (!g || key === this.zoneDrawn) return;
    this.zoneDrawn = key;
    g.clear();
    if (!show || !arena) return;
    // A ring from the zone's edge to past the arena corners, as side-by-side
    // triangles (they never overlap, so the tint stays even).
    const cx = arena.centerX;
    const cy = arena.centerY;
    const inner = Math.max(0, zone);
    const outer = Math.max(inner, Math.hypot(arena.width, arena.height) / 2) + 16;
    const point = (r: number, i: number) => {
      const a = (i / ZONE_SEGMENTS) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    };
    g.fillStyle(0xb01848, 0.32);
    for (let i = 0; i < ZONE_SEGMENTS; i++) {
      const [ix0, iy0] = point(inner, i);
      const [ix1, iy1] = point(inner, i + 1);
      const [ox0, oy0] = point(outer, i);
      const [ox1, oy1] = point(outer, i + 1);
      g.fillTriangle(ix0, iy0, ox0, oy0, ox1, oy1);
      if (inner > 0) g.fillTriangle(ix0, iy0, ox1, oy1, ix1, iy1);
    }
    if (inner > 0) {
      g.lineStyle(1, 0xffc8dc, 0.9);
      g.strokeCircle(cx, cy, inner);
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
    const attackPressed = input.wasPressed(ACTION_ATTACK);
    if (attackPressed) this.attackQueued = true;
    if (input.wasPressed(ACTION_READY)) this.toggleReady();

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
          this.sfx(SFX_SHOOT, { volume: 0.5 }, 60);
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

    const pvp = isPvpPhase(room.state.phase);
    for (const [id, player] of room.state.players) {
      const view = this.players.get(id);
      if (!view) continue;
      const isSelf = id === room.sessionId;
      // Out of the match: gone until the next one.
      view.setVisible(!player.out);
      if (player.out) {
        this.labels?.removeName(id);
        continue;
      }
      const state = isSelf && sim ? sim : player;
      const x = predict.value(player, "x");
      const y = predict.value(player, "y");
      this.labels?.name(id, player.name, x, y - 9, isSelf, pvp && !isSelf);
      view.update(x, y, { facing: state.facing, dead: state.dead, invuln: player.invuln }, time);
      // Own swings come from prediction (instant feedback); others' from the server.
      if (state.swing !== this.lastSwing.get(id)) {
        this.lastSwing.set(id, state.swing);
        view.playSwing(state.facing, statsFor(isClassId(player.classId) ? player.classId : "knight", 1).reach);
        if (isSelf) this.sfx(SFX_SWING, { volume: 0.7 });
        else if (this.cameras.main.worldView.contains(x, y)) this.sfx(SFX_SWING, { volume: 0.25 }, 90, "swing:others");
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

    this.watchPhase();
    this.drawZone();
    const { state } = room;
    const entries = this.lobbyEntries();
    this.lobby?.update(isLobbyPhase(state.phase), entries, room.sessionId, state.bots);
    if (self) {
      if (this.lastHp >= 0) this.watchHealth(self);
      else this.lastHp = self.hp;
      const x = predict.value(self, "x");
      const y = predict.value(self, "y");
      // Out of the match: the server keeps us next to the hero we watch; attack switches to the next one.
      const watched = self.out ? state.players.get(self.watch) : undefined;
      if (self.out && attackPressed) room.send(Msg.watchNext);
      const focusX = watched ? predict.value(watched, "x") : x;
      const focusY = watched ? predict.value(watched, "y") : y;
      this.updateCamera(focusX, focusY);
      if (this.minimap) this.minimap.el.hidden = this.cameraMode === "arena";
      this.updateShopCards(x, y);
      this.minimap?.update(x, y, time);
      this.updateBossBar(x, y);
      this.announceArea(x, y);
      this.status?.update(self);
      const outsideZone =
        state.phase === MatchPhase.arena &&
        !self.dead &&
        this.arena !== undefined &&
        Math.hypot(x - this.arena.centerX, y - this.arena.centerY) > state.zone;
      this.match?.update(
        {
          phase: state.phase,
          clock: state.clock,
          phaseEnds: state.phaseEnds,
          alive: state.alive,
          winner: state.winner,
          winnerName: state.winnerName,
          // Like the server: players whose connection dropped aren't waited for.
          ready: entries.filter((e) => e.ready && !e.away).length,
          total: entries.filter((e) => !e.away).length,
        },
        { id: room.sessionId, outsideZone, out: self.out, watching: watched?.name, place: self.place },
      );
    }
  }
}

/** Quantizes an analog axis to the -1|0|1 the server accepts (8-way movement). */
function toAxis(v: number): -1 | 0 | 1 {
  return v > AXIS_THRESHOLD ? 1 : v < -AXIS_THRESHOLD ? -1 : 0;
}
