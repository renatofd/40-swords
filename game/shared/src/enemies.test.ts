import { describe, expect, it } from "vitest";
import {
  ACT_MOVE,
  ACT_STONE,
  ActPhase,
  actPhase,
  actSlot,
  actStunned,
  ENEMIES,
  ENEMY_KINDS,
  type EnemyDef,
  encodeAct,
  enemyPhase,
  enemyStats,
  isEnemyKind,
  MAX_ATTACKS,
  SHOT_DEFS,
  SHOT_STYLES,
  STONE_WINDUP_TICKS,
} from "./enemies";

describe("enemies", () => {
  it("get stronger farther from the start", () => {
    for (const kind of ENEMY_KINDS) {
      const near = enemyStats(kind, 0, false);
      const far = enemyStats(kind, 6, false);
      expect(far.maxHp).toBeGreaterThan(near.maxHp);
      expect(far.damage).toBeGreaterThan(near.damage);
      expect(far.xp).toBeGreaterThan(near.xp);
    }
  });

  it("regular monsters around the start are a bit weaker in the overworld, not in dungeons", () => {
    for (const tier of [0, 1, 2]) {
      const outside = enemyStats("goblin", tier, false, true);
      const inside = enemyStats("goblin", tier, false, false);
      expect(outside.maxHp).toBeLessThan(inside.maxHp);
      expect(outside.damage).toBeLessThan(inside.damage);
      expect(outside.xp).toBe(inside.xp);
      expect(outside.rupees).toEqual(inside.rupees);
    }
    // Still stronger the farther they are, and the same as before from tier 3 on.
    expect(enemyStats("goblin", 1, false, true).maxHp).toBeGreaterThan(enemyStats("goblin", 0, false, true).maxHp);
    expect(enemyStats("goblin", 2, false, true).maxHp).toBeGreaterThan(enemyStats("goblin", 1, false, true).maxHp);
    expect(enemyStats("goblin", 3, false, true)).toEqual(enemyStats("goblin", 3, false, false));
    // Bosses keep their strength wherever they are.
    expect(enemyStats("warden", 0, false, true)).toEqual(enemyStats("warden", 0, false, false));
  });

  it("elites are tougher and richer", () => {
    const normal = enemyStats("goblin", 2, false);
    const elite = enemyStats("goblin", 2, true);
    expect(Math.abs(elite.maxHp - normal.maxHp * 3)).toBeLessThanOrEqual(2); // rounding
    expect(elite.damage).toBeGreaterThan(normal.damage);
    expect(Math.abs(elite.xp - normal.xp * 3)).toBeLessThanOrEqual(2);
    expect(elite.rupees[1]).toBeGreaterThan(normal.rupees[1]);
    expect(elite.half).toBe(normal.half + 1);
  });

  it("each dungeon has a mini-boss and a boss with attacks; summons are regular enemies", () => {
    const bosses = ENEMY_KINDS.filter((k) => ENEMIES[k].rank === "boss");
    const minis = ENEMY_KINDS.filter((k) => ENEMIES[k].rank === "miniboss");
    expect(bosses).toHaveLength(4);
    expect(new Set(minis).size).toBe(4);
    for (const k of [...bosses, ...minis]) {
      expect(ENEMIES[k].attacks.length).toBeGreaterThan(0);
      for (const a of ENEMIES[k].attacks)
        if (a.type === "summon") {
          expect(isEnemyKind(a.kind)).toBe(true);
          expect(ENEMIES[a.kind].rank).toBe("normal");
        }
    }
  });
});

/** Every attack of every kind, with its kind. */
const allAttacks = ENEMY_KINDS.flatMap((kind) => ENEMIES[kind].attacks.map((attack) => ({ kind, attack })));

