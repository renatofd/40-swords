import { readFileSync } from "node:fs";
import { CLASS_IDS, ENEMY_KINDS, SHOT_STYLES, WEAPON_IDS } from "@game/shared";
import { describe, expect, it, vi } from "vitest";
import { facingDir, feetOrigin, spriteAnchor } from "./anim";
import { actorDepth, DEPTH } from "./depth";

// @core/client pulls in Phaser (needs a browser); these helpers only use animKey.
vi.mock("@core/client", () => ({ animKey: (sprite: string, tag: string) => `${sprite}/${tag}` }));

const tagsOf = (key: string): string[] => {
  const url = new URL(`../../../../content/sprites/${key}.json`, import.meta.url);
  const data = JSON.parse(readFileSync(url, "utf8")) as { meta: { frameTags: { name: string }[] } };
  return data.meta.frameTags.map((t) => t.name);
};

describe("facingDir", () => {
  it("maps the 8 facings to up/right/down rows, mirroring the west side", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => facingDir(f));
    expect(rows.map((r) => r.dir)).toEqual(["right", "right", "down", "right", "right", "right", "up", "right"]);
    expect(rows.map((r) => r.flipX)).toEqual([false, false, false, true, true, true, false, false]);
  });

  it("uses a redrawn left row when the sprite has one", () => {
    expect(facingDir(4, true)).toEqual({ dir: "left", flipX: false });
    expect(facingDir(-4, true)).toEqual({ dir: "left", flipX: false });
  });
});

describe("actorDepth", () => {
  it("sorts by the feet and stays inside the actors band", () => {
    expect(actorDepth(100, 5)).toBeLessThan(actorDepth(100, 12));
    expect(actorDepth(100, 5)).toBeLessThan(actorDepth(100, 5, true));
    expect(actorDepth(100, 5, true)).toBeLessThan(actorDepth(101, 5));
    expect(actorDepth(-50, 5)).toBeGreaterThanOrEqual(DEPTH.actors);
    expect(actorDepth(1e6, 5, true)).toBeLessThan(DEPTH.actors + 1);
  });
});

describe("sprites from tools/art", () => {
  it("puts the feet of a character on the bottom of its box, on whole pixels", () => {
    // Humanoid: 32x32 frame, feet line 24; box half 5 → origin y = 19/32.
    expect(feetOrigin("knight", 5)).toEqual([0.5, 19 / 32]);
    expect(feetOrigin("fx-hit", 5)).toEqual([0.5, 0.5]);
    expect(feetOrigin("missing", 5)).toEqual([0.5, 0.5]);
  });

  it("covers every hero class with directional idle, walk and attack plus hurt/stun/burn", () => {
    for (const id of CLASS_IDS) {
      const tags = tagsOf(id);
      for (const anim of ["idle", "walk", "attack", "hurt", "stun", "burn"])
        for (const dir of ["up", "right", "down"]) expect(tags, `${id}`).toContain(`${anim}-${dir}`);
      expect(tags).toContain("idle");
      expect(tagsOf(`fx-slash-${id}`)).toContain("slash-right");
    }
  });

  it("covers every enemy kind, weapon shot and enemy shot style, each with an idle tag and an anchor", () => {
    const keys = [
      ...ENEMY_KINDS,
      ...WEAPON_IDS.map((w) => `shot-${w}`),
      ...SHOT_STYLES.map((s) => `hostile-${s}`),
      "merchant",
    ];
    for (const key of keys) {
      expect(tagsOf(key), key).toContain("idle");
      expect(spriteAnchor(key), key).toBeDefined();
    }
  });
});
