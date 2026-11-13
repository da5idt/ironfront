import { describe, expect, it } from "vitest";
import {
  advanceTick,
  BUILDING_STATS,
  canPlaceBuilding,
  createMatch,
  ECONOMY,
  getPlayerView,
  issueCommand,
  type Match,
  TICKS_PER_SECOND,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, removeTestBuilding, setTestBuildingHp, setTestCredits } from "./testing/setup";

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

const BARRACKS = BUILDING_STATS.barracks;

describe("building from the HQ", () => {
  it("starting a Building spends its cost up front and shows it in production", () => {
    const match = createMatch(openMap(30, 30), 1);
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "barracks" })).toEqual({ ok: true });
    const view = getPlayerView(match, 0);
    expect(view.credits).toBe(ECONOMY.startingCredits - BARRACKS.cost);
    expect(view.production).toEqual({ kind: "barracks", progress: 0, ready: false });
  });

  it("is rejected without enough Credits, and nothing changes", () => {
    const match = createMatch(openMap(30, 30), 1);
    setTestCredits(match, 0, BARRACKS.cost - 1);
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "barracks" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(BARRACKS.cost - 1);
    expect(getPlayerView(match, 0).production).toBeNull();
  });

  it("builds one at a time: a second start is rejected while the first is in progress", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "turret" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits - BARRACKS.cost);
    expect(getPlayerView(match, 0).production?.kind).toBe("barracks");
  });

  it("is rejected for a Player with no HQ, and for the HQ itself", () => {
    const match = createMatch(openMap(30, 30), 1);
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "hq" }).ok).toBe(false);
    const hq = getPlayerView(match, 0).buildings.find((b) => b.owner === 0 && b.kind === "hq")!;
    removeTestBuilding(match, hq.id);
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "barracks" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
  });

  it("progresses each Tick and is ready to place after its build time", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BARRACKS.buildTicks / 2);
    expect(getPlayerView(match, 0).production).toEqual({ kind: "barracks", progress: 0.5, ready: false });
    run(match, BARRACKS.buildTicks / 2);
    expect(getPlayerView(match, 0).production).toEqual({ kind: "barracks", progress: 1, ready: true });
    run(match, 10);
    expect(getPlayerView(match, 0).production?.progress).toBe(1);
  });

  it("a finished Building must be placed before the next one starts", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BARRACKS.buildTicks);
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "turret" }).ok).toBe(false);
  });
});

