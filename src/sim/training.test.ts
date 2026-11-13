import { describe, expect, it } from "vitest";
import {
  advanceTick,
  type BuildingKind,
  type BuildingView,
  createMatch,
  ECONOMY,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
  TICKS_PER_SECOND,
  TRAINING,
  UNIT_STATS,
  type UnitView,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, setTestCredits } from "./testing/setup";

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

/** Adds a Building and returns its id as the owner sees it. */
function building(match: Match, owner: PlayerId, kind: BuildingKind, x: number, y: number): number {
  addTestBuilding(match, owner, kind, { x, y });
  return getPlayerView(match, owner).buildings.find((b) => b.x === x && b.y === y)!.id;
}

function viewOf(match: Match, player: PlayerId, id: number): BuildingView {
  return getPlayerView(match, player).buildings.find((b) => b.id === id)!;
}

/** Player 0's Units, newest last; enemy Units coming into sight don't count. */
function ownUnits(match: Match): UnitView[] {
  return getPlayerView(match, 0).units.filter((u) => u.owner === 0);
}

const RIFLEMAN = UNIT_STATS.rifleman;

describe("training Units", () => {
  it("spends the cost up front and shows the Unit queued with no progress", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" })).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits - RIFLEMAN.cost);
    expect(viewOf(match, 0, barracks).training).toEqual({ queue: ["rifleman"], progress: 0, rallyPoint: null });
  });
});

describe("train is rejected, changing nothing", () => {
  it("without enough Credits", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    setTestCredits(match, 0, RIFLEMAN.cost - 1);
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(RIFLEMAN.cost - 1);
    expect(viewOf(match, 0, barracks).training?.queue).toEqual([]);
  });

  it("when the queue is full", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    setTestCredits(match, 0, 10_000);
    for (let i = 0; i < TRAINING.queueSize; i++) {
      expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" }).ok).toBe(true);
    }
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(10_000 - TRAINING.queueSize * RIFLEMAN.cost);
    expect(viewOf(match, 0, barracks).training?.queue).toHaveLength(TRAINING.queueSize);
  });

  it("for a Unit the Building does not train, or a Building that trains nothing", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    const factory = building(match, 0, "vehicleFactory", 14, 10);
    const hq = getPlayerView(match, 0).buildings.find((b) => b.kind === "hq")!.id;
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "raider" }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "train", buildingId: factory, kind: "rifleman" }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "train", buildingId: hq, kind: "rifleman" }).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
  });

  it("for the other Player's Building", () => {
    const match = createMatch(openMap(30, 30), 1);
    const enemyBarracks = building(match, 1, "barracks", 20, 10);
    expect(issueCommand(match, 0, { type: "train", buildingId: enemyBarracks, kind: "rifleman" }).ok).toBe(false);
    expect(viewOf(match, 1, enemyBarracks).training?.queue).toEqual([]);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
  });
});

describe("the queue", () => {
  it("trains the oldest Unit first; only it makes progress", () => {
    const match = createMatch(openMap(30, 30), 1);
    const factory = building(match, 0, "vehicleFactory", 10, 10);
    setTestCredits(match, 0, 10_000);
    issueCommand(match, 0, { type: "train", buildingId: factory, kind: "raider" });
    issueCommand(match, 0, { type: "train", buildingId: factory, kind: "harvester" });
    const raider = UNIT_STATS.raider.trainTicks;
    run(match, raider / 2);
    expect(viewOf(match, 0, factory).training).toMatchObject({ queue: ["raider", "harvester"], progress: 0.5 });
    const before = ownUnits(match).length;
    run(match, raider / 2);
    expect(ownUnits(match)).toHaveLength(before + 1);
    expect(ownUnits(match).at(-1)!.kind).toBe("raider");
    expect(viewOf(match, 0, factory).training).toMatchObject({ queue: ["harvester"], progress: 0 });
  });
});

