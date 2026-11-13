import { describe, expect, it } from "vitest";
import {
  advanceTick,
  createMatch,
  getPlayerView,
  issueCommand,
  type Match,
  TICKS_PER_SECOND,
  UNIT_STATS,
  type UnitView,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestUnit, removeTestBuilding } from "./testing/setup";

// Reads each Unit from its owner's view: a Player always sees its own Units,
// while Fog of War may hide an enemy target from the attacker.
const find = (match: Match, id: number): UnitView | undefined =>
  getPlayerView(match, 0).units.find((u) => u.id === id && u.owner === 0) ??
  getPlayerView(match, 1).units.find((u) => u.id === id && u.owner === 1);

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

/**
 * An unarmed Player 0 Harvester beside a far target, so Player 0 can see (and
 * so attack) it without anyone else firing. With no Ore on the Map it stays put.
 */
const spotter = (match: Match, cell: { x: number; y: number }) => addTestUnit(match, 0, "harvester", cell);

describe("the attack Command", () => {
  it("fires on reload until the target dies, then removes it", () => {
    const match = createMatch(openMap(20, 20), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 5, y: 10 });
    const target = addTestUnit(match, 1, "rifleman", { x: 8, y: 10 });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: target })).toEqual({ ok: true });
    // Raider: 10 damage every 12 Ticks against 50 health is 5 shots, the first at once.
    run(match, 1);
    expect(find(match, target)!.hp).toBe(40);
    run(match, 47);
    expect(find(match, target)!.hp).toBe(10);
    run(match, 1);
    expect(find(match, target)).toBeUndefined();
    // With its target gone the Raider goes idle and stays put.
    const at = find(match, raider)!;
    run(match, 40);
    expect(find(match, raider)!.x).toBe(at.x);
  });

  it("chases a target out of range, then stands and fires once in range", () => {
    const match = createMatch(openMap(20, 20), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 2, y: 10 });
    const harvester = addTestUnit(match, 1, "harvester", { x: 12, y: 10 });
    spotter(match, { x: 12, y: 8 });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [rifleman], targetId: harvester })).toEqual({ ok: true });
    run(match, 20);
    expect(find(match, harvester)!.hp).toBe(UNIT_STATS.harvester.maxHp);
    run(match, 6 * TICKS_PER_SECOND);
    const r = find(match, rifleman)!;
    expect(12.5 - r.x).toBeLessThanOrEqual(UNIT_STATS.rifleman.range);
    expect(12.5 - r.x).toBeGreaterThan(UNIT_STATS.rifleman.range - 0.2);
    expect(find(match, harvester)!.hp).toBeLessThan(UNIT_STATS.harvester.maxHp);
    run(match, 20);
    expect(find(match, rifleman)!.x).toBe(r.x);
  });

  it("follows a target that walks away", () => {
    const match = createMatch(openMap(30, 20), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 2, y: 10 });
    const harvester = addTestUnit(match, 1, "harvester", { x: 8, y: 10 });
    issueCommand(match, 1, { type: "move", unitIds: [harvester], target: { x: 25, y: 10 } });
    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: harvester });
    run(match, 4 * TICKS_PER_SECOND);
    const r = find(match, raider)!;
    const h = find(match, harvester)!;
    expect(Math.hypot(h.x - r.x, h.y - r.y)).toBeLessThanOrEqual(UNIT_STATS.raider.range);
    expect(h.hp).toBeLessThan(UNIT_STATS.harvester.maxHp);
  });

  it("gives up on a target it cannot reach", () => {
    const rows = Array.from({ length: 20 }, () => ".........~~~~~~~~.............");
    const match = createMatch(testMap(rows), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 2, y: 10 });
    const harvester = addTestUnit(match, 1, "harvester", { x: 18, y: 10 });
    spotter(match, { x: 18, y: 8 });
    issueCommand(match, 0, { type: "attack", unitIds: [rifleman], targetId: harvester });
    run(match, 10 * TICKS_PER_SECOND);
    const at = find(match, rifleman)!;
    expect(at.x).toBeLessThan(9);
    run(match, 20);
    expect(find(match, rifleman)!.x).toBe(at.x);
    expect(find(match, harvester)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("rejects own, unknown and unarmed attacks, changing nothing", () => {
    const match = createMatch(openMap(20, 20), 1);
    const mine = addTestUnit(match, 0, "rifleman", { x: 2, y: 10 });
    const myHarvester = addTestUnit(match, 0, "harvester", { x: 3, y: 10 });
    const enemy = addTestUnit(match, 1, "harvester", { x: 12, y: 10 });
    const before = JSON.stringify(getPlayerView(match, 0));
    expect(issueCommand(match, 0, { type: "attack", unitIds: [mine], targetId: myHarvester }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "attack", unitIds: [mine], targetId: 999 }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "attack", unitIds: [myHarvester], targetId: enemy }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "attack", unitIds: [enemy], targetId: mine }).ok).toBe(false);
    expect(JSON.stringify(getPlayerView(match, 0))).toBe(before);
  });

  it("records each shot in the view for one Tick, so drawing can show a tracer", () => {
    const match = createMatch(openMap(20, 20), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 5, y: 10 });
    const target = addTestUnit(match, 1, "harvester", { x: 8, y: 10 });
    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: target });
    run(match, 1);
    expect(getPlayerView(match, 0).shots).toEqual([{ fromX: 5.5, fromY: 10.5, toX: 8.5, toY: 10.5, tick: 0 }]);
    run(match, 1);
    expect(getPlayerView(match, 0).shots).toEqual([]);
  });
});

