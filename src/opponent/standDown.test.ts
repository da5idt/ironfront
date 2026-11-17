import { describe, expect, it } from "vitest";
import { getPlayerView, type MapDef, type Match, OPPONENT, TROOP_CARRIER, type UnitView } from "../sim";
import { testMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit, removeTestBuilding, setTestCredits, setTestUnitHp } from "../sim/testing/setup";
import { createOpponent, type Opponent } from "./opponent";
import { base, BUILD_ORDER_DONE, play, SECONDS } from "./testing/stage";

// A wave that ends with Units left while its Troop Carrier is still out with
// Passengers inside. The Opponent plays Player 0: HQ on (0..2, 0..2), rally
// point at about (6, 6), Parking Cell at about (1, 9).

const RALLY = { x: 6, y: 6 };
const HQ = { x: 1, y: 1 };
/** The other Player's Barracks. A wave on it gathers at about (17, 5), on the way there from the HQ. */
const OUTPOST = { x: 30, y: 8 };
/**
 * Two Cells shut in by rock on every side: a Unit on one sees out but goes nowhere.
 * The first is far from the base, from the Barracks and from the way between them;
 * the second is in sight of the Barracks and out of a Rifleman's range of it.
 */
const SHUT_IN = { x: 5, y: 30 };
const LOOKOUT = { x: 30, y: 14 };
const SITES = [
  { x: 10, y: 0 },
  { x: 14, y: 0 },
  { x: 18, y: 0 },
  { x: 22, y: 0 },
];

const apart = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (match: Match, id: number): UnitView | undefined =>
  getPlayerView(match, 0).units.find((u) => u.owner === 0 && u.id === id);

/** A wall of rock from side to side between the base and the first shut-in Cell, with one Cell to pass by. */
const WALL_ROW = 22;
const GAP = { x: 12, y: WALL_ROW };

function mapWithShutInCells(walled = false): MapDef {
  const ringed = (x: number, y: number, c: { x: number; y: number }): boolean =>
    Math.abs(x - c.x) <= 1 && Math.abs(y - c.y) <= 1 && !(x === c.x && y === c.y);
  const wall = (x: number, y: number): boolean => walled && y === WALL_ROW && x !== GAP.x;
  const rows = Array.from({ length: 40 }, (_, y) =>
    Array.from({ length: 40 }, (_, x) => (ringed(x, y, SHUT_IN) || ringed(x, y, LOOKOUT) || wall(x, y) ? "#" : ".")).join(""),
  );
  return testMap(rows);
}

interface AtTheFront {
  readonly match: Match;
  readonly opponent: Opponent;
  readonly carrier: number;
  /** The Riflemen inside the Troop Carrier, as many as it holds. */
  readonly boarding: number[];
  /** The other Player's Barracks, as the Opponent sees it. */
  readonly outpost: number;
}

/**
 * A first wave that has set off and cannot gather: as many of its Riflemen as
 * the Troop Carrier holds are inside it, and it waits beside one more, who is shut in.
 */
function waveStuckGathering(map: MapDef): AtTheFront {
  const match = base(BUILD_ORDER_DONE, SITES, map);
  // The only Building of the other Player the Opponent ever knows: its scout stays near home once one is known.
  addTestBuilding(match, 1, "barracks", OUTPOST);
  // The first wave is the oldest army Units at home: the starting Riflemen and enough more to fill the Troop
  // Carrier Board, and the next, who can never leave its Cell, is the wave's only Unit on foot. The Troop Carrier
  // is led to where the wave's foremost Unit on foot is, so it waits beside that Cell, full, and never gathers.
  const starting = getPlayerView(match, 0)
    .units.filter((u) => u.owner === 0 && u.kind === "rifleman")
    .map((u) => u.id);
  const boarding = [
    ...starting,
    ...Array.from({ length: TROOP_CARRIER.capacity - starting.length }, (_, i) =>
      addTestUnit(match, 0, "rifleman", { x: RALLY.x - 1 + i, y: RALLY.y + 1 }),
    ),
  ];
  const shutIn = addTestUnit(match, 0, "rifleman", SHUT_IN);
  // One more than the wave takes stays behind and sees the Barracks. It is all that is left at home to scout, and it cannot move.
  addTestUnit(match, 0, "rifleman", LOOKOUT);
  const carrier = addTestUnit(match, 0, "troopCarrier", { x: 12, y: 12 });
  // Nothing to spend and nothing coming in, so the Opponent trains nobody who could go and find another Building.
  setTestCredits(match, 0, 0);
  setTestUnitHp(match, getPlayerView(match, 0).units.find((u) => u.owner === 0 && u.kind === "harvester")!.id, 0);
  const outpost = getPlayerView(match, 0).buildings.find((b) => b.owner === 1)!;
  expect(outpost).toBeDefined();

  const opponent = createOpponent(0, 1);
  const setOff = play(match, opponent, OPPONENT.firstWaveTick + 240 * SECONDS, {
    done: (soFar) => soFar.some((g) => g.command.type === "attackMove"),
  });
  expect(setOff.map((g) => g.command)).toContainEqual({ type: "board", unitIds: boarding, targetId: carrier });
  expect(setOff.at(-1)!.command).toMatchObject({ type: "attackMove", unitIds: [shutIn] });
  expect(unit(match, carrier)!.passengers!.map((p) => p.id).sort((a, b) => a - b)).toEqual(boarding);
  return { match, opponent, carrier, boarding, outpost: outpost.id };
}

