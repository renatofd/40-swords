/** A screen rectangle in CSS px (as getBoundingClientRect gives it). */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the found box opens, as in the Zelda games: at the top, unless the
 * hero stands where it would cover them (within `margin` CSS px); then at the
 * bottom of the screen. Decided when each box opens; it does not move after.
 */
export function foundAtBottom(boxAtTop: ScreenBox, hero: ScreenBox, margin: number): boolean {
  return (
    hero.right > boxAtTop.left - margin &&
    hero.left < boxAtTop.right + margin &&
    hero.bottom > boxAtTop.top - margin &&
    hero.top < boxAtTop.bottom + margin
  );
}
