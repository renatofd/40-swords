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
import { ICON_SHEETS, type IconDef, ITEM_ICONS, UI_ICONS } from "./icons";
import type { AsepriteJson, FrameRef, SpriteDef, TagDef } from "./sheet";

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
    // Enemy acts (stage 8B): the wind-up (startup, weapon raised; played fitted to windupTicks), the release at
    // col 10 (overlay frame 2, as the pack template syncs it) and the charge pose (col 9 held).
    tags.push({ name: `aim-${dir}`, frames: [row + 8, row + 9], duration: 60, repeat: 1 });
    tags.push({ name: `strike-${dir}`, frames: [row + 10, row + 11], duration: [60, 80], repeat: 1 });
    tags.push({ name: `charge-${dir}`, frames: [row + 9], duration: 100, repeat: 1 });
    tags.push({ name: `stun-${dir}`, frames: [row + 12], duration: 100, repeat: 1 });
    tags.push({ name: `burn-${dir}`, frames: [row + 13], duration: 100, repeat: 1 });
    tags.push({ name: `hurt-${dir}`, frames: [row + 14], duration: 100, repeat: 1 });
  }
  const aliases: [string, string][] = [["idle", "idle-down"]];
  if (opts.attack !== false)
    for (const anim of ["walk", "attack", "stun", "burn", "hurt"]) aliases.push([anim, `${anim}-down`]);
  return { key, src, frame: [32, 32], tags, aliases, anchor: [16, 24] } satisfies SpriteDef;
}

/**
 * 16x16 walkers (4x4: rows up, right, down, left; cols stand, step, stand, other step).
 * Col 3 has the arm or weapon forward on some sheets (Bones, Kultist): `strike-<dir>` holds it.
 */
