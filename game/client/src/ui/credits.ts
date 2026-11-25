import { h, type Translate, type TranslateParams } from "@core/client";
import { icon } from "./icons";

/**
 * Credits screen (from hero select) and the attribution data it shows. The art
 * licence (CC BY-SA 4.0) asks for the work, the author, the licence with its URL
 * and a note of our changes; `apps/client/public/CREDITS.txt` ships the full
 * list next to the game (credits.test.ts checks that both agree).
 */

/** The pixel art pack every sprite, tile, icon and UI frame comes from. */
export const ART_CREDIT = {
  work: "#NotZelda Overhead Adventure Tiles",
  pack: "Super Overhead Adventure 3",
  version: "vSUPER 1.0",
  author: "Raphael Azcueta",
  license: "CC BY-SA 4.0",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

/** The pixel font of numbers and short labels (bundled from @fontsource/tiny5). */
export const FONT_CREDIT = {
  work: "Tiny5",
  author: "The Tiny5 Project Authors",
  license: "SIL Open Font License 1.1",
  url: "https://openfontlicense.org",
  source: "https://github.com/Gissio/font_tiny5",
} as const;

/** The file named by `credits.files`, shipped at the root of the game. */
const CREDITS_FILE = "CREDITS.txt";

/** A piece of a credits line: translated text, or a literal (name, title, URL) kept left-to-right. */
type Part = string | { ltr: string; strong?: boolean };
/** `icons`: the decorative icon row follows this line in the panel. */
type Line = { tag: "h2" | "h3" | "p"; parts: Part[]; icons?: true };

const ltr = (text: string, strong = false): Part => ({ ltr: text, strong });

/**
 * A translated message whose parameters are literals: the result is split around
 * them so the panel can isolate each one (`<bdi dir="ltr">`), e.g. the author in
 * "بواسطة {author}".
 */
function literalParams(t: Translate, key: string, params: TranslateParams): Part[] {
  const values = Object.values(params).map(String);
  const marks = Object.fromEntries(Object.keys(params).map((name, i) => [name, `\uE000${i}\uE000`]));
  return t(key, marks)
    .split(/\uE000(\d+)\uE000/)
    .map((piece, i) => (i % 2 === 0 ? piece : ltr(values[Number(piece)] ?? "")))
    .filter((part) => part !== "");
}

/** `credits.files`, with the file name isolated. */
const filesLine = (t: Translate): Part[] =>
  t("credits.files")
    .split(CREDITS_FILE)
    .flatMap((piece, i) => (i === 0 ? [piece] : [ltr(CREDITS_FILE), piece]))
    .filter((part) => part !== "");

function lines(t: Translate): Line[] {
  const a = ART_CREDIT;
  const f = FONT_CREDIT;
  return [
    { tag: "h2", parts: [t("credits.title")] },
    { tag: "h3", parts: [t("credits.art")] },
    {
      tag: "p",
      parts: [
        ltr(a.work, true),
        " (",
        ltr(`${a.pack} ${a.version}`),
        ") — ",
        ...literalParams(t, "credits.by", { author: a.author }),
      ],
    },
    { tag: "p", parts: [...literalParams(t, "credits.licence", { licence: a.license }), " · ", ltr(a.url)] },
    { tag: "p", parts: [t("credits.changes")], icons: true },
    { tag: "h3", parts: [t("credits.font")] },
    {
      tag: "p",
      parts: [
        ltr(f.work),
        " — ",
        ...literalParams(t, "credits.by", { author: f.author }),
        " · ",
        ...literalParams(t, "credits.licence", { licence: f.license }),
        " · ",
        ltr(f.url),
        " · ",
        ltr(f.source),
      ],
    },
    { tag: "p", parts: filesLine(t) },
  ];
}

/** The credits as plain text, one entry per heading or paragraph (what the panel shows, in order). */
export function creditLines(t: Translate): string[] {
  return lines(t).map((line) => line.parts.map((part) => (typeof part === "string" ? part : part.ltr)).join(""));
}

/**
 * The credits panel. URLs are selectable plain text, never links (game portals
 * forbid outbound links; the licence accepts the URI as text). Every literal is
 * isolated left-to-right, so "#NotZelda…" and the URLs read right in Arabic.
 * Back (autofocused) calls `onBack`.
 */
export function creditsPanel(t: Translate, onBack: () => void): HTMLElement {
  const titleId = "sw-credits-title";
  const render = (part: Part) => {
    if (typeof part === "string") return part;
    const bdi = h("bdi", { dir: "ltr" }, part.ltr);
    return part.strong ? h("strong", {}, bdi) : bdi;
  };
  const iconRow = () =>
    h(
      "div",
      { className: "sw-credits-icons", "aria-hidden": "true" },
      icon("heart"),
      icon("chest"),
      icon("power"),
      icon("potion"),
    );
  const nodes = lines(t).flatMap((line, i) => {
    const node = h(line.tag, i === 0 ? { id: titleId } : {}, ...line.parts.map(render));
    return line.icons ? [node, iconRow()] : [node];
  });
  return h(
    "section",
    { className: "sw-credits", role: "dialog", "aria-labelledby": titleId },
    ...nodes,
    h(
      "div",
      { className: "ui-actions" },
      h("button", { type: "button", className: "ui-button", autofocus: true, onclick: onBack }, t("select.back")),
    ),
  );
}
