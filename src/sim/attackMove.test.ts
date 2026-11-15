import { describe, expect, it } from "vitest";
import {
  advanceTick,
  BUILDING_STATS,
  type BuildingView,
  createMatch,
  getPlayerView,
  issueCommand,
  type Match,
  UNIT_STATS,
  type UnitView,
} from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp } from "./testing/setup";

// Staged along row 8 of a wide open Map, far from both starting bases in the
// top-left and bottom-right corners, so only the Units put here take part.
const ROW = 8;
const START = { x: 14, y: ROW };
const GOAL = { x: 40, y: ROW };
const stage = (): Match => createMatch(openMap(50, 40), 1);

// Reads each Unit from its owner's view: a Player always sees its own Units.
const find = (match: Match, id: number): UnitView | undefined =>
  getPlayerView(match, 0).units.find((u) => u.id === id && u.owner === 0) ??
  getPlayerView(match, 1).units.find((u) => u.id === id && u.owner === 1);

/** The Building of that kind and owner at a Cell, read from its owner's view. */
const buildingAt = (match: Match, owner: 0 | 1, at: { x: number; y: number }): BuildingView | undefined =>
  getPlayerView(match, owner).buildings.find((b) => b.owner === owner && b.x === at.x && b.y === at.y);

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

/** Runs until the check holds, failing if it has not within `limit` Ticks. */
function runUntil(match: Match, done: () => boolean, limit = 1200): number {
  for (let t = 0; t < limit; t++) {
    if (done()) return t;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

const attackMove = (match: Match, unitIds: number[], target = GOAL) =>
  issueCommand(match, 0, { type: "attackMove", unitIds, target });

const arrived = (match: Match, id: number, goal = GOAL) => () => {
  const u = find(match, id);
  return u !== undefined && u.x === goal.x + 0.5 && u.y === goal.y + 0.5;
};

describe("the attack-move Command", () => {
  it("walks to the target Cell when nothing is in the way, and stays there", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    expect(attackMove(match, [raider])).toEqual({ ok: true });
    runUntil(match, arrived(match, raider));
    run(match, 40);
    expect(arrived(match, raider)()).toBe(true);
  });

  it("stops to fight an enemy Unit on the route, then carries on and arrives", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    const enemy = addTestUnit(match, 1, "rifleman", { x: 27, y: ROW });
    attackMove(match, [raider]);
    runUntil(match, () => find(match, enemy)!.hp < UNIT_STATS.rifleman.maxHp);
    // It stands where the enemy came into range, firing, until the enemy is dead.
    const stoodAt = find(match, raider)!.x;
    expect(27.5 - stoodAt).toBeLessThanOrEqual(UNIT_STATS.raider.range);
    runUntil(match, () => find(match, enemy) === undefined);
    expect(find(match, raider)!.x).toBe(stoodAt);
    runUntil(match, arrived(match, raider));
  });

  it("attacks an enemy Building that comes into range, and walks on once it is gone", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    const at = { x: 26, y: ROW + 2 };
    addTestBuilding(match, 1, "refinery", at);
    const refinery = buildingAt(match, 1, at)!;
    attackMove(match, [raider]);
    runUntil(match, () => buildingAt(match, 1, at)!.hp < refinery.maxHp);
    const stoodAt = find(match, raider)!.x;
    run(match, 30);
    expect(find(match, raider)!.x).toBe(stoodAt);
    // The long siege is skipped: one more shot finishes it.
    setTestBuildingHp(match, refinery.id, 1);
    runUntil(match, () => buildingAt(match, 1, at) === undefined);
    runUntil(match, arrived(match, raider));
  });

  it("picks an enemy Unit that can shoot back over a harmless one when both are in range", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    // One Cell either side of the route, so both come into range on the same Tick, equally near.
    // The Harvester has the lower id, so it would win the tie if weapons did not count.
    const harvester = addTestUnit(match, 1, "harvester", { x: 24, y: ROW + 1 });
    const rifleman = addTestUnit(match, 1, "rifleman", { x: 24, y: ROW - 1 });
    attackMove(match, [raider]);
    runUntil(match, () => find(match, rifleman) === undefined);
    // Only with the Rifleman dead does the Harvester get shot.
    expect(find(match, harvester)!.hp).toBe(UNIT_STATS.harvester.maxHp);
    runUntil(match, () => find(match, harvester) === undefined);
    runUntil(match, arrived(match, raider));
  });

  it("picks a Turret over a harmless Building when both are in range", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    // One above the route and one below, their near corners level, so both come into range on the same Tick.
    const refineryAt = { x: 22, y: ROW + 2 };
    const turretAt = { x: 22, y: ROW - 1 - BUILDING_STATS.turret.height };
    addTestBuilding(match, 1, "refinery", refineryAt);
    addTestBuilding(match, 1, "turret", turretAt);
    const hp = (at: { x: number; y: number }) => buildingAt(match, 1, at)!.hp;
    attackMove(match, [raider]);
    runUntil(match, () => hp(turretAt) < BUILDING_STATS.turret.maxHp || hp(refineryAt) < BUILDING_STATS.refinery.maxHp);
    run(match, 60);
    expect(hp(turretAt)).toBeLessThan(BUILDING_STATS.turret.maxHp);
    expect(hp(refineryAt)).toBe(BUILDING_STATS.refinery.maxHp);
  });

  it("never steps off its route to chase an enemy it can see but not reach", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    // Inside the Raider's sight as it passes, outside its range.
    const offRoute = UNIT_STATS.raider.range + 1;
    expect(offRoute).toBeLessThan(UNIT_STATS.raider.sight);
    const enemy = addTestUnit(match, 1, "harvester", { x: 27, y: ROW + offRoute });
    attackMove(match, [raider]);
    runUntil(match, () => {
      expect(find(match, raider)!.y).toBe(ROW + 0.5);
      return arrived(match, raider)();
    });
    expect(find(match, enemy)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("is a plain move for a Harvester, which has no weapon", () => {
    const match = stage();
    const harvester = addTestUnit(match, 0, "harvester", START);
    const enemy = addTestUnit(match, 1, "harvester", { x: 27, y: ROW + 1 });
    expect(attackMove(match, [harvester])).toEqual({ ok: true });
    runUntil(match, arrived(match, harvester));
    expect(find(match, enemy)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("spreads a group over goals round the target, as a group move does", () => {
    const match = stage();
    const a = addTestUnit(match, 0, "raider", START);
    const b = addTestUnit(match, 0, "raider", { x: START.x, y: ROW + 1 });
    attackMove(match, [a, b]);
    run(match, 400);
    const [ua, ub] = [find(match, a)!, find(match, b)!];
    expect(Math.hypot(ua.x - ub.x, ua.y - ub.y)).toBeGreaterThanOrEqual(1);
    for (const u of [ua, ub]) expect(Math.hypot(u.x - (GOAL.x + 0.5), u.y - (GOAL.y + 0.5))).toBeLessThan(2);
  });

  it("is replaced by a later move: the Unit then walks past the enemy without firing", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    const enemy = addTestUnit(match, 1, "harvester", { x: 27, y: ROW + 2 });
    attackMove(match, [raider]);
    run(match, 5);
    issueCommand(match, 0, { type: "move", unitIds: [raider], target: GOAL });
    runUntil(match, arrived(match, raider));
    expect(find(match, enemy)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("is replaced by a later attack Command: the Unit leaves its route to chase that target", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    const enemy = addTestUnit(match, 1, "harvester", { x: 18, y: ROW + 5 });
    attackMove(match, [raider]);
    run(match, 5);
    expect(issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: enemy })).toEqual({ ok: true });
    runUntil(match, () => find(match, enemy) === undefined);
    run(match, 200);
    expect(find(match, raider)!.x).toBeLessThan(GOAL.x - 10);
  });

  it("keeps other Units off the Cell where it stands firing", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    addTestBuilding(match, 1, "refinery", { x: 26, y: ROW + 2 });
    attackMove(match, [raider]);
    runUntil(match, () => buildingAt(match, 1, { x: 26, y: ROW + 2 })!.hp < BUILDING_STATS.refinery.maxHp);
    const firing = find(match, raider)!;
    const other = addTestUnit(match, 0, "harvester", START);
    issueCommand(match, 0, { type: "move", unitIds: [other], target: { x: Math.floor(firing.x), y: Math.floor(firing.y) } });
    run(match, 300);
    const o = find(match, other)!;
    expect(Math.hypot(o.x - firing.x, o.y - firing.y)).toBeGreaterThanOrEqual(1);
  });

  it("is ended by stop", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    attackMove(match, [raider]);
    run(match, 10);
    issueCommand(match, 0, { type: "stop", unitIds: [raider] });
    const at = find(match, raider)!;
    run(match, 40);
    expect(find(match, raider)!.x).toBe(at.x);
    expect(at.x).toBeLessThan(GOAL.x);
  });

  // Weapon range is inside sight for every Unit, so a hidden enemy in range cannot be staged through the
  // seam; the rule itself is that targets come only from what the Player's Fog of War shows as Visible.
  it("walks past an enemy it cannot see without turning aside or firing", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", START);
    const hidden = addTestUnit(match, 1, "harvester", { x: 27, y: ROW + UNIT_STATS.raider.sight + 2 });
    attackMove(match, [raider]);
    runUntil(match, arrived(match, raider));
    expect(getPlayerView(match, 0).units.some((u) => u.id === hidden)).toBe(false);
    expect(find(match, hidden)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("is rejected, changing nothing, for another Player's Units, unknown Units and Cells off the Map or between Cells", () => {
    const match = stage();
    const mine = addTestUnit(match, 0, "raider", START);
    const theirs = addTestUnit(match, 1, "raider", { x: 30, y: 30 });
    const before = JSON.stringify(getPlayerView(match, 0));
    expect(attackMove(match, [theirs]).ok).toBe(false);
    expect(attackMove(match, [999]).ok).toBe(false);
    expect(attackMove(match, []).ok).toBe(false);
    for (const target of [
      { x: 50, y: ROW },
      { x: -1, y: ROW },
      { x: 20.5, y: ROW },
      { x: 20, y: Number.NaN },
      { x: Number.POSITIVE_INFINITY, y: ROW },
    ]) {
      expect(attackMove(match, [mine], target).ok, JSON.stringify(target)).toBe(false);
    }
    run(match, 20);
    expect(JSON.stringify({ ...getPlayerView(match, 0), tick: 0 })).toBe(JSON.stringify({ ...JSON.parse(before), tick: 0 }));
  });

  it("gives the same Match from the same seed and Commands", () => {
    const play = (): string => {
      const match = createMatch(openMap(50, 40), 7);
      const raiders = [0, 1, 2].map((i) => addTestUnit(match, 0, "raider", { x: START.x, y: ROW + i }));
      addTestUnit(match, 1, "rifleman", { x: 27, y: ROW });
      addTestUnit(match, 1, "raider", { x: 29, y: ROW + 2 });
      attackMove(match, raiders);
      run(match, 500);
      return JSON.stringify([getPlayerView(match, 0), getPlayerView(match, 1)]);
    };
    expect(play()).toBe(play());
  });
});
