import { describe, expect, it } from "vitest";
import { advanceTick, createMatch, getMatchStatus, getPlayerView, issueCommand, type Match, type PlayerId } from "./index";
import { openMap } from "./testing/maps";
import { addTestUnit, removeTestBuilding, setTestBuildingHp } from "./testing/setup";

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

const buildingOf = (match: Match, owner: PlayerId, kind: string) =>
  getPlayerView(match, owner).buildings.find((b) => b.owner === owner && b.kind === kind)!;

describe("Victory", () => {
  it("goes to a Player at the end of the Tick the other loses its last Building, and then the Match stands still", () => {
    // openMap(20, 20): Player 1's HQ covers (17..19, 17..19), its Refinery (13..15, 18..19).
    const match = createMatch(openMap(20, 20), 1);
    const hq = buildingOf(match, 1, "hq");
    const refinery = buildingOf(match, 1, "refinery");
    setTestBuildingHp(match, hq.id, 5);
    setTestBuildingHp(match, refinery.id, 5);
    const raider = addTestUnit(match, 0, "raider", { x: 16, y: 15 });
    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: hq.id });
    run(match, 1);
    expect(getPlayerView(match, 0).buildings.some((b) => b.id === hq.id)).toBe(false);
    expect(getMatchStatus(match)).toEqual({ state: "running" });

    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: refinery.id });
    // The Raider fired on Tick 0 and reloads for 12 Ticks: its next shot is on Tick 12.
    run(match, 11);
    expect(getMatchStatus(match)).toEqual({ state: "running" });
    run(match, 1);
    expect(getMatchStatus(match)).toEqual({ state: "victory", winner: 0 });

    const before = getPlayerView(match, 0);
    run(match, 5);
    expect(getPlayerView(match, 0)).toEqual(before);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [raider] }).ok).toBe(false);
  });

  describe("when both Players lose their last Building in the same Tick", () => {
    /** Each side's HQ is its only Building, one shot from destruction, with an enemy Rifleman beside it. */
    function mutualDestruction(): Match {
      const match = createMatch(openMap(20, 20), 1);
      const hqs = [buildingOf(match, 0, "hq"), buildingOf(match, 1, "hq")];
      for (const owner of [0, 1] as const) {
        removeTestBuilding(match, buildingOf(match, owner, "refinery").id);
        setTestBuildingHp(match, hqs[owner]!.id, 5);
      }
      const p0 = addTestUnit(match, 0, "rifleman", { x: 16, y: 18 });
      const p1 = addTestUnit(match, 1, "rifleman", { x: 3, y: 1 });
      issueCommand(match, 0, { type: "attack", unitIds: [p0], targetId: hqs[1]!.id });
      issueCommand(match, 1, { type: "attack", unitIds: [p1], targetId: hqs[0]!.id });
      return match;
    }

    it("goes to the Player with more Units left", () => {
      const match = mutualDestruction();
      addTestUnit(match, 1, "harvester", { x: 10, y: 10 });
      run(match, 1);
      expect(getMatchStatus(match)).toEqual({ state: "victory", winner: 1 });
    });

    it("goes to Player 0 when they have as many Units, as a Match always names a winner", () => {
      const match = mutualDestruction();
      run(match, 1);
      expect(getMatchStatus(match)).toEqual({ state: "victory", winner: 0 });
    });
  });
});
