import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "../../sim";
import { BUILD_UP_SECONDS } from "./buildingArt";
import { buildUpProgress, type BuildUpView, type PlacedAt, risingBuildings } from "./buildUp";

const building = (id: number, owner: 0 | 1 = 0, remembered = false) => ({ id, owner, remembered });
const view = (tick: number, buildings: BuildUpView["buildings"], playerId: 0 | 1 = 0): BuildUpView => ({ tick, playerId, buildings });
const RISE_TICKS = BUILD_UP_SECONDS * TICKS_PER_SECOND;

/** Shows views one after another, keeping what the presentation keeps between them: the notes and the last view's Buildings. */
function watch(first: BuildUpView) {
  let placedAt: PlacedAt = risingBuildings(null, first);
  let buildings = new Set(first.buildings.map((b) => b.id));
  return {
    get placedAt() {
      return placedAt;
    },
    show(next: BuildUpView): void {
      placedAt = risingBuildings({ placedAt, buildings }, next);
      buildings = new Set(next.buildings.map((b) => b.id));
    },
    progress: (id: number, tick: number) => buildUpProgress(placedAt, id, tick),
  };
}

describe("build-up of newly placed Buildings", () => {
  it("leaves the Buildings of the first view standing: the Match starts with them built", () => {
    const seen = watch(view(0, [building(1)]));
    expect(seen.progress(1, 0)).toBe(1);
  });

  it("starts an own Building rising on the Tick it first appears, and finishes it after the build-up time", () => {
    const seen = watch(view(0, [building(1)]));
    seen.show(view(10, [building(1), building(2)]));
    expect(seen.progress(2, 10)).toBe(0);
    expect(seen.progress(2, 10 + RISE_TICKS / 2)).toBeCloseTo(0.5);
    expect(seen.progress(2, 10 + RISE_TICKS)).toBe(1);
    expect(seen.progress(1, 10)).toBe(1);
  });

  it("keeps the rise going over later views, and forgets it once done", () => {
    const seen = watch(view(0, []));
    seen.show(view(10, [building(2)]));
    seen.show(view(11, [building(2)]));
    expect(seen.progress(2, 11)).toBeCloseTo(1 / RISE_TICKS);
    seen.show(view(10 + RISE_TICKS + 1, [building(2)]));
    expect(seen.placedAt.size).toBe(0);
    expect(seen.progress(2, 10 + RISE_TICKS + 1)).toBe(1);
  });

  it("does not play for the other Player's Buildings, which come into sight already built", () => {
    const seen = watch(view(0, []));
    seen.show(view(5, [building(7, 1), building(8, 1, true)]));
    expect(seen.progress(7, 5)).toBe(1);
    expect(seen.progress(8, 5)).toBe(1);
  });

  it("forgets a Building that is destroyed while rising", () => {
    const seen = watch(view(0, []));
    seen.show(view(5, [building(2)]));
    seen.show(view(6, []));
    expect(seen.placedAt.size).toBe(0);
  });

  it("takes everything in a view with nothing before it as built, whatever its Tick", () => {
    expect(risingBuildings(null, view(40, [building(1), building(2)])).size).toBe(0);
  });
});
