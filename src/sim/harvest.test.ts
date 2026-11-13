import { describe, expect, it } from "vitest";
import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  createMatch,
  ECONOMY,
  getPlayerView,
  issueCommand,
  TICKS_PER_SECOND,
  type Match,
  type UnitView,
} from "./index";
import { testMap } from "./testing/maps";
import { addTestUnit } from "./testing/setup";

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

const harvester = (match: Match, player: 0 | 1 = 0): UnitView =>
  getPlayerView(match, player).units.find((u) => u.owner === player && u.kind === "harvester")!;

/** 20x20 open Map with one Ore Cell at (5,7), a few Cells below Player 0's Refinery (4,0 3x2). */
const ONE_ORE = testMap(Array.from({ length: 20 }, (_, y) => (y === 7 ? ".....*" + ".".repeat(14) : ".".repeat(20))));
const LOAD_CREDITS = ECONOMY.harvesterCapacity * ECONOMY.creditsPerOre;

describe("harvesting Ore", () => {
  it("a Harvester left alone fills up and unloads at its Refinery, raising Credits by one load", () => {
    const match = createMatch(ONE_ORE, 1);
    let ticks = 0;
    while (getPlayerView(match, 0).credits === ECONOMY.startingCredits && ticks < 60 * TICKS_PER_SECOND) {
      advanceTick(match);
      ticks++;
    }
    const view = getPlayerView(match, 0);
    expect(view.credits).toBe(ECONOMY.startingCredits + LOAD_CREDITS);
    expect(harvester(match).cargo).toBe(0);
    // Unloading happens beside the Refinery (4,0 3x2), so the Harvester is in the row below it or at its sides.
    const h = harvester(match);
    expect(Math.floor(h.x)).toBeGreaterThanOrEqual(3);
    expect(Math.floor(h.x)).toBeLessThanOrEqual(7);
    expect(Math.floor(h.y)).toBeLessThanOrEqual(2);
    expect(view.map.ore[7 * 20 + 5]).toBeLessThanOrEqual(ECONOMY.orePerCell - ECONOMY.harvesterCapacity);
  });

  it("keeps going round the loop, so Credits keep rising until the Ore is gone", () => {
    const match = createMatch(ONE_ORE, 1);
    run(match, 180 * TICKS_PER_SECOND);
    const both = getPlayerView(match, 0).credits + getPlayerView(match, 1).credits;
    expect(getPlayerView(match, 0).map.ore[7 * 20 + 5]).toBe(0);
    // Every bit of Ore dug ends up as Credits for one Player or the other.
    expect(both).toBe(2 * ECONOMY.startingCredits + ECONOMY.orePerCell * ECONOMY.creditsPerOre);
  });

  it("abandons an emptied Ore Field for the next nearest one", () => {
    // A rock wall keeps Player 1's Harvester out of the way.
    const rows = Array.from({ length: 20 }, (_, y) =>
      y === 6 ? ".....*......*......." : y === 10 ? "#".repeat(20) : ".".repeat(20),
    );
    const match = createMatch(testMap(rows), 1);
    const near = 6 * 20 + 5;
    const far = 6 * 20 + 12;
    const ore = () => getPlayerView(match, 0).map.ore;
    let ticks = 0;
    while (ore()[near]! > 0 && ticks < 300 * TICKS_PER_SECOND) {
      // Untouched: Unexplored (shown as 0) until the Harvester comes near, then full.
      expect([0, ECONOMY.orePerCell]).toContain(ore()[far]);
      advanceTick(match);
      ticks++;
    }
    expect(ore()[near]).toBe(0);
    run(match, 60 * TICKS_PER_SECOND);
    expect(ore()[far]).toBeLessThan(ECONOMY.orePerCell);
    expect(getPlayerView(match, 0).credits).toBeGreaterThanOrEqual(ECONOMY.startingCredits + ECONOMY.orePerCell);
    expect(getPlayerView(match, 1).credits).toBe(ECONOMY.startingCredits);
  });
});

describe("harvesting under Fog of War", () => {
  it("a Harvester left alone looks for Ore only where its Player has explored", () => {
    // The only Ore is far up the top row, Unexplored by Player 0; a rock wall keeps Player 1 away.
    const rows = Array.from({ length: 20 }, (_, y) =>
      y === 1 ? ".".repeat(30) + "*" + ".".repeat(9) : y === 10 ? "#".repeat(40) : ".".repeat(40),
    );
    const match = createMatch(testMap(rows), 1);
    const start = harvester(match);
    run(match, 10 * TICKS_PER_SECOND);
    expect(harvester(match)).toMatchObject({ x: start.x, y: start.y });
    // Once a scout has seen the Ore, the Harvester goes and digs it.
    addTestUnit(match, 0, "rifleman", { x: 28, y: 3 });
    run(match, 30 * TICKS_PER_SECOND);
    expect(harvester(match).cargo).toBeGreaterThan(0);
  });
});

