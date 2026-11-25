import { findMissingTranslations, LOCALES } from "@core/client/i18n";
import { ENEMIES, ENEMY_KINDS, type OfferItem, RELIC_IDS } from "@game/shared";
import { describe, expect, it } from "vitest";
import { messages } from "./messages";

/** Distinct `{name}` placeholders (plural forms may repeat them). */
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
const text = (m: unknown) => (typeof m === "string" ? m : Object.values(m as Record<string, string>).join(" "));

describe("game messages", () => {
  it("are translated for every supported locale", () => {
    expect(findMissingTranslations(messages)).toEqual({});
  });

  it("name every boss and mini-boss (boss bar, defeated toast)", () => {
    for (const kind of ENEMY_KINDS) {
      if (ENEMIES[kind].rank === "normal") continue;
      expect(messages.en?.[`enemy.${kind}`], kind).toBeTypeOf("string");
    }
  });

  it("name every item, and item names carry no emoji (the pack icons show the item)", () => {
    const items: OfferItem[] = [...RELIC_IDS, "potion"];
    for (const kind of items) {
      expect(messages.en[`item.${kind}`], kind).toBeTypeOf("string");
      // The found box (ui/foundPanel.ts) says what the item is.
      expect(messages.en[`item.${kind}.desc`], `${kind}.desc`).toBeTypeOf("string");
    }
    // One sentence per way of getting an item (GainMessage.source), around the item's name.
    for (const source of ["chest", "shop", "loot"]) expect(messages.en[`found.${source}`]).toContain("{item}");
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(messages[locale] ?? {})) {
        if (!key.startsWith("item.")) continue;
        expect(text(value), `${locale} ${key}`).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it("keep the English placeholders in every locale", () => {
    for (const locale of LOCALES) {
      for (const [key, en] of Object.entries(messages.en)) {
        const value = messages[locale]?.[key];
        if (value === undefined) continue;
        expect(placeholders(text(value)), `${locale} ${key}`).toEqual(placeholders(text(en)));
      }
    }
  });

  it("have the stage 9 keys (credits, HUD, shop)", () => {
    const keys = [
      "credits.button",
      "credits.title",
      "credits.art",
      "credits.font",
      "credits.by",
      "credits.licence",
      "credits.changes",
      "credits.files",
      "hud.standing",
      "hud.weapons",
      "item.weapon",
    ];
    for (const key of keys) expect(messages.en[key], key).toBeTypeOf("string");
    // The credits name the shipped file literally in every locale (it is wrapped in <bdi dir="ltr">).
    for (const locale of LOCALES) expect(text(messages[locale]?.["credits.files"]), locale).toContain("CREDITS.txt");
  });
});