describe("where a new Unit appears", () => {
  it("on a free Cell touching the Building", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    run(match, RIFLEMAN.trainTicks);
    const unit = ownUnits(match).at(-1)!;
    const cx = Math.floor(unit.x);
    const cy = Math.floor(unit.y);
    const touching = cx >= 9 && cx <= 12 && cy >= 9 && cy <= 12;
    const inside = cx >= 10 && cx <= 11 && cy >= 10 && cy <= 11;
    expect(touching && !inside).toBe(true);
  });

  it("waits, finished, while every Cell nearby is taken, then steps out on the first one freed", () => {
    // A 4x4 island round a Barracks, with a one-Cell causeway leading east.
    const rows = Array.from({ length: 14 }, (_, y) =>
      Array.from({ length: 30 }, (_, x) => {
        const p0Start = x <= 8 && y <= 5;
        const p1Start = x >= 22 && y >= 9;
        const island = x >= 14 && x <= 17 && y >= 5 && y <= 8;
        const causeway = y === 6 && x >= 18 && x <= 24;
        return p0Start || p1Start || island || causeway ? "." : "~";
      }).join(""),
    );
    const match = createMatch(testMap(rows), 1);
    const barracks = building(match, 0, "barracks", 15, 6);
    for (let y = 5; y <= 8; y++) {
      for (let x = 14; x <= 17; x++) {
        if (!(x >= 15 && x <= 16 && y >= 6 && y <= 7)) addTestUnit(match, 0, "rifleman", { x, y });
      }
    }
    addTestUnit(match, 0, "rifleman", { x: 18, y: 6 });
    const blocker = addTestUnit(match, 0, "rifleman", { x: 19, y: 6 });
    const before = ownUnits(match).length;

    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    run(match, RIFLEMAN.trainTicks + 10);
    expect(ownUnits(match)).toHaveLength(before);
    expect(viewOf(match, 0, barracks).training).toMatchObject({ queue: ["rifleman"], progress: 1 });

    issueCommand(match, 0, { type: "move", unitIds: [blocker], target: { x: 23, y: 6 } });
    run(match, 2 * TICKS_PER_SECOND);
    const units = ownUnits(match);
    expect(units).toHaveLength(before + 1);
    const trained = units.at(-1)!;
    expect([Math.floor(trained.x), Math.floor(trained.y)]).toEqual([19, 6]);
    expect(viewOf(match, 0, barracks).training?.queue).toEqual([]);
  });
});

describe("cancelling training", () => {
  it("takes the newest Unit off the queue and refunds it, leaving the one in training alone", () => {
    const match = createMatch(openMap(30, 30), 1);
    const factory = building(match, 0, "vehicleFactory", 10, 10);
    setTestCredits(match, 0, 10_000);
    issueCommand(match, 0, { type: "train", buildingId: factory, kind: "raider" });
    issueCommand(match, 0, { type: "train", buildingId: factory, kind: "harvester" });
    run(match, UNIT_STATS.raider.trainTicks / 4);
    expect(issueCommand(match, 0, { type: "cancelTraining", buildingId: factory })).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(10_000 - UNIT_STATS.raider.cost);
    expect(viewOf(match, 0, factory).training).toMatchObject({ queue: ["raider"], progress: 0.25 });
  });

  it("refunds the Unit in training when it is the only one, and its progress is lost", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    run(match, RIFLEMAN.trainTicks / 2);
    expect(issueCommand(match, 0, { type: "cancelTraining", buildingId: barracks }).ok).toBe(true);
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits);
    expect(viewOf(match, 0, barracks).training).toMatchObject({ queue: [], progress: 0 });
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    expect(viewOf(match, 0, barracks).training?.progress).toBe(0);
  });

  it("is rejected for an empty queue or someone else's Building", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    expect(issueCommand(match, 0, { type: "cancelTraining", buildingId: barracks }).ok).toBe(false);
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    expect(issueCommand(match, 1, { type: "cancelTraining", buildingId: barracks }).ok).toBe(false);
    expect(viewOf(match, 0, barracks).training?.queue).toEqual(["rifleman"]);
    expect(getPlayerView(match, 1).credits).toBe(ECONOMY.startingCredits);
  });
});