describe("placing a Building", () => {
  function readyBarracks(): Match {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BARRACKS.buildTicks);
    return match;
  }

  it("puts a finished Building on the Map and frees the HQ, at no further cost", () => {
    const match = readyBarracks();
    const credits = getPlayerView(match, 0).credits;
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } })).toEqual({ ok: true });
    const view = getPlayerView(match, 0);
    expect(view.buildings).toContainEqual(
      expect.objectContaining({ kind: "barracks", owner: 0, x: 0, y: 6, width: 2, height: 2, hp: BARRACKS.maxHp }),
    );
    expect(view.production).toBeNull();
    expect(view.credits).toBe(credits);
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "turret" }).ok).toBe(true);
  });

  it("is rejected before the Building is finished", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BARRACKS.buildTicks - 1);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } }).ok).toBe(false);
    expect(getPlayerView(match, 0).buildings.some((b) => b.kind === "barracks")).toBe(false);
  });

  it("is rejected when nothing is being built", () => {
    const match = createMatch(openMap(30, 30), 1);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } }).ok).toBe(false);
  });

  it("is rejected on an invalid spot, and the Building stays ready to place", () => {
    const match = readyBarracks();
    // On top of the HQ, then on a Rifleman, then too far away.
    for (const at of [{ x: 1, y: 1 }, { x: 0, y: 4 }, { x: 20, y: 6 }]) {
      expect(issueCommand(match, 0, { type: "placeBuilding", at }).ok).toBe(false);
    }
    expect(getPlayerView(match, 0).production?.ready).toBe(true);
    expect(getPlayerView(match, 0).buildings.some((b) => b.kind === "barracks")).toBe(false);
  });

  it("places over an enemy Unit this Player cannot see, nudging it to the nearest free Cell", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "vehicleFactory" });
    // An outpost Barracks sees (20,20) but not (22,22); a scout explores both, then walks off.
    addTestBuilding(match, 0, "barracks", { x: 15, y: 15 });
    const scout = addTestUnit(match, 0, "rifleman", { x: 22, y: 21 });
    run(match, 1);
    issueCommand(match, 0, { type: "move", unitIds: [scout], target: { x: 8, y: 21 } });
    run(match, BUILDING_STATS.vehicleFactory.buildTicks);
    const hidden = addTestUnit(match, 1, "rifleman", { x: 22, y: 22 });
    // Stand still, so only the placement moves it.
    issueCommand(match, 1, { type: "stop", unitIds: [hidden] });
    const view = getPlayerView(match, 0);
    expect(view.map.visibility[22 * 30 + 22]).toBe("fogged");
    expect(canPlaceBuilding(view, "vehicleFactory", { x: 20, y: 20 })).toBe(true);
    // The answer is the one the Player's own view predicts, so it gives nothing away.
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 20, y: 20 } })).toEqual({ ok: true });
    const factory = getPlayerView(match, 0).buildings.find((b) => b.kind === "vehicleFactory")!;
    expect(factory).toMatchObject({ x: 20, y: 20 });
    const enemy = getPlayerView(match, 1).units.find((u) => u.id === hidden)!;
    const cell = { x: Math.floor(enemy.x), y: Math.floor(enemy.y) };
    // Nudged to a Cell just outside the footprint, not sent away, and unharmed.
    const outside = Math.max(
      factory.x - cell.x,
      cell.x - (factory.x + factory.width - 1),
      factory.y - cell.y,
      cell.y - (factory.y + factory.height - 1),
    );
    expect(outside).toBe(1);
    expect(enemy.hp).toBe(enemy.maxHp);
  });
});

