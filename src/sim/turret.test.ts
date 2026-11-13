import { describe, expect, it } from "vitest";
import { advanceTick, BUILDING_STATS, createMatch, getPlayerView, type Match, UNIT_STATS } from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit } from "./testing/setup";

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

const enemyUnit = (match: Match, id: number) => getPlayerView(match, 1).units.find((u) => u.id === id);

describe("a Turret", () => {
  it("fires by itself at the nearest enemy Unit in range, on reload, until it dies", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    const far = addTestUnit(match, 1, "harvester", { x: 10, y: 19 });
    const near = addTestUnit(match, 1, "harvester", { x: 14, y: 14 });
    const outOfRange = addTestUnit(match, 1, "harvester", { x: 17, y: 14 });
    run(match, 1);
    const { damage, reloadTicks } = BUILDING_STATS.turret;
    const full = UNIT_STATS.harvester.maxHp;
    expect(enemyUnit(match, near)!.hp).toBe(full - damage);
    expect(enemyUnit(match, far)!.hp).toBe(full);
    expect(getPlayerView(match, 0).shots).toEqual([{ fromX: 10.5, fromY: 14.5, toX: 14.5, toY: 14.5, tick: 0 }]);
    run(match, reloadTicks - 1);
    expect(enemyUnit(match, near)!.hp).toBe(full - damage);
    run(match, 1);
    expect(enemyUnit(match, near)!.hp).toBe(full - 2 * damage);
    // 300 health at 15 a shot is 20 shots; the 21st goes to the next nearest.
    run(match, 19 * reloadTicks);
    expect(enemyUnit(match, near)).toBeUndefined();
    expect(enemyUnit(match, far)!.hp).toBe(full - damage);
    expect(enemyUnit(match, outOfRange)!.hp).toBe(full);
  });

  it("ignores enemy Buildings", () => {
    const match = createMatch(openMap(40, 40), 1);
    // In range of Player 1's Refinery at (33, 38), out of range of its Units.
    addTestBuilding(match, 0, "turret", { x: 28, y: 38 });
    run(match, 3);
    expect(getPlayerView(match, 0).shots).toEqual([]);
    const refinery = getPlayerView(match, 1).buildings.find((b) => b.kind === "refinery")!;
    expect(refinery.hp).toBe(BUILDING_STATS.refinery.maxHp);
  });
});