describe("harvesting on Riverford", () => {
  it("both starting Harvesters earn Credits within the first two minutes", () => {
    const match = createMatch(RIVERFORD, 1);
    run(match, 120 * TICKS_PER_SECOND);
    for (const player of [0, 1] as const) {
      expect(getPlayerView(match, player).credits).toBeGreaterThan(ECONOMY.startingCredits);
    }
  });
});

describe("the harvest Command", () => {
  // Near Ore at (5,6), far Ore at (15,6); a rock wall keeps Player 1's Harvester out of the way.
  const TWO_FIELDS = testMap(
    Array.from({ length: 20 }, (_, y) =>
      y === 6 ? ".....*.........*...." : y === 10 ? "#".repeat(20) : ".".repeat(20),
    ),
  );
  const NEAR = 6 * 20 + 5;
  const FAR = 6 * 20 + 15;
  const riflemen = (match: Match) =>
    getPlayerView(match, 0).units.filter((u) => u.owner === 0 && u.kind === "rifleman");

  it("sends a Harvester to dig at the chosen Ore Cell instead of the nearest", () => {
    const match = createMatch(TWO_FIELDS, 1);
    const h = harvester(match);
    expect(issueCommand(match, 0, { type: "harvest", unitIds: [h.id], target: { x: 15, y: 6 } })).toEqual({ ok: true });
    run(match, 30 * TICKS_PER_SECOND);
    const { ore } = getPlayerView(match, 0).map;
    expect(ore[FAR]).toBeLessThan(ECONOMY.orePerCell);
    expect(ore[NEAR]).toBe(ECONOMY.orePerCell);
  });

  it("ignores other Units in the Command, which carry on as they were", () => {
    const match = createMatch(TWO_FIELDS, 1);
    const h = harvester(match);
    const r = riflemen(match)[0]!;
    expect(issueCommand(match, 0, { type: "harvest", unitIds: [h.id, r.id], target: { x: 15, y: 6 } }).ok).toBe(true);
    run(match, 40);
    const after = getPlayerView(match, 0).units.find((u) => u.id === r.id)!;
    expect({ x: after.x, y: after.y }).toEqual({ x: r.x, y: r.y });
  });

  it("rejects targets without Ore and Commands with no own Harvester, changing nothing", () => {
    const match = createMatch(TWO_FIELDS, 1);
    const mine = harvester(match);
    const enemy = harvester(match, 1);
    const before = JSON.stringify(getPlayerView(match, 0));
    const harvest = (unitIds: number[], x: number, y: number) =>
      issueCommand(match, 0, { type: "harvest", unitIds, target: { x, y } }).ok;
    expect(harvest([mine.id], 6, 6)).toBe(false);
    expect(harvest([mine.id], 20, 6)).toBe(false);
    expect(harvest([mine.id], -1, 6)).toBe(false);
    expect(harvest([enemy.id], 15, 6)).toBe(false);
    expect(harvest(riflemen(match).map((u) => u.id), 15, 6)).toBe(false);
    expect(harvest([999], 15, 6)).toBe(false);
    expect(JSON.stringify(getPlayerView(match, 0))).toBe(before);
  });

  it("a Harvester given a move Command stops harvesting until told to harvest again", () => {
    const match = createMatch(TWO_FIELDS, 1);
    const h = harvester(match);
    run(match, 5 * TICKS_PER_SECOND);
    issueCommand(match, 0, { type: "move", unitIds: [h.id], target: { x: 10, y: 2 } });
    const ore = () => getPlayerView(match, 0).map.ore;
    const left = ore()[NEAR];
    run(match, 60 * TICKS_PER_SECOND);
    expect(ore()[NEAR]).toBe(left);
    const parked = harvester(match);
    expect({ x: parked.x, y: parked.y }).toEqual({ x: 10.5, y: 2.5 });

    issueCommand(match, 0, { type: "harvest", unitIds: [h.id], target: { x: 5, y: 6 } });
    run(match, 30 * TICKS_PER_SECOND);
    expect(ore()[NEAR]).toBeLessThan(left!);
  });
});
