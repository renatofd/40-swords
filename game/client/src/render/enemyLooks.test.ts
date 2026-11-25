import { readFileSync } from "node:fs";
import { ACT_MOVE, ACT_STONE, ENEMIES, ENEMY_KINDS } from "@game/shared";
import { describe, expect, it } from "vitest";
import {
  type ActLook,
  actInfo,
  angleFacing,
  ENEMY_LOOKS,
  enemySkin,
  fitScale,
  goldRecolor,
  overlayFrame,
  SKINS,
  sideFlip,
  TICK_MS,
  tellDelayMs,
  tellOffset,
} from "./enemyLooks";

const tagsOf = (key: string): string[] => {
  const url = new URL(`../../../../content/sprites/${key}.json`, import.meta.url);
  const data = JSON.parse(readFileSync(url, "utf8")) as { meta: { frameTags: { name: string }[] } };
  return data.meta.frameTags.map((t) => t.name);
};

/** Every tag a look plays (directional sheets resolve `<tag>-<dir>`). */
function tagsUsed(kind: (typeof ENEMY_KINDS)[number]): string[] {
  const look = ENEMY_LOOKS[kind];
  const acts = [...look.acts, actInfo(kind, ACT_MOVE)?.look, actInfo(kind, ACT_STONE)?.look].filter((a): a is ActLook =>
    Boolean(a),
  );
  return [
    look.walk,
    look.idle,
    look.hurt,
    look.stun,
    look.rest?.tag,
    look.death?.tag,
    ...acts.flatMap((a) => [a.windup, a.action, a.recover, a.stunned?.tag, a.stunned?.next]),
  ].filter((t): t is string => Boolean(t));
}

describe("ENEMY_LOOKS", () => {
  it("has a look for every kind, with one act look per attack (wind-up and action set)", () => {
    for (const kind of ENEMY_KINDS) {
      const look = ENEMY_LOOKS[kind];
      expect(look, kind).toBeDefined();
      const { attacks } = ENEMIES[kind];
      expect(look.acts.length, kind).toBe(attacks.length);
      attacks.forEach((_, i) => {
        expect(look.acts[i]?.windup, `${kind} ${i}`).toBeTypeOf("string");
        expect(look.acts[i]?.action, `${kind} ${i}`).toBeTypeOf("string");
      });
      expect(Boolean(look.hop), kind).toBe(ENEMIES[kind].behaviour === "hop");
      expect(Boolean(look.stone), kind).toBe(Boolean(ENEMIES[kind].stone));
    }
  });

  it("only uses tags, variants, effects and sheets that tools/art made", () => {
    for (const kind of ENEMY_KINDS) {
      const look = ENEMY_LOOKS[kind];
      for (const sheet of SKINS[kind] ?? [look.sheet]) {
        const tags = tagsOf(sheet);
        // Directional sheets need at least the `-down` row (or a plain tag); others the plain tag.
        for (const tag of tagsUsed(kind))
          expect(tags.includes(tag) || tags.includes(`${tag}-down`), `${kind} (${sheet}): ${tag}`).toBe(true);
        if (look.facing === "rows")
          for (const tag of tagsUsed(kind))
            if (!tags.includes(tag))
              for (const dir of ["up", "right", "down"])
                expect(tags, `${sheet}: ${tag}-${dir}`).toContain(`${tag}-${dir}`);
      }
      for (const act of look.acts) {
        for (const fx of act?.fx ?? []) expect(tagsOf(fx.key), `${kind}: ${fx.key}`).toContain("play");
        if (act?.stunned?.fx) expect(tagsOf(act.stunned.fx), kind).toContain("twinkle");
        if (act?.held) expect(tagsOf(act.held), kind).toContain("idle");
        if (act?.overlay) expect(tagsOf(act.overlay), `${kind}: ${act.overlay}`).toContain("cast-right");
      }
      if (look.stone) expect(tagsOf(look.stone.endFx), kind).toContain("play");
      if (look.eliteSheet) expect(tagsOf(look.eliteSheet)).toEqual(tagsOf(look.sheet));
    }
  });

  it("never shows the 'attack coming' shine on a stunned enemy", () => {
    for (const kind of ENEMY_KINDS)
      for (const act of ENEMY_LOOKS[kind].acts) if (act?.stunned) expect(act.stunned.fx, kind).not.toBe("fx-shine");
  });

  it("gives per-row tell points on 4-way sheets and single points on side views", () => {
    for (const kind of ENEMY_KINDS) {
      const look = ENEMY_LOOKS[kind];
      for (const act of look.acts) {
        if (!act?.tell) continue;
        expect("right" in act.tell, kind).toBe(look.facing === "rows");
      }
    }
  });

  it("stuns only charges that can hit a wall stunned, and arcs only leaps", () => {
    for (const kind of ENEMY_KINDS)
      ENEMIES[kind].attacks.forEach((attack, i) => {
        const act = ENEMY_LOOKS[kind].acts[i];
        if (act?.stunned) expect(attack.type === "charge" && attack.stunTicks !== undefined, kind).toBe(true);
        if (attack.type === "charge" && attack.stunTicks) expect(act?.stunned, `${kind} ${i}`).toBeDefined();
        if (act?.arc) expect(attack.type, kind).toBe("leap");
      });
  });
});