describe("enemy defs (stage 8B roster)", () => {
  it("keep the first 13 kinds and 4 shot styles in place (append-only)", () => {
    expect(ENEMY_KINDS).toHaveLength(25);
    expect(ENEMY_KINDS.slice(0, 13)).toEqual([
      "slime",
      "goblin",
      "bat",
      "skeleton",
      "scorpion",
      "wolf",
      "lurker",
      "brute",
      "hexer",
      "warden",
      "witch",
      "matriarch",
      "colossus",
    ]);
    expect(SHOT_STYLES.slice(0, 4)).toEqual(["bone", "rock", "orb", "sting"]);
    expect(new Set(ENEMY_KINDS).size).toBe(ENEMY_KINDS.length);
    expect(new Set(SHOT_STYLES).size).toBe(SHOT_STYLES.length);
  });

  it("every kind has a def with a usable speed and at most MAX_ATTACKS attacks", () => {
    for (const kind of ENEMY_KINDS) {
      const def: EnemyDef | undefined = ENEMIES[kind];
      expect(def, kind).toBeDefined();
      // Never NaN-prone: velocities are built from `speed` (the guarding witch keeps hers too).
      expect(def.speed, kind).toBeGreaterThan(0);
      expect(def.attacks.length, kind).toBeLessThanOrEqual(MAX_ATTACKS);
    }
    expect(Object.keys(ENEMIES).sort()).toEqual([...ENEMY_KINDS].sort());
  });

  it("wind-ups stay readable and cooldowns outlast the act", () => {
    for (const { kind, attack } of allAttacks) {
      const [lo, hi] = ENEMIES[kind].rank === "normal" ? [10, 18] : [10, 20];
      expect(attack.windupTicks, `${kind} ${attack.type}`).toBeGreaterThanOrEqual(lo);
      expect(attack.windupTicks, `${kind} ${attack.type}`).toBeLessThanOrEqual(hi);
      expect(attack.recoverTicks, kind).toBeGreaterThan(0);
      expect(attack.cooldownTicks, kind).toBeGreaterThan(attack.windupTicks + attack.recoverTicks);
    }
    // Hop crouches are not attacks: shorter, but still a tell. The stone flash is the one exception.
    for (const kind of ENEMY_KINDS) {
      const hop = ENEMIES[kind].hop;
      if (hop) {
        expect(hop.crouch, kind).toBeGreaterThanOrEqual(6);
        expect(hop.crouch, kind).toBeLessThanOrEqual(8);
      }
    }
    expect(STONE_WINDUP_TICKS).toBe(6);
  });

  it("hop and kite settings come exactly with their behaviours", () => {
    for (const kind of ENEMY_KINDS) {
      const def = ENEMIES[kind];
      expect(def.hop !== undefined, kind).toBe(def.behaviour === "hop");
      expect(def.kite !== undefined, kind).toBe(def.behaviour === "kite");
      if (def.hop) {
        expect(def.hop.rest[0], kind).toBeLessThanOrEqual(def.hop.rest[1]);
        expect(def.hop.air, kind).toBeGreaterThan(0);
        expect(def.hop.land, kind).toBeGreaterThan(0);
      }
      if (def.kite) {
        expect(def.kite.min, kind).toBeLessThan(def.kite.max);
        expect(def.kite.max, kind).toBeLessThanOrEqual(def.aggroRange);
      }
    }
  });

  it("start bands lie inside the aggro range", () => {
    for (const { kind, attack } of allAttacks) {
      if (!attack.within) continue;
      const [lo, hi] = attack.within;
      expect(lo, kind).toBeGreaterThanOrEqual(0);
      expect(lo, kind).toBeLessThan(hi);
      expect(hi, kind).toBeLessThanOrEqual(ENEMIES[kind].aggroRange);
    }
    expect(ENEMIES.skeleton.attacks[0]?.within).toEqual([24, 110]);
    expect(ENEMIES.archer.attacks[0]?.within).toEqual([24, 150]);
    expect(ENEMIES.axeman.attacks[0]?.within).toEqual([32, 120]);
  });

  it("phase-gated attacks belong to kinds with a phase 2; mini-bosses and bosses have one", () => {
    for (const { kind, attack } of allAttacks)
      if (attack.phase !== undefined) expect(ENEMIES[kind].phase2At, kind).toBeDefined();
    for (const kind of ENEMY_KINDS) {
      const def = ENEMIES[kind];
      if (def.rank !== "normal") expect(def.phase2At, kind).toBe(0.5);
      else expect(def.phase2At, kind).toBeUndefined();
    }
    const warden = ENEMIES.warden;
    expect(enemyPhase(warden, warden.maxHp, warden.maxHp)).toBe(1);
    expect(enemyPhase(warden, warden.maxHp / 2 + 1, warden.maxHp)).toBe(1);
    expect(enemyPhase(warden, warden.maxHp / 2, warden.maxHp)).toBe(2);
    expect(enemyPhase(ENEMIES.goblin, 1, 34)).toBe(1);
  });

  it("summons (attacks and the stone) are regular kinds; every style has a shot def", () => {
    for (const { kind, attack } of allAttacks)
      if (attack.type === "summon") expect(ENEMIES[attack.kind].rank, kind).toBe("normal");
    for (const kind of ENEMY_KINDS) {
      const stone = ENEMIES[kind].stone;
      if (stone?.summon) expect(ENEMIES[stone.summon.kind].rank, kind).toBe("normal");
      if (stone) expect([...stone.marks].sort((a, b) => b - a)).toEqual([...stone.marks]);
    }
    for (const style of SHOT_STYLES) expect(SHOT_DEFS[style]?.radius, style).toBeGreaterThan(0);
    expect(Object.keys(SHOT_DEFS).sort()).toEqual([...SHOT_STYLES].sort());
    expect(SHOT_DEFS.web.slowTicks).toBeGreaterThan(0);
  });

  it("only kinds with a front block, wake or burst carry those modifiers, in sane ranges", () => {
    for (const kind of ENEMY_KINDS) {
      const def = ENEMIES[kind];
      if (def.block !== undefined) expect(def.block > 0 && def.block < 1, kind).toBe(true);
      if (def.wake !== undefined) expect(def.wake, kind).toBeGreaterThan(0);
      if (def.burst) expect(def.burst[0] > 0 && def.burst[1] > 0, kind).toBe(true);
      if (def.cardinal !== undefined) expect(["chase", "kite"], kind).toContain(def.behaviour);
    }
    expect(ENEMIES.lancer.block).toBe(0.3);
  });
});

describe("encodeAct", () => {
  it("round-trips slot, phase and the stunned bit, and fits in 6 bits", () => {
    let max = 0;
    for (let slot = 0; slot <= ACT_MOVE; slot++)
      for (const phase of [ActPhase.windup, ActPhase.action, ActPhase.recover])
        for (const stunned of [false, true]) {
          const act = encodeAct(slot, phase, stunned);
          expect(act).toBeGreaterThan(0);
          expect(actSlot(act)).toBe(slot);
          expect(actPhase(act)).toBe(phase);
          expect(actStunned(act)).toBe(stunned);
          max = Math.max(max, act);
        }
    expect(max).toBeLessThanOrEqual(63);
    expect(encodeAct(ACT_STONE, ActPhase.none, true)).toBe(0);
    expect(actPhase(0)).toBe(ActPhase.none);
    expect(ACT_STONE).toBe(MAX_ATTACKS);
  });
});