describe("Computer Opponent's wave that stands down with its Troop Carrier still full", () => {
  it("brings the Troop Carrier back to its Parking Cell and its Riflemen back to the rally point", () => {
    const { match, opponent, carrier, boarding, outpost } = waveStuckGathering(mapWithShutInCells());
    // The Barracks falls while the wave is still gathering, in sight of the Rifleman shut in beside it
    // (removeTestBuilding takes it off the Map as destruction does), so the Opponent knows nothing to attack.
    removeTestBuilding(match, outpost);
    // A wave waits a minute for its stragglers. Until then the Troop Carrier stands by the shut-in Cell, still full.
    play(match, opponent, 30 * SECONDS);
    expect(unit(match, carrier)!.passengers).toHaveLength(TROOP_CARRIER.capacity);
    expect(apart(unit(match, carrier)!, SHUT_IN)).toBeLessThan(4);
    play(match, opponent, 120 * SECONDS);
    expect(getPlayerView(match, 0).buildings.filter((b) => b.owner === 1)).toEqual([]);

    const home = unit(match, carrier)!;
    expect(home.passengers).toEqual([]);
    expect(apart(home, HQ)).toBeLessThan(12);
    expect(apart(home, RALLY)).toBeGreaterThan(4);
    for (const id of boarding) expect(apart(unit(match, id)!, RALLY)).toBeLessThan(4);
  });

  it("has the next wave Board no Troop Carrier that was recalled and is stuck far from home, and sends that one home again now and then", () => {
    const { match, opponent, carrier, outpost } = waveStuckGathering(mapWithShutInCells(true));
    // Out through the wall to the Rifleman it is led to, where it waits, full.
    play(match, opponent, 30 * SECONDS);
    expect(apart(unit(match, carrier)!, SHUT_IN)).toBeLessThan(4);
    removeTestBuilding(match, outpost);
    // The way home is shut behind it: a Turret of its own Player now stands on the one Cell through the wall.
    addTestBuilding(match, 0, "turret", GAP);
    // With the seven Riflemen of before, enough at home for a second wave.
    for (let i = 0; i < 2; i++) addTestUnit(match, 0, "rifleman", { x: RALLY.x + i, y: RALLY.y + 2 });

    const stoodDown = 150 * SECONDS;
    const recalled = play(match, opponent, stoodDown);
    const stuck = unit(match, carrier)!;
    expect(stuck.passengers).toEqual([]);
    expect(stuck.y).toBeGreaterThan(WALL_ROW);
    const drives = recalled.filter((g) => g.command.type === "move" && g.command.unitIds.includes(carrier));
    // Twice when recalled, and twice more each time the wait is over; never think after think.
    expect(drives.length).toBeGreaterThan(2);
    expect(drives.length).toBeLessThanOrEqual(2 * (1 + Math.ceil(stoodDown / OPPONENT.parkAgainTicks)));

    // The other Player builds again where the lookout sees it, and the second wave is due.
    addTestBuilding(match, 1, "barracks", OUTPOST);
    const next = play(match, opponent, 60 * SECONDS, { done: (soFar) => soFar.some((g) => g.command.type === "attackMove") });
    expect(next.map((g) => g.command.type)).toContain("attackMove");
    expect([...recalled, ...next].filter((g) => g.command.type === "board")).toEqual([]);
  });
});
