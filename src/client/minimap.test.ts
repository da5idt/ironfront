import { describe, expect, it } from "vitest";
import { cameraFrame, cameraOnMinimapPoint, minimapToCell, minimapToMap } from "./minimap";

const box = { x: 1000, y: 10, width: 200, height: 200 };

describe("the Cell under a minimap pixel", () => {
  it("is a whole Cell on the Map, even at the far edge and outside the box", () => {
    const map = { width: 64, height: 64 };
    expect(minimapToCell(box, map, 1101, 111)).toEqual({ x: 32, y: 32 });
    expect(minimapToCell(box, map, 1200, 210)).toEqual({ x: 63, y: 63 });
    expect(minimapToCell(box, map, 900, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("minimap to Map", () => {
  it("maps the minimap's corners and centre onto a square Map", () => {
    const map = { width: 64, height: 64 };
    expect(minimapToMap(box, map, 1000, 10)).toEqual({ x: 0, y: 0 });
    expect(minimapToMap(box, map, 1100, 110)).toEqual({ x: 32, y: 32 });
    expect(minimapToMap(box, map, 1150, 60)).toEqual({ x: 48, y: 16 });
  });

  it("keeps a wide Map's shape, centred with bands above and below", () => {
    // 80x40 Cells in a 200px square: 2.5px per Cell, drawn 100px tall from y = 60.
    const map = { width: 80, height: 40 };
    expect(minimapToMap(box, map, 1000, 60)).toEqual({ x: 0, y: 0 });
    expect(minimapToMap(box, map, 1200, 160)).toEqual({ x: 80, y: 40 });
    expect(minimapToMap(box, map, 1100, 110)).toEqual({ x: 40, y: 20 });
  });

  it("keeps a tall Map's shape, centred with bands left and right", () => {
    // 40x80 Cells: 2.5px per Cell, drawn 100px wide from x = 1050.
    const map = { width: 40, height: 80 };
    expect(minimapToMap(box, map, 1050, 10)).toEqual({ x: 0, y: 0 });
    expect(minimapToMap(box, map, 1125, 110)).toEqual({ x: 30, y: 40 });
  });

  it("clamps a point in a band or past the edge onto the Map", () => {
    const map = { width: 80, height: 40 };
    expect(minimapToMap(box, map, 1100, 20)).toEqual({ x: 40, y: 0 });
    expect(minimapToMap(box, map, 1300, 205)).toEqual({ x: 80, y: 40 });
  });
});

describe("camera frame on the minimap", () => {
  it("outlines the part of the Map the camera shows", () => {
    // 64 Cells in 200px is 3.125px per Cell; the camera shows Cells (10, 20) to (50, 50).
    const frame = cameraFrame(box, { width: 64, height: 64 }, { x: 240, y: 480, cellPx: 24 }, { width: 960, height: 720 });
    expect(frame).toEqual({ x: 1031.25, y: 72.5, width: 125, height: 93.75 });
  });

  it("stays inside the Map's area when the view is larger than the Map", () => {
    // A 10x10 Map centred in a 480x480 view: the camera starts at -120.
    const frame = cameraFrame(box, { width: 10, height: 10 }, { x: -120, y: -120, cellPx: 24 }, { width: 480, height: 480 });
    expect(frame).toEqual(box);
  });
});

describe("camera frame at each zoom step", () => {
  const bigMap = { width: 200, height: 200 };
  const view = { width: 960, height: 720 };

  for (const cellPx of [12, 24, 36]) {
    it(`covers the Cells on screen at ${cellPx} pixels per Cell`, () => {
      // The view starts at Cell (50, 40); the minimap shows 200 Cells in 200px, one pixel per Cell.
      const frame = cameraFrame(box, bigMap, { x: 50 * cellPx, y: 40 * cellPx, cellPx }, view);
      expect(frame.x).toBeCloseTo(box.x + 50, 9);
      expect(frame.y).toBeCloseTo(box.y + 40, 9);
      expect(frame.width).toBeCloseTo(960 / cellPx, 9);
      expect(frame.height).toBeCloseTo(720 / cellPx, 9);
    });

    it(`a minimap click centres that place at ${cellPx} pixels per Cell`, () => {
      const cam = cameraOnMinimapPoint(box, bigMap, view, cellPx, box.x + 100, box.y + 100);
      expect(cam).toEqual({ x: 100 * cellPx - 480, y: 100 * cellPx - 360, cellPx });
    });
  }
});

describe("moving the camera from the minimap", () => {
  const map = { width: 64, height: 64 };
  const view = { width: 960, height: 720 };

  it("centres the camera on the clicked Map position", () => {
    // The minimap centre is Cell position (32, 32), world pixel (768, 768).
    expect(cameraOnMinimapPoint(box, map, view, 24, 1100, 110)).toEqual({ x: 768 - 480, y: 768 - 360, cellPx: 24 });
  });

  it("keeps the camera on the Map near a corner", () => {
    expect(cameraOnMinimapPoint(box, map, view, 24, 1001, 11)).toEqual({ x: 0, y: 0, cellPx: 24 });
    expect(cameraOnMinimapPoint(box, map, view, 24, 1199, 209)).toEqual({ x: 64 * 24 - 960, y: 64 * 24 - 720, cellPx: 24 });
  });
});
