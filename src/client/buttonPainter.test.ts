import { describe, expect, it } from "vitest";
import { BUILD_BUTTON_HEIGHT, buildButtons } from "./buildPanel";
import { KEY_BADGE, menuButtonParts, pictureScale } from "./buttonPainter";
import { computeLayout } from "./layout";

/** Half the height of a line of the button's text, a little generous: its largest font is 13 pixels. */
const HALF_LINE = 7;
const BAR_HEIGHT = 4;

describe("what a menu button shows at its height", () => {
  it("has the picture's full well and two lines of hint at full size", () => {
    expect(menuButtonParts(BUILD_BUTTON_HEIGHT)).toEqual({
      wellWidth: 72,
      nameY: 13,
      keyY: 24,
      costY: 32,
      hintYs: [50, 63],
      barY: 71,
    });
  });

  it("still fits the name, the key with the cost, one line of hint and the bar on the short windows' buttons", () => {
    for (const windowHeight of [657, 600]) {
      const { height } = buildButtons(computeLayout({ width: 1366, height: windowHeight }).buttons)[0]!.rect;
      const parts = menuButtonParts(height);
      expect(parts.hintYs).toHaveLength(1);
      const hintY = parts.hintYs[0]!;
      // Top to bottom without one row running into the next, and all of it inside the button.
      expect(parts.nameY - HALF_LINE).toBeGreaterThanOrEqual(0);
      expect(parts.keyY!).toBeGreaterThanOrEqual(parts.nameY + HALF_LINE - 2);
      expect(parts.costY).toBe(parts.keyY! + KEY_BADGE / 2);
      expect(hintY - HALF_LINE).toBeGreaterThanOrEqual(parts.keyY! + KEY_BADGE - 2);
      expect(parts.barY!).toBeGreaterThanOrEqual(hintY + HALF_LINE - 2);
      expect(parts.barY! + BAR_HEIGHT).toBeLessThan(height);
      // The well stays square and inside the button, leaving the text more width.
      expect(parts.wellWidth).toBeLessThanOrEqual(height - 8);
      expect(parts.wellWidth).toBeGreaterThanOrEqual(40);
    }
  });

  it("keeps the name, the key with the cost and the bar clear of each other on the smallest button the layout makes", () => {
    // 42 pixels: what the layout holds the buttons to while it can (layout.test.ts).
    for (let height = 42; height < 52; height++) {
      const parts = menuButtonParts(height);
      expect(parts.hintYs).toEqual([]);
      expect(parts.keyY).not.toBeNull();
      expect(parts.barY).not.toBeNull();
      expect(parts.keyY!).toBeGreaterThanOrEqual(parts.nameY + HALF_LINE - 2);
      expect(parts.barY!).toBeGreaterThanOrEqual(parts.keyY! + KEY_BADGE);
      expect(parts.barY! + BAR_HEIGHT).toBeLessThan(height);
    }
  });

  it("shows only what fits whole on a button smaller than that", () => {
    // No bar across the key's badge, and no badge cut off at the button's edge.
    expect(menuButtonParts(41).barY).toBeNull();
    expect(menuButtonParts(36).keyY).not.toBeNull();
    expect(menuButtonParts(35).keyY).toBeNull();
    expect(menuButtonParts(35).costY).toBeNull();
    expect(menuButtonParts(0).wellWidth).toBe(0);
  });
});

describe("how large a button's picture is drawn", () => {
  const well = (side: number) => ({ x: 0, y: 0, width: side, height: side });

  it("shows a 3 by 3 Cell Building at the Map's 2 in the full well", () => {
    expect(pictureScale({ width: 36, height: 36 }, well(72), 3)).toBe(2);
  });

  it("blows a small picture up, but no further than the largest scale allowed", () => {
    expect(pictureScale({ width: 12, height: 12 }, well(72), 5)).toBe(5);
    expect(pictureScale({ width: 24, height: 24 }, well(72), 3)).toBe(2);
  });

  it("goes down to 1 rather than spill out of a small well", () => {
    expect(pictureScale({ width: 36, height: 36 }, well(47), 3)).toBe(1);
    expect(pictureScale({ width: 24, height: 24 }, well(47), 3)).toBe(1);
    expect(pictureScale({ width: 12, height: 12 }, well(47), 5)).toBe(3);
  });
});
