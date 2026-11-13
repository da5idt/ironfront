import { describe, expect, it } from "vitest";
import {
  advanceTick,
  BUILDING_STATS,
  createMatch,
  ECONOMY,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
  TICKS_PER_SECOND,
  UNIT_STATS,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding, removeTestBuilding, setTestOre } from "./testing/setup";

const ownUnits = (match: Match, player: PlayerId) =>
  getPlayerView(match, player).units.filter((u) => u.owner === player);

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

const visibilityAt = (match: Match, player: PlayerId, x: number, y: number) => {
  const { map } = getPlayerView(match, player);
  return map.visibility[y * map.width + x];
};

describe("Fog of War", () => {
  it("starts Unexplored except around each Player's starting position", () => {
    const match = createMatch(openMap(40, 40), 1);
    expect(visibilityAt(match, 0, 1, 1)).toBe("visible");
    expect(visibilityAt(match, 0, 30, 30)).toBe("unexplored");
    expect(visibilityAt(match, 1, 38, 38)).toBe("visible");
    expect(visibilityAt(match, 1, 1, 1)).toBe("unexplored");
  });

  it("measures a Building's sight from the edge of its footprint", () => {
    const [, p1] = openMap(40, 40).starts;
    const map = testMap(Array.from({ length: 40 }, () => ".".repeat(40)), [
      { hq: { x: 10, y: 10 }, refinery: { x: 20, y: 0 }, harvester: { x: 26, y: 0 }, riflemen: [{ x: 26, y: 1 }] },
      p1,
    ]);
    const match = createMatch(map, 1);
    // HQ covers Cells 10..12, so its edge is at 13 and its sight reaches 6 Cells past it.
    expect(BUILDING_STATS.hq.sight).toBe(6);
    expect(visibilityAt(match, 0, 18, 11)).toBe("visible");
    expect(visibilityAt(match, 0, 19, 11)).toBe("unexplored");
    expect(visibilityAt(match, 0, 16, 16)).toBe("visible");
    expect(visibilityAt(match, 0, 17, 17)).toBe("unexplored");
  });

  it("shows what a Unit can see now and leaves Fogged Cells where it has been", () => {
    const match = createMatch(openMap(40, 40), 1);
    const scout = ownUnits(match, 0).find((u) => u.kind === "rifleman")!;
    expect(visibilityAt(match, 0, 0, 20)).toBe("unexplored");
    issueCommand(match, 0, { type: "move", unitIds: [scout.id], target: { x: 0, y: 30 } });
    run(match, 30 * TICKS_PER_SECOND);
    expect(visibilityAt(match, 0, 0, 20)).toBe("fogged");
    // The Rifleman stands at (0.5, 30.5) with a sight of 5 Cells.
    expect(UNIT_STATS.rifleman.sight).toBe(5);
    expect(visibilityAt(match, 0, 0, 35)).toBe("visible");
    expect(visibilityAt(match, 0, 0, 36)).toBe("unexplored");
    expect(visibilityAt(match, 0, 0, 25)).toBe("visible");
    expect(visibilityAt(match, 0, 0, 24)).toBe("fogged");
  });

  it("shows enemy Units only while they stand in a Visible Cell", () => {
    const match = createMatch(openMap(40, 40), 1);
    const enemies = () => getPlayerView(match, 0).units.filter((u) => u.owner === 1);
    expect(enemies()).toEqual([]);
    const intruder = ownUnits(match, 1).find((u) => u.kind === "rifleman")!;
    issueCommand(match, 1, { type: "move", unitIds: [intruder.id], target: { x: 5, y: 6 } });
    run(match, 40 * TICKS_PER_SECOND);
    expect(enemies().map((u) => u.id)).toEqual([intruder.id]);
    issueCommand(match, 1, { type: "move", unitIds: [intruder.id], target: { x: 30, y: 30 } });
    run(match, 40 * TICKS_PER_SECOND);
    expect(enemies()).toEqual([]);
    expect(visibilityAt(match, 0, 5, 6)).toBe("visible");
  });

  it("always shows a Player's own Units and Buildings", () => {
    const match = createMatch(openMap(40, 40), 1);
    const scout = ownUnits(match, 0).find((u) => u.kind === "rifleman")!;
    issueCommand(match, 0, { type: "move", unitIds: [scout.id], target: { x: 39, y: 0 } });
    run(match, 40 * TICKS_PER_SECOND);
    const view = getPlayerView(match, 0);
    expect(view.units.filter((u) => u.owner === 0)).toHaveLength(3);
    expect(view.buildings.filter((b) => b.owner === 0)).toHaveLength(2);
  });
});

