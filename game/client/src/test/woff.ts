/**
 * Test helper (Node only): reads the character map of a WOFF 1.0 font, so tests
 * can check which characters a bundled font covers.
 */
import { inflateSync } from "node:zlib";

/** Table bytes of a WOFF 1.0 file by tag (each table inflated when compressed). */
export function woffTables(file: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (buf.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  const numTables = buf.readUInt16BE(12);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const tag = buf.toString("latin1", at, at + 4);
    const offset = buf.readUInt32BE(at + 4);
    const compLength = buf.readUInt32BE(at + 8);
    const origLength = buf.readUInt32BE(at + 12);
    const data = buf.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(data) : Buffer.from(data));
  }
  return tables;
}

/** Code points mapped to a glyph other than .notdef, from a cmap subtable of format 4 or 12. */
export function cmapCodePoints(cmap: Buffer): Set<number> {
  const count = cmap.readUInt16BE(2);
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 8;
    subtables.push({
      platform: cmap.readUInt16BE(at),
      encoding: cmap.readUInt16BE(at + 2),
      offset: cmap.readUInt32BE(at + 4),
    });
  }
  const format = (s: { offset: number }) => cmap.readUInt16BE(s.offset);
  const pick =
    subtables.find((s) => format(s) === 12) ??
    subtables.find((s) => format(s) === 4 && (s.platform === 3 || s.platform === 0));
  if (!pick) throw new Error("no format 4 or 12 cmap subtable");
  const points = new Set<number>();
  const base = pick.offset;
  if (format(pick) === 12) {
    const groups = cmap.readUInt32BE(base + 12);
    for (let g = 0; g < groups; g++) {
      const at = base + 16 + g * 12;
      const start = cmap.readUInt32BE(at);
      const end = cmap.readUInt32BE(at + 4);
      const glyph = cmap.readUInt32BE(at + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) points.add(c);
    }
    return points;
  }
  const segX2 = cmap.readUInt16BE(base + 6);
  const ends = base + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = cmap.readUInt16BE(ends + s * 2);
    const start = cmap.readUInt16BE(starts + s * 2);
    const delta = cmap.readInt16BE(deltas + s * 2);
    const rangeAt = ranges + s * 2;
    const rangeOffset = cmap.readUInt16BE(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        const g = cmap.readUInt16BE(rangeAt + rangeOffset + (c - start) * 2);
        glyph = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      if (glyph !== 0) points.add(c);
    }
  }
  return points;
}

/** Every code point a WOFF 1.0 font maps to a glyph. */
export function woffCoverage(file: Uint8Array): Set<number> {
  const cmap = woffTables(file).get("cmap");
  if (!cmap) throw new Error("font has no cmap table");
  return cmapCodePoints(cmap);
}
