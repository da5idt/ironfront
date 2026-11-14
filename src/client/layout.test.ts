import { describe, expect, it } from "vitest";
import { BUTTON_MARGIN } from "./buildPanel";
import { EDGE_PX } from "./camera";
import { computeLayout, contains, edgeScroll, PANEL_EDGE_SCROLL_PX, PANEL_WIDTH, toMapView } from "./layout";

describe("screen layout", () => {
  it("puts the panel on the left with the minimap above the buttons, and the Map view fills the rest", () => {
    const l = computeLayout({ width: 1280, height: 800 });
    expect(l.panel).toEqual({ x: 0, y: 0, width: PANEL_WIDTH, height: 800 });
    expect(l.mapView).toEqual({ x: PANEL_WIDTH, y: 0, width: 1280 - PANEL_WIDTH, height: 800 });
    expect(l.minimap.x + l.minimap.width).toBeLessThan(PANEL_WIDTH);
    expect(l.minimap.width).toBe(l.minimap.height);
    expect(l.buttons.x).toBe(0);
    expect(l.buttons.y).toBeGreaterThan(l.minimap.y + l.minimap.height);
    expect(contains(l.minimap, l.minimap.x, l.minimap.y)).toBe(true);
    expect(contains(l.mapView, PANEL_WIDTH - 1, 10)).toBe(false);
    expect(contains(l.mapView, PANEL_WIDTH, 10)).toBe(true);
  });

  it("turns a screen point into a point in the Map view", () => {
    const l = computeLayout({ width: 1280, height: 800 });
    expect(toMapView(l, { x: PANEL_WIDTH, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(toMapView(l, { x: PANEL_WIDTH + 30, y: 40 })).toEqual({ x: 30, y: 40 });
  });
});

describe("edge scrolling", () => {
  const l = computeLayout({ width: 1280, height: 800 });
  const still = { dx: 0, dy: 0 };

  it("scrolls at the top, right and bottom screen edges over the Map view", () => {
    expect(edgeScroll(l, { x: 600, y: 0 })).toEqual({ dx: 0, dy: -1 });
    expect(edgeScroll(l, { x: 1279, y: 400 })).toEqual({ dx: 1, dy: 0 });
    expect(edgeScroll(l, { x: 600, y: 799 })).toEqual({ dx: 0, dy: 1 });
    expect(edgeScroll(l, { x: 1279, y: 799 })).toEqual({ dx: 1, dy: 1 });
    expect(edgeScroll(l, { x: 1280 - EDGE_PX - 1, y: 400 })).toEqual(still);
  });

  it("does not scroll in the middle of the Map view or at its edge beside the panel", () => {
    expect(edgeScroll(l, { x: 600, y: 400 })).toEqual(still);
    expect(edgeScroll(l, { x: PANEL_WIDTH, y: 400 })).toEqual(still);
  });

  it("never scrolls over the panel, its buttons or the minimap, even at the top and bottom", () => {
    expect(edgeScroll(l, { x: l.minimap.x + 5, y: l.minimap.y + 5 })).toEqual(still);
    expect(edgeScroll(l, { x: 100, y: 0 })).toEqual(still);
    expect(edgeScroll(l, { x: 100, y: 799 })).toEqual(still);
    expect(edgeScroll(l, { x: PANEL_WIDTH - 1, y: 400 })).toEqual(still);
  });

  it("scrolls left only from a strip at the panel's outer edge, narrower than the margin round the buttons", () => {
    expect(PANEL_EDGE_SCROLL_PX).toBeLessThan(BUTTON_MARGIN);
    expect(edgeScroll(l, { x: 0, y: 400 })).toEqual({ dx: -1, dy: 0 });
    expect(edgeScroll(l, { x: 0, y: 0 })).toEqual({ dx: -1, dy: 0 });
    expect(edgeScroll(l, { x: PANEL_EDGE_SCROLL_PX, y: 400 })).toEqual(still);
  });

  it("does not scroll when the mouse is outside the window", () => {
    expect(edgeScroll(l, null)).toEqual(still);
  });
});
