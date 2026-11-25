/**
 * Every sprite the game loads from the pack "Super Overhead Adventure 3"
 * (#NotZelda Overhead Adventure Tiles, Raphael Azcueta, CC BY-SA 4.0).
 * Sources live in content/src/notzelda/ (pack folder names kept); see
 * content/CREDITS.md for the list and what is modified.
 *
 * Keys: heroes and enemies use the game ids (`knight`, `slime`...), so
 * the views (EnemyView, PlayerView) find them; variants add a suffix (`slime-gold`); effects start with
 * `fx-`, hero shots with `shot-`, enemy shots with `hostile-`.
 *
 * Tag naming: `<anim>-<dir>` with dir up | right | down; left is right + flipX
 * unless a `-left` tag exists (redrawn rows). Every sprite has an `idle` tag
 * (an alias of `idle-down`, or of the main loop for creatures without idle frames).
 * One-shot effects use `play` (repeat 1), loops use `loop`.
 */
import type { FrameRef, SpriteDef, TagDef } from "./sheet";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ─── Humanoids (480x128: 32x32 frames, 15 columns; rows up, right, down, left) ─
/** Rows on the humanoid sheets; the left row is a mirror of the right one, so it is not imported. */
const HUMANOID_ROWS = { up: 0, right: 1, down: 2 } as const;
/** Attack cols 8-11 (startup, action, follow-through, recovery) ≈ the 5-tick (167 ms) swing lock. */
export const ATTACK_DURATIONS = [40, 40, 40, 50] as const;

function humanoid(key: string, src: string, opts: { attack?: boolean; dirs?: (keyof typeof HUMANOID_ROWS)[] } = {}) {
  const tags: TagDef[] = [];
  const dirs = opts.dirs ?? (["up", "right", "down"] as const);
  for (const dir of dirs) {
    const row = HUMANOID_ROWS[dir] * 15;
    tags.push({ name: `idle-${dir}`, frames: range(row, row + 3), duration: 180 });
    if (opts.attack === false) continue;
    tags.push({ name: `walk-${dir}`, frames: range(row + 4, row + 7), duration: 110 });
    tags.push({ name: `attack-${dir}`, frames: range(row + 8, row + 11), duration: ATTACK_DURATIONS, repeat: 1 });
    tags.push({ name: `stun-${dir}`, frames: [row + 12], duration: 100, repeat: 1 });
    tags.push({ name: `burn-${dir}`, frames: [row + 13], duration: 100, repeat: 1 });
    tags.push({ name: `hurt-${dir}`, frames: [row + 14], duration: 100, repeat: 1 });
  }
  const aliases: [string, string][] = [["idle", "idle-down"]];
  if (opts.attack !== false)
    for (const anim of ["walk", "attack", "stun", "burn", "hurt"]) aliases.push([anim, `${anim}-down`]);
  return { key, src, frame: [32, 32], tags, aliases, anchor: [16, 24] } satisfies SpriteDef;
}

/** 16x16 walkers (4x4: rows up, right, down, left; cols stand, step, stand, other step). */
function walker(key: string, src: string, left: boolean): SpriteDef {
  const dirs = { up: 0, right: 1, down: 2, ...(left ? { left: 3 } : {}) };
  const tags: TagDef[] = [];
  for (const [dir, row] of Object.entries(dirs)) {
    tags.push({ name: `walk-${dir}`, frames: range(row * 4, row * 4 + 3), duration: 150 });
    tags.push({ name: `idle-${dir}`, frames: [row * 4], duration: 200 });
  }
  return { key, src, frame: [16, 16], tags, aliases: [["idle", "walk-down"]], anchor: [8, 16] };
}

/** Attack overlay drawn facing right, synced 1:1 with the humanoid attack cols 8-11. */
const slash = (key: string, src: string, extra: Partial<SpriteDef> = {}): SpriteDef => ({
  key,
  src,
  frame: [48, 48],
  tags: [{ name: "slash-right", frames: range(0, 3), duration: ATTACK_DURATIONS, repeat: 1 }],
  aliases: [["idle", "slash-right"]],
  anchor: [24, 24],
  ...extra,
});

/** A one-row effect. `once`: plays once (`play`), else loops (`loop`). */
const fx = (
  key: string,
  src: string,
  size: number | [number, number],
  count: number,
  duration: number,
  once = true,
) => {
  const name = once ? "play" : "loop";
  const frame: [number, number] = typeof size === "number" ? [size, size] : size;
  return {
    key,
    src,
    frame,
    tags: [{ name, frames: range(0, count - 1), duration, ...(once ? { repeat: 1 } : {}) }],
    aliases: [["idle", name]],
  } satisfies SpriteDef;
};

