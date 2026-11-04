import type { GameModule } from "@core/client";
import { ArenaState, PROTOCOL_VERSION, ROOM_ARENA } from "@game/shared";
import { MUSIC_THEME, preloadAssets, SFX_UI } from "./assets";
import { messages } from "./messages";
import { GAME_SCENE_KEY, GameScene } from "./scenes/GameScene";
import { pickColor } from "./ui/pickColor";
import "./styles.css";

/** EXAMPLE GAME: everything the template core needs to run this game. */
export const game: GameModule<ArenaState> = {
  title: "Arena Demo",
  id: "arena-demo",
  protocolVersion: PROTOCOL_VERSION,
  roomName: ROOM_ARENA,
  rootSchema: ArenaState,
  // Shown between Play and joining; the picked colour goes in the join options.
  beforeJoin: pickColor,
  resolution: { width: 640, height: 360 },
  orientation: "landscape",
  preload: preloadAssets,
  scenes: [GameScene],
  gameSceneKey: GAME_SCENE_KEY,
  // Actions besides movement. The demo has none; a dash would look like
  // { id: "dash", keys: ["Space"], gamepadButtons: [0], touchLabel: "action.dash" },
  // read in the scene with ctx.input.isDown("dash").
  actions: [],
  messages,
  menuMusic: MUSIC_THEME,
  uiSound: SFX_UI,
};
