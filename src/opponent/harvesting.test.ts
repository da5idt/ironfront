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
