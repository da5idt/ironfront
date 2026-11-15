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
  return { id, kind: "rifleman", owner: 0, x, y, prevX: x, prevY: y, hp: 50, maxHp: 50, cargo: 0 };
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
