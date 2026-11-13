import { describe, expect, it } from "vitest";
import { advanceTick, canPlaceBuilding, createMatch, getPlayerView, PLACEMENT } from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit } from "./testing/setup";

// Player 0's default start on these Maps: HQ (0,0) 3x3, Refinery (4,0) 3x2,
// Harvester (5,3), Riflemen (0,4) and (1,4). A Barracks is 2x2.

describe("placement validity", () => {
  it("allows clear, passable, explored Cells next to an own Building", () => {
    const view = getPlayerView(createMatch(openMap(30, 30), 1), 0);
    expect(canPlaceBuilding(view, "barracks", { x: 4, y: 4 })).toBe(true);
    expect(canPlaceBuilding(view, "barracks", { x: 0, y: 5 })).toBe(true);
  });

  it("rejects a footprint that runs off the Map", () => {
    const view = getPlayerView(createMatch(openMap(30, 30), 1), 0);
    expect(canPlaceBuilding(view, "barracks", { x: -1, y: 5 })).toBe(false);
    expect(canPlaceBuilding(view, "barracks", { x: 0, y: -1 })).toBe(false);
  });

  it("rejects impassable terrain anywhere in the footprint", () => {
    const rows = Array.from({ length: 30 }, (_, y) => (y === 5 ? ".....#" + ".".repeat(24) : ".".repeat(30)));
    const view = getPlayerView(createMatch(testMap(rows), 1), 0);
    expect(canPlaceBuilding(view, "barracks", { x: 4, y: 4 })).toBe(false);
    expect(canPlaceBuilding(view, "barracks", { x: 6, y: 4 })).toBe(true);
  });

  it("rejects a footprint overlapping a Building", () => {
    const view = getPlayerView(createMatch(openMap(30, 30), 1), 0);
    expect(canPlaceBuilding(view, "barracks", { x: 2, y: 2 })).toBe(false);
  });

  it("rejects a footprint with a Unit standing on it", () => {
    const view = getPlayerView(createMatch(openMap(30, 30), 1), 0);
    expect(canPlaceBuilding(view, "barracks", { x: 0, y: 4 })).toBe(false);
    expect(canPlaceBuilding(view, "turret", { x: 5, y: 3 })).toBe(false);
  });

  it("rejects Unexplored Cells, and allows them once explored", () => {
    const match = createMatch(openMap(30, 30), 1);
    // Fog of War catches up with a new Building at the end of the next Tick.
    addTestBuilding(match, 0, "turret", { x: 15, y: 15 });
    expect(canPlaceBuilding(getPlayerView(match, 0), "barracks", { x: 16, y: 15 })).toBe(false);
    advanceTick(match);
    expect(canPlaceBuilding(getPlayerView(match, 0), "barracks", { x: 16, y: 15 })).toBe(true);
  });

  it(`allows at most ${PLACEMENT.maxGap} Cells of gap to the nearest own Building`, () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 15, y: 15 });
    advanceTick(match);
    const view = getPlayerView(match, 0);
    // The turret's footprint ends at x = 16, so a Barracks at x = 16 + gap leaves `gap` Cells between.
    expect(canPlaceBuilding(view, "barracks", { x: 16 + PLACEMENT.maxGap, y: 15 })).toBe(true);
    expect(canPlaceBuilding(view, "barracks", { x: 17 + PLACEMENT.maxGap, y: 15 })).toBe(false);
  });

  it("does not count the other Player's Buildings as a place to build from", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 1, "turret", { x: 15, y: 15 });
    // A Rifleman explores the ground far from Player 0's base.
    addTestUnit(match, 0, "rifleman", { x: 18, y: 18 });
    advanceTick(match);
    expect(canPlaceBuilding(getPlayerView(match, 0), "turret", { x: 16, y: 16 })).toBe(false);
    addTestBuilding(match, 0, "turret", { x: 19, y: 15 });
    expect(canPlaceBuilding(getPlayerView(match, 0), "turret", { x: 16, y: 16 })).toBe(true);
  });
});
