import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { I18n, LOCALES } from "@core/client/i18n";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../messages";

/** Minimal DOM stand-in: `h()` builds plain nodes, so the panel's structure can be checked without a browser. */
interface FakeNode {
  tag: string;
  props: Record<string, unknown>;
  children: (FakeNode | string)[];
}
// @core/client pulls in Phaser (needs a browser); the panel only needs `h`. Icons need the Vite asset glob.
vi.mock("@core/client", () => ({
  h: (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]): FakeNode => ({
    tag,
    props,
    children: children.filter((c): c is FakeNode | string => c !== null && c !== undefined && c !== false),
  }),
}));
vi.mock("./icons", () => ({ icon: (name: string) => ({ tag: "span", props: { "data-icon": name }, children: [] }) }));

const { ART_CREDIT, FONT_CREDIT, creditLines, creditsPanel } = await import("./credits");

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const i18n = (locale: (typeof LOCALES)[number]) => {
  const i = new I18n(messages);
  i.setLocale(locale);
  return i.t;
};

const walk = (node: FakeNode | string, fn: (n: FakeNode) => void) => {
  if (typeof node === "string") return;
  fn(node);
  for (const child of node.children) walk(child, fn);
};
const textOf = (node: FakeNode | string): string =>
  typeof node === "string" ? node : node.children.map(textOf).join("");

describe("credits", () => {
  it("name the work, pack version, author, licence and URL in every locale", () => {
    for (const locale of LOCALES) {
      const text = creditLines(i18n(locale)).join("\n");
      for (const value of [...Object.values(ART_CREDIT), ...Object.values(FONT_CREDIT), "CREDITS.txt"]) {
        expect(text, `${locale}: ${value}`).toContain(value);
      }
      expect(text, locale).toContain(i18n(locale)("credits.changes"));
    }
  });

  it("panel: dialog titled by its h2, every literal isolated LTR, decorative icons, Back autofocused", () => {
    const onBack = vi.fn();
    const t = i18n("ar");
    const panel = creditsPanel(t, onBack) as unknown as FakeNode;
    expect(panel.tag).toBe("section");
    expect(panel.props).toMatchObject({ className: "sw-credits", role: "dialog" });
    const nodes: FakeNode[] = [];
    walk(panel, (n) => nodes.push(n));
    const title = nodes.find((n) => n.tag === "h2");
    expect(title?.props.id).toBe(panel.props["aria-labelledby"]);
    expect(textOf(title as FakeNode)).toBe(t("credits.title"));

    const bdi = nodes.filter((n) => n.tag === "bdi");
    expect(bdi.every((n) => n.props.dir === "ltr")).toBe(true);
    const literals = bdi.map(textOf);
    for (const value of [
      ART_CREDIT.work,
      `${ART_CREDIT.pack} ${ART_CREDIT.version}`,
      ART_CREDIT.author,
      ART_CREDIT.license,
      ART_CREDIT.url,
      FONT_CREDIT.work,
      FONT_CREDIT.author,
      FONT_CREDIT.license,
      FONT_CREDIT.url,
      FONT_CREDIT.source,
      "CREDITS.txt",
    ]) {
      expect(literals, value).toContain(value);
    }
    // No links: the URLs are plain text.
    expect(nodes.some((n) => n.tag === "a")).toBe(false);
    // The paragraphs read exactly as creditLines (the bdi only wrap literals).
    expect(nodes.filter((n) => /^h[23]$|^p$/.test(n.tag)).map(textOf)).toEqual(creditLines(t));

    const icons = nodes.find((n) => n.props.className === "sw-credits-icons");
    expect(icons?.props["aria-hidden"]).toBe("true");
    expect(icons?.children.map((c) => (c as FakeNode).props["data-icon"])).toEqual([
      "heart",
      "chest",
      "power",
      "potion",
    ]);

    const back = nodes.find((n) => n.tag === "button");
    if (!back) throw new Error("no Back button");
    expect(back.props).toMatchObject({ autofocus: true, className: "ui-button" });
    expect(textOf(back)).toBe(t("select.back"));
    (back.props.onclick as () => void)();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("CREDITS.txt (shipped with the game) carries every credit, the legal code and the author's notice verbatim", () => {
    const txt = read("apps/client/public/CREDITS.txt");
    for (const value of [...Object.values(ART_CREDIT), ...Object.values(FONT_CREDIT)]) expect(txt).toContain(value);
    expect(txt).toContain("https://creativecommons.org/licenses/by-sa/4.0/legalcode");
    expect(txt).toContain("licenses/OFL-1.1-Tiny5.txt");
    // The licensing paragraph of the pack's ReadMe (CC BY-SA asks to keep the licensor's notices).
    const readme = read("content/src/notzelda/ReadMe.txt").split(/\r?\n/);
    const notice = readme.slice(readme.indexOf("Licensing:") + 1).filter((line) => line.trim() !== "");
    expect(notice.length).toBeGreaterThanOrEqual(3);
    for (const line of notice) expect(txt).toContain(line);
  });

  it("ships the OFL text of Tiny5 byte for byte", () => {
    const require = createRequire(join(ROOT, "game/client/package.json"));
    const original = readFileSync(require.resolve("@fontsource/tiny5/LICENSE"));
    expect(readFileSync(join(ROOT, "apps/client/public/licenses/OFL-1.1-Tiny5.txt")).equals(original)).toBe(true);
  });

  it("content/CREDITS.md names every pack file copied to content/src/notzelda", () => {
    const md = read("content/CREDITS.md");
    // Names inside backtick code spans, with brace groups expanded: `a {x, y}.png` → `a x.png`, `a y.png`.
    const names: string[] = [];
    for (const [, span = ""] of md.matchAll(/`([^`]+)`/g)) {
      const [, before, items, after] = /^(.*)\{([^}]*)\}(.*)$/.exec(span) ?? [];
      if (items === undefined) names.push(span);
      else for (const item of items.split(",")) names.push(`${before}${item.trim()}${after}`);
    }
    const dir = join(ROOT, "content/src/notzelda");
    const pngs: string[] = [];
    const scan = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.png$/i.test(entry.name)) pngs.push(relative(dir, full).split("\\").join("/"));
      }
    };
    scan(dir);
    expect(pngs.length).toBeGreaterThan(0);
    // A file matches when a path suffix (at least its basename) is named.
    const suffixes = (path: string) => path.split("/").map((_, i, parts) => parts.slice(i).join("/"));
    const missing = pngs.filter((png) => !suffixes(png).some((s) => names.includes(s)));
    expect(missing).toEqual([]);
  });
});
