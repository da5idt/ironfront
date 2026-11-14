import { type BuildingKind, canPlaceBuilding, type CellPos, type Command, type PlayerView } from "../sim";
import { footprintAt } from "./buildPanel";

// Placing a finished Building: one click on its button (or its number key)
// puts it on the cursor, one click on the Map places it, so no mouse button is
// ever held. Pure, so main.ts only feeds it the Cell under the mouse and acts
// on the outcome. Escape is decided with the other keys in screenOverlay.keyAction.

export interface PlacingPreview {
  readonly kind: BuildingKind;
  /** The footprint's top-left Cell. */
  readonly at: CellPos;
  readonly valid: boolean;
}

export type PlacingOutcome =
  /** Issue the Command and leave placing mode. */
  | { readonly type: "place"; readonly command: Command }
  /** Stay in placing mode; the "can't build there" sound hangs off this outcome. */
  | { readonly type: "cantBuildThere" }
  /** Leave placing mode without ordering anything. */
  | { readonly type: "cancel" };

/** The footprint centred on the Cell under the mouse, and whether the Building fits there. */
export function placingPreview(view: PlayerView, kind: BuildingKind, cell: CellPos): PlacingPreview {
  const at = footprintAt(kind, cell);
  return { kind, at, valid: canPlaceBuilding(view, kind, at) };
}

/** A click on the Map while placing `kind`, with the mouse over `cell`. */
export function placingMapClick(
  view: PlayerView,
  kind: BuildingKind,
  cell: CellPos,
  button: "left" | "right",
): PlacingOutcome {
  if (button === "right") return { type: "cancel" };
  const preview = placingPreview(view, kind, cell);
  return preview.valid
    ? { type: "place", command: { type: "placeBuilding", at: preview.at } }
    : { type: "cantBuildThere" };
}
