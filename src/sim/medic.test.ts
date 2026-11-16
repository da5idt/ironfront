import { describe, expect, it } from "vitest";
import {
  advanceTick,
  createMatch,
  ECONOMY,
  getPlayerView,
  isArmed,
  issueCommand,
  type Match,
  type PlayerId,
  TICKS_PER_SECOND,
  TRAINING,
  TRAINS,
  UNIT_STATS,
  type UnitClass,
  type UnitKind,
  type UnitView,
} from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, setTestCredits } from "./testing/setup";

// Fights are staged along row 8 of a wide open Map, far from both starting
// bases in the corners, so only the Units put there take part.
const ROW = 8;
const stage = (): Match => createMatch(openMap(50, 40), 1);

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

function runUntil(match: Match, done: () => boolean, limit = 1200): number {
  for (let t = 0; t < limit; t++) {
    if (done()) return t;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

/** A Unit as its owner sees it: a Player always sees its own Units. */
const find = (match: Match, id: number): UnitView | undefined =>
  getPlayerView(match, 0).units.find((u) => u.id === id && u.owner === 0) ??
  getPlayerView(match, 1).units.find((u) => u.id === id && u.owner === 1);

/** Adds a Hospital for the Player and returns its id. */
function hospital(match: Match, owner: PlayerId, x: number, y: number): number {
  addTestBuilding(match, owner, "hospital", { x, y });
  return getPlayerView(match, owner).buildings.find((b) => b.x === x && b.y === y)!.id;
}

const training = (match: Match, id: number) => getPlayerView(match, 0).buildings.find((b) => b.id === id)!.training;

const medics = (match: Match, owner: PlayerId): UnitView[] =>
  getPlayerView(match, owner).units.filter((u) => u.owner === owner && u.kind === "medic");

const train = (match: Match, buildingId: number) => issueCommand(match, 0, { type: "train", buildingId, kind: "medic" });

describe("Unit classes", () => {
  it("can be read for every Unit kind through the Simulation seam: Infantry on foot, Vehicles on wheels and tracks", () => {
    const classes: Record<UnitKind, UnitClass> = {
      rifleman: "infantry",
      medic: "infantry",
      mechanic: "infantry",
      raider: "vehicle",
      harvester: "vehicle",
      troopCarrier: "vehicle",
    };
    expect(Object.fromEntries(Object.entries(UNIT_STATS).map(([kind, stats]) => [kind, stats.class]))).toEqual(classes);
  });
});

describe("armed and unarmed", () => {
  it("is read from the weapon numbers: the Rifleman and Raider are armed, the Harvester and Medic are not", () => {
    expect(isArmed(UNIT_STATS.rifleman)).toBe(true);
    expect(isArmed(UNIT_STATS.raider)).toBe(true);
    expect(isArmed(UNIT_STATS.harvester)).toBe(false);
    expect(isArmed(UNIT_STATS.medic)).toBe(false);
  });
});

describe("the Medic", () => {
  it("has its numbers in the tuning file: 200 Credits, 40 health, the Rifleman's speed, no weapon", () => {
    expect(UNIT_STATS.medic).toMatchObject({ name: "Medic", cost: 200, maxHp: 40, speed: 1.5, damage: 0, range: 0 });
    expect(UNIT_STATS.medic.speed).toBe(UNIT_STATS.rifleman.speed);
  });

  it("is what the Hospital trains, and nothing else trains it", () => {
    expect(TRAINS.hospital).toEqual(["medic"]);
    expect(Object.entries(TRAINS).filter(([, kinds]) => kinds.includes("medic")).map(([b]) => b)).toEqual(["hospital"]);
    const match = stage();
    addTestBuilding(match, 0, "barracks", { x: 10, y: 10 });
    const barracks = getPlayerView(match, 0).buildings.find((b) => b.kind === "barracks")!.id;
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "medic" }).ok).toBe(false);
    const ward = hospital(match, 0, 14, 10);
    expect(issueCommand(match, 0, { type: "train", buildingId: ward, kind: "rifleman" }).ok).toBe(false);
  });

  it("is paid for when queued and steps out beside the Hospital at full health when trained", () => {
    const match = stage();
    const ward = hospital(match, 0, 10, 10);
    expect(training(match, ward)).toEqual({ queue: [], progress: 0, rallyPoint: null });
    expect(train(match, ward)).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits - 200);
    expect(training(match, ward)).toEqual({ queue: ["medic"], progress: 0, rallyPoint: null });
    run(match, UNIT_STATS.medic.trainTicks - 1);
    expect(medics(match, 0)).toEqual([]);
    run(match, 1);
    const [medic] = medics(match, 0);
    expect(medic).toMatchObject({ hp: 40, maxHp: 40 });
    // Beside the 2 by 2 footprint at (10, 10): within one Cell of it, and not on it.
    const cell = { x: Math.floor(medic!.x), y: Math.floor(medic!.y) };
    expect(cell.x >= 9 && cell.x <= 12 && cell.y >= 9 && cell.y <= 12).toBe(true);
    expect(cell.x >= 10 && cell.x <= 11 && cell.y >= 10 && cell.y <= 11).toBe(false);
    expect(training(match, ward)?.queue).toEqual([]);
  });

  it("queues up to the limit and cancels with a full refund, as at the Barracks", () => {
    const match = stage();
    const ward = hospital(match, 0, 10, 10);
    setTestCredits(match, 0, 5000);
    for (let i = 0; i < TRAINING.queueSize; i++) expect(train(match, ward).ok).toBe(true);
    expect(train(match, ward).ok).toBe(false);
    expect(getPlayerView(match, 0).credits).toBe(5000 - TRAINING.queueSize * 200);
    expect(issueCommand(match, 0, { type: "cancelTraining", buildingId: ward })).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(5000 - (TRAINING.queueSize - 1) * 200);
    expect(training(match, ward)?.queue).toHaveLength(TRAINING.queueSize - 1);
  });

  it("walks to the Hospital's rally point when trained", () => {
    const match = stage();
    const ward = hospital(match, 0, 10, 10);
    const rally = { x: 16, y: 13 };
    expect(issueCommand(match, 0, { type: "setRallyPoint", buildingId: ward, target: rally })).toEqual({ ok: true });
    expect(training(match, ward)?.rallyPoint).toEqual(rally);
    train(match, ward);
    run(match, UNIT_STATS.medic.trainTicks);
    const id = medics(match, 0)[0]!.id;
    runUntil(match, () => find(match, id)!.x === rally.x + 0.5 && find(match, id)!.y === rally.y + 0.5);
  });

  it("is trained by either Player", () => {
    const match = stage();
    const ward = hospital(match, 1, 30, 30);
    expect(issueCommand(match, 1, { type: "train", buildingId: ward, kind: "medic" })).toEqual({ ok: true });
    run(match, UNIT_STATS.medic.trainTicks);
    expect(medics(match, 1)).toHaveLength(1);
  });

  it("never fires: standing next to an enemy Unit and an enemy Building it leaves both unhurt", () => {
    const match = stage();
    addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const harvester = addTestUnit(match, 1, "harvester", { x: 21, y: ROW });
    addTestBuilding(match, 1, "barracks", { x: 20, y: ROW + 1 });
    for (let t = 0; t < 100; t++) {
      advanceTick(match);
      expect(getPlayerView(match, 0).shots).toEqual([]);
    }
    expect(find(match, harvester)!.hp).toBe(UNIT_STATS.harvester.maxHp);
    const barracks = getPlayerView(match, 1).buildings.find((b) => b.kind === "barracks")!;
    expect(barracks.hp).toBe(barracks.maxHp);
  });

  it("cannot be told to attack: the Command is rejected for Medics alone, and leaves a Medic out when sent with armed Units", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 20, y: ROW + 1 });
    const enemy = addTestUnit(match, 1, "harvester", { x: 24, y: ROW });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [medic], targetId: enemy }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "attack", unitIds: [medic, rifleman], targetId: enemy })).toEqual({ ok: true });
    runUntil(match, () => find(match, enemy) === undefined);
    expect(find(match, medic)).toMatchObject({ x: 20.5, y: ROW + 0.5 });
  });

  it("treats an Attack-move as a plain move: it walks past an enemy without stopping or firing", () => {
    const goal = { x: 34, y: ROW };
    const walk = (type: "move" | "attackMove", withEnemy: boolean): { ticks: number; enemyHp: number | undefined } => {
      const match = stage();
      const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
      const enemy = withEnemy ? addTestUnit(match, 1, "harvester", { x: 27, y: ROW + 1 }) : null;
      expect(issueCommand(match, 0, { type, unitIds: [medic], target: goal })).toEqual({ ok: true });
      const ticks = runUntil(match, () => find(match, medic)!.x === goal.x + 0.5 && find(match, medic)!.y === goal.y + 0.5);
      return { ticks, enemyHp: enemy === null ? undefined : find(match, enemy)!.hp };
    };
    const plain = walk("move", false);
    const past = walk("attackMove", true);
    expect(past.ticks).toBe(plain.ticks);
    expect(past.enemyHp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("is shot like any Unit: an idle enemy Rifleman in range kills it, and a Turret fires on it", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    addTestUnit(match, 1, "rifleman", { x: 22, y: ROW });
    run(match, 1);
    expect(find(match, medic)!.hp).toBe(40 - UNIT_STATS.rifleman.damage);
    runUntil(match, () => find(match, medic) === undefined);

    const other = stage();
    const second = addTestUnit(other, 0, "medic", { x: 20, y: ROW });
    addTestBuilding(other, 1, "turret", { x: 23, y: ROW });
    runUntil(other, () => find(other, second)!.hp < 40, 5);
  });

  it("can be attacked by Command, and an Attack-move stops for it only after enemies that can shoot back", () => {
    const match = stage();
    // Both are in the Raider's range from the start, the Medic the nearer of the two.
    const raider = addTestUnit(match, 0, "raider", { x: 20, y: ROW });
    const medic = addTestUnit(match, 1, "medic", { x: 22, y: ROW });
    const rifleman = addTestUnit(match, 1, "rifleman", { x: 23, y: ROW + 1 });
    expect(issueCommand(match, 0, { type: "attackMove", unitIds: [raider], target: { x: 40, y: ROW } })).toEqual({ ok: true });
    runUntil(match, () => find(match, rifleman) === undefined || find(match, medic)!.hp < 40);
    // The armed Rifleman goes first although the Medic is nearer.
    expect(find(match, rifleman)).toBeUndefined();
    expect(find(match, medic)?.hp).toBe(40);
    runUntil(match, () => find(match, medic) === undefined);

    const other = stage();
    const attacker = addTestUnit(other, 0, "rifleman", { x: 20, y: ROW });
    const target = addTestUnit(other, 1, "medic", { x: 22, y: ROW });
    expect(issueCommand(other, 0, { type: "attack", unitIds: [attacker], targetId: target })).toEqual({ ok: true });
    runUntil(other, () => find(other, target) === undefined);
  });

  it("gives the same result from the same seed", () => {
    const play = (): string => {
      const match = stage();
      const ward = hospital(match, 0, 10, 10);
      issueCommand(match, 0, { type: "setRallyPoint", buildingId: ward, target: { x: 18, y: 14 } });
      train(match, ward);
      train(match, ward);
      run(match, 2 * UNIT_STATS.medic.trainTicks + 10 * TICKS_PER_SECOND);
      return JSON.stringify(getPlayerView(match, 0).units);
    };
    expect(play()).toBe(play());
  });
});
