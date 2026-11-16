import { describe, expect, it } from "vitest";
import { ZOOM_STEPS_PX } from "./camera";
import type { UnitKind, UnitView } from "../sim";
import {
  type MarkerBox,
  MIN_GROUP_DIGIT_SCREEN_PX,
  MIN_PASSENGER_MARK_SCREEN_PX,
  passengerMarks,
  unitMarkerBoxes,
} from "./unitMarkers";

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

  it("leave room for five Passenger marks of two art pixels with a gap between, clear of the brackets and the health bar at every zoom step", () => {
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

describe("Passenger marks", () => {
  /** A Unit as its owner's view lists it (UnitView in src/sim/view.ts) with this many Riflemen inside, or as the other Player's view does (null). */
  const unit = (kind: UnitKind, inside: number | null): Pick<UnitView, "kind" | "passengers"> => ({
    kind,
    passengers: inside === null ? null : Array.from({ length: inside }, (_, i) => ({ id: 100 + i, kind: "rifleman" as const })),
  });

  it("show five places on an own Troop Carrier, filled from the left for as many Passengers as are inside", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      for (let inside = 0; inside <= 5; inside++) {
        const marks = passengerMarks(unit("troopCarrier", inside), unitMarkerBoxes(cellPx));
        expect(marks.map((m) => m.filled)).toEqual([0, 1, 2, 3, 4].map((i) => i < inside));
      }
    }
  });

  it("never show on the other Player's Troop Carrier, whose Passengers the view does not list", () => {
    for (const cellPx of ZOOM_STEPS_PX) expect(passengerMarks(unit("troopCarrier", null), unitMarkerBoxes(cellPx))).toEqual([]);
  });

  it("do not show on a Unit that carries nobody", () => {
    for (const kind of ["rifleman", "medic", "raider", "harvester"] as const) {
      expect(passengerMarks(unit(kind, 0), unitMarkerBoxes(24))).toEqual([]);
    }
  });

  it("stay readable at every zoom step: in the room kept for them, at least two screen pixels each way and a gap of at least one between", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      const room = unitMarkerBoxes(cellPx).passengerMarks;
      const boxes = passengerMarks(unit("troopCarrier", 5), unitMarkerBoxes(cellPx)).map((m) => m.box);
      expect(boxes).toHaveLength(5);
      boxes.forEach((box, i) => {
        expect(Number.isInteger(box.x) && Number.isInteger(box.y)).toBe(true);
        expect(box.x).toBeGreaterThanOrEqual(room.x);
        expect(box.x + box.width).toBeLessThanOrEqual(room.x + room.width);
        expect(box.y).toBeGreaterThanOrEqual(room.y);
        expect(box.y + box.height).toBeLessThanOrEqual(room.y + room.height);
        expect(box.width * screenPxPerArtPx(cellPx)).toBeGreaterThanOrEqual(2);
        expect(box.height * screenPxPerArtPx(cellPx)).toBeGreaterThanOrEqual(2);
        const next = boxes[i + 1];
        if (next) expect((next.x - (box.x + box.width)) * screenPxPerArtPx(cellPx)).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it("can be counted at every zoom step: each at least 2 screen pixels wide and 4 tall, with at least 2 between", () => {
    expect(MIN_PASSENGER_MARK_SCREEN_PX).toEqual({ width: 2, height: 4, gap: 2 });
    const sizes = ZOOM_STEPS_PX.map((cellPx) => {
      const boxes = passengerMarks(unit("troopCarrier", 5), unitMarkerBoxes(cellPx)).map((m) => m.box);
      const px = screenPxPerArtPx(cellPx);
      return { width: boxes[0]!.width * px, height: boxes[0]!.height * px, gap: (boxes[1]!.x - boxes[0]!.x - boxes[0]!.width) * px };
    });
    // Widest zoom first: there an art pixel is one screen pixel, and a mark of two by two with one between ran together.
    expect(sizes).toEqual([
      { width: 2, height: 4, gap: 2 },
      { width: 4, height: 4, gap: 2 },
      { width: 6, height: 6, gap: 3 },
    ]);
  });

  it("sit in the middle of the Unit, as wide to its left as to its right", () => {
    for (const cellPx of ZOOM_STEPS_PX) {
      const boxes = passengerMarks(unit("troopCarrier", 5), unitMarkerBoxes(cellPx)).map((m) => m.box);
      expect(boxes[0]!.x).toBe(-(boxes[4]!.x + boxes[4]!.width));
    }
  });
});
