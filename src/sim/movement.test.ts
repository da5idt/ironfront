import { describe, expect, it } from "vitest";
import {
  advanceTick,
  createMatch,
  getPlayerView,
  issueCommand,
  TICKS_PER_SECOND,
  UNIT_STATS,
  type Match,
  type MapDef,
  type UnitView,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding } from "./testing/setup";

const unit = (match: Match, id: number): UnitView => getPlayerView(match, 0).units.find((u) => u.id === id)!;
const cellOf = (u: UnitView) => ({ x: Math.floor(u.x), y: Math.floor(u.y) });
const ownRiflemen = (match: Match, player: 0 | 1 = 0) =>
  getPlayerView(match, player).units.filter((u) => u.owner === player && u.kind === "rifleman");

function run(match: Match, ticks: number, each?: () => void): void {
  for (let t = 0; t < ticks; t++) {
    advanceTick(match);
    each?.();
  }
}

/** Starts for a Map with room for both bases along the top and bottom rows. */
function startsWithRiflemen(riflemen: { x: number; y: number }[], w: number, h: number): MapDef["starts"] {
  return [
    { hq: { x: 0, y: 0 }, refinery: { x: 3, y: 0 }, harvester: { x: 6, y: 0 }, riflemen },
    {
      hq: { x: w - 3, y: h - 3 },
      refinery: { x: w - 6, y: h - 2 },
      harvester: { x: w - 7, y: h - 1 },
      riflemen: [{ x: w - 1, y: h - 4 }],
    },
  ];
}

describe("the move Command", () => {
  it("walks a Unit to the target Cell and leaves it standing at the Cell's centre", () => {
    const match = createMatch(openMap(20, 20), 1);
    const r = ownRiflemen(match)[0]!;
    expect(issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 8, y: 9 } })).toEqual({ ok: true });
    run(match, 10 * TICKS_PER_SECOND);
    const after = unit(match, r.id);
    expect({ x: after.x, y: after.y }).toEqual({ x: 8.5, y: 9.5 });
    run(match, 20);
    expect(unit(match, r.id).x).toBe(8.5);
  });

  it("moves at the Unit's speed, one Tick at a time, so drawing can interpolate", () => {
    const match = createMatch(openMap(20, 20), 1);
    const r = ownRiflemen(match)[0]!;
    issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 0, y: 15 } });
    const perTick = UNIT_STATS.rifleman.speed / TICKS_PER_SECOND;
    run(match, 20, () => {
      const u = unit(match, r.id);
      expect(Math.hypot(u.x - u.prevX, u.y - u.prevY)).toBeCloseTo(perTick, 6);
    });
  });

  it("rejects moves for enemy Units, unknown Units and off-Map targets, changing nothing", () => {
    const match = createMatch(openMap(20, 20), 1);
    const enemy = ownRiflemen(match, 1)[0]!;
    const mine = ownRiflemen(match)[0]!;
    const before = JSON.stringify(getPlayerView(match, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [enemy.id], target: { x: 5, y: 5 } }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "move", unitIds: [999], target: { x: 5, y: 5 } }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "move", unitIds: [mine.id], target: { x: 20, y: 5 } }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "move", unitIds: [mine.id], target: { x: -1, y: 5 } }).ok).toBe(false);
    run(match, 20);
    const after = getPlayerView(match, 0);
    expect(JSON.stringify({ ...after, tick: 0 })).toBe(JSON.stringify({ ...JSON.parse(before), tick: 0 }));
  });

  it("moves only own Units when a Command mixes in enemy ones", () => {
    const match = createMatch(openMap(20, 20), 1);
    const enemy = ownRiflemen(match, 1)[0]!;
    const mine = ownRiflemen(match)[0]!;
    expect(issueCommand(match, 0, { type: "move", unitIds: [mine.id, enemy.id], target: { x: 5, y: 10 } }).ok).toBe(true);
    run(match, 40);
    expect(unit(match, enemy.id)).toMatchObject({ x: enemy.x, y: enemy.y });
    expect(unit(match, mine.id).y).toBeGreaterThan(mine.y);
  });

  it("is cancelled by stop", () => {
    const match = createMatch(openMap(20, 20), 1);
    const r = ownRiflemen(match)[0]!;
    issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 0, y: 18 } });
    run(match, 10);
    issueCommand(match, 0, { type: "stop", unitIds: [r.id] });
    const stopped = unit(match, r.id);
    run(match, 20);
    expect(unit(match, r.id)).toMatchObject({ x: stopped.x, y: stopped.y });
  });
});

