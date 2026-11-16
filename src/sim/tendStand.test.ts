import { describe, expect, it } from "vitest";
import { advanceTick, type CellPos, createMatch, getPlayerView, issueCommand, type Match } from "./index";
import { testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp } from "./testing/setup";

// A Turret with its west side walled off: the three Cells west of it are open
// ground inside rock, touching nothing but the Turret. Its east side is open.
//
//   ####.
//   #.#..
//   #.T..
//   #.#..
//   ####.
const TURRET: CellPos = { x: 20, y: 16 };
const ROCK: readonly CellPos[] = [
  ...[14, 15, 16, 17, 18].map((y) => ({ x: 18, y })),
  { x: 19, y: 14 },
  { x: 19, y: 18 },
  { x: 20, y: 14 },
  { x: 20, y: 15 },
  { x: 20, y: 17 },
  { x: 20, y: 18 },
];
const ROWS = Array.from({ length: 40 }, (_, y) =>
  Array.from({ length: 50 }, (_, x) => (ROCK.some((c) => c.x === x && c.y === y) ? "#" : ".")).join(""),
);

/** The Map above with a damaged Turret of Player 0's, and the starting Units parked. Returns the Turret's id too. */
function stage(): { match: Match; turret: number } {
  const match = createMatch(testMap(ROWS), 1);
  for (const player of [0, 1] as const) {
    const unitIds = getPlayerView(match, player).units.filter((u) => u.owner === player).map((u) => u.id);
    issueCommand(match, player, { type: "stop", unitIds });
  }
  addTestBuilding(match, 0, "turret", TURRET);
  const turret = getPlayerView(match, 0).buildings.find((b) => b.x === TURRET.x && b.y === TURRET.y)!.id;
  setTestBuildingHp(match, turret, 50);
  return { match, turret };
}

const turretHp = (match: Match, id: number): number => getPlayerView(match, 0).buildings.find((b) => b.id === id)!.hp;
const unit = (match: Match, id: number) => getPlayerView(match, 0).units.find((u) => u.id === id)!;

function runUntil(match: Match, done: () => boolean, limit = 1200): void {
  for (let t = 0; t < limit; t++) {
    if (done()) return;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

describe("a Tend on a target whose nearest side is cut off", () => {
  it("walks round to a side that can be reached when told to", () => {
    const { match, turret } = stage();
    // West of the wall: the Cells beside the Turret nearest to it are the three it cannot get to.
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: 16 });
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: turret })).toEqual({ ok: true });
    runUntil(match, () => turretHp(match, turret) > 50);
    expect(Math.floor(unit(match, mechanic).x)).toBe(21);
  });

  it("walks round to a side that can be reached by itself", () => {
    const { match, turret } = stage();
    // Two Cells from the Turret as the crow flies, with the wall and the cut-off Cells between.
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 17, y: 16 });
    runUntil(match, () => turretHp(match, turret) > 50);
    expect(Math.floor(unit(match, mechanic).x)).toBe(21);
  });
});
