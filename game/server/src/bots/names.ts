import type { Rng } from "@game/shared";

/** Marks bots wherever names are shown (labels, scoreboard, kill feed). */
export const BOT_MARK = "🤖";

const FIRST = ["Ka", "Ri", "Mo", "Ta", "Zu", "Ve", "Lo", "Ni", "Sa", "Bo", "Fe", "Gri", "Tor", "El", "Ash", "Kel"];
const MIDDLE = ["", "", "", "la", "ri", "va", "do", "mi"];
const LAST = ["ro", "na", "lin", "dor", "mi", "ra", "ven", "ko", "sa", "rik", "lo", "mun", "tis", "ga", "rel", "bas"];

const pick = (items: readonly string[], rng: Rng) => items[Math.floor(rng() * items.length)] ?? "";

/** An invented name for a bot, not already in `taken`. */
export function botName(rng: Rng, taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 30; attempt++) {
    const name = `${BOT_MARK} ${pick(FIRST, rng)}${pick(MIDDLE, rng)}${pick(LAST, rng)}`;
    if (!taken.has(name)) return name;
  }
  for (let n = 1; ; n++) if (!taken.has(`${BOT_MARK} Bot ${n}`)) return `${BOT_MARK} Bot ${n}`;
}