describe("Ore under Fog of War", () => {
  it("shows no Ore in Unexplored Cells and the last-seen amount in Fogged Cells", () => {
    const rows = Array.from({ length: 40 }, (_, y) => (y === 4 ? ".".repeat(20) + "*" + ".".repeat(19) : ".".repeat(40)));
    const match = createMatch(testMap(rows), 1);
    const oreAt = () => getPlayerView(match, 0).map.ore[4 * 40 + 20];
    const scout = ownUnits(match, 0).find((u) => u.kind === "rifleman")!;
    // Park both Harvesters so only setTestOre changes the Ore.
    for (const p of [0, 1] as const) {
      const harvesters = ownUnits(match, p).filter((u) => u.kind === "harvester").map((u) => u.id);
      issueCommand(match, p, { type: "stop", unitIds: harvesters });
    }
    const walkTo = (target: { x: number; y: number }) => {
      issueCommand(match, 0, { type: "move", unitIds: [scout.id], target });
      run(match, 20 * TICKS_PER_SECOND);
    };
    expect(oreAt()).toBe(0);
    walkTo({ x: 17, y: 4 });
    expect(oreAt()).toBe(ECONOMY.orePerCell);
    walkTo({ x: 0, y: 6 });
    setTestOre(match, { x: 20, y: 4 }, 100);
    advanceTick(match);
    expect(oreAt()).toBe(ECONOMY.orePerCell);
    walkTo({ x: 17, y: 4 });
    expect(oreAt()).toBe(100);
  });
});

describe("enemy Buildings under Fog of War", () => {
  /** A Map with an enemy Turret out of sight of Player 0's base, and Player 0's first Rifleman to scout it. */
  function setup() {
    const match = createMatch(openMap(40, 40), 1);
    addTestBuilding(match, 1, "turret", { x: 20, y: 2 });
    // A Tick so the Fog of War catches up with the Turret added mid-Match.
    advanceTick(match);
    const turret = getPlayerView(match, 1).buildings.find((b) => b.kind === "turret")!;
    const scout = ownUnits(match, 0).find((u) => u.kind === "rifleman")!;
    const walkTo = (target: { x: number; y: number }) => {
      issueCommand(match, 0, { type: "move", unitIds: [scout.id], target });
      run(match, 20 * TICKS_PER_SECOND);
    };
    const seen = () => getPlayerView(match, 0).buildings.filter((b) => b.owner === 1);
    return { match, turret, walkTo, seen };
  }

  it("hides enemy Buildings in Unexplored Cells", () => {
    const { seen } = setup();
    expect(seen()).toEqual([]);
  });

  it("shows an enemy Building while it is seen, and remembers it once its Cells are Fogged", () => {
    const { turret, walkTo, seen } = setup();
    walkTo({ x: 17, y: 4 });
    expect(seen()).toEqual([{ ...turret, remembered: false }]);
    walkTo({ x: 0, y: 6 });
    expect(seen()).toEqual([{ ...turret, remembered: true }]);
  });

  it("keeps showing a Building destroyed out of sight until its Cells are seen again", () => {
    const { match, turret, walkTo, seen } = setup();
    walkTo({ x: 17, y: 4 });
    walkTo({ x: 0, y: 6 });
    removeTestBuilding(match, turret.id);
    advanceTick(match);
    expect(seen()).toEqual([{ ...turret, remembered: true }]);
    walkTo({ x: 17, y: 4 });
    expect(seen()).toEqual([]);
    walkTo({ x: 0, y: 6 });
    expect(seen()).toEqual([]);
  });
});
