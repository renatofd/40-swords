import type { Room } from "@colyseus/sdk";
import {
  type ChatBroadcast,
  CoreMessage,
  DEFAULT_MAX_CHAT_LENGTH,
  DEFAULT_MAX_NAME_LENGTH,
  sanitizeName,
} from "@core/shared";
import Phaser from "phaser";
import { AudioManager } from "./audio/AudioManager";
import type { BeforeJoinContext, GameContext, GameModule, JoinChoice, MatchResult } from "./GameModule";
import { detectLocale, I18n } from "./i18n";
import { InputManager, isTouchDevice } from "./input";
import { JoinError, joinRoom } from "./net/session";
import { computeZoom, createPhaserConfig } from "./phaserConfig";
import { createPlatform, type Platform } from "./platform";
import { BOOT_SCENE_KEY, BootScene, type BootSceneData } from "./scenes/BootScene";
import { Storage } from "./storage";
import { h, isTextField } from "./ui/dom";
import {
  formatStats,
  hudView,
  loadingScreen,
  menuScreen,
  messageScreen,
  resultScreen,
  settingsScreen,
} from "./ui/screens";
import { type ScreenRender, Ui } from "./ui/Ui";
import { Chat, PlayerList, Scoreboard, Toasts } from "./ui/widgets";
import "./ui/ui.css";

const DEFAULT_RESOLUTION = { width: 640, height: 360 };

/**
 * Boots a game on top of the template core. Call once from the app entrypoint:
 *
 *   startClient(arenaGame);
 */
export async function startClient<State>(game: GameModule<State>): Promise<void> {
  const app = new ClientApp(game);
  try {
    await app.start();
  } catch (err) {
    app.showStartupError();
    throw err;
  }
}

class ClientApp<State> {
  private storage: Storage;
  private i18n: I18n;
  private platform!: Platform;
  private ui!: Ui;
  private input!: InputManager;
  private phaser!: Phaser.Game;
  private resolution: { width: number; height: number };

  /** The running match's room. Handlers of older rooms compare against it and ignore themselves. */
  private room?: Room<unknown, State>;
  /** Bumped on every join and on cancel, so a join that finishes too late is discarded. */
  private joinAttempt = 0;
  /** The game's `beforeJoin` choice for the current or last match (reused by "Try again"). */
  private choice: JoinChoice = {};
  /** Set while the game's `beforeJoin` screen is up; aborting it returns to the menu. */
  private preJoin?: AbortController;
  /** True between a connection drop and the reconnect (or the final leave). */
  private reconnecting = false;
  private playerName = "";
  private gameHud = h("div", { className: "ui-game-hud" });
  private statsEl = h("div", { className: "ui-hud-stats", "aria-hidden": "true" });
  private statsTimer?: number;
  private audio!: AudioManager;
  private toasts = new Toasts();
  private scoreboard!: Scoreboard;
  private playerList!: PlayerList;
  private chat!: Chat;

  constructor(private readonly game: GameModule<State>) {
    this.storage = new Storage(`${game.id}:`);
    this.i18n = new I18n(game.messages);
    this.resolution = game.resolution ?? DEFAULT_RESOLUTION;
  }