describe("a new Refinery", () => {
  it("comes with a free Harvester beside it that goes to work", () => {
    // An Ore Field at (6..9, 10..11), a short walk from where the Refinery goes and big
    // enough that the starting Harvester cannot empty it during the build time.
    const rows = Array.from({ length: 30 }, (_, y) =>
      y === 10 || y === 11 ? "......****" + ".".repeat(20) : ".".repeat(30),
    );
    const match = createMatch(testMap(rows), 1);
    // Harvesters only look for Ore their Player has seen, so a Rifleman stands by the field.
    addTestUnit(match, 0, "rifleman", { x: 8, y: 13 });
    issueCommand(match, 0, { type: "startBuilding", kind: "refinery" });
    run(match, BUILDING_STATS.refinery.buildTicks);
    const before = getPlayerView(match, 0).units.filter((u) => u.kind === "harvester").map((u) => u.id);
    const credits = getPlayerView(match, 0).credits;
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } }).ok).toBe(true);

    const fresh = getPlayerView(match, 0).units.filter((u) => u.kind === "harvester" && !before.includes(u.id));
    expect(fresh).toHaveLength(1);
    const h = fresh[0]!;
    expect(h.owner).toBe(0);
    expect(getPlayerView(match, 0).credits).toBe(credits);
    // Touching the 3x2 footprint at (0,6), sides or corners.
    const cx = Math.floor(h.x);
    const cy = Math.floor(h.y);
    expect(cx >= -1 && cx <= 3 && cy >= 5 && cy <= 8).toBe(true);
    expect(!(cx >= 0 && cx <= 2 && cy >= 6 && cy <= 7)).toBe(true);

    run(match, 10 * TICKS_PER_SECOND);
    expect(getPlayerView(match, 0).units.find((u) => u.id === h.id)!.cargo).toBeGreaterThan(0);
  });

  it("puts the Harvester on a free Cell, not on a Unit", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "refinery" });
    run(match, BUILDING_STATS.refinery.buildTicks);
    // Fill the whole row above the footprint, where a top-left-first search would look first.
    for (let x = 0; x <= 3; x++) addTestUnit(match, 0, "rifleman", { x, y: 5 });
    const before = new Set(getPlayerView(match, 0).units.map((u) => u.id));
    issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } });
    const units = getPlayerView(match, 0).units;
    const h = units.find((u) => !before.has(u.id))!;
    const others = units.filter((u) => u.id !== h.id);
    expect(others.some((u) => Math.floor(u.x) === Math.floor(h.x) && Math.floor(u.y) === Math.floor(h.y))).toBe(false);
  });

  it("keeps its free Harvester waiting while every Cell nearby is taken, then sends it out on the first one freed", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "refinery" });
    run(match, BUILDING_STATS.refinery.buildTicks);
    // Pack every free Cell within three of the footprint (0..2, 6..7) with Riflemen.
    const taken = new Set(getPlayerView(match, 0).units.map((u) => `${Math.floor(u.x)},${Math.floor(u.y)}`));
    const blockers: number[] = [];
    for (let y = 3; y <= 10; y++) {
      for (let x = 0; x <= 5; x++) {
        const footprint = x <= 2 && y >= 6 && y <= 7;
        if (!footprint && !taken.has(`${x},${y}`)) blockers.push(addTestUnit(match, 0, "rifleman", { x, y }));
      }
    }
    const harvesters = () => getPlayerView(match, 0).units.filter((u) => u.kind === "harvester");
    const before = harvesters().length;
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } }).ok).toBe(true);
    run(match, 2 * TICKS_PER_SECOND);
    expect(harvesters()).toHaveLength(before);

    // Clear one Cell at the edge of the packed ground.
    const last = blockers.at(-1)!;
    issueCommand(match, 0, { type: "move", unitIds: [last], target: { x: 20, y: 20 } });
    run(match, 2 * TICKS_PER_SECOND);
    expect(harvesters()).toHaveLength(before + 1);
  });

  it("other Buildings come with nothing", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BARRACKS.buildTicks);
    const count = getPlayerView(match, 0).units.length;
    issueCommand(match, 0, { type: "placeBuilding", at: { x: 0, y: 6 } });
    expect(getPlayerView(match, 0).units).toHaveLength(count);
  });
});

describe("cancelling a Building", () => {
  it("refunds the full cost while in progress and frees the HQ", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, 30);
    expect(issueCommand(match, 0, { type: "cancelBuilding" })).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
    expect(getPlayerView(match, 0).production).toBeNull();
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "turret" }).ok).toBe(true);
  });

  it("refunds a finished Building still waiting to be placed", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BARRACKS.buildTicks);
    expect(issueCommand(match, 0, { type: "cancelBuilding" }).ok).toBe(true);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
  });

  it("is rejected when nothing is being built", () => {
    const match = createMatch(openMap(30, 30), 1);
    expect(issueCommand(match, 0, { type: "cancelBuilding" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
  });
});

describe("losing the HQ", () => {
  it("cancels what it was building and refunds the cost", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, 30);
    const hq = getPlayerView(match, 0).buildings.find((b) => b.kind === "hq")!;
    setTestBuildingHp(match, hq.id, 1);
    // Beside the HQ, where Player 1 can see it.
    const attacker = addTestUnit(match, 1, "rifleman", { x: 3, y: 1 });
    expect(issueCommand(match, 1, { type: "attack", unitIds: [attacker], targetId: hq.id })).toEqual({ ok: true });
    run(match, 1);
    const view = getPlayerView(match, 0);
    expect(view.buildings.some((b) => b.kind === "hq")).toBe(false);
    expect(view.production).toBeNull();
    expect(view.credits).toBe(ECONOMY.startingCredits);
  });
});
