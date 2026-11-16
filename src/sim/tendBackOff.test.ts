import { describe, expect, it, vi } from "vitest";
import { advanceTick, createMatch, getPlayerView, issueCommand, type Match, TEND, TICKS_PER_SECOND } from "./index";
import { findPath } from "./pathfinding";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, removeTestBuilding, setTestUnitHp } from "./testing/setup";

// How often a route is planned cannot be seen in a Player view: it costs time,
// not health or position. So this one file counts calls into the pathfinding
// module, the pure helper the seam's notes already let tests import. The real
// function still runs; only the calls are counted.
vi.mock("./pathfinding", async (original) => {
  const real = await original<typeof import("./pathfinding")>();
  return { ...real, findPath: vi.fn(real.findPath) };
});

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

/** Parks every Unit that starts on the Map, so the only routes planned are the ones under test. */
function parkStartingUnits(match: Match): void {
  for (const player of [0, 1] as const) {
    const unitIds = getPlayerView(match, player).units.filter((u) => u.owner === player).map((u) => u.id);
    issueCommand(match, player, { type: "stop", unitIds });
  }
}

const unitHp = (match: Match, id: number): number => getPlayerView(match, 0).units.find((u) => u.id === id)!.hp;

describe("an idle support Unit near a hurt target it cannot reach", () => {
  it("backs off for a while after finding no way to it, rather than planning a route on every look", () => {
    // A pocket of open ground walled in by rock, Cells 19..21 by 15..17, with a damaged Raider inside.
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 50 }, (_, x) => {
        const ring = x >= 18 && x <= 22 && y >= 14 && y <= 18 && (x === 18 || x === 22 || y === 14 || y === 18);
        return ring ? "#" : ".";
      }).join(""),
    );
    const match = createMatch(testMap(rows), 1);
    parkStartingUnits(match);
    const raider = addTestUnit(match, 0, "raider", { x: 20, y: 16 });
    setTestUnitHp(match, raider, 30);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 16, y: 16 });
    vi.mocked(findPath).mockClear();
    const seconds = 20;
    run(match, seconds * TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBe(30);
    const planned = vi.mocked(findPath).mock.calls.length;
    // It does try, and tries again now and then in case the way has opened...
    expect(planned).toBeGreaterThanOrEqual(2);
    // ...but far less often than it looks: a look every seekTicks would be 40 routes here.
    expect(planned).toBeLessThanOrEqual((seconds * TICKS_PER_SECOND) / TEND.retryTicks + 1);
    expect(TEND.retryTicks).toBeGreaterThanOrEqual(4 * TEND.seekTicks);
    expect(mechanic).toBeGreaterThan(0);
  });

  it("still goes to another target it can reach while it is backing off from the first", () => {
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 50 }, (_, x) => {
        const ring = x >= 18 && x <= 22 && y >= 14 && y <= 18 && (x === 18 || x === 22 || y === 14 || y === 18);
        return ring ? "#" : ".";
      }).join(""),
    );
    const match = createMatch(testMap(rows), 1);
    parkStartingUnits(match);
    const walledIn = addTestUnit(match, 0, "raider", { x: 20, y: 16 });
    setTestUnitHp(match, walledIn, 30);
    addTestUnit(match, 0, "mechanic", { x: 16, y: 16 });
    run(match, 2 * TICKS_PER_SECOND);
    // A second damaged Raider turns up farther off than the first, in the open.
    const inTheOpen = addTestUnit(match, 0, "raider", { x: 12, y: 16 });
    setTestUnitHp(match, inTheOpen, 100);
    run(match, TEND.retryTicks - TICKS_PER_SECOND);
    expect(unitHp(match, inTheOpen)).toBeGreaterThan(100);
    expect(unitHp(match, walledIn)).toBe(30);
  });

  it("goes to it once the way opens, within the back-off and one more look", () => {
    const match = createMatch(openMap(50, 40), 1);
    parkStartingUnits(match);
    // Walled in by the Player's own whole Turrets this time, so one can be taken away.
    const wall: number[] = [];
    for (let y = 14; y <= 18; y++) {
      for (let x = 18; x <= 22; x++) {
        if (x !== 18 && x !== 22 && y !== 14 && y !== 18) continue;
        addTestBuilding(match, 0, "turret", { x, y });
        wall.push(getPlayerView(match, 0).buildings.find((b) => b.x === x && b.y === y)!.id);
      }
    }
    const raider = addTestUnit(match, 0, "raider", { x: 20, y: 16 });
    setTestUnitHp(match, raider, 30);
    addTestUnit(match, 0, "mechanic", { x: 16, y: 16 });
    run(match, 3 * TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBe(30);
    const gap = getPlayerView(match, 0).buildings.find((b) => b.x === 18 && b.y === 16)!.id;
    removeTestBuilding(match, gap);
    // The back-off, a look, and a few Cells to walk.
    run(match, TEND.retryTicks + TEND.seekTicks + 4 * TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBeGreaterThan(30);
    expect(wall).toHaveLength(16);
  });

  it("goes at once when told to by a Tend Command, back-off or not", () => {
    const match = createMatch(openMap(50, 40), 1);
    parkStartingUnits(match);
    for (let y = 14; y <= 18; y++) {
      for (let x = 18; x <= 22; x++) {
        if (x === 18 || x === 22 || y === 14 || y === 18) addTestBuilding(match, 0, "turret", { x, y });
      }
    }
    const raider = addTestUnit(match, 0, "raider", { x: 20, y: 16 });
    setTestUnitHp(match, raider, 30);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 16, y: 16 });
    run(match, TICKS_PER_SECOND);
    removeTestBuilding(match, getPlayerView(match, 0).buildings.find((b) => b.x === 18 && b.y === 16)!.id);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: raider })).toEqual({ ok: true });
    // Two Cells to walk at 1.5 a second, then work: well inside the back-off.
    run(match, 3 * TICKS_PER_SECOND);
    expect(3 * TICKS_PER_SECOND).toBeLessThan(TEND.retryTicks - TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBeGreaterThan(30);
  });
});
