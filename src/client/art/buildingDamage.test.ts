import { describe, expect, it } from "vitest";
import { advanceTick, BUILDING_STATS, type BuildingKind, createMatch, getPlayerView, issueCommand, type Match } from "../../sim";
import { openMap } from "../../sim/testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp } from "../../sim/testing/setup";
import { DAMAGED_BELOW, isBurning } from "./buildingArt";

const ROW = 8;

/** A Building of the Player's own on an open Map at the given health, and its id. */
function stage(kind: BuildingKind, health: number): { match: Match; id: number } {
  const match = createMatch(openMap(50, 40), 1);
  addTestBuilding(match, 0, kind, { x: 20, y: ROW });
  const id = getPlayerView(match, 0).buildings.find((b) => b.x === 20 && b.y === ROW)!.id;
  setTestBuildingHp(match, id, health);
  return { match, id };
}

const seen = (match: Match, id: number) => getPlayerView(match, 0).buildings.find((b) => b.id === id)!;

describe("a Building's fire and smoke", () => {
  it("show below half health and not at half or above", () => {
    expect(DAMAGED_BELOW).toBe(0.5);
    expect(isBurning({ hp: 299, maxHp: 600 })).toBe(true);
    expect(isBurning({ hp: 300, maxHp: 600 })).toBe(false);
    expect(isBurning({ hp: 600, maxHp: 600 })).toBe(false);
    expect(isBurning({ hp: 1, maxHp: 600 })).toBe(true);
  });

  it.each(Object.keys(BUILDING_STATS) as BuildingKind[])(
    "stop on the Tick a Mechanic's repair brings a %s back to half health, and stay off to full",
    (kind) => {
      const max = BUILDING_STATS[kind].maxHp;
      const { match, id } = stage(kind, max / 2 - 30);
      const mechanic = addTestUnit(match, 0, "mechanic", { x: 19, y: ROW });
      expect(isBurning(seen(match, id))).toBe(true);
      issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: id });
      let burningTicks = 0;
      let stoppedAt: number | null = null;
      for (let t = 0; t < 4000 && seen(match, id).hp < max; t++) {
        advanceTick(match);
        const b = seen(match, id);
        if (isBurning(b)) {
          // Once out, the smoke never comes back while the repair goes on.
          expect(stoppedAt).toBeNull();
          burningTicks++;
        } else if (stoppedAt === null) stoppedAt = b.hp;
      }
      // 30 health at 15 a second is two seconds of work, and the smoke is gone before the last of it lands.
      expect(burningTicks).toBeGreaterThan(20);
      expect(burningTicks).toBeLessThan(40);
      expect(stoppedAt).toBe(max / 2);
      expect(seen(match, id).hp).toBe(max);
      expect(isBurning(seen(match, id))).toBe(false);
    },
  );

  it("stay on a Building nobody repairs", () => {
    const { match, id } = stage("barracks", 200);
    for (let t = 0; t < 200; t++) advanceTick(match);
    expect(isBurning(seen(match, id))).toBe(true);
  });
});
