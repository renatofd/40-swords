/**
 * Balance harness (stage 8B, docs/JOGO.md): one whole 40-hero match (1 idle player + 39 bots),
 * PvP at 5 min, arena at 30 min, run accelerated with direct `step()` calls. Skipped by
 * `pnpm check`; run it with
 *
 *   BALANCE=1 BALANCE_SEED=n pnpm --filter @game/server exec vitest run test/balance.test.ts
 *
 * (seeds 1-4 by default, one match each; run the seeds in parallel, each with its own
 * BALANCE_PORT). Each match appends one
 * JSONL row to BALANCE_OUT (default: <tmp>/balance.jsonl) and prints it. The room rng is
 * seeded right after the room is created, but the real simulation interval also steps while
 * the test awaits, so runs are seeded, not bit-reproducible: targets are judged on 3 of 4.
 */
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StepContext } from "@colyseus/core";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import { createGameServer } from "@core/server";
import { CORE_PROTOCOL_VERSION } from "@core/shared";
import {
  createRng,
  type Enemy,
  type KillMessage,
  MatchPhase,
  Msg,
  type Player,
  PROTOCOL_VERSION,
  type Rng,
  ROOM_WORLD,
  TICK_DT,
  TICK_RATE,
  type WorldState,
} from "@game/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rooms } from "../src";

vi.hoisted(() => {
  delete process.env.MATCH_PVP_SECONDS;
  delete process.env.MATCH_ARENA_SECONDS;
});

const appConfig = createGameServer({ rooms, protocolVersion: PROTOCOL_VERSION });
const v = { core: CORE_PROTOCOL_VERSION, game: PROTOCOL_VERSION };
const SEEDS = (process.env.BALANCE_SEED ?? "1,2,3,4").split(",").map(Number);
const OUT = process.env.BALANCE_OUT ?? join(tmpdir(), "balance.jsonl");
/** BALANCE_STOP: stop the match after this many seconds (quick looks at the start); default the whole match. */
const STOP_AT = Number(process.env.BALANCE_STOP ?? Number.POSITIVE_INFINITY);
/** Minutes at which the standing heroes are counted. */
const CHECKPOINTS = [5, 10, 15, 20, 30];

interface Brain {
  kind: string;
  tier: number;
  def: { rank: string };
}
interface Bot {
  mode: string;
  dodges?: number;
  isDodging?: (tick: number) => boolean;
}
interface RoomInternals {
  rng: Rng;
  tick: number;
  matchStart: number;
  bots: Map<string, Bot>;
  brains: Map<string, Brain>;
  screenIndexAt(x: number, y: number): number;
  /** Branch only: the kind of the monster that last hurt each hero. */
  lastMonsterHit?: Map<string, string>;
  step(ctx: StepContext): void;
  heroDown(id: string, player: Player, cause: KillMessage["cause"], killerId?: string): void;
  hurtPlayer(id: string, player: Player, raw: number, fromX: number, fromY: number, source?: string): void;
  killEnemy(enemyId: string, enemy: Enemy, brain: Brain, killerId: string, killer: Player): void;
}
const internals = (room: unknown) => room as RoomInternals;

