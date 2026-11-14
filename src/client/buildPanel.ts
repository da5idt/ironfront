import { BUILDING_STATS, type BuildingKind, type CellPos, type Command, HQ_BUILDS, type PlayerView } from "../sim";
import { contains, type Rect } from "./layout";

// The HQ's build buttons in the side panel: where they are, what state each
// is in and what a click on one means. Pure, so the rules are unit tested;
// the renderer draws from the same functions and main.ts acts on the result.

/** A button with text only: the train buttons, until they get pictures. */
export const BUTTON_HEIGHT = 44;
/** A build button: tall enough for a 3 by 3 Cell Building's picture at twice its art size. */
export const BUILD_BUTTON_HEIGHT = 80;
export const BUTTON_GAP = 6;
export const BUTTON_MARGIN = 10;
/** Room above the buttons for the panel's heading. */
export const BUTTONS_HEADER = 20;

export interface BuildButton {
  readonly kind: BuildingKind;
  readonly rect: Rect;
}

/** What a build button shows. "unaffordable" and "busy" are greyed out. */
export type ButtonState = "available" | "unaffordable" | "busy" | "building" | "ready";

/** What the panel reads from a PlayerView. */
export type PanelView = Pick<PlayerView, "credits" | "production">;

export type PanelAction =
  | { readonly type: "command"; readonly command: Command }
  /** Enter placement mode for the finished Building. */
  | { readonly type: "place"; readonly kind: BuildingKind };

export function buildButtons(area: Rect): BuildButton[] {
  return HQ_BUILDS.map((kind, i) => ({
    kind,
    rect: {
      x: area.x + BUTTON_MARGIN,
      y: area.y + BUTTONS_HEADER + i * (BUILD_BUTTON_HEIGHT + BUTTON_GAP),
      width: Math.max(0, area.width - BUTTON_MARGIN * 2),
      height: BUILD_BUTTON_HEIGHT,
    },
  }));
}

export function buttonAt(buttons: readonly BuildButton[], x: number, y: number): BuildingKind | null {
  return buttons.find((b) => contains(b.rect, x, y))?.kind ?? null;
}

export function buttonState(view: PanelView, kind: BuildingKind): ButtonState {
  const p = view.production;
  if (p) {
    if (p.kind !== kind) return "busy";
    return p.ready ? "ready" : "building";
  }
  return view.credits >= BUILDING_STATS[kind].cost ? "available" : "unaffordable";
}

/**
 * What the button shows: its state, or "placing" on the finished Building's
 * button while the person is picking its spot, so placing mode shows even
 * with the mouse still over the panel.
 */
export function buttonLook(view: PanelView, kind: BuildingKind, placing: BuildingKind | null): ButtonState | "placing" {
  const state = buttonState(view, kind);
  return state === "ready" && placing === kind ? "placing" : state;
}

/** Left-click starts or places; clicking the one in progress, or right-clicking it, cancels. */
export function panelClick(view: PanelView, kind: BuildingKind, button: "left" | "right"): PanelAction | null {
  switch (buttonState(view, kind)) {
    case "available":
      return button === "left" ? { type: "command", command: { type: "startBuilding", kind } } : null;
    case "building":
      return { type: "command", command: { type: "cancelBuilding" } };
    case "ready":
      return button === "left" ? { type: "place", kind } : { type: "command", command: { type: "cancelBuilding" } };
    case "unaffordable":
    case "busy":
      return null;
  }
}

/** The footprint's top-left Cell when the mouse is over `cell`, so the preview sits centred on the pointer. */
export function footprintAt(kind: BuildingKind, cell: CellPos): CellPos {
  const { width, height } = BUILDING_STATS[kind];
  return { x: cell.x - Math.floor(width / 2), y: cell.y - Math.floor(height / 2) };
}
