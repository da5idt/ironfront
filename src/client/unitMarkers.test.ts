import { describe, expect, it } from "vitest";
import { ZOOM_STEPS_PX } from "./camera";
import { type MarkerBox, MIN_GROUP_DIGIT_SCREEN_PX, unitMarkerBoxes } from "./unitMarkers";

/** The art is 12 pixels to the Cell (ADR 0003), so this is how many screen pixels one art pixel takes. */
const screenPxPerArtPx = (cellPx: number): number => cellPx / 12;

const overlaps = (a: MarkerBox, b: MarkerBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("the markers round a Unit", () => {
  it("draw the Control Group number's digit at least 10 screen pixels tall at every zoom step", () => {
    expect(MIN_GROUP_DIGIT_SCREEN_PX).toBe(10);
    // The digit is 3 by 5 dots; the widest zoom shows one art pixel as one screen pixel.
    const digitHeights = ZOOM_STEPS_PX.map((cellPx) => 5 * unitMarkerBoxes(cellPx).groupDotPx * screenPxPerArtPx(cellPx));
    expect(digitHeights).toEqual([10, 10, 15]);
  });

  it("make the number's dots no bigger than the least readable size asks for", () => {
    expect(ZOOM_STEPS_PX.map((cellPx) => unitMarkerBoxes(cellPx).groupDotPx)).toEqual([2, 1, 1]);
  });

  it("give the number a dark plate one art pixel wider than the digit all round", () => {
    expect(ZOOM_STEPS_PX.map((cellPx) => unitMarkerBoxes(cellPx).groupNumber)).toEqual([
      expect.objectContaining({ width: 8, height: 12 }),
      expect.objectContaining({ width: 5, height: 7 }),
      expect.objectContaining({ width: 5, height: 7 }),
    ]);
  });

  it("keep the number clear of the selection brackets, the health bar and the room for Passenger marks at every zoom step", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      const boxes = unitMarkerBoxes(cellPx);
      expect(overlaps(boxes.groupNumber, boxes.brackets), `brackets at ${cellPx}`).toBe(false);
      expect(overlaps(boxes.groupNumber, boxes.healthBar), `health bar at ${cellPx}`).toBe(false);
      expect(overlaps(boxes.groupNumber, boxes.passengerMarks), `Passenger marks at ${cellPx}`).toBe(false);
    }
  });

  it("leave room for five Passenger marks of two art pixels with a gap between, clear of the brackets and the health bar", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      const boxes = unitMarkerBoxes(cellPx);
      expect(boxes.passengerMarks.width).toBeGreaterThanOrEqual(5 * 2 + 4);
      expect(boxes.passengerMarks.height).toBeGreaterThanOrEqual(2);
      expect(overlaps(boxes.passengerMarks, boxes.brackets)).toBe(false);
      expect(overlaps(boxes.passengerMarks, boxes.healthBar)).toBe(false);
    }
  });

  it("hang the number under the Unit's bottom-left corner, straddling the Cell's left edge so it sits between the Units below", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      const { groupNumber } = unitMarkerBoxes(cellPx);
      // Under the brackets and their one-pixel dark edge, which end 9 art pixels below the Unit's centre.
      expect(groupNumber.y).toBe(9);
      // The Cell's left edge is 6 art pixels left of the Unit's centre.
      expect(groupNumber.x).toBeLessThan(-6);
      expect(groupNumber.x + groupNumber.width).toBeGreaterThan(-6);
    }
    expect(unitMarkerBoxes(12).groupNumber.x).toBe(-10);
    expect(unitMarkerBoxes(24).groupNumber.x).toBe(-8);
  });

  it("keep the brackets and the health bar where they were at every zoom step", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      const boxes = unitMarkerBoxes(cellPx);
      // The bracket square is 16 art pixels, with a dark edge one pixel down and right.
      expect(boxes.brackets).toEqual({ x: -8, y: -8, width: 17, height: 17 });
      expect(boxes.healthBar).toEqual({ x: -6, y: -10, width: 12, height: 3 });
    }
  });
});
