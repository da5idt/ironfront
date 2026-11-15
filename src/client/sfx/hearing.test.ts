import { describe, expect, it } from "vitest";
import { ZOOM_STEPS_PX } from "../camera";
import { hear, type Listener, listenerFor, SKIP_BEYOND_REACHES } from "./hearing";

const listener: Listener = { x: 50, y: 40, reach: 20 };

describe("the listener", () => {
  for (const cellPx of ZOOM_STEPS_PX) {
    it(`sits at the centre of the Map view and reaches to its corner, at ${cellPx} pixels per Cell`, () => {
      const l = listenerFor({ x: 10 * cellPx, y: 20 * cellPx, cellPx }, { width: 60 * cellPx, height: 80 * cellPx });
      expect(l.x).toBe(40);
      expect(l.y).toBe(60);
      // Half of a 60 by 80 Cell view is a 30-40-50 triangle.
      expect(l.reach).toBe(50);
    });
  }

  it("hears farther when zoomed out: the same view in pixels covers more Cells", () => {
    const view = { width: 960, height: 720 };
    const wide = listenerFor({ x: 0, y: 0, cellPx: 12 }, view);
    const close = listenerFor({ x: 0, y: 0, cellPx: 36 }, view);
    expect(wide.reach).toBe(close.reach * 3);
  });
});

describe("distance fall-off", () => {
  it("is loudest at the view's centre and fades with distance", () => {
    const centre = hear(listener, { x: 50, y: 40 });
    const near = hear(listener, { x: 55, y: 40 });
    const corner = hear(listener, { x: 50, y: 60 });
    const offScreen = hear(listener, { x: 50, y: 68 });
    expect(centre?.gain).toBe(1);
    expect(near!.gain).toBeLessThan(1);
    expect(corner!.gain).toBeLessThan(near!.gain);
    expect(offScreen!.gain).toBeLessThan(corner!.gain);
    expect(offScreen!.gain).toBeGreaterThan(0);
  });

  it("skips sounds beyond the limit", () => {
    const limit = listener.reach * SKIP_BEYOND_REACHES;
    expect(hear(listener, { x: 50 + limit - 0.5, y: 40 })).not.toBeNull();
    expect(hear(listener, { x: 50 + limit + 0.5, y: 40 })).toBeNull();
    expect(hear(listener, { x: 50, y: 40 - limit - 0.5 })).toBeNull();
  });

  it("places a sound left or right of the centre", () => {
    expect(hear(listener, { x: 50, y: 30 })?.pan).toBe(0);
    expect(hear(listener, { x: 40, y: 40 })!.pan).toBeLessThan(0);
    expect(hear(listener, { x: 60, y: 40 })!.pan).toBeGreaterThan(0);
    const far = hear(listener, { x: 50 + listener.reach * 1.5, y: 40 })!;
    expect(far.pan).toBeLessThanOrEqual(1);
    expect(far.pan).toBeGreaterThan(hear(listener, { x: 55, y: 40 })!.pan);
  });

  it("hears nothing through a view with no size", () => {
    expect(hear({ x: 5, y: 5, reach: 0 }, { x: 6, y: 5 })).toBeNull();
    expect(hear({ x: 5, y: 5, reach: 0 }, { x: 5, y: 5 })?.gain).toBe(1);
  });
});
