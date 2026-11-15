import { describe, expect, it } from "vitest";
import { attackMoveClick, canArmAttackMove } from "./attackMoveMode";

const MAP = { width: 64, height: 48 };
const selected = new Set([4, 7]);

describe("arming an Attack-move with A", () => {
  it("needs Units selected", () => {
    expect(canArmAttackMove(selected, false)).toBe(true);
    expect(canArmAttackMove(new Set(), false)).toBe(false);
  });

  it("does nothing while a Building is being placed", () => {
    expect(canArmAttackMove(selected, true)).toBe(false);
  });
});

describe("a click while an Attack-move is armed", () => {
  it("left on a Cell issues the Command for the selected Units", () => {
    expect(attackMoveClick(selected, { x: 10, y: 20 }, MAP, "left")).toEqual({
      type: "issue",
      command: { type: "attackMove", unitIds: [4, 7], target: { x: 10, y: 20 } },
    });
  });

  it("right cancels, wherever it lands", () => {
    expect(attackMoveClick(selected, { x: 10, y: 20 }, MAP, "right")).toEqual({ type: "cancel" });
    expect(attackMoveClick(selected, null, MAP, "right")).toEqual({ type: "cancel" });
  });

  it("left off the Map, or on neither the Map view nor the minimap, leaves it armed", () => {
    expect(attackMoveClick(selected, null, MAP, "left")).toEqual({ type: "stay" });
    expect(attackMoveClick(selected, { x: 64, y: 3 }, MAP, "left")).toEqual({ type: "stay" });
    expect(attackMoveClick(selected, { x: 3, y: -1 }, MAP, "left")).toEqual({ type: "stay" });
  });

  it("cancels when the selected Units have all gone", () => {
    expect(attackMoveClick(new Set(), { x: 10, y: 20 }, MAP, "left")).toEqual({ type: "cancel" });
  });
});
