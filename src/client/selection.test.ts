import { describe, expect, it } from "vitest";
import type { UnitView } from "../sim";
import { boxSelect, clickSelect, isDrag, pruneSelection, unitAt, unitsInBox } from "./selection";

function u(id: number, owner: 0 | 1, x: number, y: number): UnitView {
  return { id, kind: "rifleman", owner, x, y, prevX: x, prevY: y, hp: 50, maxHp: 50 };
}

const units = [u(1, 0, 2.5, 2.5), u(2, 0, 3.5, 2.5), u(3, 1, 5.5, 5.5), u(4, 0, 8.5, 8.5)];

describe("unitAt", () => {
  it("finds the own Unit under the point", () => {
    expect(unitAt(units, { x: 2.7, y: 2.3 }, 0)?.id).toBe(1);
  });

  it("picks the nearest when two are close", () => {
    expect(unitAt(units, { x: 3.1, y: 2.5 }, 0)?.id).toBe(2);
  });

  it("finds nothing on empty ground", () => {
    expect(unitAt(units, { x: 6.5, y: 1.5 }, 0)).toBeNull();
  });

  it("ignores enemy Units", () => {
    expect(unitAt(units, { x: 5.5, y: 5.5 }, 0)).toBeNull();
  });
});

describe("unitsInBox", () => {
  it("returns own Units inside the box, whichever corner the drag started from", () => {
    expect(unitsInBox(units, { x: 9, y: 9 }, { x: 2, y: 2 }, 0).sort()).toEqual([1, 2, 4]);
    expect(unitsInBox(units, { x: 3, y: 0 }, { x: 4, y: 3 }, 0)).toEqual([2]);
  });

  it("leaves out enemy Units", () => {
    expect(unitsInBox(units, { x: 5, y: 5 }, { x: 6, y: 6 }, 0)).toEqual([]);
  });
});

describe("clickSelect", () => {
  it("replaces the selection with the clicked Unit", () => {
    expect([...clickSelect(new Set([1, 2]), 4, false)]).toEqual([4]);
  });

  it("clears the selection on a click on empty ground", () => {
    expect(clickSelect(new Set([1, 2]), null, false).size).toBe(0);
  });

  it("toggles the clicked Unit with shift", () => {
    expect([...clickSelect(new Set([1]), 2, true)].sort()).toEqual([1, 2]);
    expect([...clickSelect(new Set([1, 2]), 2, true)]).toEqual([1]);
  });

  it("keeps the selection on a shift-click on empty ground", () => {
    expect([...clickSelect(new Set([1]), null, true)]).toEqual([1]);
  });
});

describe("boxSelect", () => {
  it("replaces the selection, or adds to it with shift", () => {
    expect([...boxSelect(new Set([1]), [2, 4], false)].sort()).toEqual([2, 4]);
    expect([...boxSelect(new Set([1]), [2, 4], true)].sort()).toEqual([1, 2, 4]);
  });
});

describe("pruneSelection", () => {
  it("drops Units that are gone", () => {
    expect([...pruneSelection(new Set([1, 9]), units)]).toEqual([1]);
  });

  it("returns the same set when nothing changed, so callers can skip work", () => {
    const sel = new Set([1, 2]);
    expect(pruneSelection(sel, units)).toBe(sel);
  });
});

describe("isDrag", () => {
  it("treats small mouse wobbles as a click", () => {
    expect(isDrag({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(false);
    expect(isDrag({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(true);
  });
});
