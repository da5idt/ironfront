import { describe, expect, it } from "vitest";
import { cameraFrame, cameraOnMinimapPoint, minimapToMap } from "./minimap";

const box = { x: 1000, y: 10, width: 200, height: 200 };

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
    const frame = cameraFrame(box, { width: 64, height: 64 }, { x: 240, y: 480 }, { width: 960, height: 720 });
    expect(frame).toEqual({ x: 1031.25, y: 72.5, width: 125, height: 93.75 });
  });

  it("stays inside the Map's area when the view is larger than the Map", () => {
    // A 10x10 Map centred in a 480x480 view: the camera starts at -120.
    const frame = cameraFrame(box, { width: 10, height: 10 }, { x: -120, y: -120 }, { width: 480, height: 480 });
    expect(frame).toEqual(box);
  });
});

describe("moving the camera from the minimap", () => {
  const map = { width: 64, height: 64 };
  const view = { width: 960, height: 720 };

  it("centres the camera on the clicked Map position", () => {
    // The minimap centre is Cell position (32, 32), world pixel (768, 768).
    expect(cameraOnMinimapPoint(box, map, view, 1100, 110)).toEqual({ x: 768 - 480, y: 768 - 360 });
  });

  it("keeps the camera on the Map near a corner", () => {
    expect(cameraOnMinimapPoint(box, map, view, 1001, 11)).toEqual({ x: 0, y: 0 });
    expect(cameraOnMinimapPoint(box, map, view, 1199, 209)).toEqual({ x: 64 * 24 - 960, y: 64 * 24 - 720 });
  });
});
