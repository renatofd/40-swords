import type { GameModule } from "@core/client";
import { PROTOCOL_VERSION, ROOM_WORLD, SCREEN_HEIGHT, SCREEN_WIDTH, WorldState } from "@game/shared";
import { MUSIC_THEME, preloadAssets, SFX_UI } from "./assets";
import { messages } from "./messages";
import { ACTION_ATTACK, GAME_SCENE_KEY, GameScene } from "./scenes/GameScene";
import "./styles.css";

/** 40 Swords: everything the template core needs to run this game. */
export const game: GameModule<WorldState> = {
  title: "40 Swords",
  id: "40-swords",
  protocolVersion: PROTOCOL_VERSION,
  roomName: ROOM_WORLD,
  rootSchema: WorldState,
  // Exactly one world screen; the canvas is scaled up by whole numbers.
  resolution: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  orientation: "landscape",
  backgroundColor: "#101018",
  preload: preloadAssets,
  scenes: [GameScene],
  gameSceneKey: GAME_SCENE_KEY,
  actions: [{ id: ACTION_ATTACK, keys: ["Space", "KeyJ"], gamepadButtons: [0, 2], touchLabel: "action.attack" }],
  messages,
  menuMusic: MUSIC_THEME,
  uiSound: SFX_UI,
};