describe("attacking only what the Player can see", () => {
  it("rejects an attack on an enemy Unit out of sight, changing nothing", () => {
    const match = createMatch(openMap(20, 20), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 2, y: 10 });
    const hidden = addTestUnit(match, 1, "harvester", { x: 12, y: 10 });
    const before = JSON.stringify(getPlayerView(match, 0));
    expect(issueCommand(match, 0, { type: "attack", unitIds: [rifleman], targetId: hidden }).ok).toBe(false);
    expect(JSON.stringify(getPlayerView(match, 0))).toBe(before);
  });

  it("drops a chase when the target walks out of sight", () => {
    const match = createMatch(openMap(40, 20), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 10, y: 10 });
    const raider = addTestUnit(match, 1, "raider", { x: 14, y: 10 });
    issueCommand(match, 1, { type: "move", unitIds: [raider], target: { x: 38, y: 10 } });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [rifleman], targetId: raider })).toEqual({ ok: true });
    // The Raider is far faster, so the Rifleman loses sight of it and stops.
    run(match, 4 * TICKS_PER_SECOND);
    const at = find(match, rifleman)!;
    run(match, 2 * TICKS_PER_SECOND);
    expect(find(match, rifleman)!.x).toBe(at.x);
    expect(at.x).toBeLessThan(15);
  });
});

describe("the stop Command", () => {
  it("halts a chase and the attack with it", () => {
    const match = createMatch(openMap(20, 20), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 2, y: 10 });
    const harvester = addTestUnit(match, 1, "harvester", { x: 14, y: 10 });
    spotter(match, { x: 14, y: 8 });
    issueCommand(match, 0, { type: "attack", unitIds: [rifleman], targetId: harvester });
    run(match, 20);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [rifleman] })).toEqual({ ok: true });
    const at = find(match, rifleman)!;
    run(match, 10 * TICKS_PER_SECOND);
    expect(find(match, rifleman)!.x).toBe(at.x);
    expect(find(match, harvester)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });
});

describe("idle Units", () => {
  it("return fire on an attacker in range", () => {
    const match = createMatch(openMap(20, 20), 1);
    const raider = addTestUnit(match, 1, "raider", { x: 5, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 8, y: 10 });
    issueCommand(match, 1, { type: "attack", unitIds: [raider], targetId: rifleman });
    run(match, 1);
    expect(find(match, raider)!.hp).toBe(UNIT_STATS.raider.maxHp - UNIT_STATS.rifleman.damage);
  });

  it("fire at the nearest enemy in range, the lowest id on a tie, and never chase", () => {
    const match = createMatch(openMap(20, 20), 1);
    const far = addTestUnit(match, 1, "harvester", { x: 13, y: 10 });
    const right = addTestUnit(match, 1, "harvester", { x: 12, y: 10 });
    const left = addTestUnit(match, 1, "harvester", { x: 8, y: 10 });
    addTestUnit(match, 0, "rifleman", { x: 10, y: 10 });
    run(match, 1);
    const full = UNIT_STATS.harvester.maxHp;
    expect(find(match, right)!.hp).toBe(full - UNIT_STATS.rifleman.damage);
    expect(find(match, left)!.hp).toBe(full);
    expect(find(match, far)!.hp).toBe(full);
  });

  it("ignore enemies out of range", () => {
    const match = createMatch(openMap(20, 20), 1);
    const enemy = addTestUnit(match, 1, "harvester", { x: 14, y: 10 });
    addTestUnit(match, 0, "rifleman", { x: 10, y: 10 });
    run(match, 60);
    expect(find(match, enemy)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("that kill each other in the same Tick both die, whatever their ids", () => {
    const match = createMatch(openMap(20, 20), 1);
    const a = addTestUnit(match, 0, "rifleman", { x: 8, y: 10 });
    const b = addTestUnit(match, 1, "rifleman", { x: 10, y: 10 });
    // 50 health, 6 damage: the ninth shot kills, 8 reloads after the first.
    run(match, 8 * UNIT_STATS.rifleman.reloadTicks);
    expect(find(match, a)).toBeDefined();
    expect(find(match, b)).toBeDefined();
    run(match, 1);
    expect(find(match, a)).toBeUndefined();
    expect(find(match, b)).toBeUndefined();
  });
});

describe("Units on a move Command", () => {
  it("hold fire while walking past enemies and open fire on arrival", () => {
    const match = createMatch(openMap(20, 20), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 2, y: 10 });
    const enemy = addTestUnit(match, 1, "harvester", { x: 6, y: 11 });
    issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: { x: 9, y: 10 } });
    let arrivedAt = -1;
    for (let t = 0; t < 10 * TICKS_PER_SECOND && arrivedAt < 0; t++) {
      advanceTick(match);
      const r = find(match, rifleman)!;
      if (r.x === 9.5 && r.y === 10.5) arrivedAt = t;
      else expect(find(match, enemy)!.hp).toBe(UNIT_STATS.harvester.maxHp);
    }
    expect(arrivedAt).toBeGreaterThan(0);
    expect(find(match, enemy)!.hp).toBeLessThan(UNIT_STATS.harvester.maxHp);
  });
});

