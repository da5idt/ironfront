import { describe, expect, it } from "vitest";
import { ART } from "./artPalette";
import { ORE_LEVELS, ORE_VARIANTS, oreLevel, paintOreCell } from "./oreArt";
import type { PixelBuffer } from "./pixelBuffer";
import { pixelAt } from "./pixelBuffer";

const FULL = 500;

describe("Ore fill level", () => {
  it("is 0 for an empty Cell and the top level for a full one", () => {
    expect(oreLevel(0, FULL)).toBe(0);
    expect(oreLevel(FULL, FULL)).toBe(ORE_LEVELS);
    expect(ORE_LEVELS).toBeGreaterThanOrEqual(3);
  });

  it("steps down in even shares as the Cell is harvested", () => {
    // Four levels: above 3/4 full, above 1/2, above 1/4, and any Ore at all.
    expect(oreLevel(400, FULL)).toBe(4);
    expect(oreLevel(375, FULL)).toBe(3);
    expect(oreLevel(260, FULL)).toBe(3);
    expect(oreLevel(250, FULL)).toBe(2);
    expect(oreLevel(126, FULL)).toBe(2);
    expect(oreLevel(125, FULL)).toBe(1);
    expect(oreLevel(1, FULL)).toBe(1);
  });

  it("never shows a Cell holding a sliver of Ore as empty", () => {
    expect(oreLevel(0.01, FULL)).toBe(1);
  });

  it("treats more than a full Cell as full", () => {
    expect(oreLevel(FULL * 3, FULL)).toBe(ORE_LEVELS);
  });
});

describe("Ore Cell art", () => {
  const gold = new Set<string>([ART.ore.mid, ART.ore.light, ART.ore.dark]);
  const goldPixels = (b: PixelBuffer) => {
    let n = 0;
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (gold.has(pixelAt(b, x, y) ?? "")) n++;
    return n;
  };

  it("is one Cell of art, empty at level 0", () => {
    const empty = paintOreCell(0, 0);
    expect(empty.width).toBe(12);
    expect(empty.height).toBe(12);
    expect(empty.data.every((v) => v === 0)).toBe(true);
  });

  it("shows clearly less gold at each lower level, for every variant", () => {
    for (let v = 0; v < ORE_VARIANTS; v++) {
      for (let level = 1; level < ORE_LEVELS; level++) {
        expect(goldPixels(paintOreCell(level, v)), `variant ${v} level ${level}`).toBeLessThan(
          goldPixels(paintOreCell(level + 1, v)),
        );
      }
    }
  });

  it("varies the nugget layout so a field doesn't look stamped", () => {
    const layouts = new Set(Array.from({ length: ORE_VARIANTS }, (_, v) => paintOreCell(ORE_LEVELS, v).data.join()));
    expect(layouts.size).toBe(ORE_VARIANTS);
  });

  it("leaves the ground showing between nuggets", () => {
    const full = paintOreCell(ORE_LEVELS, 0);
    let transparent = 0;
    for (let i = 3; i < full.data.length; i += 4) if (full.data[i] === 0) transparent++;
    expect(transparent).toBeGreaterThan(12 * 12 * 0.25);
  });
});
