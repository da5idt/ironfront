import { HEALTH_BAR_PX } from "./art/markerPainter";
import { ART_CELL_PX } from "./art/terrainArt";
import type { ZoomStepPx } from "./camera";

// Where the markers round a Unit go: selection brackets, health bar, Control
// Group number and the room kept for Passenger marks. Kept pure, and in one
// place, so a test can hold them apart at every zoom step.

/** A rect in art pixels, measured from the Unit's centre. */
export interface MarkerBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UnitMarkerBoxes {
  /** The bracket square with the dark edge one pixel down and right of it. */
  readonly brackets: MarkerBox;
  readonly healthBar: MarkerBox;
  /** The Control Group number's dark plate. */
  readonly groupNumber: MarkerBox;
  /** Art pixels to one dot of the number's digit. */
  readonly groupDotPx: number;
  /** Room for a row of Passenger marks; nothing else is drawn here. */
  readonly passengerMarks: MarkerBox;
}

/** Side of the bracket square round a selected Unit: wider than the Cell, so the brackets stand off the sprite. */
export const UNIT_BRACKET_PX = 16;
/** A Unit's health bar is as wide as its Cell. */
const UNIT_HEALTH_BAR = { width: ART_CELL_PX, height: HEALTH_BAR_PX } as const;
/** The digits are drawn as dots, this many across and down. */
export const GROUP_DIGIT_DOTS = { width: 3, height: 5 } as const;
/**
 * The least height of a Control Group number's digit on the screen. Under
 * this the five rows of dots run together: at the widest zoom an art pixel is
 * one screen pixel, and a digit five of them tall could not be told apart.
 */
export const MIN_GROUP_DIGIT_SCREEN_PX = 10;

/** The markers round a Unit at a zoom step. Only the Control Group number changes with the zoom. */
export function unitMarkerBoxes(cellPx: ZoomStepPx): UnitMarkerBoxes {
  const half = UNIT_BRACKET_PX / 2;
  const brackets = { x: -half, y: -half, width: UNIT_BRACKET_PX + 1, height: UNIT_BRACKET_PX + 1 };
  // The bar's bottom row shares the top brackets' row, between their arms.
  const healthBar = { x: -UNIT_HEALTH_BAR.width / 2, y: -half - UNIT_HEALTH_BAR.height + 1, ...UNIT_HEALTH_BAR };

  const screenPxPerArtPx = cellPx / ART_CELL_PX;
  // Whole art pixels to the dot, so the digit stays as crisp as the art round it.
  const groupDotPx = Math.max(1, Math.ceil(MIN_GROUP_DIGIT_SCREEN_PX / (GROUP_DIGIT_DOTS.height * screenPxPerArtPx)));
  const width = GROUP_DIGIT_DOTS.width * groupDotPx + 2;
  const height = GROUP_DIGIT_DOTS.height * groupDotPx + 2;
  const groupNumber = {
    // Centred on the Cell's left edge: at the widest zoom the plate is most of a Cell wide, and here
    // it falls in the gap between the two Units standing below rather than on top of either.
    x: -ART_CELL_PX / 2 - Math.floor(width / 2),
    y: brackets.y + brackets.height,
    width,
    height,
  };

  // Above the health bar with a row of ground between: the one side of a Unit with nothing else on it,
  // and wide enough for five marks two art pixels wide.
  const passengerMarks = { x: -half + 1, y: healthBar.y - 3, width: UNIT_BRACKET_PX - 2, height: 2 };

  return { brackets, healthBar, groupNumber, groupDotPx, passengerMarks };
}
