import { describe, expect, it } from "vitest";
import { type BuildingKind, type CellPos, createMatch, getPlayerView, issueCommand, type Match } from "./index";
import { testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, runUntil, setTestBuildingHp } from "./testing/setup";

// A Turret with its west side walled off: the three Cells west of it are open
// ground inside rock, touching nothing but the Turret. Its east side is open.
//
//   ####.
//   #.#..
//   #.T..
//   #.#..
//   ####.
const TURRET: CellPos = { x: 20, y: 16 };
const TURRET_ROCK: readonly CellPos[] = [
  ...[14, 15, 16, 17, 18].map((y) => ({ x: 18, y })),
  { x: 19, y: 14 },
  { x: 19, y: 18 },
  { x: 20, y: 14 },
  { x: 20, y: 15 },
  { x: 20, y: 17 },
  { x: 20, y: 18 },
];

// A Vehicle Factory, 3 by 3 Cells, with rock round every side but the east:
// the Cells beside it to the west, north and south are open ground that
// touches nothing but the Building. Only the three Cells east of it can be
// walked to, and every other Cell beside it is nearer to a Unit west of it.
//
//   ######.
//   #....#.
//   #.FFF..
//   #.FFF..
//   #.FFF..
//   #....#.
//   ######.
const FACTORY: CellPos = { x: 20, y: 15 };
const FACTORY_ROCK: readonly CellPos[] = [
  ...[13, 14, 15, 16, 17, 18, 19].map((y) => ({ x: 18, y })),
  ...[19, 20, 21, 22, 23].flatMap((x) => [
    { x, y: 13 },
    { x, y: 19 },
  ]),
  { x: 23, y: 14 },
  { x: 23, y: 18 },
];

/** A Map with that rock and a damaged Building of Player 0's at `at`, the starting Units parked. Returns the Building's id too. */
function stage(rock: readonly CellPos[], kind: BuildingKind, at: CellPos): { match: Match; building: number } {
  const rows = Array.from({ length: 40 }, (_, y) =>
    Array.from({ length: 50 }, (_, x) => (rock.some((c) => c.x === x && c.y === y) ? "#" : ".")).join(""),
  );
  const match = createMatch(testMap(rows), 1);
  for (const player of [0, 1] as const) {
    const unitIds = getPlayerView(match, player).units.filter((u) => u.owner === player).map((u) => u.id);
    issueCommand(match, player, { type: "stop", unitIds });
  }
  addTestBuilding(match, 0, kind, at);
  const building = getPlayerView(match, 0).buildings.find((b) => b.x === at.x && b.y === at.y)!.id;
  setTestBuildingHp(match, building, 50);
  return { match, building };
}

const buildingHp = (match: Match, id: number): number => getPlayerView(match, 0).buildings.find((b) => b.id === id)!.hp;
const unit = (match: Match, id: number) => getPlayerView(match, 0).units.find((u) => u.id === id)!;

describe("a Tend on a target whose nearest side is cut off", () => {
  it("walks round to a side that can be reached when told to", () => {
    const { match, building: turret } = stage(TURRET_ROCK, "turret", TURRET);
    // West of the wall: the Cells beside the Turret nearest to it are the three it cannot get to.
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: 16 });
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: turret })).toEqual({ ok: true });
    runUntil(match, () => buildingHp(match, turret) > 50);
    expect(Math.floor(unit(match, mechanic).x)).toBe(21);
  });

  it("walks round to a side that can be reached by itself", () => {
    const { match, building: turret } = stage(TURRET_ROCK, "turret", TURRET);
    // Two Cells from the Turret as the crow flies, with the wall and the cut-off Cells between.
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 17, y: 16 });
    runUntil(match, () => buildingHp(match, turret) > 50);
    expect(Math.floor(unit(match, mechanic).x)).toBe(21);
  });
});

describe("a Tend on a 3 by 3 Building that can be reached only from its far side", () => {
  it("walks round to the far side when told to", () => {
    const { match, building: factory } = stage(FACTORY_ROCK, "vehicleFactory", FACTORY);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: 16 });
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: factory })).toEqual({ ok: true });
    runUntil(match, () => buildingHp(match, factory) > 50);
    expect(Math.floor(unit(match, mechanic).x)).toBe(23);
  });

  it("walks round to the far side by itself", () => {
    const { match, building: factory } = stage(FACTORY_ROCK, "vehicleFactory", FACTORY);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 17, y: 16 });
    runUntil(match, () => buildingHp(match, factory) > 50);
    expect(Math.floor(unit(match, mechanic).x)).toBe(23);
  });
});