describe("act timing", () => {
  it("reads the wind-up, action and recover lengths of attacks, hops and the stone", () => {
    expect(actInfo("skeleton", 0)).toMatchObject({ windupTicks: 12, actionTicks: 0, recoverTicks: 6, type: "aimed" });
    expect(actInfo("colossus", 1)).toMatchObject({ windupTicks: 15, actionTicks: 24, type: "leap" });
    expect(actInfo("slime", ACT_MOVE)).toMatchObject({ windupTicks: 6, actionTicks: 8, recoverTicks: 4, type: "hop" });
    expect(actInfo("witch", ACT_STONE)).toMatchObject({ windupTicks: 6, actionTicks: 120, type: "stone" });
    expect(actInfo("goblin", 0)).toBeUndefined();
    expect(actInfo("goblin", ACT_MOVE)).toBeUndefined();
  });

  it("fits a wind-up tag to the wind-up and puts the tell min(6, wu) ticks before the release", () => {
    expect(fitScale(400, 12)).toBeCloseTo(1);
    expect(fitScale(200, 12)).toBeCloseTo(0.5);
    expect(tellDelayMs(12)).toBeCloseTo(6 * TICK_MS);
    expect(tellDelayMs(4)).toBe(0);
  });

  it("places tells per row, mirroring west", () => {
    const rows = { right: [6, -10], up: [0, -14], down: [1, -6] } as const;
    expect(tellOffset(rows, "up", false)).toEqual([0, -14]);
    expect(tellOffset(rows, "right", true)).toEqual([-6, -10]);
    expect(tellOffset(rows, "left", false)).toEqual([-6, -10]);
    expect(tellOffset([10, -12], "right", true)).toEqual([-10, -12]);
  });

  it("maps body frames to overlay frames by phase", () => {
    expect(overlayFrame([0, 1], 1, 2, 0)).toBe(1);
    expect(overlayFrame([2, 3], 0, 2, 0.9)).toBe(2);
    expect(overlayFrame([1, 2, 3], 1, 2, 0.5)).toBe(2);
    expect(overlayFrame([1, 2, 3], 1, 2, 1.5)).toBe(3);
    expect(overlayFrame([0], 1, 2, 0.7)).toBe(0);
  });
});

describe("enemySkin", () => {
  it("picks the pack's colour variants by biome and dungeon", () => {
    expect(enemySkin("slime", false, { biome: "G" })).toBe("slime");
    expect(enemySkin("slime", false, { biome: "M" })).toBe("slime-blue");
    expect(enemySkin("slime", false, { dungeon: "lair" })).toBe("slime-blue");
    expect(enemySkin("slime", true, { biome: "M" })).toBe("slime-gold");
    expect(enemySkin("bat", false, { biome: "F" })).toBe("bat");
    expect(enemySkin("bat", false, { biome: "R" })).toBe("bat-brown");
    expect(enemySkin("bat", false, { dungeon: "crypt" })).toBe("bat-brown");
    expect(enemySkin("bat", true, { dungeon: "crypt" })).toBe("bat-gold");
    expect(enemySkin("lurker", false, { biome: "W" })).toBe("lurker-black");
    expect(enemySkin("lurker", false, { biome: "F" })).toBe("lurker");
    expect(enemySkin("wisp", false, { dungeon: "crypt" })).toBe("wisp");
    expect(enemySkin("wisp", false, { biome: "Y" })).toBe("wisp");
    expect(enemySkin("wisp", false, { dungeon: "lair" })).toBe("wisp-cyan");
    expect(enemySkin("wisp", false, { biome: "B" })).toBe("wisp-magenta");
    expect(enemySkin("archer", false, { dungeon: "crypt" })).toBe("archer-skeleton");
    expect(enemySkin("archer", true, { biome: "H" })).toBe("archer");
    expect(enemySkin("raider", false, { dungeon: "lair" })).toBe("raider");
    expect(enemySkin("warlord", false, {})).toBe("warlord");
  });

  it("only names sheets that exist", () => {
    for (const kind of ENEMY_KINDS)
      for (const sheet of SKINS[kind] ?? []) expect(tagsOf(sheet).length).toBeGreaterThan(0);
  });
});

describe("facing helpers", () => {
  it("mirrors side views heading west and keeps the last side going north or south", () => {
    expect([0, 1, 3, 4, 5, 7].map((f) => sideFlip(f, false))).toEqual([false, false, true, true, true, false]);
    expect(sideFlip(2, true)).toBe(true);
    expect(sideFlip(6, false)).toBe(false);
  });

  it("turns angles into 8-way facings (y grows down)", () => {
    expect(angleFacing(0)).toBe(0);
    expect(angleFacing(Math.PI / 2)).toBe(2);
    expect(angleFacing(Math.PI)).toBe(4);
    expect(angleFacing(-Math.PI / 2)).toBe(6);
    expect(angleFacing(-Math.PI / 4)).toBe(7);
  });
});

describe("goldRecolor", () => {
  it("turns the outline brown and the fills gold, keeping black details and white highlights", () => {
    // Goblin: purple outline, mid green, light green; plus black and white.
    const { map } = goldRecolor([0x500840, 0x90b464, 0xe0ffa0, 0x000000, 0xffffff]);
    expect(map.get(0x500840)).toBe(0x5c3c0d);
    expect(map.get(0x90b464)).toBe(0xd09010);
    expect(map.get(0xe0ffa0)).toBe(0xfff4b0);
    expect(map.has(0x000000)).toBe(false);
    expect(map.has(0xffffff)).toBe(false);
  });

  it("keeps brighter colours brighter", () => {
    const colors = [0x235b13, 0x434360, 0x67a353, 0xc39b07];
    const { map } = goldRecolor(colors);
    const lum = (c: number) => ((c >> 16) & 0xff) * 0.299 + ((c >> 8) & 0xff) * 0.587 + (c & 0xff) * 0.114;
    const out = colors.slice(1).map((c) => lum(map.get(c) ?? 0));
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });
});