  async start() {
    // Show the loading screen right away: the platform SDK can take seconds to load.
    // The platform's language is only known afterwards, so the locale may change once more.
    const saved = this.storage.get("locale");
    this.i18n.setLocale(detectLocale({ saved, browser: navigator.languages }));
    this.ui = new Ui(document.body, this.i18n);
    this.ui.show(() => loadingScreen(this.i18n, 0));

    this.platform = await createPlatform();
    const locale = detectLocale({ saved, platform: this.platform.getLanguage(), browser: navigator.languages });
    if (locale !== this.i18n.locale) this.i18n.setLocale(locale);
    // Keep platform overlays (ads, leaderboards) in the player's language, including a saved choice.
    this.platform.setLanguage(this.i18n.locale);

    // Colyseus debug panel (latency/jitter simulator, state inspector) with ?debug in the URL.
    if (new URLSearchParams(location.search).has("debug")) {
      await import("@colyseus/sdk/debug");
    }

    this.scoreboard = new Scoreboard(this.i18n);
    this.playerList = new PlayerList(this.i18n);
    this.chat = new Chat(this.i18n, DEFAULT_MAX_CHAT_LENGTH);
    this.input = new InputManager(this.ui.root, this.game.actions ?? [], this.i18n.t);
    this.i18n.onChange((locale) => {
      this.input.refreshLabels();
      this.platform.setLanguage(locale);
    });
    this.platform.onPauseChange((paused) => this.onPlatformPause(paused));
    this.playerName = this.storage.get("name") ?? this.platform.getPlayerName() ?? "";

    this.phaser = new Phaser.Game(createPhaserConfig(this.resolution, [], this.game.backgroundColor));
    this.phaser.events.on(Phaser.Core.Events.PRE_STEP, () => this.input.update());
    this.audio = new AudioManager(this.phaser.sound, this.storage);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onGlobalKey);
    window.addEventListener("keyup", this.onGlobalKeyUp);
    this.onResize();

    await new Promise<void>((resolve) => this.phaser.events.once(Phaser.Core.Events.READY, () => resolve()));
    for (const scene of this.game.scenes) this.phaser.scene.add("", scene, false);
    this.phaser.scene.add(BOOT_SCENE_KEY, BootScene, false);