function walker(key: string, src: string, left: boolean): SpriteDef {
  const dirs = { up: 0, right: 1, down: 2, ...(left ? { left: 3 } : {}) };
  const tags: TagDef[] = [];
  for (const [dir, row] of Object.entries(dirs)) {
    tags.push({ name: `walk-${dir}`, frames: range(row * 4, row * 4 + 3), duration: 150 });
    tags.push({ name: `idle-${dir}`, frames: [row * 4], duration: 200 });
    tags.push({ name: `strike-${dir}`, frames: [row * 4 + 3], duration: 150, repeat: 1 });
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

/**
 * Humanoid weapon overlay (64x48 frames despite some file names; FX pixel (24,24) = body frame (16,16)), drawn
 * facing right. Frames 0-1 go with the wind-up (body cols 8-9), 2-3 with the release (cols 10-11).
 */
const overlay = (key: string, src: string): SpriteDef => ({
  key,
  src,
  frame: [64, 48],
  tags: [{ name: "cast-right", frames: range(0, 3), duration: ATTACK_DURATIONS, repeat: 1 }],
  aliases: [["idle", "cast-right"]],
  anchor: [24, 24],
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

/**
 * The `items` sprite: one tag per icon (items first, then the HUD icons), frames `i..i+frames-1` of its
 * sheet. Animated icons loop; single frames have no `repeat`. The DOM reads the same sheet (iconFrames.json).
 */
export function iconSprite(key: string, icons: Readonly<Record<string, IconDef>>, idle: string): SpriteDef {
  const tags: TagDef[] = Object.entries(icons).map(([name, d]) => ({
    name,
    src: d.src,
    frames: range(d.i, d.i + (d.frames ?? 1) - 1),
    duration: d.ms ?? 1000,
  }));
  return { key, src: ICON_SHEETS, frame: [16, 16], tags, aliases: [["idle", idle]], anchor: [8, 16] };
}

/**
 * game/client/src/ui/iconFrames.json: where each icon's first frame sits in the built `items` sheet
 * (aliases excluded), so the DOM draws it as a CSS sprite. The compass stays on its first frame in the
 * DOM (packed frames are not guaranteed to be adjacent); it animates only in the world.
 */
export function iconFrames(json: AsepriteJson) {
  const icons: Record<string, { x: number; y: number; frames: number }> = {};
  for (const name of Object.keys({ ...ITEM_ICONS, ...UI_ICONS })) {
    const tag = json.meta.frameTags.find((t) => t.name === name);
    const first = tag && json.frames[tag.from];
    if (!tag || !first) throw new Error(`items: no tag for icon "${name}"`);
    icons[name] = { x: first.frame.x, y: first.frame.y, frames: tag.to - tag.from + 1 };
  }
  return { w: json.meta.size.w, h: json.meta.size.h, icons };
}

const PICKUPS = "Items/Pickups.png";
const TREASURES = "Items/Books and Treasures.png";

/** A chest on Books and Treasures: closed `c`, opening `c+1..c+4` (lid up, glow), then empty `c+5`. */
const chest = (key: string, c: number): SpriteDef => ({
  key,
  src: TREASURES,
  frame: [16, 16],
  tags: [
    { name: "closed", frames: [c], duration: 1000 },
    { name: "open", frames: range(c + 1, c + 4), duration: [80, 60, 80, 200], repeat: 1 },
    { name: "empty", frames: [c + 5], duration: 1000 },
  ],
  aliases: [["idle", "closed"]],
  anchor: [8, 8],
});

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
  // Goo: 0-2 grounded, 3-4 airborne, 5 landing. `hop` stays for the walk loop; the hop act plays crouch → jump → land.
  ...(
    [
      ["slime", "Goo/Goo.png"],
      ["slime-blue", "Goo/Blue Goo.png"],
      ["slime-gold", "Goo/Gold Goo.png"],
    ] as const
  ).map(
    ([key, file]): SpriteDef => ({
      key,
      src: `${S}/${file}`,
      frame: [32, 32],
      tags: [
        { name: "hop", frames: range(0, 5), duration: [200, 90, 90, 120, 120, 150] },
        { name: "idle", frames: [0, 1], duration: 250 },
        { name: "crouch", frames: [0], duration: 100, repeat: 1 },
        { name: "jump", frames: [1, 2, 3, 4], duration: [60, 60, 80, 80], repeat: 1 },
        { name: "land", frames: [5], duration: 100, repeat: 1 },
      ],
    }),
  ),
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
  // Snakes: three sheets (side faces right; up; down). Frame 0: head high, tongue out (the `ready` pose);
  // HoodFang frame 2: head lunged low (its spit).
  ...(
    [
      ["scorpion", "Fang/fang"],
      ["cobra", "HoodFang/hoodfang"],
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
      tags: (
        [
          ["up", "up"],
          ["right", "side"],
          ["down", "down"],
        ] as const
      ).flatMap(([dir, src]): TagDef[] => [
        { name: `walk-${dir}`, src, frames: range(0, 3), duration: 130 },
        { name: `ready-${dir}`, src, frames: [0], duration: 100, repeat: 1 },
        ...(key === "cobra" ? [{ name: `spit-${dir}`, src, frames: [2], duration: 150, repeat: 1 }] : []),
      ]),
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
        { name: "crouch", frames: [4], duration: 100, repeat: 1 },
        { name: "air", frames: [5, 6], duration: 110, repeat: 1 },
      ],
      aliases: [["idle", "sit"]],
    }),
  ),

  // ─── Enemies, stage 8B (new kinds; skins: wisp-cyan, wisp-magenta, archer-skeleton) ─
  {
    // Smushroom: a cap bobbing on little feet (it only waddles; the puff is the walk sped up).
    key: "shroom",
    src: `${S}/Smushroom/smushroom.png`,
    frame: [16, 16],
    tags: [{ name: "walk", frames: range(0, 5), duration: 110 }],
    aliases: [["idle", "walk"]],
    anchor: [8, 16],
  },
  {
    // Spider (32x16, 6 cols): idle 0-5, walk 6-9, jump 12-15 (12 ≈ idle, 13-14 crouched, 15 airborne).
    key: "spider",
    src: `${S}/Spider/Spider.png`,
    frame: [32, 16],
    tags: [
      { name: "idle", frames: range(0, 5), duration: 150 },
      { name: "walk", frames: range(6, 9), duration: 100 },
      { name: "crouch", frames: [13, 14], duration: 100, repeat: 1 },
      { name: "air", frames: [15], duration: 100, repeat: 1 },
      { name: "land", frames: [13], duration: 100, repeat: 1 },
      // Raised on its legs, the jump's first frame: the web spit pose.
      { name: "rear", frames: [12], duration: 100, repeat: 1 },
    ],
    anchor: [16, 16],
  },
  // FloatSkull (3x3): rows yellow, cyan, magenta aura; cols 0-1 flicker, col 2 white flash.
  ...(
    [
      ["wisp", 0],
      ["wisp-cyan", 3],
      ["wisp-magenta", 6],
    ] as const
  ).map(
    ([key, at]): SpriteDef => ({
      key,
      src: `${S}/FloatSkull/floatskull.png`,
      frame: [16, 16],
      tags: [
        { name: "float", frames: [at, at + 1], duration: 90 },
        { name: "hurt", frames: [at + 2], duration: 100, repeat: 1 },
      ],
      aliases: [["idle", "float"]],
    }),
  ),
  {
    key: "eye",
    src: `${S}/FloatEye/FloatEye.png`,
    frame: [16, 16],
    tags: [{ name: "float", frames: range(0, 3), duration: 140 }],
    aliases: [["idle", "float"]],
  },
  // Humanoid archers, raiders and the warlord (32x32 humanoid sheets) with 64x48 weapon overlays.
  humanoid("archer", `${H}/Reptiles & Kobold/kobold.png`),
  humanoid("archer-skeleton", `${H}/Skeleton/Skeleton.png`),
  humanoid("raider", `${H}/Reptiles & Kobold/reptile.png`),
  overlay("fx-bow", `${H}/Reptiles & Kobold/Shortbow 48x48.png`),
  overlay("fx-sword-long", `${H}/Reptiles & Kobold/Long Slash Sword 64x48.png`),
  // ArmorLancer: the lance is level in every frame, and its left row is redrawn.
  walker("lancer", `${S}/ArmorLancer/ArmorLancer.png`, true),
  walker("axeman", `${S}/Beasts/AxeBeast/AxeBeast.png`, false),
  walker("kultist", `${S}/Kultist/Kultist.png`, false),

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
      { name: "throw-windup", frames: range(16, 19), duration: 80, repeat: 1 },
      { name: "throw-release", frames: range(20, 23), duration: 80, repeat: 1 },
      { name: "roll-start", frames: range(24, 26), duration: 80, repeat: 1 },
      { name: "roll", frames: range(27, 31), duration: 70 },
      { name: "roll-end", frames: [26, 25, 24], duration: 80, repeat: 1 },
    ],
    aliases: [["idle", "stand"]],
  },
  humanoid("hexer", `${H}/SkeletonMage/SkeletonMage.png`),
  // Staff overlay for the hexer's casts.
  overlay("fx-staff-green", `${H}/Attack FX/Bowshot and Spells/Green Staff 48x48.png`),
  {
    // Wyvern (4x2, faces down-right): flap 0-3; 4 = flap 1 with the wings raised (the inhale); 5-7 head down breathing.
    key: "drake",
    src: `${L}/Wyvern/Wyvern Green.png`,
    frame: [32, 32],
    tags: [
      { name: "flap", frames: range(0, 3), duration: 100 },
      { name: "inhale", frames: [4], duration: 100, repeat: 1 },
      { name: "breath", frames: [5, 6, 7], duration: 90, repeat: 1 },
    ],
    aliases: [["idle", "flap"]],
  },
  humanoid("warlord", `${H}/Reptiles & Kobold/scaleless.png`),
  overlay("fx-hammer", `${H}/Reptiles & Kobold/Long Swing Hammer 64x48.png`),

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
      { name: "rear", frames: range(16, 19), duration: 70, repeat: 1 },
      { name: "swing-windup", frames: range(16, 20), duration: 70, repeat: 1 },
      { name: "swing-release", frames: [21, 22, 23], duration: 70, repeat: 1 },
      { name: "throw-windup", frames: range(24, 28), duration: 80, repeat: 1 },
      { name: "throw-release", frames: [29, 30, 31], duration: 80, repeat: 1 },
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
      { name: "cast-windup", frames: range(18, 31), duration: 60, repeat: 1 },
      { name: "cast-windup-short", frames: range(25, 31), duration: 60, repeat: 1 },
      { name: "cast-release", frames: range(32, 35), duration: 60, repeat: 1 },
      { name: "split-windup", frames: range(36, 40), duration: 70, repeat: 1 },
      { name: "split-release", frames: range(41, 48), duration: 70, repeat: 1 },
      { name: "flash", frames: [41], duration: 100, repeat: 1 },
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
      { name: "breath-windup", frames: [16, 17, 18], duration: 100, repeat: 1 },
      { name: "breath-release", frames: [19], duration: 300, repeat: 1 },
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

  // ─── Enemy shots (SHOT_STYLES: bone, rock, orb, sting, axe, web, arrow, bolt, curse, spore, spear) ─
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

  {
    // The AxeBeast's thrown axe (16x15: no quarter turns on a non-square frame), tumbling through flips.
    key: "hostile-axe",
    src: `${S}/Beasts/AxeBeast/AxeBeastAxe.png`,
    frame: [16, 15],
    tags: [
      {
        name: "spin",
        frames: [
          { i: 0, t: "none" },
          { i: 0, t: "flipV" },
          { i: 0, t: "rot180" },
          { i: 0, t: "flipH" },
        ],
        duration: 70,
      },
    ],
    aliases: [["idle", "spin"]],
  },
  {
    // A web glob; also drawn at a webbed hero's feet.
    key: "hostile-web",
    src: `${S}/Spider/SpiderWeb.png`,
    frame: [16, 16],
    tags: [{ name: "idle", frames: [0], duration: 1000 }],
  },
  {
    // Green arrow (drawn pointing up), turned to point right (the hero's arrow is the red one, 22).
    key: "hostile-arrow",
    src: "Items/Tools.png",
    frame: [16, 16],
    tags: [{ name: "idle", frames: [{ i: 26, t: "rot90" }], duration: 1000 }],
  },
  {
    // The bolt comet pointing right; only frames 0-1 (2-4 grow to a 32 px ball, too big for the shot).
    key: "hostile-bolt",
    src: `${VFX}/Bolt 40x40.png`,
    frame: [40, 40],
    tags: [{ name: "loop", frames: [0, 1], duration: 60 }],
    aliases: [["idle", "loop"]],
  },
  {
    // Black fire in purples (black is invisible on crypt floors).
    ...fx("hostile-curse", `${VFX}/Looping Fire/Black Fire 16x16.png`, 16, 8, 60, false),
    recolor: [
      [0x000000, 0x5a1991],
      [0x211640, 0xa675fe],
      [0x5a1991, 0xe2c9ff],
    ],
  },
  {
    // A spore puff: the small smoke in the mushroom's pink with a dark outline (green vanished on light grass).
    ...fx("hostile-spore", `${VFX}/Smoke/Smoke Small 16x16.png`, 16, 4, 80, false),
    recolor: [[0x7b7b7b, 0xc080d0]],
    outline: 0x211640,
  },
  {
    // A spear drawn diagonally (tip up-right, like the dagger): rotation = angle + π/4.
    key: "hostile-spear",
    src: "Items/Weapons.png",
    frame: [16, 16],
    tags: [{ name: "idle", frames: [12], duration: 1000 }],
  },

  // ─── Visual effects ──────────────────────────────────────────────────────
  fx("fx-smoke-16", `${VFX}/Smoke/Smoke 16x16.png`, 16, 16, 40),
  fx("fx-smoke-32", `${VFX}/Smoke/Smoke 32x32.png`, 32, 16, 45),
  fx("fx-smoke-small", `${VFX}/Smoke/Smoke Small 16x16.png`, 16, 8, 50),
  fx("fx-hit", `${VFX}/Hit Effect 16x16.png`, 16, 5, 40),
  // `twinkle` (frames 1-4, no big white cross): stuns and guarded blows, so they never look like
  // the fx-shine tell ("attack coming"), whose first frame is that same cross.
  (() => {
    const def = fx("fx-spark", `${VFX}/Spark 16x16.png`, 16, 5, 50);
    return { ...def, tags: [...def.tags, { name: "twinkle", frames: range(1, 4), duration: 100, repeat: 1 }] };
  })(),
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

  // ─── Items, pickups, chests, shop (stage 9) ────────────────────────────────
  // Every relic, weapon, potion and HUD icon (icons.ts); the DOM draws the same sheet.
  iconSprite("items", { ...ITEM_ICONS, ...UI_ICONS }, "potion"),
  {
    // Rupees by value: green 1-4, blue 5-19, pink 20-49, a spinning gold coin from 50 (row 7, cols 0-4).
    // The dark purple gem (57) is not used: it vanishes on the crypt and tomb floors.
    key: "pickups",
    src: PICKUPS,
    frame: [16, 16],
    tags: [
      { name: "rupee-green", frames: [56], duration: 1000 },
      { name: "rupee-blue", frames: [55], duration: 1000 },
      { name: "rupee-pink", frames: [54], duration: 1000 },
      { name: "rupee-gold", frames: range(91, 95), duration: 100 },
      { name: "heart", frames: [13], duration: 1000 },
      { name: "heart-vanish", frames: range(14, 17), duration: 60, repeat: 1 },
    ],
    aliases: [["idle", "heart"]],
    anchor: [8, 8],
  },
  chest("chest", 63),
  // Gold chest: dungeon chests and mini-boss/boss drops (holds at least an uncommon relic).
  chest("chest-gold", 70),
  {
    // Shop pedestal: the dungeon statue plinth (2560,432): tan-framed top with a cream oval, brown front.
    key: "pedestal",
    src: "Environments/Dungeon.png",
    frame: [16, 16],
    tags: [{ name: "idle", frames: [9664], duration: 1000 }],
    anchor: [8, 16],
  },
  {
    // Loot burst, gold: pickup frames 27-31 (26 is the Lucky Star icon, never part of the burst).
    key: "fx-burst-gold",
    src: PICKUPS,
    frame: [16, 16],
    tags: [{ name: "play", frames: range(27, 31), duration: 60, repeat: 1 }],
    aliases: [["idle", "play"]],
  },
  {
    // Loot burst, purple (epic and legendary): frames 40-44 (39 is the `sum-level` icon).
    key: "fx-burst-purple",
    src: PICKUPS,
    frame: [16, 16],
    tags: [{ name: "play", frames: range(40, 44), duration: 60, repeat: 1 }],
    aliases: [["idle", "play"]],
  },
  {
    // Loot glint: the gold sparkle's last two frames (specks, then a 14 px cross) recoloured to grey, so
    // it never reads as fx-shine ("attack coming") or fx-spark twinkle ("stunned").
    key: "fx-glint",
    src: PICKUPS,
    frame: [16, 16],
    recolor: [[0xffbb31, 0xd7d7d7]],
    tags: [{ name: "play", frames: [30, 31], duration: 80, repeat: 1 }],
    aliases: [["idle", "play"]],
  },
];
