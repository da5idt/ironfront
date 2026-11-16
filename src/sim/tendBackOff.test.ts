import { describe, expect, it } from "vitest";
import { advanceTick, type CellPos, createMatch, getPlayerView, issueCommand, type Match, TEND, TICKS_PER_SECOND } from "./index";
import { testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, removeTestBuilding, setTestUnitHp } from "./testing/setup";

// Two pockets of open ground, 3 by 3 Cells, each inside a ring of rock with one
// Cell left open as a door. The doors face each other across column 17, so a
// Unit standing at BETWEEN is next to both.
const EAST = { centre: { x: 20, y: 16 }, door: { x: 18, y: 16 } };
const WEST = { centre: { x: 14, y: 16 }, door: { x: 16, y: 16 } };
const BETWEEN: CellPos = { x: 17, y: 16 };

const ROWS = Array.from({ length: 40 }, (_, y) =>
  Array.from({ length: 50 }, (_, x) => {
    const rock = [EAST, WEST].some(({ centre, door }) => {
      const dx = Math.abs(x - centre.x);
      const dy = Math.abs(y - centre.y);
      return Math.max(dx, dy) === 2 && !(x === door.x && y === door.y);
    });
    return rock ? "#" : ".";
  }).join(""),
);

/** The Map above with the starting Units parked, so nothing but the Units under test moves. */
function stage(): Match {
  const match = createMatch(testMap(ROWS), 1);
  for (const player of [0, 1] as const) {
    const unitIds = getPlayerView(match, player).units.filter((u) => u.owner === player).map((u) => u.id);
    issueCommand(match, player, { type: "stop", unitIds });
  }
  return match;
}

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

function runUntil(match: Match, done: () => boolean, limit = 1200): void {
  for (let t = 0; t < limit; t++) {
    if (done()) return;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

const unit = (match: Match, id: number) => getPlayerView(match, 0).units.find((u) => u.id === id)!;
const unitHp = (match: Match, id: number): number => unit(match, id).hp;

/** Shuts a pocket's door with one of the Player's own whole Turrets, which nothing Repairs, and returns the Turret's id. */
function shut(match: Match, door: CellPos): number {
  addTestBuilding(match, 0, "turret", door);
  return getPlayerView(match, 0).buildings.find((b) => b.x === door.x && b.y === door.y)!.id;
}

/** A Raider at 30 health in the middle of the pocket. */
function damagedRaider(match: Match, pocket: { centre: CellPos }): number {
  const id = addTestUnit(match, 0, "raider", pocket.centre);
  setTestUnitHp(match, id, 30);
  return id;
}

describe("an idle support Unit near a hurt target it cannot reach", () => {
  it("leaves it alone for the back-off after finding no way to it, even with the way open, and goes once the back-off is over", () => {
    const match = stage();
    const door = shut(match, EAST.door);
    const raider = damagedRaider(match, EAST);
    addTestUnit(match, 0, "mechanic", BETWEEN);
    // One look: it stands as near as it can get already, so it gives up on the spot.
    run(match, TEND.seekTicks);
    removeTestBuilding(match, door);
    // Looks go by all through the back-off, and the door is open, but it gave up less than the back-off ago.
    run(match, TEND.retryTicks - TEND.seekTicks);
    expect(unitHp(match, raider)).toBe(30);
    // The back-off ends within one more look; then two Cells to walk at 1.5 a second.
    run(match, TEND.seekTicks + 3 * TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBeGreaterThan(30);
  });

  it("backs off from each of two targets it found no way to, not only from the last", () => {
    const match = stage();
    const doors = [shut(match, EAST.door), shut(match, WEST.door)];
    const raiders = [damagedRaider(match, EAST), damagedRaider(match, WEST)];
    addTestUnit(match, 0, "mechanic", BETWEEN);
    // Two looks: it gives up on one, then on the other.
    run(match, 2 * TEND.seekTicks);
    for (const door of doors) removeTestBuilding(match, door);
    // Both ways are open now, and the first back-off still has a look or more to go.
    run(match, TEND.retryTicks - 2 * TEND.seekTicks);
    expect(raiders.map((id) => unitHp(match, id))).toEqual([30, 30]);
    runUntil(match, () => raiders.every((id) => unitHp(match, id) > 30));
  });

  it("backs off as well when the way shuts while it is walking there", () => {
    const match = stage();
    const raider = damagedRaider(match, EAST);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 13, y: 20 });
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: raider })).toEqual({ ok: true });
    run(match, TICKS_PER_SECOND);
    const door = shut(match, EAST.door);
    // It walks on to the shut door, finds no way round, and stops as near as it can get.
    let before = { x: -1, y: -1 };
    runUntil(match, () => {
      const { x, y } = unit(match, mechanic);
      const stopped = x === before.x && y === before.y;
      before = { x, y };
      return stopped;
    });
    removeTestBuilding(match, door);
    run(match, TEND.retryTicks - TEND.seekTicks);
    expect(unitHp(match, raider)).toBe(30);
    run(match, 2 * TEND.seekTicks + 3 * TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBeGreaterThan(30);
  });

  it("still goes to another target it can reach while it is backing off from the first", () => {
    const match = stage();
    shut(match, EAST.door);
    const walledIn = damagedRaider(match, EAST);
    addTestUnit(match, 0, "mechanic", BETWEEN);
    run(match, 2 * TICKS_PER_SECOND);
    // A second damaged Raider turns up farther off than the first, in the open.
    const inTheOpen = addTestUnit(match, 0, "raider", { x: 17, y: 21 });
    setTestUnitHp(match, inTheOpen, 100);
    run(match, TEND.retryTicks - TICKS_PER_SECOND);
    expect(unitHp(match, inTheOpen)).toBeGreaterThan(100);
    expect(unitHp(match, walledIn)).toBe(30);
  });

  it("goes at once when told to by a Tend Command, back-off or not", () => {
    const match = stage();
    const door = shut(match, EAST.door);
    const raider = damagedRaider(match, EAST);
    const mechanic = addTestUnit(match, 0, "mechanic", BETWEEN);
    run(match, TICKS_PER_SECOND);
    removeTestBuilding(match, door);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: raider })).toEqual({ ok: true });
    // Two Cells to walk at 1.5 a second, then work: well inside the back-off.
    run(match, 3 * TICKS_PER_SECOND);
    expect(unitHp(match, raider)).toBeGreaterThan(30);
  });
});