    const boot: BootSceneData = {
      preload: (scene) => this.game.preload(scene),
      onProgress: (p) => this.ui.show(() => loadingScreen(this.i18n, p)),
      onComplete: () => this.showMenu(),
    };
    this.phaser.scene.start(BOOT_SCENE_KEY, boot);
  }

  /** Last-resort screen when start() fails (called by startClient). */
  showStartupError() {
    if (!this.ui) {
      document.body.textContent = this.i18n.t("error.startFailed");
      return;
    }
    this.ui.hideHud();
    this.ui.show(() =>
      messageScreen({
        title: this.i18n.t("error.title"),
        body: this.i18n.t("error.startFailed"),
        actions: [{ label: this.i18n.t("action.reload"), onClick: () => location.reload(), primary: true }],
      }),
    );
  }

  // ─── Screens ──────────────────────────────────────────────────────────────

  private showMenu() {
    this.ui.hideHud();
    if (this.game.menuMusic) this.audio.playMusic(this.game.menuMusic);
    this.ui.show(() =>
      menuScreen(this.i18n, {
        title: this.game.title,
        name: this.playerName,
        maxNameLength: this.game.maxNameLength ?? DEFAULT_MAX_NAME_LENGTH,
        canFullscreen: canFullscreen(),
        onNameInput: (name) => {
          this.playerName = name;
        },
        onPlay: () => void this.play(),
        onLocale: (locale) => {
          this.storage.set("locale", locale);
          this.i18n.setLocale(locale);
        },
        onFullscreen: toggleFullscreen,
        onSettings: () => this.showSettings(() => this.showMenu()),
        footer: `build ${import.meta.env.VITE_BUILD_ID ?? "dev"}`,
      }),
    );
  }

  private showSettings(back: () => void) {
    this.ui.show(() =>
      settingsScreen(this.i18n, {
        ...this.audio.current,
        onMusic: (music) => this.audio.update({ music }),
        onSfx: (sfx) => {
          this.audio.update({ sfx });
          this.audio.playSfx(this.game.uiSound ?? "", { volume: 0.8 });
        },
        onMuted: (muted) => this.audio.update({ muted }),
        onLocale: (locale) => {
          this.storage.set("locale", locale);
          this.i18n.setLocale(locale);
        },
        onBack: back,
      }),
    );
  }

  private showError(title: string, body: string, retry = true) {
    this.ui.show(() =>
      messageScreen({
        title,
        body,
        actions: [
          ...(retry
            ? [{ label: this.i18n.t("action.retry"), onClick: () => void this.join(this.choice), primary: true }]
            : []),
          { label: this.i18n.t("action.backToMenu"), onClick: () => this.showMenu() },
        ],
      }),
    );
  }

  private showPauseMenu() {
    this.input.setActive(false);
    this.ui.show(() =>
      messageScreen({
        title: this.i18n.t("pause.title"),
        body: this.game.title,
        actions: [
          { label: this.i18n.t("action.resume"), onClick: () => this.resume(), primary: true },
          { label: `⚙ ${this.i18n.t("menu.settings")}`, onClick: () => this.showSettings(() => this.showPauseMenu()) },
          { label: this.i18n.t("action.leave"), onClick: () => this.exitToMenu() },
        ],
      }),
    );
  }

  /** Kept as one function so onReconnect can tell whether it is still the screen showing. */
  private reconnectScreen: ScreenRender = () =>
    messageScreen({
      body: this.i18n.t("reconnecting"),
      busy: true,
      actions: [{ label: this.i18n.t("action.leave"), onClick: () => this.exitToMenu() }],
    });

  /** Platform pause (e.g. an ad is playing): mute and release input; the match itself keeps running. */
  private onPlatformPause(paused: boolean) {
    this.audio.setPlatformPaused(paused);
    if (paused) this.input.setActive(false);
    else if (this.room && !this.ui.isScreenOpen) this.input.setActive(true);
  }

  private resume() {
    this.ui.hide();
    this.input.setActive(true);
  }

  // ─── Match lifecycle ──────────────────────────────────────────────────────

  /** The sanitized name to join with (saved for next time), or a guest name. */
  private joinName(): string {
    const maxLength = this.game.maxNameLength ?? DEFAULT_MAX_NAME_LENGTH;
    this.playerName = sanitizeName(this.playerName, "", maxLength);
    if (this.playerName) this.storage.set("name", this.playerName);
    return this.playerName || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  }

  /** Play / Play again: the game's `beforeJoin` step, if it has one, then join. */
  private async play() {
    const beforeJoin = this.game.beforeJoin;
    if (!beforeJoin) return this.join({});

    const attempt = ++this.joinAttempt;
    const controller = new AbortController();
    this.preJoin?.abort();
    this.preJoin = controller;
    const ctx: BeforeJoinContext = {
      t: this.i18n.t,
      name: this.joinName(),
      show: (render) => {
        if (!controller.signal.aborted) this.ui.show(render);
      },
      audio: this.audio,
      platform: this.platform,
      storage: this.storage,
      signal: controller.signal,
    };
    let choice: JoinChoice | null = null;
    try {
      choice = await beforeJoin(ctx);
    } catch (err) {
      console.error(err);
    }
    if (this.preJoin === controller) this.preJoin = undefined;
    if (attempt !== this.joinAttempt || controller.signal.aborted) return; // left meanwhile
    if (!choice) {
      this.showMenu();
      return;
    }
    await this.join(choice);
  }

  /** Esc on the `beforeJoin` screen: back to the menu. */
  private cancelPreJoin() {
    this.preJoin?.abort();
    this.preJoin = undefined;
    this.joinAttempt++;
    this.showMenu();
  }

  /** Connects to the room the choice names (or the game's default room). */
  private async join(choice: JoinChoice) {
    this.choice = choice;
    const name = this.joinName();
    const attempt = ++this.joinAttempt;
    this.ui.show(() =>
      messageScreen({
        body: this.i18n.t("connecting"),
        busy: true,
        actions: [
          {
            label: this.i18n.t("action.backToMenu"),
            onClick: () => {
              this.joinAttempt++;
              this.showMenu();
            },
          },
        ],
      }),
    );
    let room: Room<unknown, State>;
    try {
      room = await joinRoom<State>({
        roomName: choice.roomName ?? this.game.roomName,
        gameProtocolVersion: this.game.protocolVersion,
        rootSchema: this.game.rootSchema,
        options: {
          ...this.game.joinOptions?.(),
          ...choice.options,
          // Core options last: a game can't replace the name, locale or account.
          name,
          locale: this.i18n.locale,
          auth: this.platform.getAuthPayload(),
        },
      });
    } catch (err) {
      if (attempt !== this.joinAttempt) return; // cancelled from the connecting screen
      console.error(err);
      const reason = err instanceof JoinError ? err.reason : "unreachable";
      if (reason === "version-mismatch") {
        this.ui.show(() =>
          messageScreen({
            title: this.i18n.t("error.versionTitle"),
            body: this.i18n.t("error.versionBody"),
            actions: [{ label: this.i18n.t("action.reload"), onClick: () => location.reload(), primary: true }],
          }),
        );
      } else if (reason === "auth-failed") {
        this.showError(this.i18n.t("error.title"), this.i18n.t("error.authFailed"));
      } else {
        this.showError(this.i18n.t("error.title"), this.i18n.t("error.unreachable"));
      }
      return;
    }
    if (attempt !== this.joinAttempt) {
      // The player went back to the menu while we were connecting.
      room.leave().catch(() => {});
      return;
    }

    this.room = room;
    this.startMatch(room);
  }

  private startMatch(room: Room<unknown, State>) {
    this.reconnecting = false;
    // The SDK only auto-reconnects rooms that have been up this long (default 5s), to avoid
    // reconnect loops. 1s still prevents loops and covers drops right after joining.
    room.reconnection.minUptime = 1000;

    // Every handler checks `room === this.room`: a room we already left can still be
    // reconnecting in the background and must not touch the current screen or match.
    room.onDrop(() => {
      if (room !== this.room) return;
      this.reconnecting = true;
      this.input.setActive(false);
      this.ui.show(this.reconnectScreen);
    });
    room.onReconnect(() => {
      if (room !== this.room) {
        // We left while the socket was down, so that leave never reached the server.
        room.leave().catch(() => {});
        return;
      }
      this.reconnecting = false;
      // Don't close a screen the player opened meanwhile.
      if (this.ui.isShowing(this.reconnectScreen)) this.resume();
    });
    room.onLeave(() => {
      if (room !== this.room) return; // left on purpose (stopMatch clears this.room first)
      this.stopMatch();
      this.showError(this.i18n.t("error.title"), this.i18n.t("error.disconnected"));
    });

    const chatEnabled = this.game.chat !== false;
    if (chatEnabled) {
      room.onMessage(CoreMessage.chat, (m: ChatBroadcast) => {
        if (room === this.room) this.chat.add({ name: m.name, text: m.text });
      });
      room.onMessage(CoreMessage.chatRejected, () => {
        if (room === this.room) this.chat.addSystem(this.i18n.t("chat.slowDown"));
      });
      this.chat.onSend = (text) => room.send(CoreMessage.chat, text);
    }

    this.gameHud.replaceChildren();
    this.toasts.clear();
    this.chat.clear();
    this.scoreboard.hide();
    this.playerList.clear();
    this.ui.showHud(() =>
      hudView(
        this.i18n,
        {
          onMenu: () => this.showPauseMenu(),
          canFullscreen: canFullscreen() && isTouchDevice(),
          onFullscreen: toggleFullscreen,
          touch: isTouchDevice(),
          onChat: () => this.openChat(),
          onPlayers: () => this.playerList.toggle(),
          widgets: [this.toasts.el, this.scoreboard.el, ...(chatEnabled ? [this.chat.el] : []), this.playerList.el],
          gameHud: this.gameHud,
        },
        this.statsEl,
      ),
    );
    this.statsTimer = window.setInterval(() => {
      this.statsEl.textContent = formatStats(this.i18n, {
        ping: Math.round(room.clock.smoothedRtt()),
        fps: Math.round(this.phaser.loop.actualFps),
      });
    }, 500);

    const ctx: GameContext<State> = {
      room,
      input: this.input,
      t: this.i18n.t,
      platform: this.platform,
      hud: this.gameHud,
      audio: this.audio,
      ui: {
        toast: (text, durationMs) => this.toasts.show(text, durationMs),
        setScores: (rows, selfId) => {
          this.scoreboard.update(rows, selfId);
          this.playerList.update(rows, selfId);
        },
        chat: { addSystem: (text) => this.chat.addSystem(text) },
      },
      endMatch: (result) => this.endMatch(result),
      exitToMenu: () => this.exitToMenu(),
    };

    // Dev-only hook for end-to-end tests and console debugging (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = { room, locale: this.i18n.locale };

    this.ui.hide();
    this.input.setActive(true);
    this.platform.gameplayStart();
    this.phaser.scene.start(this.game.gameSceneKey, ctx);
  }

  /** Leaves the room (if any) and tears down the running match. */
  private stopMatch() {
    this.reconnecting = false;
    this.input.setActive(false);
    window.clearInterval(this.statsTimer);
    this.chat.clear();
    this.chat.onSend = undefined;
    this.playerList.setOpen(false);
    this.ui.hideHud();
    this.platform.gameplayStop();
    // Also shuts down a paused or sleeping scene; already shut down scenes are ignored.
    this.phaser.scene.stop(this.game.gameSceneKey);
    const room = this.room;
    this.room = undefined;
    if (!room) return;
    // If the socket is down, leave() can't reach the server: make pending reconnect
    // attempts give up instead of retrying (a late success is left in onReconnect).
    room.reconnection.maxRetries = 0;
    room.leave().catch(() => {});
  }

  private endMatch(result: MatchResult = {}) {
    this.stopMatch();
    this.ui.show(() =>
      resultScreen(this.i18n, result.title, result.rows ?? [], [
        { label: this.i18n.t("action.playAgain"), onClick: () => void this.play(), primary: true },
        { label: this.i18n.t("action.backToMenu"), onClick: () => this.showMenu() },
      ]),
    );
  }

  private exitToMenu() {
    this.stopMatch();
    this.showMenu();
  }

  // ─── Window events ────────────────────────────────────────────────────────

  private onResize = () => {
    this.phaser?.scale.setZoom(computeZoom(this.resolution));
    const wanted = this.game.orientation ?? "landscape";
    // Prefer the screen orientation: the window shrinks when the on-screen keyboard opens.
    const type = screen.orientation?.type;
    const portrait = type ? type.startsWith("portrait") : window.innerHeight > window.innerWidth;
    const wrong = wanted !== "any" && isTouchDevice() && (wanted === "landscape" ? portrait : !portrait);
    this.ui?.setRotateHint(wrong);
  };

  private openChat() {
    if (!this.room || this.game.chat === false || this.ui.isScreenOpen) return;
    this.input.reset();
    this.chat.open();
  }

  private onGlobalKey = (e: KeyboardEvent) => {
    if (isTextField(e.target)) return;
    if (e.code === "Escape" && this.preJoin) {
      this.cancelPreJoin();
      return;
    }
    if (!this.room) return;
    if (e.code === "Escape") {
      if (this.reconnecting) return; // the reconnect screen closes itself
      if (this.ui.isScreenOpen) this.resume();
      else this.showPauseMenu();
    } else if (e.code === "Enter" && !this.ui.isScreenOpen) {
      e.preventDefault();
      this.openChat();
    } else if (e.code === "Tab" && !this.ui.isScreenOpen) {
      e.preventDefault();
      this.playerList.setOpen(true);
    }
  };

  private onGlobalKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Tab") this.playerList.setOpen(false);
  };
}

function canFullscreen(): boolean {
  return document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function";
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}