describe("pathing", () => {
  // A rock ridge and a river split the Map; the only way through is the gap at the bottom.
  const rows = [
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "..........#.~.......",
    "....................",
    "....................",
    "....................",
  ];
  const map = testMap(rows, startsWithRiflemen([{ x: 2, y: 4 }], 20, 12));

  it("goes around rock and water, never standing on them", () => {
    const match = createMatch(map, 1);
    const r = ownRiflemen(match)[0]!;
    issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 15, y: 4 } });
    run(match, 30 * TICKS_PER_SECOND, () => {
      const c = cellOf(unit(match, r.id));
      expect(rows[c.y]![c.x], `Cell ${c.x},${c.y}`).toBe(".");
    });
    expect(cellOf(unit(match, r.id))).toEqual({ x: 15, y: 4 });
  });

  it("goes around Buildings, never walking through a footprint", () => {
    const match = createMatch(openMap(20, 20), 1);
    // Riflemen start at (0,4) and (1,4); a 3x3 Vehicle Factory sits between them and the target.
    addTestBuilding(match, 0, "vehicleFactory", { x: 0, y: 6 });
    const r = ownRiflemen(match)[0]!;
    issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 1, y: 11 } });
    run(match, 15 * TICKS_PER_SECOND, () => {
      const c = cellOf(unit(match, r.id));
      const inside = c.x >= 0 && c.x < 3 && c.y >= 6 && c.y < 9;
      expect(inside, `Cell ${c.x},${c.y}`).toBe(false);
    });
    expect(cellOf(unit(match, r.id))).toEqual({ x: 1, y: 11 });
  });

  it("re-plans when a Building appears on its route", () => {
    const match = createMatch(openMap(20, 20), 1);
    const r = ownRiflemen(match)[0]!;
    issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 0, y: 16 } });
    run(match, 10);
    // Wall off the straight line down column 0..2 ahead of the Unit.
    addTestBuilding(match, 1, "vehicleFactory", { x: 0, y: 9 });
    run(match, 20 * TICKS_PER_SECOND, () => {
      const c = cellOf(unit(match, r.id));
      expect(c.x < 3 && c.y >= 9 && c.y < 12, `Cell ${c.x},${c.y}`).toBe(false);
    });
    expect(cellOf(unit(match, r.id))).toEqual({ x: 0, y: 16 });
  });

  it("stops on the nearest open Cell when the target is rock", () => {
    const match = createMatch(map, 1);
    const r = ownRiflemen(match)[0]!;
    issueCommand(match, 0, { type: "move", unitIds: [r.id], target: { x: 10, y: 3 } });
    run(match, 15 * TICKS_PER_SECOND);
    expect(cellOf(unit(match, r.id))).toEqual({ x: 9, y: 3 });
  });
});

describe("rough terrain", () => {
  it("slows Units down", () => {
    // Everything is rough except the bottom row, so the slow Rifleman has no faster detour.
    const rows = [...Array.from({ length: 9 }, () => ",".repeat(20)), ".".repeat(20)];
    const match = createMatch(testMap(rows, startsWithRiflemen([{ x: 0, y: 4 }, { x: 0, y: 9 }], 20, 10)), 1);
    const [rough, open] = ownRiflemen(match);
    issueCommand(match, 0, { type: "move", unitIds: [rough!.id], target: { x: 12, y: 4 } });
    issueCommand(match, 0, { type: "move", unitIds: [open!.id], target: { x: 12, y: 9 } });
    run(match, 3 * TICKS_PER_SECOND);
    const roughGone = unit(match, rough!.id).x - rough!.x;
    const openGone = unit(match, open!.id).x - open!.x;
    expect(openGone).toBeCloseTo(3 * UNIT_STATS.rifleman.speed, 5);
    expect(roughGone).toBeLessThan(openGone * 0.75);
    expect(roughGone).toBeGreaterThan(0);
  });
});

describe("group moves", () => {
  it("end on distinct Cells close to the target", () => {
    const match = createMatch(openMap(24, 24), 1);
    const group = getPlayerView(match, 0).units.filter((u) => u.owner === 0);
    expect(group).toHaveLength(3);
    const target = { x: 12, y: 12 };
    issueCommand(match, 0, { type: "move", unitIds: group.map((u) => u.id), target });
    run(match, 20 * TICKS_PER_SECOND);
    const cells = group.map((g) => cellOf(unit(match, g.id)));
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(3);
    for (const c of cells) expect(Math.max(Math.abs(c.x - target.x), Math.abs(c.y - target.y))).toBeLessThanOrEqual(1);
    expect(cells).toContainEqual(target);
  });

  it("spreads around a target that is itself blocked", () => {
    const match = createMatch(openMap(24, 24), 1);
    const group = getPlayerView(match, 0).units.filter((u) => u.owner === 0);
    const hq = getPlayerView(match, 0).buildings.find((b) => b.kind === "hq" && b.owner === 0)!;
    issueCommand(match, 0, { type: "move", unitIds: group.map((u) => u.id), target: { x: hq.x + 1, y: hq.y + 1 } });
    run(match, 10 * TICKS_PER_SECOND);
    const cells = group.map((g) => cellOf(unit(match, g.id)));
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(3);
    for (const c of cells) expect(c.x >= hq.x && c.x < hq.x + 3 && c.y >= hq.y && c.y < hq.y + 3).toBe(false);
  });
});
