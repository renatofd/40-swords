import { readFileSync } from "node:fs";
import { ENEMIES, ENEMY_KINDS } from "@game/shared";
import { describe, expect, it } from "vitest";
import {
  angleFacing,
  ENEMY_LOOKS,
  type EnemyAct,
  goldRecolor,
  isCharging,
  STILL_SPEED,
  sideFlip,
  volleyShape,
} from "./enemyLooks";

const tagsOf = (key: string): string[] => {
  const url = new URL(`../../../../content/sprites/${key}.json`, import.meta.url);
  const data = JSON.parse(readFileSync(url, "utf8")) as { meta: { frameTags: { name: string }[] } };
  return data.meta.frameTags.map((t) => t.name);
};

describe("ENEMY_LOOKS", () => {
  it("only uses tags, variants and effects that tools/art made", () => {
    for (const kind of ENEMY_KINDS) {
      const look = ENEMY_LOOKS[kind];
      const tags = tagsOf(look.sheet);
      // Directional sheets need at least the `-down` row (or a plain tag); others the plain tag.
      const has = (tag: string) =>
        expect(tags.includes(tag) || tags.includes(`${tag}-down`), `${kind}: ${tag}`).toBe(true);
      for (const tag of [look.walk, look.idle, look.hurt, look.charge?.anim, look.charge?.start, look.hop?.jump])
        if (tag) has(tag);
      if (look.hop?.land) has(look.hop.land);
      const acts = [look.aimed, look.ring, look.blink].filter((a): a is EnemyAct => Boolean(a));
      for (const act of acts) {
        if (act.anim) has(act.anim);
        if (act.fx) expect(tagsOf(act.fx), `${kind}: ${act.fx}`).toContain("play");
        if (act.overlay) expect(tagsOf(act.overlay), `${kind}: ${act.overlay}`).toContain("cast-right");
      }
      if (look.eliteSheet) expect(tagsOf(look.eliteSheet)).toEqual(tags);
    }
  });

  it("plays an attack pose for the volleys of every boss and mini-boss", () => {
    for (const kind of ENEMY_KINDS) {
      const { rank, attacks } = ENEMIES[kind];
      if (rank === "normal") continue;
      const look = ENEMY_LOOKS[kind];
      for (const attack of attacks) {
        if (attack.type === "aimed" || attack.type === "ring") expect(look.aimed ?? look.ring, kind).toBeDefined();
        if (attack.type === "blink") expect(look.blink, kind).toBeDefined();
      }
    }
  });

  it("tells charges from walking for every kind that charges", () => {
    for (const kind of ENEMY_KINDS) {
      const { speed, attacks } = ENEMIES[kind];
      // Walking (elites are 10% faster) never reads as a charge, and walking is never "still".
      expect(isCharging(speed * 1.1, speed * 1.1), kind).toBe(false);
      expect(speed).toBeGreaterThan(STILL_SPEED);
      for (const attack of attacks)
        if (attack.type === "charge") expect(isCharging(attack.speed, speed), kind).toBe(true);
    }
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

  it("tells rings from aimed volleys", () => {
    const ring = Array.from({ length: 10 }, (_, i) => (i * Math.PI * 2) / 10);
    expect(volleyShape(ring).ring).toBe(true);
    const aimed = volleyShape([1 - 0.2, 1, 1 + 0.2]);
    expect(aimed).toEqual({ ring: false, aim: 1 });
    expect(volleyShape([2])).toEqual({ ring: false, aim: 2 });
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
