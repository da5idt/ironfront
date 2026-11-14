import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "../../sim";
import { BUILD_UP_SECONDS } from "./buildingArt";
import { buildUpProgress, noteBuildings, type BuildUpView } from "./buildUp";

const building = (id: number, owner: 0 | 1 = 0, remembered = false) => ({ id, owner, remembered });
const view = (tick: number, buildings: BuildUpView["buildings"], playerId: 0 | 1 = 0): BuildUpView => ({ tick, playerId, buildings });
const RISE_TICKS = BUILD_UP_SECONDS * TICKS_PER_SECOND;

describe("build-up of newly placed Buildings", () => {
  it("leaves the Buildings of the first view standing: the Match starts with them built", () => {
    const ups = noteBuildings(null, view(0, [building(1)]));
    expect(buildUpProgress(ups, 1, 0)).toBe(1);
  });

  it("starts an own Building rising on the Tick it first appears, and finishes it after the build-up time", () => {
    let ups = noteBuildings(null, view(0, [building(1)]));
    ups = noteBuildings(ups, view(10, [building(1), building(2)]));
    expect(buildUpProgress(ups, 2, 10)).toBe(0);
    expect(buildUpProgress(ups, 2, 10 + RISE_TICKS / 2)).toBeCloseTo(0.5);
    expect(buildUpProgress(ups, 2, 10 + RISE_TICKS)).toBe(1);
    expect(buildUpProgress(ups, 1, 10)).toBe(1);
  });

  it("keeps the rise going over later views, and forgets it once done", () => {
    let ups = noteBuildings(null, view(0, []));
    ups = noteBuildings(ups, view(10, [building(2)]));
    ups = noteBuildings(ups, view(11, [building(2)]));
    expect(buildUpProgress(ups, 2, 11)).toBeCloseTo(1 / RISE_TICKS);
    ups = noteBuildings(ups, view(10 + RISE_TICKS + 1, [building(2)]));
    expect(ups.placedAt.size).toBe(0);
    expect(buildUpProgress(ups, 2, 10 + RISE_TICKS + 1)).toBe(1);
  });

  it("does not play for the other Player's Buildings, which come into sight already built", () => {
    let ups = noteBuildings(null, view(0, []));
    ups = noteBuildings(ups, view(5, [building(7, 1), building(8, 1, true)]));
    expect(buildUpProgress(ups, 7, 5)).toBe(1);
    expect(buildUpProgress(ups, 8, 5)).toBe(1);
  });

  it("forgets a Building that is destroyed while rising", () => {
    let ups = noteBuildings(null, view(0, []));
    ups = noteBuildings(ups, view(5, [building(2)]));
    ups = noteBuildings(ups, view(6, []));
    expect(ups.placedAt.size).toBe(0);
  });

  it("starts afresh when a new Match begins or another Player's view is shown", () => {
    let ups = noteBuildings(null, view(50, [building(1)]));
    // A restart: Ticks begin again and ids are reused.
    ups = noteBuildings(ups, view(0, [building(1), building(2)]));
    expect(buildUpProgress(ups, 2, 0)).toBe(1);
    ups = noteBuildings(ups, view(1, [building(9, 1)], 1));
    expect(buildUpProgress(ups, 9, 1)).toBe(1);
  });
});