/** Four pixel-exact quarter turns of frame 0: a spinning shot. */
const quarterTurns = (i: number, src?: string): FrameRef[] =>
  (["none", "rot90", "rot180", "rot270"] as const).map((t) => ({ i, t, ...(src ? { src } : {}) }));

const H = "Characters/Humanoid";
const S = "Characters/Small";
const L = "Characters/Large";
const VFX = "Visual FX";

export const SPRITES: readonly SpriteDef[] = [
  // ─── Heroes (characters.md §2) ───────────────────────────────────────────
  humanoid("knight", `${H}/Character Gigante Sample/Gigante.png`),
  humanoid("rogue", `${H}/Character Green Gal Sample/Gal Green.png`),
  humanoid("barbarian", `${H}/Colt/colt.png`),

  // Class weapon overlays (48x48 Slash family: 24 px reach ≈ every class's sword hit edge).
  slash("fx-slash-knight", `${H}/Attack FX/Slash/Slash Wooden Sword 48x48.png`, {
    // Wooden sword → steel blade; the leaves on the hilt go away.
    recolor: [
      [0xc59782, 0xd7d7d7],
      [0xae6c37, 0x7b7b7b],
      [0x4f1507, 0x211640],
      [0x376d03, null],
      [0x6ab417, null],
    ],
  }),
  slash("fx-slash-rogue", `${H}/Attack FX/Slash/Slash Kukri 48x48.png`),
  slash("fx-slash-barbarian", `${H}/Attack FX/Slash/Slash Axe 48x48.png`),

  // ─── Merchant: the bald monk, a friendly face behind the counter ─────────
  humanoid("merchant", `${H}/Character The Fool Sample/TheFool.png`, { attack: false, dirs: ["right", "down"] }),

  // ─── Enemies, phase 1 (characters.md §3.2: same kinds, new art) ──────────
  {
    key: "slime",
    src: `${S}/Goo/Goo.png`,
    frame: [32, 32],
    tags: [{ name: "hop", frames: range(0, 5), duration: [200, 90, 90, 120, 120, 150] }],
    aliases: [["idle", "hop"]],
  },
  {
    key: "slime-blue",
    src: `${S}/Goo/Blue Goo.png`,
    frame: [32, 32],
    tags: [{ name: "hop", frames: range(0, 5), duration: [200, 90, 90, 120, 120, 150] }],
    aliases: [["idle", "hop"]],
  },
  {
    key: "slime-gold",
    src: `${S}/Goo/Gold Goo.png`,
    frame: [32, 32],
    tags: [{ name: "hop", frames: range(0, 5), duration: [200, 90, 90, 120, 120, 150] }],
    aliases: [["idle", "hop"]],
  },
  // Beast's left row differs a little from the mirrored right one: keep it.
  walker("goblin", `${S}/Beasts/Beast.png`, true),
  walker("skeleton", `${S}/Bones/Bones.png`, false),
  ...(
    [
      ["bat", "Bat/Bat.png"],
      ["bat-brown", "Bat/BrownBat.png"],
      ["bat-gold", "EyeBat/GoldEye.png"],
    ] as const
  ).map(
    ([key, file]): SpriteDef => ({
      key,
      src: `${S}/${file}`,
      frame: [16, 16],
      tags: [
        { name: "fly", frames: [3, 2, 0, 1, 4, 1, 0, 2], duration: 70 },
        { name: "rest", frames: [5], duration: 200 },
      ],
      aliases: [["idle", "fly"]],
    }),
  ),
  // Snakes: three sheets (side faces right; up; down).
  ...(
    [
      ["scorpion", "Fang/fang"],
      ["scorpion-hood", "HoodFang/hoodfang"],
    ] as const
  ).map(
    ([key, base]): SpriteDef => ({
      key,
      src: {
        down: `${S}/Snakes/${base} down.png`,
        side: `${S}/Snakes/${base} side.png`,
        up: `${S}/Snakes/${base} up.png`,
      },
      frame: [16, 16],
      tags: [
        { name: "walk-up", src: "up", frames: range(0, 3), duration: 130 },
        { name: "walk-right", src: "side", frames: range(0, 3), duration: 130 },
        { name: "walk-down", src: "down", frames: range(0, 3), duration: 130 },
      ],
      aliases: [["idle", "walk-down"]],
      anchor: [8, 16],
    }),
  ),
  {
    // Rat: 3/4 view running down-right (flipX for left).
    key: "wolf",
    src: `${S}/Rat/Rat-Sheet.png`,
    frame: [20, 20],
    tags: [{ name: "walk", frames: range(0, 7), duration: 70 }],
    aliases: [["idle", "walk"]],
  },
  ...(
    [
      ["lurker", "FrogFlower/FrogFlower.png"],
      ["lurker-black", "FrogFlower/Black FrogFlower.png"],
    ] as const
  ).map(
    ([key, file]): SpriteDef => ({
      // Faces right (flipX for left). 4 crouch, 5-6 airborne, 7-8 knocked over.
      key,
      src: `${S}/${file}`,
      frame: [32, 32],
      tags: [
        { name: "sit", frames: range(0, 3), duration: 200 },
        { name: "jump", frames: [4, 5, 6], duration: [90, 110, 110], repeat: 1 },
        { name: "fall", frames: [7, 8], duration: 150, repeat: 1 },
      ],
      aliases: [["idle", "sit"]],
    }),
  ),

  // ─── Mini-bosses ─────────────────────────────────────────────────────────
  {
    // BigBeast: throw releases on step 4 (sheet 20); roll-start curls up, roll loops the ball.
    key: "brute",
    src: `${L}/BigBeast/BigBeast.png`,
    frame: [32, 32],
    tags: [
      { name: "stand", frames: range(0, 5), duration: 150 },
      { name: "walk", frames: range(8, 15), duration: 100 },
      { name: "throw", frames: range(16, 23), duration: 80, repeat: 1 },
      { name: "roll-start", frames: range(24, 26), duration: 80, repeat: 1 },
      { name: "roll", frames: range(27, 31), duration: 70 },
    ],
    aliases: [["idle", "stand"]],
  },
  humanoid("hexer", `${H}/SkeletonMage/SkeletonMage.png`),
  {
    // Staff overlay for the hexer's casts (64x48, synced with attack cols 8-11; FX pixel (24,24) = body frame (16,16)).
    key: "fx-staff-green",
    src: `${H}/Attack FX/Bowshot and Spells/Green Staff 48x48.png`,
    frame: [64, 48],
    tags: [{ name: "cast-right", frames: range(0, 3), duration: ATTACK_DURATIONS, repeat: 1 }],
    aliases: [["idle", "cast-right"]],
    anchor: [24, 24],
  },

  // ─── Bosses ──────────────────────────────────────────────────────────────
  {
    // CentaurKnite faces right (flipX for left). throw releases the lance on step 5 (sheet 29).
    key: "warden",
    src: `${L}/CentaurKnite/CentaurKnite.png`,
    frame: [32, 32],
    tags: [
      { name: "stand", frames: range(0, 3), duration: 150 },
      { name: "walk", frames: range(8, 11), duration: 100 },
      { name: "swing", frames: range(16, 23), duration: 70, repeat: 1 },
      { name: "throw", frames: range(24, 31), duration: 80, repeat: 1 },
    ],
    aliases: [["idle", "stand"]],
  },
  {
    // TenguMask (front): cast releases the orb on step 14 (sheet 32); split flashes on step 5 (sheet 41).
    key: "witch",
    src: `${L}/TenguMask/TenguMask.png`,
    frame: [32, 32],
    tags: [
      { name: "stand", frames: range(0, 3), duration: 150 },
      { name: "cast", frames: range(18, 35), duration: 60, repeat: 1 },
      { name: "split", frames: range(36, 48), duration: 70, repeat: 1 },
      { name: "stone", frames: [54], duration: 200, repeat: 1 },
    ],
    aliases: [["idle", "stand"]],
  },
  {
    // TurtleDragon (front): hurt = its own red silhouette, special = gold silhouette (attack tell).
    key: "matriarch",
    src: `${L}/TurtleDragon/TurtleDragon.png`,
    frame: [32, 32],
    tags: [
      { name: "stand", frames: range(0, 3), duration: 150 },
      { name: "walk", frames: range(4, 9), duration: 110 },
      { name: "spin", frames: range(10, 13), duration: 60 },
      { name: "hurt", frames: [14], duration: 100, repeat: 1 },
      { name: "special", frames: [15], duration: 150, repeat: 1 },
    ],
    aliases: [["idle", "stand"]],
  },
  {
    // BatwingButtStomper (40x40, front): breath, then the stomp: crouch → flap (airborne) → stomp.
    key: "colossus",
    src: `${L}/BatwingButtStomper/BatwingButtstomper.png`,
    frame: [40, 40],
    tags: [
      { name: "stand", frames: range(0, 3), duration: 150 },
      { name: "walk", frames: range(8, 15), duration: 100 },
      { name: "breath", frames: range(16, 19), duration: 100, repeat: 1 },
      { name: "crouch", frames: range(24, 27), duration: 80, repeat: 1 },
      { name: "flap", frames: range(32, 34), duration: 90 },
      { name: "stomp", frames: [40, 41], duration: 120, repeat: 1 },
    ],
    aliases: [["idle", "stand"]],
  },

  // ─── Hero shots (point right unless noted; rotated to the flight angle) ──
  {
    // Blue knife, drawn diagonally (tip up-right): rotation = angle + π/4.
    key: "shot-dagger",
    src: "Items/Weapons.png",
    frame: [16, 16],
    tags: [{ name: "idle", frames: [32], duration: 1000 }],
  },
  fx("shot-fireball", `${VFX}/Looping Fire/Fireball 16x16.png`, 16, 8, 60, false),
  {
    // Red arrow (drawn pointing up), turned to point right.
    key: "shot-arrow",
    src: "Items/Tools.png",
    frame: [16, 16],
    tags: [{ name: "idle", frames: [{ i: 22, t: "rot90" }], duration: 1000 }],
  },
  {
    // Blue striped crystal (drawn upright), turned to point right.
    key: "shot-nova",
    src: "Items/Pickups.png",
    frame: [16, 16],
    tags: [{ name: "idle", frames: [{ i: 59, t: "rot90" }], duration: 1000 }],
  },

  // ─── Enemy shots (SHOT_STYLES: bone, rock, orb, sting) ───────────────────
  {
    // 1-bit femur in bone white with a dark outline, spinning in quarter turns.
    key: "hostile-bone",
    src: "Items/1 Bit/Weapons/Femur.png",
    frame: [16, 16],
    recolor: [[0xffffff, 0xe2d7b5]],
    outline: 0x211640,
    tags: [{ name: "spin", frames: quarterTurns(0), duration: 70 }],
    aliases: [["idle", "spin"]],
  },
  {
    // A stone cut from the overworld boulder tile 1602 (shadow removed), in greys with a dark outline, tumbling.
    key: "hostile-rock",
    src: "Environments/Overworld.png",
    frame: [16, 16],
    crop: [4, 1, 11, 11],
    recolor: [
      [0xe2d7b5, 0xd7d7d7],
      [0xc59782, 0xa8a8a8],
      [0x376d03, 0x7b7b7b],
      [0x000a33, null],
    ],
    outline: 0x211640,
    tags: [{ name: "spin", frames: quarterTurns(1602), duration: 90 }],
    aliases: [["idle", "spin"]],
  },
  fx("hostile-orb", `${VFX}/magicOrb 16x16.png`, 16, 4, 80, false),
  {
    // The fireball in venom green, so it never reads as a hero's fireball.
    ...fx("hostile-sting", `${VFX}/Looping Fire/Fireball 16x16.png`, 16, 8, 60, false),
    recolor: [
      [0xe03c28, 0x376d03],
      [0xf68f37, 0x6ab417],
      [0xffe737, 0x8cd612],
    ],
  },

  // ─── Visual effects ──────────────────────────────────────────────────────
  fx("fx-smoke-16", `${VFX}/Smoke/Smoke 16x16.png`, 16, 16, 40),
  fx("fx-smoke-32", `${VFX}/Smoke/Smoke 32x32.png`, 32, 16, 45),
  fx("fx-smoke-small", `${VFX}/Smoke/Smoke Small 16x16.png`, 16, 8, 50),
  fx("fx-hit", `${VFX}/Hit Effect 16x16.png`, 16, 5, 40),
  fx("fx-spark", `${VFX}/Spark 16x16.png`, 16, 5, 50),
  fx("fx-shine", `${VFX}/Shine 16x16.png`, 16, 4, 80),
  fx("fx-grass", `${H}/Attack FX/Unsynced Attacks/Grass.png`, 16, 4, 60),
  fx("fx-explosion-small", `${VFX}/Explosions/Small Explosion 16x16.png`, 16, 12, 40),
  fx("fx-explosion-small-blue", `${VFX}/Explosions/Small Blue Explosion 16x16.png`, 16, 12, 40),
  fx("fx-explosion-small-pink", `${VFX}/Explosions/Small Pink Explosion 16x16.png`, 16, 12, 40),
  fx("fx-explosion", `${VFX}/Explosions/Explosion 32x32.png`, 32, 20, 35),
  fx("fx-explosion-magic", `${VFX}/Explosions/MagicExplosion 32x32.png`, 32, 20, 35),
  fx("fx-explosion-green", `${VFX}/Explosions/GreenExplosion 32x32.png`, 32, 20, 35),
  fx("fx-explosion-big", `${VFX}/Explosions/Big Explosion 48x48.png`, 48, 12, 50),
  fx("fx-dust-burst", `${VFX}/Dust20x40.png`, [20, 40], 16, 40),
  fx("fx-fire-small", `${VFX}/Looping Fire/FireSmall 12x12.png`, 12, 8, 60, false),
  {
    // Bolt (40x40): a comet flying right (0-4), then its impact (5-7).
    key: "fx-bolt",
    src: `${VFX}/Bolt 40x40.png`,
    frame: [40, 40],
    tags: [
      { name: "fly", frames: range(0, 4), duration: 60 },
      { name: "impact", frames: range(5, 7), duration: 60, repeat: 1 },
    ],
    aliases: [["idle", "fly"]],
  },
];
