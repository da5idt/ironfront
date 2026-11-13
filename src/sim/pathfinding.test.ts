import { describe, expect, it } from "vitest";
import { findPath, nearbyCells, nearestReachable, type Grid } from "./pathfinding";

/** A Grid from rows: `#` blocked, `,` costs 2 to enter, anything else costs 1. */
function grid(rows: readonly string[]): Grid {
  return {
    width: rows[0]!.length,
    height: rows.length,
    walkable: (x, y) => rows[y]?.[x] !== undefined && rows[y]![x] !== "#",
    cost: (x, y) => (rows[y]![x] === "," ? 2 : 1),
  };
}

describe("findPath", () => {
  it("goes straight along an open row, ending on the goal and leaving out the start", () => {
    expect(findPath(grid(["....."]), { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("moves diagonally on open ground", () => {
    const path = findPath(grid(["....", "....", "....", "...."]), { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it("returns an empty path when already at the goal", () => {
    expect(findPath(grid(["..."]), { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  it("goes around a wall", () => {
    const g = grid([
      ".....", //
      "..#..",
      "..#..",
      "..#..",
      ".....",
    ]);
    const path = findPath(g, { x: 0, y: 2 }, { x: 4, y: 2 })!;
    expect(path.at(-1)).toEqual({ x: 4, y: 2 });
    for (const c of path) expect(g.walkable(c.x, c.y)).toBe(true);
    // Around the end of the wall: 2 to reach row 0 or 4, 2 across, 2 back = 6 steps.
    expect(path).toHaveLength(6);
  });

  it("never cuts a corner past a blocked Cell", () => {
    const g = grid([
      ".#", //
      "..",
    ]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it("does not squeeze diagonally between two blocked Cells", () => {
    const g = grid([
      ".#.", //
      "#..",
      "...",
    ]);
    // (0,0) is sealed in: both neighbours on the way to (1,1) are blocked.
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([]);
  });

  it("prefers a longer route over open ground to a short one through costly Cells", () => {
    const g = grid([
      ".....", //
      ".,,,.",
      ".....",
    ]);
    const path = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    for (const c of path) expect(g.cost(c.x, c.y)).toBe(1);
  });

  it("gets as close as it can when the goal is unreachable", () => {
    const g = grid([
      "...#.", //
      "...#.",
      "...#.",
    ]);
    const path = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(path.at(-1)).toEqual({ x: 2, y: 1 });
  });

  it("returns the same path every time", () => {
    const g = grid(["......", "..##..", "......", "......"]);
    const a = findPath(g, { x: 0, y: 0 }, { x: 5, y: 3 });
    const b = findPath(g, { x: 0, y: 0 }, { x: 5, y: 3 });
    expect(a).toEqual(b);
  });
});

describe("nearbyCells", () => {
  it("returns the target first, then the nearest walkable Cells, all distinct", () => {
    const cells = nearbyCells(grid([".....", ".....", "....."]), { x: 2, y: 1 }, 5);
    expect(cells[0]).toEqual({ x: 2, y: 1 });
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(5);
    // The four straight neighbours come before any diagonal.
    expect(cells.slice(1).sort((a, b) => a.y - b.y || a.x - b.x)).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it("skips blocked Cells, including a blocked target", () => {
    const cells = nearbyCells(grid(["...", ".#.", "..."]), { x: 1, y: 1 }, 3);
    expect(cells).toHaveLength(3);
    for (const c of cells) expect(c).not.toEqual({ x: 1, y: 1 });
  });

  it("returns fewer Cells when the Map runs out of room", () => {
    expect(nearbyCells(grid([".#", "##"]), { x: 1, y: 1 }, 4)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe("nearestReachable", () => {
  const isStar = (rows: readonly string[]) => (x: number, y: number) => rows[y]![x] === "*";

  it("finds the matching Cell fewest steps away, counting the start itself", () => {
    const rows = ["*.....", "......", "....*."];
    expect(nearestReachable(grid(rows), { x: 3, y: 2 }, isStar(rows))).toEqual({ x: 4, y: 2 });
    expect(nearestReachable(grid(rows), { x: 1, y: 1 }, isStar(rows))).toEqual({ x: 0, y: 0 });
    expect(nearestReachable(grid(rows), { x: 4, y: 2 }, isStar(rows))).toEqual({ x: 4, y: 2 });
  });

  it("measures by walking, so a Cell behind a wall loses to a farther open one", () => {
    const rows = ["..#*", "..##", "....", "....", "...*"];
    expect(nearestReachable(grid(rows), { x: 1, y: 0 }, isStar(rows))).toEqual({ x: 3, y: 4 });
  });

  it("returns null when no matching Cell can be reached", () => {
    const rows = ["..#*", "..##"];
    expect(nearestReachable(grid(rows), { x: 0, y: 0 }, isStar(rows))).toBeNull();
  });
});
