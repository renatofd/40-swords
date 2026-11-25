/**
 * Zips apps/client/dist into release/<id>-client-<version>.zip with index.html
 * at the root, which is what GamePush and itch.io (HTML5 game) expect.
 * <version> is RELEASE_VERSION (set by the release workflow from the tag), else package.json.
 *
 *   pnpm build:client && pnpm pack:client
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIST = join(ROOT, "apps/client/dist");

function collect(dir: string, files: Record<string, Uint8Array> = {}): Record<string, Uint8Array> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, files);
    else files[relative(DIST, full).split("\\").join("/")] = readFileSync(full);
  }
  return files;
}

let files: Record<string, Uint8Array> = {};
try {
  files = collect(DIST);
} catch {
  // handled below
}
if (!files["index.html"]) {
  console.error("apps/client/dist/index.html not found. Run `pnpm build:client` first.");
  process.exit(1);
}

// Dev-only pages (the enemy gallery, apps/client/gallery.html) must never ship: `vite build` bundles index.html alone.
const devOnly = Object.keys(files).filter((name) => /gallery/i.test(name));
if (devOnly.length > 0) {
  console.error(`Dev-only files in apps/client/dist: ${devOnly.join(", ")}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { name: string; version: string };
const version = (process.env.RELEASE_VERSION || pkg.version).replace(/^v/, "");
const out = join(ROOT, "release", `${pkg.name}-client-${version}.zip`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zipSync(files, { level: 9 }));

const kb = Math.round(statSync(out).size / 1024);
console.log(`✓ ${relative(ROOT, out)} (${Object.keys(files).length} files, ${kb} KB)`);
