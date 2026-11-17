import { HEALTH_BAR_PX } from "./art/markerPainter";
import { ART_CELL_PX } from "./art/terrainArt";
import { passengerRoom, TROOP_CARRIER, type UnitView } from "../sim";
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
  /** One Passenger mark and the gap to the next, in art pixels. */
  readonly passengerMarkPx: { readonly width: number; readonly height: number; readonly gap: number };
}

/** Side of the bracket square round a selected Unit: wider than the Cell, so the brackets stand off the sprite. */
export const UNIT_BRACKET_PX = 16;
/** A Unit's health bar is as wide as its Cell. */
const UNIT_HEALTH_BAR = { width: ART_CELL_PX, height: HEALTH_BAR_PX } as const;
/** The digits are drawn as dots, this many across and down. */
export const GROUP_DIGIT_DOTS = { width: 3, height: 5 } as const;
/**
 * The least height of a Control Group number's digit on the screen. Under
 * this the rows of dots run together: at the widest zoom an art pixel is one
 * screen pixel, and a digit with one to the dot could not be told apart.
 */
export const MIN_GROUP_DIGIT_SCREEN_PX = 10;

/**
 * The least size of a Passenger mark, and of the gap to the next, on the
 * screen. Under this the row cannot be counted at a glance: at the widest zoom
 * marks at their art size run into a dotted line. They grow taller before
 * wider, as a mark for every place in a Troop Carrier must fit over one Unit.
 */
export const MIN_PASSENGER_MARK_SCREEN_PX = { width: 2, height: 4, gap: 2 } as const;
/** A Passenger mark and its gap in art pixels wherever the least screen size asks for no more. */
const PASSENGER_MARK_PX = { width: 2, height: 2, gap: 1 } as const;

/** The markers round a Unit at a zoom step. Only the Control Group number and the Passenger marks change with the zoom. */
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

  // Whole art pixels, as for the number's dots.
  const artPx = (part: keyof typeof PASSENGER_MARK_PX): number =>
    Math.max(PASSENGER_MARK_PX[part], Math.ceil(MIN_PASSENGER_MARK_SCREEN_PX[part] / screenPxPerArtPx));
  const passengerMarkPx = { width: artPx("width"), height: artPx("height"), gap: artPx("gap") };
  const places = TROOP_CARRIER.capacity;
  const rowWidth = places * passengerMarkPx.width + (places - 1) * passengerMarkPx.gap;
  // Above the health bar with a row of ground between: the one side of a Unit with nothing else on it.
  // At the widest zoom the row is a little wider than the brackets, as the number's plate is.
  const passengerMarks = {
    x: -rowWidth / 2,
    y: healthBar.y - 1 - passengerMarkPx.height,
    width: rowWidth,
    height: passengerMarkPx.height,
  };

  return { brackets, healthBar, groupNumber, groupDotPx, passengerMarks, passengerMarkPx };
}

/** One Passenger mark: a place for a Passenger in a Troop Carrier, bright when taken and dark when free. */
export interface PassengerMark {
  readonly box: MarkerBox;
  readonly filled: boolean;
}

/**
 * The Passenger marks over a Unit: one for every place it has, filled from
 * the left for each Passenger inside, so a glance tells how full it is. None
 * for a Unit that carries nobody, and none for the other Player's Units: the
 * view lists no Passengers for those (null), and this reads nothing else, so
 * what the other Player's Troop Carrier holds cannot show.
 */
export function passengerMarks(u: Pick<UnitView, "kind" | "passengers">, boxes: UnitMarkerBoxes): PassengerMark[] {
  const places = passengerRoom(u.kind);
  if (u.passengers === null || places === 0) return [];
  const { passengerMarks: room, passengerMarkPx: size } = boxes;
  const inside = u.passengers.length;
  return Array.from({ length: places }, (_, i) => ({
    box: { x: room.x + i * (size.width + size.gap), y: room.y, width: size.width, height: size.height },
    filled: i < inside,
  }));
}
