import { describe, expect, it } from "vitest";
import {
  type Camera,
  centreCamera,
  clampCamera,
  DEFAULT_CELL_PX,
  screenToMap,
  WHEEL_STEP_GAP_MS,
  wheelZoomStep,
  ZOOM_STEPS_PX,
  zoomCamera,
  mapToScreen, screenToCell, scrollCamera, scrollDirection } from "./camera";

const screen = { width: 800, height: 600 };
const map = { width: 64, height: 64 };
const still = { dx: 0, dy: 0 };
const CELL_PX = DEFAULT_CELL_PX;
/** A camera at the zoom a Match starts at. */
const at = (x: number, y: number): Camera => ({ x, y, cellPx: CELL_PX });

describe("camera", () => {
  it("is clamped to the Map", () => {
    expect(clampCamera(at(-50, -10), screen, map)).toEqual(at(0, 0));
    expect(clampCamera(at(1e6, 1e6), screen, map)).toEqual(at(64 * CELL_PX - 800, 64 * CELL_PX - 600));
  });

  it("centres a Map smaller than the screen", () => {
    expect(clampCamera(at(0, 0), screen, { width: 10, height: 10 })).toEqual(
      at((10 * CELL_PX - 800) / 2, (10 * CELL_PX - 600) / 2),
    );
  });

  it("centres on a Map position, and stops at the Map's edge", () => {
    const cam = centreCamera({ x: 32, y: 32 }, CELL_PX, screen, map);
    expect(mapToScreen(cam, 32, 32)).toEqual({ x: 400, y: 300 });
    expect(centreCamera({ x: 1, y: 1 }, CELL_PX, screen, map)).toEqual(at(0, 0));
  });

  it("scrolls with the arrow keys, and not with W, A, S and D", () => {
    expect(scrollDirection(new Set(["ArrowRight"]), still)).toEqual({ dx: 1, dy: 0 });
    expect(scrollDirection(new Set(["ArrowUp", "ArrowLeft"]), still)).toEqual({ dx: -1, dy: -1 });
    expect(scrollDirection(new Set(["ArrowLeft", "ArrowRight"]), still)).toEqual({ dx: 0, dy: 0 });
    expect(scrollDirection(new Set(["KeyW", "KeyA"]), still)).toEqual({ dx: 0, dy: 0 });
  });

  it("adds the mouse's edge-scroll to the keys, never faster than one step per axis", () => {
    const none = new Set<string>();
    expect(scrollDirection(none, { dx: -1, dy: 1 })).toEqual({ dx: -1, dy: 1 });
    expect(scrollDirection(new Set(["ArrowLeft"]), { dx: -1, dy: 0 })).toEqual({ dx: -1, dy: 0 });
    expect(scrollDirection(new Set(["ArrowRight"]), { dx: -1, dy: 0 })).toEqual({ dx: 0, dy: 0 });
  });

  it("moves by speed times time and stays on the Map", () => {
    const moved = scrollCamera(at(100, 100), { dx: 1, dy: -1 }, 0.1, screen, map);
    expect(moved.x).toBeGreaterThan(100);
    expect(moved.y).toBeLessThan(100);
    expect(scrollCamera(at(0, 0), { dx: -1, dy: -1 }, 1, screen, map)).toEqual(at(0, 0));
  });

  it("maps screen pixels to Cells and back", () => {
    const cam = at(48, 24);
    expect(screenToCell(cam, 0, 0)).toEqual({ x: 2, y: 1 });
    expect(screenToCell(cam, CELL_PX - 1, CELL_PX)).toEqual({ x: 2, y: 2 });
    expect(mapToScreen(cam, 2, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoom", () => {
  const bigMap = { width: 200, height: 200 };
  const mouse = { x: 500, y: 250 };
  /** A camera at a zoom step, well inside a big Map so nothing is clamped. */
  const inside = (cellPx: number): Camera => ({ x: 60 * cellPx, y: 70 * cellPx, cellPx });

  it("has three steps, each a whole multiple of the 12-pixel art, and starts in the middle", () => {
    expect(ZOOM_STEPS_PX).toEqual([12, 24, 36]);
    expect(DEFAULT_CELL_PX).toBe(24);
  });

  for (const cellPx of ZOOM_STEPS_PX) {
    it(`at ${cellPx} pixels per Cell, screen pixels map to Cells and back`, () => {
      const cam: Camera = { x: 2 * cellPx, y: cellPx, cellPx };
      expect(screenToCell(cam, 0, 0)).toEqual({ x: 2, y: 1 });
      expect(screenToCell(cam, cellPx - 1, cellPx)).toEqual({ x: 2, y: 2 });
      expect(mapToScreen(cam, 2, 1)).toEqual({ x: 0, y: 0 });
      expect(mapToScreen(cam, 3.5, 2)).toEqual({ x: 1.5 * cellPx, y: cellPx });
    });

    it(`at ${cellPx} pixels per Cell, the camera is clamped to the Map and a smaller Map is centred`, () => {
      const far: Camera = { x: 1e6, y: 1e6, cellPx };
      expect(clampCamera(far, screen, bigMap)).toEqual({ x: 200 * cellPx - 800, y: 200 * cellPx - 600, cellPx });
      expect(clampCamera({ x: -5, y: -5, cellPx }, screen, bigMap)).toEqual({ x: 0, y: 0, cellPx });
      const small = { width: 10, height: 10 };
      expect(clampCamera(far, screen, small)).toEqual({ x: (10 * cellPx - 800) / 2, y: (10 * cellPx - 600) / 2, cellPx });
    });

    it(`at ${cellPx} pixels per Cell, scrolling keeps the zoom`, () => {
      expect(scrollCamera(inside(cellPx), { dx: 1, dy: 0 }, 0.1, screen, bigMap).cellPx).toBe(cellPx);
    });
  }

  it("moves one step at a time and stops at the last step either way", () => {
    const mid = inside(24);
    expect(zoomCamera(mid, 1, mouse, screen, bigMap).cellPx).toBe(36);
    expect(zoomCamera(mid, -1, mouse, screen, bigMap).cellPx).toBe(12);
    // A big wheel flick is still one step.
    expect(zoomCamera(mid, 5, mouse, screen, bigMap).cellPx).toBe(36);
    const closest = inside(36);
    expect(zoomCamera(closest, 1, mouse, screen, bigMap)).toBe(closest);
    const widest = inside(12);
    expect(zoomCamera(widest, -1, mouse, screen, bigMap)).toBe(widest);
  });

  it("keeps the Map position under the cursor where it is, in and out through every step", () => {
    let cam = inside(12);
    const under = screenToMap(cam, mouse.x, mouse.y);
    for (const steps of [1, 1, -1, -1]) {
      cam = zoomCamera(cam, steps, mouse, screen, bigMap);
      const now = screenToMap(cam, mouse.x, mouse.y);
      expect(now.x).toBeCloseTo(under.x, 9);
      expect(now.y).toBeCloseTo(under.y, 9);
    }
    expect(cam.cellPx).toBe(12);
  });

  it("stays on the Map when zooming out near its edge", () => {
    const corner = clampCamera({ x: 1e6, y: 1e6, cellPx: 36 }, screen, map);
    const out = zoomCamera(corner, -1, { x: 10, y: 10 }, screen, map);
    expect(out).toEqual(clampCamera(out, screen, map));
    expect(out.x).toBeLessThanOrEqual(64 * 24 - 800);
  });

  it("centres a Map that is smaller than the screen at the widest step", () => {
    const out = zoomCamera(at(0, 0), -1, mouse, screen, { width: 40, height: 40 });
    expect(out).toEqual({ x: (40 * 12 - 800) / 2, y: (40 * 12 - 600) / 2, cellPx: 12 });
  });
});

describe("the mouse wheel", () => {
  it("zooms in when rolled up and out when rolled down", () => {
    expect(wheelZoomStep(-100, null, 1000)).toBe(1);
    expect(wheelZoomStep(100, null, 1000)).toBe(-1);
    expect(wheelZoomStep(0, null, 1000)).toBe(0);
  });

  it("gives one step for a burst of scroll events, and another once the burst is over", () => {
    expect(wheelZoomStep(-4, 1000, 1000 + WHEEL_STEP_GAP_MS - 1)).toBe(0);
    expect(wheelZoomStep(-4, 1000, 1000 + WHEEL_STEP_GAP_MS)).toBe(1);
  });
});
