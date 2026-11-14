import { describe, expect, it } from "vitest";
import {
  advanceTick,
  BUILDING_STATS,
  createMatch,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerView,
} from "../sim";
import { openMap } from "../sim/testing/maps";
import { placingMapClick, placingPreview } from "./placing";

/** A Match whose HQ has a Barracks ready to place. */
function readyBarracks(): Match {
  const match = createMatch(openMap(30, 30), 1);
  issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
  for (let t = 0; t < BUILDING_STATS.barracks.buildTicks; t++) advanceTick(match);
  return match;
}

/**
 * The Cell under the mouse for a free spot below the base (the Barracks' top-left
 * at 0,6, as in the Simulation's own placing tests), and for the HQ's middle.
 */
function spots(view: PlayerView) {
  const hq = view.buildings.find((b) => b.owner === 0 && b.kind === "hq")!;
  return { free: { x: 1, y: 7 }, onHq: { x: hq.x + 1, y: hq.y + 1 } };
}

describe("the placing preview", () => {
  it("follows the Cell under the mouse, green where the Building fits and red where not", () => {
    const view = getPlayerView(readyBarracks(), 0);
    const { free, onHq } = spots(view);
    expect(placingPreview(view, "barracks", free)).toEqual({
      kind: "barracks",
      at: { x: free.x - 1, y: free.y - 1 },
      valid: true,
    });
    expect(placingPreview(view, "barracks", onHq).valid).toBe(false);
  });
});

describe("clicking the Map while placing", () => {
  it("places the Building with one left-click on a spot where it fits", () => {
    const match = readyBarracks();
    const view = getPlayerView(match, 0);
    const outcome = placingMapClick(view, "barracks", spots(view).free, "left");
    expect(outcome.type).toBe("place");
    if (outcome.type !== "place") return;
    expect(issueCommand(match, 0, outcome.command)).toEqual({ ok: true });
    expect(getPlayerView(match, 0).buildings.some((b) => b.kind === "barracks")).toBe(true);
  });

  it("stays in placing mode, saying it can't build there, on a spot where it doesn't fit", () => {
    const view = getPlayerView(readyBarracks(), 0);
    expect(placingMapClick(view, "barracks", spots(view).onHq, "left")).toEqual({ type: "cantBuildThere" });
  });

  it("cancels placing with a right-click, wherever it lands", () => {
    const view = getPlayerView(readyBarracks(), 0);
    expect(placingMapClick(view, "barracks", spots(view).free, "right")).toEqual({ type: "cancel" });
    expect(placingMapClick(view, "barracks", spots(view).onHq, "right")).toEqual({ type: "cancel" });
  });
});
