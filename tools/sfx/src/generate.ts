/**
 * GAME (40 Swords): synthesizes the placeholder sound effects into
 * content/audio/sfx (16-bit mono WAV, a few KB each). The client loads every
 * file there by name (see game/client/src/assets.ts), so a real sound replaces
 * one of these by having the same file name (e.g. swing.ogg).
 *
 *   pnpm sfx    writes them all again (same output every time)
 *
 * Not the template's `assets:placeholder` (that one writes the template's
 * example game): only the files listed in SOUNDS below are written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../content/audio/sfx");
const RATE = 22050;

type Wave = (phase: number) => number;
const sine: Wave = (p) => Math.sin(2 * Math.PI * p);
const square: Wave = (p) => (p % 1 < 0.5 ? 0.8 : -0.8);
const triangle: Wave = (p) => 1 - 4 * Math.abs((p % 1) - 0.5);

/** Seeded noise, so the files come out the same on every run. */
let seed = 0x2f6b9a1;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed / 2 ** 32) * 2 - 1;
};

const buffer = (seconds: number) => new Float32Array(Math.ceil(seconds * RATE));
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Tone {
  start: number;
  dur: number;
  /** Frequency at the start and at the end (exponential slide). */
  from: number;
  to?: number;
  wave?: Wave;
  vol: number;
  /** Seconds to reach full volume; the rest decays. */
  attack?: number;
  /** Vibrato depth (share of the frequency) and rate (Hz). */
  vibrato?: [number, number];
}

function tone(out: Float32Array, t: Tone) {
  const { start, dur, from, to = from, wave = square, vol, attack = 0.004, vibrato } = t;
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const k = i / n;
    const time = i / RATE;
    let f = from * (to / from) ** k;
    if (vibrato) f *= 1 + vibrato[0] * Math.sin(2 * Math.PI * vibrato[1] * time);
    phase += f / RATE;
    const env = Math.min(1, time / attack) * (1 - k) ** 1.6;
    out[s0 + i] = (out[s0 + i] ?? 0) + wave(phase) * vol * env;
  }
}

/** Noise through a low-pass filter whose cutoff slides from `from` to `to` Hz. */
function hiss(out: Float32Array, start: number, dur: number, vol: number, from: number, to: number, attack = 0.005) {
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  let low = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const k = i / n;
    const cutoff = from * (to / from) ** k;
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
    low += a * (noise() - low);
    const env = Math.min(1, i / RATE / attack) * (1 - k) ** 2;
    out[s0 + i] = (out[s0 + i] ?? 0) + low * vol * env;
  }
}

/** Notes one after the other (`step` seconds apart), each ringing `ring` seconds. */
function arpeggio(
  out: Float32Array,
  start: number,
  notes: number[],
  step: number,
  ring: number,
  wave: Wave,
  vol: number,
) {
  notes.forEach((midi, i) => {
    tone(out, { start: start + i * step, dur: ring, from: hz(midi), wave, vol });
  });
}

/** Scales the sound so its loudest sample reaches `peak` (every effect about as loud). */
function normalize(out: Float32Array, peak = 0.85) {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = ((out[i] ?? 0) * peak) / max;
  return out;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Each effect, by file name (the key the client plays it with). */
const SOUNDS: Record<string, () => Float32Array> = {
  /** Sword swing: a short whoosh. */
  swing: () => {
    const out = buffer(0.15);
    hiss(out, 0, 0.15, 1, 5000, 500, 0.02);
    tone(out, { start: 0, dur: 0.12, from: 700, to: 250, wave: sine, vol: 0.15, attack: 0.02 });
    return normalize(out, 0.6);
  },
  /** A blow landing on a monster: a dull thump with a click. */
  hit: () => {
    const out = buffer(0.13);
    tone(out, { start: 0, dur: 0.12, from: 170, to: 55, wave: sine, vol: 1 });
    hiss(out, 0, 0.03, 0.6, 3500, 1500);
    return normalize(out);
  },
  /** The hero takes a hit: a low buzz. */
  hurt: () => {
    const out = buffer(0.24);
    tone(out, { start: 0, dur: 0.22, from: 260, to: 110, vol: 0.5, vibrato: [0.08, 30] });
    hiss(out, 0, 0.08, 0.4, 2000, 600);
    return normalize(out, 0.75);
  },
  /** A rupee picked up: two quick high blips. */
  coin: () => {
    const out = buffer(0.22);
    tone(out, { start: 0, dur: 0.06, from: hz(83), vol: 0.5 });
    tone(out, { start: 0.055, dur: 0.16, from: hz(88), vol: 0.5 });
    return normalize(out, 0.55);
  },
  /** A heart picked up: a soft rising arpeggio. */
  heart: () => {
    const out = buffer(0.36);
    arpeggio(out, 0, [72, 76, 79, 84], 0.06, 0.18, triangle, 0.6);
    return normalize(out, 0.6);
  },
  /** A chest opened (or a relic won): an arpeggio up to a ringing note. */
  chest: () => {
    const out = buffer(0.6);
    arpeggio(out, 0, [67, 72, 76, 79], 0.05, 0.12, square, 0.35);
    tone(out, { start: 0.2, dur: 0.4, from: hz(84), wave: triangle, vol: 0.6 });
    return normalize(out, 0.6);
  },
  /** Level up: a quick climb and a bright chord. */
  levelup: () => {
    const out = buffer(0.75);
    arpeggio(out, 0, [60, 64, 67, 72, 76], 0.055, 0.12, square, 0.3);
    for (const midi of [72, 76, 79]) tone(out, { start: 0.28, dur: 0.45, from: hz(midi), wave: triangle, vol: 0.4 });
    return normalize(out, 0.65);
  },
  /** Weapons fire: a short "pew". */
  shoot: () => {
    const out = buffer(0.1);
    tone(out, { start: 0, dur: 0.09, from: 1500, to: 500, vol: 0.5 });
    hiss(out, 0, 0.04, 0.3, 6000, 2000);
    return normalize(out, 0.45);
  },
  /** The hero falls (out of the match): a long slide down. */
  fall: () => {
    const out = buffer(0.85);
    tone(out, { start: 0, dur: 0.8, from: 440, to: 80, wave: triangle, vol: 0.7, vibrato: [0.04, 7] });
    tone(out, { start: 0, dur: 0.6, from: 220, to: 55, vol: 0.2 });
    return normalize(out, 0.7);
  },
  /** Victory: a short fanfare. */
  win: () => {
    const out = buffer(1.2);
    arpeggio(out, 0, [67, 72, 76, 79], 0.1, 0.16, square, 0.3);
    for (const midi of [72, 76, 79, 84])
      tone(out, { start: 0.42, dur: 0.75, from: hz(midi), wave: triangle, vol: 0.35 });
    tone(out, { start: 0.42, dur: 0.75, from: hz(48), wave: triangle, vol: 0.5 });
    return normalize(out, 0.7);
  },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, build] of Object.entries(SOUNDS)) {
  const path = join(OUT_DIR, `${name}.wav`);
  writeFileSync(path, wav(build()));
  console.log(`wrote ${path}`);
}
