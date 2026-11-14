import { describe, expect, it } from "vitest";
import { BUILD_BUTTON_HEIGHT, BUTTON_MARGIN, buildButtons } from "./buildPanel";
import {
  computeLayout,
  contains,
  EDGE_PX,
  edgeScroll,
  PANEL_EDGE_SCROLL_PX,
  PANEL_WIDTH,
  SOUND_STRIP_COMPACT_HEIGHT,
  SOUND_STRIP_HEIGHT,
  toMapView,
} from "./layout";
import { trainButtons } from "./trainPanel";

describe("the side panel on a short window", () => {
  // 657 is a 1366x768 laptop less the browser's own bars; 600 is the shortest window the game is laid out for.
  const HEIGHTS = [1080, 800, 720, 706, 657, 600, 540, 480, 360, 260];

  it("keeps all four build buttons between the minimap and the sound strip, one under the other", () => {
    for (const height of HEIGHTS) {
      const l = computeLayout({ width: 1366, height });
      const rects = buildButtons(l.buttons).map((b) => b.rect);
      expect(rects).toHaveLength(4);
      expect(rects[0]!.y).toBeGreaterThanOrEqual(l.minimap.y + l.minimap.height);
      for (let i = 1; i < rects.length; i++) {
        expect(rects[i]!.y).toBeGreaterThanOrEqual(rects[i - 1]!.y + rects[i - 1]!.height);
      }
      expect(rects[3]!.y + rects[3]!.height, `window height ${height}`).toBeLessThanOrEqual(l.soundStrip.y);
    }
  });

  it("gives every part of a button to the buttons and none of it to the sound strip", () => {
    for (const height of [800, 657, 600]) {
      const l = computeLayout({ width: 1366, height });
      for (const { rect } of buildButtons(l.buttons)) {
        const x = rect.x + rect.width / 2;
        for (const y of [rect.y, rect.y + rect.height - 1]) {
          expect(contains(l.buttons, x, y), `window height ${height}`).toBe(true);
          expect(contains(l.soundStrip, x, y), `window height ${height}`).toBe(false);
        }
      }
    }
  });

  it("keeps the buttons full size where there is room, and tall enough to read down to a 600 pixel window", () => {
    const heightAt = (height: number) => buildButtons(computeLayout({ width: 1366, height }).buttons)[0]!.rect.height;
    expect(heightAt(800)).toBe(BUILD_BUTTON_HEIGHT);
    expect(heightAt(1080)).toBe(BUILD_BUTTON_HEIGHT);
    // Name, key with cost and one line of hint take about 50 pixels.
    expect(heightAt(657)).toBeGreaterThanOrEqual(60);
    expect(heightAt(600)).toBeGreaterThanOrEqual(50);
  });

  it("gives up the sound strip, in two steps, before the buttons get too small to use", () => {
    // 42 pixels is a button with its name, its key and cost, and its progress bar clear of each other.
    const at = (height: number) => {
      const l = computeLayout({ width: 1024, height });
      return { strip: l.soundStrip.height, button: buildButtons(l.buttons)[0]!.rect.height };
    };
    // The whole strip while the buttons keep their least height beside it...
    for (const height of [800, 600, 560, 548]) {
      expect(at(height).strip, `window height ${height}`).toBe(SOUND_STRIP_HEIGHT);
      expect(at(height).button, `window height ${height}`).toBeGreaterThanOrEqual(42);
    }
    // ...then only its mute-all button...
    for (const height of [547, 520, 480, 454]) {
      expect(at(height).strip, `window height ${height}`).toBe(SOUND_STRIP_COMPACT_HEIGHT);
      expect(at(height).button, `window height ${height}`).toBeGreaterThanOrEqual(42);
    }
    // ...then none of it (the M key still mutes).
    for (const height of [453, 440, 420]) {
      expect(at(height).strip, `window height ${height}`).toBe(0);
      expect(at(height).button, `window height ${height}`).toBeGreaterThanOrEqual(42);
    }
  });

  it("keeps the minimap, the buttons and the sound strip inside the window and off each other at any height", () => {
    for (let height = 0; height <= 900; height += 7) {
      const l = computeLayout({ width: 1024, height });
      const rects = buildButtons(l.buttons).map((b) => b.rect);
      expect(l.buttons.y, `window height ${height}`).toBeGreaterThanOrEqual(l.minimap.y + l.minimap.height);
      expect(l.buttons.height, `window height ${height}`).toBeGreaterThanOrEqual(0);
      expect(rects[3]!.y + rects[3]!.height, `window height ${height}`).toBeLessThanOrEqual(l.soundStrip.y);
      expect(l.soundStrip.y, `window height ${height}`).toBe(l.buttons.y + l.buttons.height);
      // A strip that shows at all shows whole: it never hangs off the bottom of the window.
      if (l.soundStrip.height > 0) {
        expect(l.soundStrip.y + l.soundStrip.height, `window height ${height}`).toBe(height);
      }
    }
  });

  it("sizes the train buttons like the build buttons", () => {
    for (const height of [800, 657, 600]) {
      const area = computeLayout({ width: 1366, height }).buttons;
      expect(trainButtons(area, "vehicleFactory").map((b) => b.rect)).toEqual(
        buildButtons(area)
          .slice(0, 2)
          .map((b) => b.rect),
      );
    }
  });
});

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
