/**
 * `pnpm art`: turns the pack sheets in content/src/notzelda into
 * content/sprites/<key>.png + <key>.json (Aseprite json-array), as listed in
 * manifest.ts, plus game/client/src/render/spriteAnchors.json (frame size and
 * anchor pixel of each sprite: feet point, overlay attach point or centre).
 *
 * Deterministic: the same manifest and sources give the same bytes.
 * Sprites this tool wrote earlier that are no longer in the manifest are deleted.
 *
 *   pnpm art            write everything
 *   pnpm art --check    exit 1 if any output is missing or out of date (writes nothing)
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { SPRITES } from "./manifest";
import { APP, buildSprite, formatJson, type Rgba, type SpriteAnchor, spriteSources } from "./sheet";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SOURCE_DIR = resolve(ROOT, "content/src/notzelda");
const SPRITES_DIR = resolve(ROOT, "content/sprites");
const ANCHORS_FILE = resolve(ROOT, "game/client/src/render/spriteAnchors.json");

const check = process.argv.includes("--check");

function readPng(path: string): Rgba {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

function encodePng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}

const outdated: string[] = [];
function output(path: string, data: Buffer | string) {
  const bytes = typeof data === "string" ? Buffer.from(data) : data;
  const same = existsSync(path) && readFileSync(path).equals(bytes);
  if (same) return;
  if (check) outdated.push(path.replace(`${ROOT}`, ""));
  else writeFileSync(path, bytes);
}

const sheets = new Map<string, Rgba>();
const keys = new Set<string>();
const anchors: Record<string, SpriteAnchor> = {};
for (const def of SPRITES) {
  if (keys.has(def.key)) throw new Error(`duplicate sprite key "${def.key}"`);
  keys.add(def.key);
  for (const src of spriteSources(def)) if (!sheets.has(src)) sheets.set(src, readPng(resolve(SOURCE_DIR, src)));
  const built = buildSprite(def, sheets);
  anchors[def.key] = built.anchor;
  output(resolve(SPRITES_DIR, `${def.key}.png`), encodePng(built.image));
  output(resolve(SPRITES_DIR, `${def.key}.json`), formatJson(built.json));
  const tags = built.json.meta.frameTags.map((t) => t.name).join(" ");
  if (!check)
    console.log(
      `✓ ${def.key} ${built.image.width}x${built.image.height} (frame ${built.anchor.w}x${built.anchor.h}, anchor ${built.anchor.x},${built.anchor.y}): ${tags}`,
    );
}
output(ANCHORS_FILE, formatJson(anchors));

// Sprites this tool made before that left the manifest.
for (const file of readdirSync(SPRITES_DIR).filter((f) => f.endsWith(".json"))) {
  const key = file.replace(/\.json$/, "");
  if (keys.has(key)) continue;
  const meta = (JSON.parse(readFileSync(resolve(SPRITES_DIR, file), "utf8")) as { meta?: { app?: string } }).meta;
  if (meta?.app !== APP) continue;
  if (check) outdated.push(`content/sprites/${key}.* (no longer in the manifest)`);
  else
    for (const ext of ["json", "png"]) {
      const path = resolve(SPRITES_DIR, `${key}.${ext}`);
      if (existsSync(path)) unlinkSync(path);
    }
}

if (check) {
  if (outdated.length > 0) {
    console.error(`Out of date (run \`pnpm art\`):\n${outdated.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`✓ ${SPRITES.length} sprites up to date`);
} else console.log(`${SPRITES.length} sprites written to content/sprites/`);
