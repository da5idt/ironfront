import { describe, expect, it } from "vitest";
import { computeLayout, contains, PANEL_WIDTH } from "./layout";

describe("screen layout", () => {
  it("puts the panel on the right with the minimap above the buttons", () => {
    const l = computeLayout({ width: 1280, height: 800 });
    expect(l.mapView).toEqual({ x: 0, y: 0, width: 1280 - PANEL_WIDTH, height: 800 });
    expect(l.panel.x).toBe(1280 - PANEL_WIDTH);
    expect(l.minimap.width).toBe(l.minimap.height);
    expect(l.buttons.y).toBeGreaterThan(l.minimap.y + l.minimap.height);
    expect(contains(l.minimap, l.minimap.x, l.minimap.y)).toBe(true);
    expect(contains(l.mapView, l.panel.x, 10)).toBe(false);
  });
});