describe.runIf(process.env.BALANCE === "1")("balance", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  beforeAll(async () => {
    // A port of its own (BALANCE_PORT) lets the seeds run in parallel (`boot` always takes 2568).
    const port = Number(process.env.BALANCE_PORT ?? 0);
    if (port > 0) {
      await appConfig.listen(port);
      colyseus = new ColyseusTestServer(appConfig);
    } else colyseus = await boot(appConfig);
  });
  afterAll(async () => {
    await colyseus.shutdown();
  });

  for (const seed of SEEDS) {
    it(`match, seed ${seed}`, { timeout: 1_800_000 }, async () => {
      await colyseus.cleanup();
      const room = await colyseus.createRoom<WorldState>(ROOM_WORLD, {});
      const r = internals(room);
      r.rng = createRng(seed);
      const client = await colyseus.connectTo(room, { v, name: "Ana", classId: "knight" });
      client.onMessage("*", () => {});

      // Who hurt each hero last: the room's own record on the branch, else (main) the
      // closest monster to where the blow came from.
      const lastHit = new Map<string, string>();
      let dodgeHits = 0;
      /** HP the heroes lost to monsters, by kind. */
      const hurtBy: Record<string, number> = {};
      let webs = 0;
      const hurt = r.hurtPlayer;
      r.hurtPlayer = function (this: unknown, ...args: Parameters<RoomInternals["hurtPlayer"]>) {
        const [id, player, , fromX, fromY, source] = args;
        const before = player.hp;
        hurt.apply(this, args);
        if (player.hp >= before) return;
        let kind = source ?? r.lastMonsterHit?.get(id);
        let tier = 0;
        if (!source) {
          let best = Number.POSITIVE_INFINITY;
          for (const [eid, e] of room.state.enemies) {
            const d = (e.x - fromX) ** 2 + (e.y - fromY) ** 2;
            if (d < best) [best, kind, tier] = [d, e.kind, r.brains.get(eid)?.tier ?? 0];
          }
        } else {
          let best = Number.POSITIVE_INFINITY;
          for (const [eid, e] of room.state.enemies) {
            const d = (e.x - fromX) ** 2 + (e.y - fromY) ** 2;
            if (e.kind === source && d < best) [best, tier] = [d, r.brains.get(eid)?.tier ?? 0];
          }
        }
        lastHit.set(id, `${kind}:t${tier}`);
        const k = kind ?? "?";
        hurtBy[k] = (hurtBy[k] ?? 0) + before - player.hp;
        if (r.bots.get(id)?.isDodging?.(r.tick)) dodgeHits++;
      };

      const causes: { t: number; cause: string; by?: string }[] = [];
      const heroDown = r.heroDown;
      r.heroDown = function (this: unknown, ...args: Parameters<RoomInternals["heroDown"]>) {
        const [id, , cause] = args;
        causes.push({ t: room.state.clock, cause, by: cause === "monster" ? lastHit.get(id) : undefined });
        heroDown.apply(this, args);
      };
      const bossKills: string[] = [];
      /** Monsters the heroes killed, by kind (where the XP comes from). */
      const kills: Record<string, number> = {};
      const kills90: Record<string, number> = {};
      /** Bots past level 1 after 90 s (bots.test checks more than a third). */
      let grown90 = -1;
      const killEnemy = r.killEnemy;
      r.killEnemy = function (this: unknown, ...args: Parameters<RoomInternals["killEnemy"]>) {
        const [, , brain] = args;
        if (brain.def.rank !== "normal") bossKills.push(`${brain.kind}@${room.state.clock}`);
        kills[brain.kind] = (kills[brain.kind] ?? 0) + 1;
        if (room.state.clock <= 90) kills90[brain.kind] = (kills90[brain.kind] ?? 0) + 1;
        killEnemy.apply(this, args);
      };

      client.send(Msg.ready, { ready: true });
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.starting));
      r.matchStart -= (room.state.phaseEnds - room.state.clock) * TICK_RATE;
      await vi.waitFor(() => expect(room.state.phase).toBe(MatchPhase.calm));

      const ctx = { dt: TICK_DT, dtMs: 1000 / TICK_RATE, tick: 0, subSteps: 1, subDt: TICK_DT } as StepContext;
      const bots = () => [...room.state.players.entries()].filter(([id]) => id.startsWith("bot:"));
      const last = new Map<string, { x: number; y: number; still: number }>();
      // Webs (branch only): a hero's `slow` going up from 0.
      const slowOf = (p: Player) => (p as Player & { slow?: number }).slow ?? 0;
      const slowed = new Map<string, number>();
      let longest = 0;
      // Stuck in a small area (two bots chasing each other across a border, a wall): no 32 px move.
      const anchor = new Map<string, { x: number; y: number; ticks: number }>();
      let longestArea = 0;
      let longestAreaAt = "";
      const checkpoints = [...CHECKPOINTS];
      const rows: Record<string, unknown>[] = [];
      const began = performance.now();
      let ticks = 0;
      while (room.state.phase !== MatchPhase.ended && ticks < 2000 * TICK_RATE && room.state.clock < STOP_AT) {
        r.step.call(room, ctx);
        ticks++;
        const phase = room.state.phase;
        if (phase === MatchPhase.calm || phase === MatchPhase.pvp || phase === MatchPhase.arena) {
          for (const [id, p] of bots()) {
            if (p.out || p.dead) continue;
            const prev = last.get(id);
            const still = prev && prev.x === p.x && prev.y === p.y ? prev.still + 1 : 0;
            longest = Math.max(longest, still);
            last.set(id, { x: p.x, y: p.y, still });
            const a = anchor.get(id);
            if (!a || Math.hypot(p.x - a.x, p.y - a.y) > 32) anchor.set(id, { x: p.x, y: p.y, ticks: 0 });
            else if (++a.ticks > longestArea) {
              longestArea = a.ticks;
              longestAreaAt = `${id}@${Math.round(room.state.clock)}:${Math.round(p.x)},${Math.round(p.y)}`;
            }
          }
        } else {
          last.clear();
          anchor.clear();
        }
        for (const [id, p] of room.state.players) {
          const s = slowOf(p);
          if (s > (slowed.get(id) ?? 0)) webs++;
          slowed.set(id, s);
        }
        if (grown90 < 0 && room.state.clock >= 90) grown90 = bots().filter(([, p]) => !p.out && p.level > 1).length;
        const c = checkpoints[0];
        if (c !== undefined && (room.state.clock >= c * 60 || (c === 30 && phase === MatchPhase.prep))) {
          checkpoints.shift();
          const standing = bots().filter(([, p]) => !p.out);
          const levels = standing.map(([, p]) => p.level).sort((a, b) => a - b);
          rows.push({
            min: c,
            alive: room.state.alive,
            levels: `${levels[0]}-${levels[levels.length - 1]}`,
            median: levels[Math.floor(levels.length / 2)],
            monsterDeaths: causes.filter((k) => k.cause === "monster").length,
            heroDeaths: causes.filter((k) => k.cause === "hero").length,
            screens: new Set(standing.map(([, p]) => r.screenIndexAt(p.x, p.y))).size,
            relics: standing.reduce((sum, [, p]) => sum + p.relics.length, 0),
          });
        }
      }
      const monster = causes.filter((k) => k.cause === "monster");
      const byKind: Record<string, number> = {};
      const byKindTier: Record<string, number> = {};
      for (const k of monster) {
        const by = k.by ?? "?:t0";
        byKindTier[by] = (byKindTier[by] ?? 0) + 1;
        const kind = by.split(":")[0] ?? "?";
        byKind[kind] = (byKind[kind] ?? 0) + 1;
      }
      const dodges = [...r.bots.values()].reduce((sum, b) => sum + (b.dodges ?? 0), 0);
      const out = {
        seed,
        rows,
        monsterDeaths: monster.length,
        monsterDeaths5min: monster.filter((k) => k.t <= 300).length,
        byKind,
        byKindTier,
        byKind5min: monster
          .filter((k) => k.t <= 300)
          .reduce<Record<string, number>>((acc, k) => {
            acc[k.by ?? "?"] = (acc[k.by ?? "?"] ?? 0) + 1;
            return acc;
          }, {}),
        bossKills,
        kills,
        grown90,
        kills90,
        hurtBy: Object.fromEntries(Object.entries(hurtBy).map(([k, hp]) => [k, Math.round(hp)])),
        dodges: { attempted: dodges, hit: dodgeHits },
        webs,
        storm: causes.filter((k) => k.cause === "storm").length,
        end: { phase: room.state.phase, winner: room.state.winnerName, clock: room.state.clock },
        longestStillSec: (longest / TICK_RATE).toFixed(1),
        longestAreaSec: (longestArea / TICK_RATE).toFixed(1),
        longestAreaAt,
        msPerTick: ((performance.now() - began) / ticks).toFixed(2),
      };
      console.info("balance", JSON.stringify(out));
      appendFileSync(OUT, `${JSON.stringify(out)}\n`);
      if (STOP_AT === Number.POSITIVE_INFINITY) expect(room.state.phase).toBe(MatchPhase.ended);
    });
  }
});
