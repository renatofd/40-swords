import { type BeforeJoinContext, h, type JoinChoice } from "@core/client";
import { PLAYER_COLORS } from "@game/shared";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/**
 * EXAMPLE pre-join step (`GameModule.beforeJoin`): pick a colour before entering
 * the arena. Games use the same hook for character, team or map selection; the
 * choice travels in the join options and the server validates it.
 */
export function pickColor(ctx: BeforeJoinContext): Promise<JoinChoice | null> {
  const saved = Number(ctx.storage.get("color"));
  const last = Number.isInteger(saved) && saved >= 0 && saved < PLAYER_COLORS.length ? saved : 0;

  return new Promise((resolve) => {
    // Esc (handled by the core) aborts the step and returns to the menu.
    ctx.signal.addEventListener("abort", () => resolve(null));
    const pick = (color: number) => {
      ctx.storage.set("color", String(color));
      resolve({ options: { color } });
    };
    ctx.show(() =>
      h(
        "div",
        { className: "ui-panel arena-pick" },
        h("h2", {}, ctx.t("pick.title")),
        h(
          "div",
          { className: "arena-swatches" },
          ...PLAYER_COLORS.map((color, i) =>
            h("button", {
              type: "button",
              className: "arena-swatch",
              style: `--swatch: ${hex(color)}`,
              "aria-label": ctx.t("pick.color", { n: i + 1 }),
              autofocus: i === last,
              onclick: () => pick(i),
            }),
          ),
        ),
        h(
          "div",
          { className: "ui-actions" },
          h("button", { type: "button", className: "ui-button", onclick: () => resolve(null) }, ctx.t("action.back")),
        ),
      ),
    );
  });
}
