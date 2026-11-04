import type { Room } from "@colyseus/sdk";
import type Phaser from "phaser";
import type { AudioManager } from "./audio/AudioManager";
import type { MessageCatalog, Translate } from "./i18n";
import type { ActionBinding, InputManager } from "./input";
import type { Platform } from "./platform";
import type { ResultRow } from "./ui/screens";
import type { ScoreRow } from "./ui/widgets";

/** A Colyseus schema class (e.g. `ArenaState`). */
// biome-ignore lint/suspicious/noExplicitAny: schema constructors take arbitrary init args.
export type SchemaClass<State> = new (...args: any[]) => State;

/**
 * Everything a game plugs into the template core. The core owns the page,
 * boot/loading, menus, connection, reconnection, errors, input devices and
 * i18n; the game owns its assets, scenes and rules.
 */
export interface GameModule<State = unknown> {
  /** Display name on the main menu (not translated). */
  title: string;
  /** Short id used for storage keys, e.g. "arena-demo". */
  id: string;

  /** The game's PROTOCOL_VERSION (from game/shared). */
  protocolVersion: number;
  /** Room type to join when the player presses Play. */
  roomName: string;
  /** Schema class of the room state. */
  rootSchema?: SchemaClass<State>;
  /** Extra join options sent to the server (core adds name, locale and versions). */
  joinOptions?: () => Record<string, unknown>;
  /**
   * Optional step between the menu's Play button and joining a room: pick a
   * character, a map, a team... Show your screen with `ctx.show(...)` and resolve
   * with the room to join and extra join options, or with null to go back to the
   * menu. Retrying a failed connection reuses the last choice; "Play again" runs
   * this step again.
   */
  beforeJoin?: (ctx: BeforeJoinContext) => Promise<JoinChoice | null>;

  /** Logical render size in pixels. The canvas is scaled up by whole numbers. Default 640x360. */
  resolution?: { width: number; height: number };
  /** Preferred orientation on phones; a "rotate your device" hint shows otherwise. Default "landscape". */
  orientation?: "landscape" | "portrait" | "any";
  /** Canvas background colour. */
  backgroundColor?: string;

  /** Loads every asset. Called once in the boot scene; progress is shown by the core. */
  preload(scene: Phaser.Scene): void;
  /** Phaser scenes of the game. They are registered but not started by Phaser itself. */
  scenes: Phaser.Types.Scenes.SceneType[];
  /** Key of the scene started when a match begins. It receives a GameContext in `init(data)`. */
  gameSceneKey: string;

  /** Actions besides movement, bound to keys, gamepad buttons and touch buttons. */
  actions?: ActionBinding[];
  /** Game strings. English required; other locales fall back to English per key. */
  messages?: MessageCatalog;
  /** Max display name length (grapheme clusters). Default 16. */
  maxNameLength?: number;

  /** Music key (content/audio/music/<key>.*) played on the main menu. */
  menuMusic?: string;
  /** Sfx key played as feedback when the sfx volume slider moves. */
  uiSound?: string;
  /** Show the chat UI (Enter to type). Default true. Set false if your rooms disable chat. */
  chat?: boolean;
}

/** What the `beforeJoin` step decided. */
export interface JoinChoice {
  /** Room type to join instead of `roomName` (e.g. one room per map). */
  roomName?: string;
  /** Extra join options, merged over `joinOptions()`. The server must validate them. */
  options?: Record<string, unknown>;
}

/** Handed to `GameModule.beforeJoin`. */
export interface BeforeJoinContext {
  t: Translate;
  /** The name the player joins with. */
  name: string;
  /**
   * Shows a full-screen panel in place of the menu (DOM, like every core screen).
   * `render` runs again when the language changes: keep the step's state outside it.
   */
  show(render: () => HTMLElement): void;
  audio: AudioManager;
  platform: Platform;
  /** Saved per game in this browser, e.g. the last character picked. */
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  /** Aborted when the player leaves the step another way (Esc goes back to the menu). */
  signal: AbortSignal;
}

export interface MatchResult {
  /** Title (already translated). Default: "Match over". */
  title?: string;
  /** Stats rows (already translated). */
  rows?: ResultRow[];
}

/** Core HUD widgets a game can drive. */
export interface GameUi {
  /** Short message at the top of the screen. */
  toast(text: string, durationMs?: number): void;
  /** Feeds the corner leaderboard (top 5 + own rank) and the Tab player list. */
  setScores(rows: ScoreRow[], selfId?: string): void;
  chat: {
    /** Adds a local system line to the chat log (not sent to anyone). */
    addSystem(text: string): void;
  };
}

/** Handed to the game scene in `init(data)` when a match starts. */
export interface GameContext<State = unknown> {
  room: Room<unknown, State>;
  input: InputManager;
  t: Translate;
  platform: Platform;
  /** Container for the game's own DOM HUD widgets (score, timer...). Cleared between matches. */
  hud: HTMLElement;
  /** Music and sound effects with the player's saved volumes. */
  audio: AudioManager;
  /** Toasts, scoreboard, player list and chat. */
  ui: GameUi;
  /** Ends the match: leaves the room and shows the result screen. */
  endMatch(result?: MatchResult): void;
  /** Leaves the room and returns to the main menu. */
  exitToMenu(): void;
}
