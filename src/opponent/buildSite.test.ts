import { describe, expect, it } from "vitest";
import { BUILDING_STATS, canPlaceBuilding, createMatch, getPlayerView } from "../sim";
import { openMap, testMap } from "../sim/testing/maps";
import { findBuildSite } from "./buildSite";

// Player 0's default start on these Maps: HQ (0,0) 3x3, Refinery (4,0) 3x2,
// Harvester (5,3), Riflemen (0,4) and (1,4).

describe("build site search", () => {
  it("picks a placeable spot as close as it can to where it is asked for", () => {
    const view = getPlayerView(createMatch(openMap(30, 30), 1), 0);
    const at = findBuildSite(view, "barracks", { x: 2, y: 8 });
    expect(at).not.toBeNull();
    expect(canPlaceBuilding(view, "barracks", at!)).toBe(true);
    // Rows 7 and below are more than three Cells from the HQ (rows 0..2), so the
    // footprint reaches down at most to row 7: (1,6) and (2,6) are equally near
    // (2,8), and ties go to the top-left one.
    expect(at).toEqual({ x: 1, y: 6 });
  });

  it("keeps a Cell of space round its other Buildings so Units can walk between them", () => {
    const view = getPlayerView(createMatch(openMap(30, 30), 1), 0);
    const at = findBuildSite(view, "turret", { x: 3, y: 1 })!;
    expect(at).not.toBeNull();
    for (const b of view.buildings) {
      const gapX = Math.max(b.x - (at.x + 1), at.x - (b.x + b.width));
      const gapY = Math.max(b.y - (at.y + 1), at.y - (b.y + b.height));
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not build on Ore", () => {
    // Ore fills x = 4..12 in rows 3..12, right beside the base.
    const rows = Array.from({ length: 30 }, (_, y) =>
      y >= 3 && y <= 12 ? "...." + "*".repeat(9) + ".".repeat(17) : ".".repeat(30),
    );
    const view = getPlayerView(createMatch(testMap(rows), 1), 0);
    const at = findBuildSite(view, "barracks", { x: 8, y: 6 })!;
    expect(at).not.toBeNull();
    const { width, height } = BUILDING_STATS.barracks;
    for (let y = at.y; y < at.y + height; y++) {
      for (let x = at.x; x < at.x + width; x++) expect(rows[y]![x]).not.toBe("*");
    }
  });

  it("gives null when nowhere near the base is free", () => {
    // Dry land only round each starting base: 8x6 Cells in the top-left, a corner bottom-right.
    const rows = Array.from({ length: 30 }, (_, y) => {
      if (y < 6) return ".".repeat(8) + "~".repeat(22);
      if (y >= 24) return "~".repeat(20) + ".".repeat(10);
      return "~".repeat(30);
    });
    const view = getPlayerView(createMatch(testMap(rows), 1), 0);
    expect(findBuildSite(view, "vehicleFactory", { x: 2, y: 2 })).toBeNull();
  });
});
