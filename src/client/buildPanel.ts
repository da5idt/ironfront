import { BUILDING_STATS, type BuildingKind, type CellPos, type Command, HQ_BUILDS, type PlayerView } from "../sim";
import { contains, type Rect } from "./layout";

// The HQ's build buttons in the side panel: where they are, what state each
// is in and what a click on one means. Pure, so the rules are unit tested;
// the renderer draws from the same functions and main.ts acts on the result.

/** A build or train button at full size: tall enough for a 3 by 3 Cell Building's picture at twice its art size. */
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

/** The most buttons a menu has; every menu's buttons are sized as if it had this many, so they do not change size from menu to menu. */
const MENU_SLOTS = 4;
/** The gap between buttons squeezed for room: enough to tell them apart. */
const TIGHT_BUTTON_GAP = 4;

/**
 * Where a menu's first `count` buttons go in `area`, top to bottom. Full size
 * where the area has room for a whole menu; in a shorter one (a short window
 * leaves little between the minimap and the sound strip) the gaps and then
 * the buttons shrink, so the last button always ends inside the area.
 */
export function menuButtonRects(area: Rect, count: number): Rect[] {
  const room = Math.max(0, area.height - BUTTONS_HEADER);
  const heightWith = (gap: number): number => Math.floor((room - (MENU_SLOTS - 1) * gap) / MENU_SLOTS);
  const roomy = heightWith(BUTTON_GAP) >= BUILD_BUTTON_HEIGHT;
  const height = roomy ? BUILD_BUTTON_HEIGHT : Math.max(0, heightWith(TIGHT_BUTTON_GAP));
  // With no room at all the buttons are nothing, stacked at the area's end: gaps alone would still run past it.
  const gap = roomy ? BUTTON_GAP : height > 0 ? TIGHT_BUTTON_GAP : 0;
  const top = area.y + Math.min(BUTTONS_HEADER, Math.max(0, area.height));
  return Array.from({ length: count }, (_, i) => ({
    x: area.x + BUTTON_MARGIN,
    y: top + i * (height + gap),
    width: Math.max(0, area.width - BUTTON_MARGIN * 2),
    height,
  }));
}

export function buildButtons(area: Rect): BuildButton[] {
  const rects = menuButtonRects(area, HQ_BUILDS.length);
  return HQ_BUILDS.map((kind, i) => ({ kind, rect: rects[i]! }));
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

/** Left-click starts or places; right-click cancels the one in progress or waiting. A left-click on the one in progress does nothing, so a second click on a button just pressed cannot throw the Building away. */
export function panelClick(view: PanelView, kind: BuildingKind, button: "left" | "right"): PanelAction | null {
  switch (buttonState(view, kind)) {
    case "available":
      return button === "left" ? { type: "command", command: { type: "startBuilding", kind } } : null;
    case "building":
      return button === "right" ? { type: "command", command: { type: "cancelBuilding" } } : null;
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
