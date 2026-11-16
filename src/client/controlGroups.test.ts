import { describe, expect, it } from "vitest";
import type { UnitView } from "../sim";
import {
  type ControlGroups,
  groupCentre,
  groupNumbers,
  groupPress,
  NO_GROUPS,
  pruneGroups,
  RECENTRE_WITHIN_MS,
  saveGroup,
  selectGroup,
} from "./controlGroups";

/** A Unit as a PlayerView lists it (UnitView in src/sim/view.ts); only id and place are read here. */
function u(id: number, x: number, y: number): UnitView {
  return { id, kind: "rifleman", owner: 0, x, y, prevX: x, prevY: y, hp: 50, maxHp: 50, cargo: 0, passengers: [] };
}

const units = [u(1, 2.5, 2.5), u(2, 4.5, 2.5), u(3, 10.5, 8.5), u(4, 20.5, 20.5)];

/** What each group's key would select now, for groups 1 to 9. */
function selections(groups: ControlGroups, living: readonly UnitView[] = units): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (let n = 1; n <= 9; n++) {
    const sel = selectGroup(groups, n, living);
    if (sel) out[n] = [...sel].sort((a, b) => a - b);
  }
  return out;
}

describe("saving a Control Group", () => {
  it("keeps the selected Units under that number", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2]));
    expect(selections(groups)).toEqual({ 1: [1, 2] });
  });

  it("replaces what the number held before", () => {
    const groups = saveGroup(saveGroup(NO_GROUPS, 1, new Set([1, 2])), 1, new Set([3]));
    expect(selections(groups)).toEqual({ 1: [3] });
  });

  it("takes a Unit out of any other group, so it is in at most one", () => {
    let groups = saveGroup(NO_GROUPS, 1, new Set([1, 2]));
    groups = saveGroup(groups, 2, new Set([2, 3]));
    expect(selections(groups)).toEqual({ 1: [1], 2: [2, 3] });
    expect(groupNumbers(groups)).toEqual(
      new Map([
        [1, 1],
        [2, 2],
        [3, 2],
      ]),
    );
  });

  it("holds nine groups, 1 to 9, and no others", () => {
    let groups: ControlGroups = NO_GROUPS;
    groups = saveGroup(groups, 9, new Set([4]));
    groups = saveGroup(groups, 0, new Set([1]));
    groups = saveGroup(groups, 10, new Set([2]));
    expect(selections(groups)).toEqual({ 9: [4] });
  });

  it("with nothing selected leaves the groups as they were", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1]));
    expect(saveGroup(groups, 1, new Set())).toBe(groups);
  });
});

describe("selecting a Control Group", () => {
  it("gives the group's living Units", () => {
    const groups = saveGroup(NO_GROUPS, 3, new Set([1, 2, 99]));
    expect(selectGroup(groups, 3, units)).toEqual(new Set([1, 2]));
  });

  it("gives null for a group that was never saved, so the selection is left alone", () => {
    expect(selectGroup(NO_GROUPS, 3, units)).toBeNull();
  });

  it("gives null for a group with no living Units", () => {
    const groups = saveGroup(NO_GROUPS, 3, new Set([98, 99]));
    expect(selectGroup(groups, 3, units)).toBeNull();
  });
});

describe("Units that die", () => {
  it("drop out of their group", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2, 3]));
    const pruned = pruneGroups(groups, [u(1, 0, 0), u(3, 0, 0)]);
    expect(groupNumbers(pruned)).toEqual(
      new Map([
        [1, 1],
        [3, 1],
      ]),
    );
  });

  it("leave the same groups object when nobody died", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2]));
    expect(pruneGroups(groups, units)).toBe(groups);
  });
});

describe("Units inside an own Troop Carrier", () => {
  /** An own Troop Carrier as its owner's view lists it, with these Units inside. */
  const carrier = (id: number, inside: readonly number[]): UnitView => ({
    ...u(id, 6.5, 6.5),
    kind: "troopCarrier",
    passengers: inside.map((p) => ({ id: p, kind: "rifleman" as const })),
  });

  it("stay in their group though the view's Units no longer list them", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2, 3]));
    // 2 and 3 got in: they are off the Map and listed only as Passengers.
    const riding = [u(1, 2.5, 2.5), carrier(9, [2, 3])];
    expect(pruneGroups(groups, riding)).toBe(groups);
  });

  it("are not selected by the group's key, which takes only those who are out", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2, 3]));
    const riding = [u(1, 2.5, 2.5), carrier(9, [2, 3])];
    expect(selections(pruneGroups(groups, riding), riding)).toEqual({ 1: [1] });
    expect(groupCentre(groups, 1, riding)).toEqual({ x: 2.5, y: 2.5 });
  });

  it("leave the selection alone when the whole group is inside", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([2, 3]));
    const riding = [u(1, 2.5, 2.5), carrier(9, [2, 3])];
    const kept = pruneGroups(groups, riding);
    expect(kept).toBe(groups);
    expect(selectGroup(kept, 1, riding)).toBeNull();
  });

  it("are selected by the group's key again once they are out", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2, 3]));
    const kept = pruneGroups(groups, [u(1, 2.5, 2.5), carrier(9, [2, 3])]);
    const out = [u(1, 2.5, 2.5), carrier(9, []), u(2, 5.5, 6.5), u(3, 7.5, 6.5)];
    expect(selections(pruneGroups(kept, out), out)).toEqual({ 1: [1, 2, 3] });
  });

  it("drop out of their group when they are lost with their Troop Carrier", () => {
    const groups = saveGroup(saveGroup(NO_GROUPS, 1, new Set([1, 2, 3])), 2, new Set([9]));
    const kept = pruneGroups(groups, [u(1, 2.5, 2.5), carrier(9, [2, 3])]);
    // The Troop Carrier is destroyed with both inside: none of the three is in the view any more.
    const after = pruneGroups(kept, [u(1, 2.5, 2.5)]);
    expect(groupNumbers(after)).toEqual(new Map([[1, 1]]));
  });
});

describe("the middle of a Control Group", () => {
  it("is the average place of its living Units, in Cells", () => {
    const groups = saveGroup(NO_GROUPS, 1, new Set([1, 2, 99]));
    expect(groupCentre(groups, 1, units)).toEqual({ x: 3.5, y: 2.5 });
  });

  it("is null for a group with no living Units", () => {
    expect(groupCentre(NO_GROUPS, 1, units)).toBeNull();
  });
});

describe("pressing a group's key twice", () => {
  it("the first press does not centre the camera", () => {
    expect(groupPress(null, 1, 1000).centre).toBe(false);
  });

  it("a second press of the same key within a short time centres it", () => {
    const first = groupPress(null, 1, 1000);
    expect(groupPress(first.last, 1, 1000 + RECENTRE_WITHIN_MS).centre).toBe(true);
  });

  it("a slow second press, or another group's key, does not", () => {
    const first = groupPress(null, 1, 1000);
    expect(groupPress(first.last, 1, 1001 + RECENTRE_WITHIN_MS).centre).toBe(false);
    expect(groupPress(first.last, 2, 1100).centre).toBe(false);
  });

  it("a third quick press centres again", () => {
    const second = groupPress(groupPress(null, 1, 1000).last, 1, 1200);
    expect(groupPress(second.last, 1, 1400).centre).toBe(true);
  });
});