describe("rally points", () => {
  it("are set on an own Barracks or Vehicle Factory and shown only to its owner", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    expect(issueCommand(match, 0, { type: "setRallyPoint", buildingId: barracks, target: { x: 20, y: 12 } })).toEqual({
      ok: true,
    });
    expect(viewOf(match, 0, barracks).training?.rallyPoint).toEqual({ x: 20, y: 12 });
  });

  it("are rejected on the HQ, an enemy Building or off the Map", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    const hq = getPlayerView(match, 0).buildings.find((b) => b.kind === "hq")!.id;
    const target = { x: 20, y: 12 };
    expect(issueCommand(match, 0, { type: "setRallyPoint", buildingId: hq, target }).ok).toBe(false);
    expect(issueCommand(match, 1, { type: "setRallyPoint", buildingId: barracks, target }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "setRallyPoint", buildingId: barracks, target: { x: 30, y: 3 } }).ok).toBe(
      false,
    );
    expect(viewOf(match, 0, barracks).training?.rallyPoint).toBeNull();
  });

  it("send a newly trained Unit walking there", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 10, 10);
    issueCommand(match, 0, { type: "setRallyPoint", buildingId: barracks, target: { x: 20, y: 12 } });
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    run(match, RIFLEMAN.trainTicks + 10 * TICKS_PER_SECOND);
    const unit = ownUnits(match).at(-1)!;
    expect([unit.x, unit.y]).toEqual([20.5, 12.5]);
  });

  it("keep an enemy Building's queue and rally point out of the other Player's view", () => {
    const match = createMatch(openMap(30, 30), 1);
    const barracks = building(match, 0, "barracks", 25, 22);
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    issueCommand(match, 0, { type: "setRallyPoint", buildingId: barracks, target: { x: 20, y: 12 } });
    run(match, 1);
    const seen = getPlayerView(match, 1).buildings.find((b) => b.id === barracks);
    expect(seen).toBeDefined();
    expect(seen!.training).toBeNull();
  });
});

describe("new Harvesters", () => {
  // Ore just above the Factory, and a second field far off to the south-west.
  const rows = Array.from({ length: 30 }, (_, y) =>
    Array.from({ length: 30 }, (_, x) =>
      (y === 8 && x >= 12 && x <= 13) || (y === 22 && x >= 2 && x <= 3) ? "*" : ".",
    ).join(""),
  );

  /** Runs until the newest Unit has dug some Ore, and returns the Cell row it is digging in. */
  function rowWhereItDigs(match: Match): number {
    for (let t = 0; t < 60 * TICKS_PER_SECOND; t++) {
      advanceTick(match);
      const newest = ownUnits(match).at(-1)!;
      if (newest.kind === "harvester" && newest.cargo > 0) return Math.floor(newest.y);
    }
    throw new Error("the new Harvester never dug any Ore");
  }

  it("start harvesting the nearest Ore on their own", () => {
    const match = createMatch(testMap(rows), 1);
    const factory = building(match, 0, "vehicleFactory", 12, 10);
    issueCommand(match, 0, { type: "train", buildingId: factory, kind: "harvester" });
    expect(rowWhereItDigs(match)).toBe(8);
  });

  it("harvest the Ore nearest the rally point instead of stopping there, when one is set", () => {
    const match = createMatch(testMap(rows), 1);
    const factory = building(match, 0, "vehicleFactory", 12, 10);
    issueCommand(match, 0, { type: "setRallyPoint", buildingId: factory, target: { x: 4, y: 20 } });
    issueCommand(match, 0, { type: "train", buildingId: factory, kind: "harvester" });
    expect(rowWhereItDigs(match)).toBe(22);
  });
});
