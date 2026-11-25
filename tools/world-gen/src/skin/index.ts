/**
 * The skin: glyph grid → tile keys on the five tile layers. Each part owns its
 * screens; generate.ts only calls skinWorld.
 */
import { SkinLayers, type WorldView } from "./common";
import { skinInterior } from "./interior";
import { skinOverworld } from "./overworld";

export { LAYERS, type LayerName, type ScreenInfo, type ScreenKind, SkinLayers, type WorldView } from "./common";

export function skinWorld(view: WorldView): SkinLayers {
  const out = new SkinLayers(view.width, view.height);
  skinOverworld(view, out);
  skinInterior(view, out);
  return out;
}