describe("Rifleman and Raider", () => {
  it("differ: the Raider is faster and tougher, the Rifleman cheaper", () => {
    const rf = UNIT_STATS.rifleman;
    const rd = UNIT_STATS.raider;
    expect(rd.speed).toBeGreaterThan(rf.speed * 2);
    expect(rd.maxHp).toBeGreaterThan(rf.maxHp * 2);
    expect(rf.cost).toBeLessThan(rd.cost);
  });
});

describe("attacking a Building", () => {
  // openMap(20, 20): Player 1's Refinery covers (13..15, 18..19) and has 900 health.
  const refineryOf = (match: Match, player: 0 | 1) =>
    getPlayerView(match, 0).buildings.find((b) => b.owner === player && b.kind === "refinery");

  it("fires at the nearest edge of the footprint until the Building is destroyed and its Cells are free", () => {
    const match = createMatch(openMap(20, 20), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 10, y: 18 });
    const refinery = refineryOf(match, 1)!;
    expect(issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: refinery.id })).toEqual({ ok: true });
    run(match, 1);
    expect(refineryOf(match, 1)!.hp).toBe(890);
    expect(getPlayerView(match, 0).shots).toEqual([{ fromX: 10.5, fromY: 18.5, toX: 13, toY: 18.5, tick: 0 }]);
    // 90 shots of 10, one every 12 Ticks, the first at once.
    run(match, 89 * UNIT_STATS.raider.reloadTicks - 1);
    expect(refineryOf(match, 1)!.hp).toBe(10);
    run(match, 1);
    expect(refineryOf(match, 1)).toBeUndefined();
    expect(issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 14, y: 18 } })).toEqual({ ok: true });
    run(match, 2 * TICKS_PER_SECOND);
    expect(find(match, raider)).toMatchObject({ x: 14.5, y: 18.5 });
  });

  it("walks up to a Building out of range, then stands and fires", () => {
    const match = createMatch(openMap(20, 20), 1);
    // From (7, 18) the Raider sees the Refinery's nearest Cells but is 5.5 Cells from its edge.
    const raider = addTestUnit(match, 0, "raider", { x: 7, y: 18 });
    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: refineryOf(match, 1)!.id });
    run(match, 2 * TICKS_PER_SECOND);
    const r = find(match, raider)!;
    expect(13 - r.x).toBeLessThanOrEqual(UNIT_STATS.raider.range);
    expect(refineryOf(match, 1)!.hp).toBeLessThan(900);
    run(match, 20);
    expect(find(match, raider)!.x).toBe(r.x);
  });

  it("walks to a remembered Building and gives up when it turns out to be gone", () => {
    const match = createMatch(openMap(20, 20), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 7, y: 18 });
    const refinery = refineryOf(match, 1)!;
    issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 2, y: 10 } });
    run(match, 3 * TICKS_PER_SECOND);
    removeTestBuilding(match, refinery.id);
    run(match, 1);
    expect(refineryOf(match, 1)).toMatchObject({ id: refinery.id, remembered: true });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: refinery.id })).toEqual({ ok: true });
    run(match, 4 * TICKS_PER_SECOND);
    expect(refineryOf(match, 1)).toBeUndefined();
    const at = find(match, raider)!;
    run(match, 20);
    expect(find(match, raider)).toMatchObject({ x: at.x, y: at.y });
    expect(at.x).toBeLessThan(13 - UNIT_STATS.raider.range + 2);
  });
});

describe("idle Units and enemy Buildings", () => {
  const refineryHp = (match: Match) =>
    getPlayerView(match, 0).buildings.find((b) => b.owner === 1 && b.kind === "refinery")!.hp;

  it("fire at an enemy Building in range when no enemy Unit is", () => {
    const match = createMatch(openMap(20, 20), 1);
    addTestUnit(match, 0, "rifleman", { x: 10, y: 18 });
    run(match, 1);
    expect(refineryHp(match)).toBe(900 - UNIT_STATS.rifleman.damage);
  });

  it("fire at an enemy Unit in range before any Building", () => {
    const match = createMatch(openMap(20, 20), 1);
    addTestUnit(match, 0, "rifleman", { x: 10, y: 18 });
    const enemy = addTestUnit(match, 1, "harvester", { x: 10, y: 15 });
    run(match, 1);
    expect(find(match, enemy)!.hp).toBe(UNIT_STATS.harvester.maxHp - UNIT_STATS.rifleman.damage);
    expect(refineryHp(match)).toBe(900);
  });
});
