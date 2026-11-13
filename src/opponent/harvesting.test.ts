import { describe, expect, it } from "vitest";
import { createMatch, getPlayerView, OPPONENT, type PlayerView } from "../sim";
import { testMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit, setTestCredits } from "../sim/testing/setup";
import { buildCommands, trainCommands } from "./economy";
import { chooseOre, type DangerMemory, rememberDanger } from "./harvesting";

// 40x40: Player 0's Refinery covers (4..6, 0..1). A near Ore Field at (8..9, 8)
// and a far one at (20..21, 4), each watched by a Player 0 Rifleman so both are known.
const rows = Array.from({ length: 40 }, (_, y) =>
  Array.from({ length: 40 }, (_, x) =>
    (y === 8 && (x === 8 || x === 9)) || (y === 4 && (x === 20 || x === 21)) ? "*" : ".",
  ).join(""),
);
const refinery = { x: 5.5, y: 1 };

function scene(withEnemyAtNearField: boolean): PlayerView {
  const match = createMatch(testMap(rows), 1);
  addTestUnit(match, 0, "rifleman", { x: 9, y: 10 });
  addTestUnit(match, 0, "rifleman", { x: 20, y: 6 });
  if (withEnemyAtNearField) addTestUnit(match, 1, "rifleman", { x: 10, y: 11 });
  return getPlayerView(match, 0);
}

describe("choosing Ore for the Opponent's Harvesters", () => {
  it("takes the known Ore nearest the Refinery", () => {
    const view = scene(false);
    expect(chooseOre(view, new Map(), refinery)).toEqual({ x: 8, y: 8 });
  });

  it("passes over a field where an enemy fighter was seen lately for a safer one", () => {
    const view = scene(true);
    const danger: DangerMemory = new Map();
    rememberDanger(danger, view);
    expect(chooseOre(view, danger, refinery)).toEqual({ x: 20, y: 4 });
  });

  it("goes back to the near field once the sighting is old", () => {
    const view = scene(true);
    const danger: DangerMemory = new Map();
    rememberDanger(danger, view);
    const later = { ...view, tick: view.tick + OPPONENT.dangerTicks + 1, units: [] };
    rememberDanger(danger, later);
    expect(chooseOre(later, danger, refinery)).toEqual({ x: 8, y: 8 });
  });

  it("still takes the nearest field when no known field is safe", () => {
    const view = scene(true);
    const danger: DangerMemory = new Map([[999, { x: 20.5, y: 4.5, tick: view.tick }]]);
    rememberDanger(danger, view);
    expect(chooseOre(view, danger, refinery)).toEqual({ x: 8, y: 8 });
  });
});

describe("the Opponent short of Harvesters", () => {
  // Player 0 with two Refineries wants four Harvesters and has one; its build
  // order is up to the Turret.
  function shortOfHarvesters(credits: number): PlayerView {
    const match = createMatch(testMap(rows), 1);
    addTestBuilding(match, 0, "barracks", { x: 0, y: 6 });
    addTestBuilding(match, 0, "refinery", { x: 8, y: 0 });
    addTestBuilding(match, 0, "vehicleFactory", { x: 3, y: 6 });
    setTestCredits(match, 0, credits);
    return getPlayerView(match, 0);
  }

  it("keeps a Harvester's worth back from army and Turrets", () => {
    const view = shortOfHarvesters(1000);
    expect(buildCommands(view, { count: 0 })).toEqual([]);
    expect(trainCommands(view).map((c) => c.type === "train" && c.kind)).toEqual(["harvester"]);
  });

  it("trains no army while it can't yet afford the Harvester", () => {
    expect(trainCommands(shortOfHarvesters(600))).toEqual([]);
  });
});

describe("the Opponent's HQ with nowhere to place a finished Building", () => {
  // Dry land only round each starting base, so no Vehicle Factory fits anywhere.
  const cramped = Array.from({ length: 30 }, (_, y) => {
    if (y < 6) return ".".repeat(8) + "~".repeat(22);
    if (y >= 24) return "~".repeat(20) + ".".repeat(10);
    return "~".repeat(30);
  });
  const readyFactory = (): PlayerView => ({
    ...getPlayerView(createMatch(testMap(cramped), 1), 0),
    production: { kind: "vehicleFactory", progress: 1, ready: true },
  });
  /** Thinks until the HQ cancels, returning how many it took. */
  const thinksUntilCancel = (view: PlayerView, failures: { count: number }): number => {
    for (let n = 1; n <= 100; n++) {
      if (buildCommands(view, failures).some((c) => c.type === "cancelBuilding")) return n;
    }
    return Infinity;
  };

  it("gives every finished Building the full number of tries, even after an earlier one was cancelled", () => {
    const failures = { count: 0 };
    const first = thinksUntilCancel(readyFactory(), failures);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(Infinity);
    // The next Building gets as long as the first did, so start and cancel can't follow each other every think.
    expect(thinksUntilCancel(readyFactory(), failures)).toBe(first);
  });
});
