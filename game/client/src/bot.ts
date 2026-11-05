/**
 * Bot behaviour for tools/loadtest. Kept with the game because it sends this
 * game's inputs. Node-safe: must not import Phaser or the DOM.
 */
import { ColyseusSDK } from "@colyseus/sdk";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  CLASS_IDS,
  Msg,
  type PlayerInput,
  PROTOCOL_VERSION,
  ROOM_WORLD,
  type SpawnMessage,
  TICK_RATE,
  WorldState,
} from "@game/shared";

type Axis = -1 | 0 | 1;
const randomAxis = (): Axis => (Math.floor(Math.random() * 3) - 1) as Axis;

/** Room the load test joins by default (tools/loadtest). */
export const BOT_ROOM = ROOM_WORLD;

export interface BotOptions {
  endpoint: string;
  roomName?: string;
  name: string;
}

/** Joins, picks a random hero and wanders swinging its sword, one input per server tick. Returns a stop function. */
export async function runBot(options: BotOptions): Promise<() => void> {
  const client = new ColyseusSDK(options.endpoint);
  const room = await client.joinOrCreate<WorldState>(
    options.roomName || BOT_ROOM,
    { name: options.name, v: { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION } },
    WorldState,
  );
  const spawn: SpawnMessage = { classId: CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)] ?? "knight" };
  room.send(Msg.spawn, spawn);

  const input = room.input<PlayerInput>({ mode: "reliable" });
  let ticksUntilTurn = 0;
  const timer = setInterval(() => {
    if (ticksUntilTurn-- <= 0) {
      input.data.moveX = randomAxis();
      input.data.moveY = randomAxis();
      ticksUntilTurn = TICK_RATE * (1 + Math.random() * 2);
    }
    input.data.attack = Math.random() < 0.1 ? 1 : 0;
    input.send();
  }, 1000 / TICK_RATE);

  room.onLeave(() => clearInterval(timer));
  return () => {
    clearInterval(timer);
    void room.leave();
  };
}
