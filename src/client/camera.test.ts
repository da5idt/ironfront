import { describe, expect, it } from "vitest";
import { CELL_PX, clampCamera, mapToScreen, screenToCell, scrollCamera, scrollDirection } from "./camera";

const screen = { width: 800, height: 600 };
const map = { width: 64, height: 64 };
const still = { dx: 0, dy: 0 };

describe("camera", () => {
  it("is clamped to the Map", () => {
    expect(clampCamera({ x: -50, y: -10 }, screen, map)).toEqual({ x: 0, y: 0 });
    expect(clampCamera({ x: 1e6, y: 1e6 }, screen, map)).toEqual({
      x: 64 * CELL_PX - 800,
      y: 64 * CELL_PX - 600,
    });
  });

  it("centres a Map smaller than the screen", () => {
    expect(clampCamera({ x: 0, y: 0 }, screen, { width: 10, height: 10 })).toEqual({
      x: (10 * CELL_PX - 800) / 2,
      y: (10 * CELL_PX - 600) / 2,
    });
  });

  it("scrolls with arrow keys and WASD", () => {
    expect(scrollDirection(new Set(["ArrowRight"]), still)).toEqual({ dx: 1, dy: 0 });
    expect(scrollDirection(new Set(["KeyW", "KeyA"]), still)).toEqual({ dx: -1, dy: -1 });
    expect(scrollDirection(new Set(["KeyA", "KeyD"]), still)).toEqual({ dx: 0, dy: 0 });
  });

  it("adds the mouse's edge-scroll to the keys, never faster than one step per axis", () => {
    const none = new Set<string>();
    expect(scrollDirection(none, { dx: -1, dy: 1 })).toEqual({ dx: -1, dy: 1 });
    expect(scrollDirection(new Set(["ArrowLeft"]), { dx: -1, dy: 0 })).toEqual({ dx: -1, dy: 0 });
    expect(scrollDirection(new Set(["ArrowRight"]), { dx: -1, dy: 0 })).toEqual({ dx: 0, dy: 0 });
  });

  it("moves by speed times time and stays on the Map", () => {
    const moved = scrollCamera({ x: 100, y: 100 }, { dx: 1, dy: -1 }, 0.1, screen, map);
    expect(moved.x).toBeGreaterThan(100);
    expect(moved.y).toBeLessThan(100);
    expect(scrollCamera({ x: 0, y: 0 }, { dx: -1, dy: -1 }, 1, screen, map)).toEqual({ x: 0, y: 0 });
  });

  it("maps screen pixels to Cells and back", () => {
    const cam = { x: 48, y: 24 };
    expect(screenToCell(cam, 0, 0)).toEqual({ x: 2, y: 1 });
    expect(screenToCell(cam, CELL_PX - 1, CELL_PX)).toEqual({ x: 2, y: 2 });
    expect(mapToScreen(cam, 2, 1)).toEqual({ x: 0, y: 0 });
  });
});
