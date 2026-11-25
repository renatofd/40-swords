import { I18n, LOCALES } from "@core/client/i18n";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../messages";

interface FakeNode {
  tag: string;
  props: Record<string, unknown>;
  children: unknown[];
}
// @core/client pulls in Phaser (needs a browser); the match HUD's text helper only needs `h`.
vi.mock("@core/client", () => ({
  h: (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]): FakeNode => ({
    tag,
    props,
    children,
  }),
}));
vi.mock("./icons", () => ({ icon: () => ({}) }));

const { withNumbers } = await import("./matchHud");

const numbers = (parts: (string | unknown)[]) =>
  parts.filter((p): p is FakeNode => typeof p !== "string").map((p) => p.children.join(""));

describe("withNumbers", () => {
  it("keeps ready/total in one left-to-right run in every locale (RTL would reverse two isolates)", () => {
    for (const locale of LOCALES) {
      const i18n = new I18n(messages);
      i18n.setLocale(locale);
      const parts = withNumbers(i18n.t, "match.lobby", { ready: 7, total: 12 });
      expect(numbers(parts), locale).toEqual(["7/12"]);
    }
  });

  it("puts each lone number in its own span", () => {
    const i18n = new I18n(messages);
    i18n.setLocale("en");
    const parts = withNumbers(i18n.t, "match.pvp", { time: "2:41" });
    expect(numbers(parts)).toEqual(["2:41"]);
    expect(parts[0]).toBe(i18n.t("match.pvp", { time: "" }));
  });
});
