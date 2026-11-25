import { findMissingTranslations } from "@core/client/i18n";
import { ENEMIES, ENEMY_KINDS } from "@game/shared";
import { describe, expect, it } from "vitest";
import { messages } from "./messages";

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
});
