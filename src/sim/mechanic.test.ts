import { describe, expect, it } from "vitest";
import {
  advanceTick,
  BUILDING_STATS,
  type BuildingKind,
  type BuildingView,
  canPlaceBuilding,
  createMatch,
  getPlayerView,
  isArmed,
  issueCommand,
  type Match,
  type PlayerId,
  TEND,
  TEND_RATES,
  tendRate,
  TICKS_PER_SECOND,
  TRAINS,
  UNIT_STATS,
  type UnitView,
} from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp, setTestCredits, setTestUnitHp } from "./testing/setup";

// Staged along row 8 of a wide open Map, far from both starting bases in the
// corners (and from their Riflemen, who are out of every radius used here).
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

const hp = (match: Match, id: number): number => find(match, id)!.hp;
const at = (match: Match, id: number) => ({ x: find(match, id)!.x, y: find(match, id)!.y });

/** Adds a hurt Unit and returns its id. */
function hurt(match: Match, owner: PlayerId, kind: UnitView["kind"], x: number, y: number, health: number): number {
  const id = addTestUnit(match, owner, kind, { x, y });
  setTestUnitHp(match, id, health);
  return id;
}

/** Adds a Building for the Player, sets its health when given, and returns its id. */
function building(match: Match, owner: PlayerId, kind: BuildingKind, x: number, y: number, health?: number): number {
  addTestBuilding(match, owner, kind, { x, y });
  const id = getPlayerView(match, owner).buildings.find((b) => b.x === x && b.y === y)!.id;
  if (health !== undefined) setTestBuildingHp(match, id, health);
  return id;
}

const ownBuilding = (match: Match, owner: PlayerId, id: number): BuildingView =>
  getPlayerView(match, owner).buildings.find((b) => b.id === id)!;
const buildingHp = (match: Match, owner: PlayerId, id: number): number => ownBuilding(match, owner, id).hp;

const tend = (match: Match, unitIds: number[], targetId: number, player: PlayerId = 0) =>
  issueCommand(match, player, { type: "tend", unitIds, targetId });

/** Everything either Player can see, to show that a rejected Command changed nothing. */
const snapshot = (match: Match): string => JSON.stringify([getPlayerView(match, 0), getPlayerView(match, 1)]);

const BUILDING_KINDS = Object.keys(BUILDING_STATS) as BuildingKind[];

describe("the Mechanic", () => {
  it("has its numbers in the tuning file: 300 Credits, 50 health, the Rifleman's speed, Infantry, no weapon", () => {
    expect(UNIT_STATS.mechanic).toMatchObject({ name: "Mechanic", class: "infantry", cost: 300, maxHp: 50, damage: 0, range: 0 });
    expect(UNIT_STATS.mechanic.speed).toBe(UNIT_STATS.rifleman.speed);
    expect(isArmed(UNIT_STATS.mechanic)).toBe(false);
  });

  it("repairs Vehicles at 10 a second and Buildings at 15, and helps no Infantry", () => {
    expect(TEND_RATES.mechanic).toEqual({ infantry: 0, vehicle: 10, building: 15 });
    expect(tendRate("mechanic", "vehicle")).toBe(10);
    expect(tendRate("mechanic", "building")).toBe(15);
    expect(tendRate("mechanic", "infantry")).toBe(0);
  });

  it("is trained at the Vehicle Factory, after the Raider and the Harvester, and nowhere else", () => {
    expect(TRAINS.vehicleFactory!.slice(0, 3)).toEqual(["raider", "harvester", "mechanic"]);
    for (const kind of BUILDING_KINDS) {
      if (kind !== "vehicleFactory") expect(TRAINS[kind] ?? []).not.toContain("mechanic");
    }
  });

  it("is paid for when queued and steps out beside the Vehicle Factory at full health when trained", () => {
    const match = stage();
    const vehicleFactory = building(match, 0, "vehicleFactory", 20, ROW);
    setTestCredits(match, 0, 500);
    expect(issueCommand(match, 0, { type: "train", buildingId: vehicleFactory, kind: "mechanic" })).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(200);
    expect(issueCommand(match, 0, { type: "train", buildingId: vehicleFactory, kind: "mechanic" }).ok).toBe(false);
    const mechanics = () => getPlayerView(match, 0).units.filter((u) => u.kind === "mechanic");
    runUntil(match, () => mechanics().length === 1);
    const [mechanic] = mechanics();
    expect(mechanic).toMatchObject({ owner: 0, hp: 50, maxHp: 50 });
    // Beside the footprint (Cells 20..22 by 8..10), not on it.
    expect(Math.max(Math.abs(mechanic!.x - 21.5), Math.abs(mechanic!.y - (ROW + 1.5)))).toBe(2);
  });

  it("is not trained at a Barracks or a Hospital: the Command is rejected and nothing is paid", () => {
    const match = stage();
    const barracks = building(match, 0, "barracks", 20, ROW);
    const hospital = building(match, 0, "hospital", 24, ROW);
    const before = snapshot(match);
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "mechanic" }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "train", buildingId: hospital, kind: "mechanic" }).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
  });

  it("never fires: standing next to the other Player's Unit and Building it leaves both unhurt", () => {
    const match = stage();
    addTestUnit(match, 0, "mechanic", { x: 20, y: ROW });
    const harvester = addTestUnit(match, 1, "harvester", { x: 21, y: ROW });
    issueCommand(match, 1, { type: "stop", unitIds: [harvester] });
    const theirs = building(match, 1, "barracks", 20, ROW + 1);
    run(match, 10 * TICKS_PER_SECOND);
    expect(hp(match, harvester)).toBe(UNIT_STATS.harvester.maxHp);
    expect(buildingHp(match, 1, theirs)).toBe(BUILDING_STATS.barracks.maxHp);
    expect(getPlayerView(match, 0).shots).toEqual([]);
  });
});

describe("a Mechanic told to Tend", () => {
  it("walks to a damaged Raider and repairs it to full health at 10 a second, then stands idle", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    const raider = hurt(match, 0, "raider", 20, ROW, 15);
    expect(tend(match, [mechanic], raider)).toEqual({ ok: true });
    // Nothing is repaired from a distance: the Mechanic has to walk there first.
    run(match, TICKS_PER_SECOND);
    expect(hp(match, raider)).toBe(15);
    runUntil(match, () => hp(match, raider) > 15);
    expect(Math.floor(at(match, mechanic).x)).toBe(19);
    const before = hp(match, raider);
    run(match, TICKS_PER_SECOND);
    expect(hp(match, raider) - before).toBe(10);
    runUntil(match, () => {
      expect(Number.isInteger(hp(match, raider))).toBe(true);
      return hp(match, raider) === UNIT_STATS.raider.maxHp;
    });
    run(match, 3 * TICKS_PER_SECOND);
    expect(hp(match, raider)).toBe(120);
    // Idle again: when the repaired Raider drives off, the Mechanic stays where it is.
    const stood = at(match, mechanic);
    issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 26, y: ROW } });
    run(match, 4 * TICKS_PER_SECOND);
    expect(at(match, mechanic)).toEqual(stood);
  });

  it("repairs a Harvester to full health", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 18, y: ROW });
    const harvester = hurt(match, 0, "harvester", 20, ROW, 100);
    issueCommand(match, 0, { type: "stop", unitIds: [harvester] });
    expect(tend(match, [mechanic], harvester)).toEqual({ ok: true });
    runUntil(match, () => hp(match, harvester) === 300);
    run(match, 2 * TICKS_PER_SECOND);
    expect(hp(match, harvester)).toBe(300);
  });

  it("repairs a Troop Carrier to full health, when told to and by itself", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 18, y: ROW });
    const carrier = hurt(match, 0, "troopCarrier", 20, ROW, 100);
    expect(tend(match, [mechanic], carrier)).toEqual({ ok: true });
    runUntil(match, () => hp(match, carrier) > 100);
    const before = hp(match, carrier);
    run(match, TICKS_PER_SECOND);
    expect(hp(match, carrier) - before).toBe(10);
    runUntil(match, () => hp(match, carrier) === UNIT_STATS.troopCarrier.maxHp);
    run(match, 2 * TICKS_PER_SECOND);
    expect(hp(match, carrier)).toBe(220);

    const alone = stage();
    addTestUnit(alone, 0, "mechanic", { x: 15, y: ROW });
    const damaged = hurt(alone, 0, "troopCarrier", 20, ROW, 150);
    runUntil(alone, () => hp(alone, damaged) === 220);
  });

  it.each(BUILDING_KINDS)("repairs a %s from under half health to full at 15 a second, and no further", (kind) => {
    const match = stage();
    const { maxHp, width, height } = BUILDING_STATS[kind];
    const start = Math.floor(maxHp * 0.4);
    const id = building(match, 0, kind, 20, ROW, start);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    expect(tend(match, [mechanic], id)).toEqual({ ok: true });
    runUntil(match, () => buildingHp(match, 0, id) > start);
    // It works from a Cell that touches the footprint, never from on it.
    const cell = { x: Math.floor(at(match, mechanic).x), y: Math.floor(at(match, mechanic).y) };
    const onFootprint = cell.x >= 20 && cell.x < 20 + width && cell.y >= ROW && cell.y < ROW + height;
    expect(onFootprint).toBe(false);
    expect(cell.x).toBeGreaterThanOrEqual(19);
    expect(cell.x).toBeLessThanOrEqual(20 + width);
    expect(cell.y).toBeGreaterThanOrEqual(ROW - 1);
    expect(cell.y).toBeLessThanOrEqual(ROW + height);
    const before = buildingHp(match, 0, id);
    run(match, TICKS_PER_SECOND);
    expect(buildingHp(match, 0, id) - before).toBe(15);
    runUntil(
      match,
      () => {
        expect(Number.isInteger(buildingHp(match, 0, id))).toBe(true);
        return buildingHp(match, 0, id) === maxHp;
      },
      3000,
    );
    const stood = at(match, mechanic);
    run(match, 3 * TICKS_PER_SECOND);
    expect(buildingHp(match, 0, id)).toBe(maxHp);
    expect(ownBuilding(match, 0, id).maxHp).toBe(maxHp);
    expect(at(match, mechanic)).toEqual(stood);
  });

  it("repairs a Turret that goes on firing while it is worked on", () => {
    const match = stage();
    const turret = building(match, 0, "turret", 20, ROW, 100);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 19, y: ROW });
    // Unarmed, so the Turret is never hit back and only the repair changes its health.
    const target = addTestUnit(match, 1, "harvester", { x: 23, y: ROW });
    issueCommand(match, 1, { type: "stop", unitIds: [target] });
    tend(match, [mechanic], turret);
    run(match, 2 * TICKS_PER_SECOND);
    expect(buildingHp(match, 0, turret)).toBe(130);
    expect(hp(match, target)).toBeLessThan(UNIT_STATS.harvester.maxHp);
  });

  it("repairs a Building the HQ has only just placed: the Simulation has no build-up state to wait for", () => {
    const match = stage();
    setTestCredits(match, 0, 5000);
    issueCommand(match, 0, { type: "startBuilding", kind: "barracks" });
    run(match, BUILDING_STATS.barracks.buildTicks);
    const site = { x: 4, y: 4 };
    expect(canPlaceBuilding(getPlayerView(match, 0), "barracks", site)).toBe(true);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: site })).toEqual({ ok: true });
    const placed = getPlayerView(match, 0).buildings.find((b) => b.kind === "barracks")!;
    setTestBuildingHp(match, placed.id, 200);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 6, y: 5 });
    expect(tend(match, [mechanic], placed.id)).toEqual({ ok: true });
    run(match, TICKS_PER_SECOND);
    expect(buildingHp(match, 0, placed.id)).toBe(215);
  });

  it("does nothing for Infantry: the Command is rejected and the Match is unchanged", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 20, y: ROW });
    const rifleman = hurt(match, 0, "rifleman", 21, ROW, 10);
    // No Medic stands by: it would heal them and hide what the Mechanic did not do.
    const second = hurt(match, 0, "rifleman", 20, ROW + 1, 10);
    const other = hurt(match, 0, "mechanic", 21, ROW + 1, 10);
    const before = snapshot(match);
    expect(tend(match, [mechanic], rifleman).ok).toBe(false);
    expect(tend(match, [mechanic], second).ok).toBe(false);
    expect(tend(match, [mechanic], other).ok).toBe(false);
    expect(tend(match, [mechanic], mechanic).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    run(match, 5 * TICKS_PER_SECOND);
    expect([hp(match, rifleman), hp(match, second), hp(match, other)]).toEqual([10, 10, 10]);
    expect(at(match, mechanic)).toEqual({ x: 20.5, y: ROW + 0.5 });
  });

  it("is healed by a Medic when hurt, to its full 50 health", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const mechanic = hurt(match, 0, "mechanic", 21, ROW, 10);
    expect(tend(match, [medic], mechanic)).toEqual({ ok: true });
    run(match, TICKS_PER_SECOND);
    expect(hp(match, mechanic)).toBe(18);
    runUntil(match, () => hp(match, mechanic) === 50);
  });

  it("is rejected for the other Player's Vehicle or Building, with the Match unchanged", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 20, y: ROW });
    // A Harvester stands for their Vehicles: unarmed, so it does not shoot the Mechanic.
    const theirVehicle = hurt(match, 1, "harvester", 22, ROW + 4, 30);
    issueCommand(match, 1, { type: "stop", unitIds: [theirVehicle] });
    const theirs = building(match, 1, "hospital", 21, ROW + 1, 100);
    const before = snapshot(match);
    expect(tend(match, [mechanic], theirVehicle).ok).toBe(false);
    expect(tend(match, [mechanic], theirs).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    run(match, 5 * TICKS_PER_SECOND);
    expect(buildingHp(match, 1, theirs)).toBe(100);
    expect(hp(match, theirVehicle)).toBe(30);
  });

  it("goes alone when sent with a Medic and a Rifleman to a damaged Vehicle or Building: they stay as they were", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW + 1 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 14, y: ROW + 2 });
    const barracks = building(match, 0, "barracks", 20, ROW, 100);
    expect(tend(match, [mechanic, medic, rifleman], barracks)).toEqual({ ok: true });
    runUntil(match, () => buildingHp(match, 0, barracks) > 100);
    expect(at(match, medic)).toEqual({ x: 14.5, y: ROW + 1.5 });
    expect(at(match, rifleman)).toEqual({ x: 14.5, y: ROW + 2.5 });
    expect(at(match, mechanic).x).toBeGreaterThan(18);
  });

  it("repairs twice as fast with two Mechanics on one Building, each on a side of its own", () => {
    const match = stage();
    const hq = building(match, 0, "hq", 20, ROW, 500);
    const mechanics = [addTestUnit(match, 0, "mechanic", { x: 19, y: ROW }), addTestUnit(match, 0, "mechanic", { x: 19, y: ROW + 1 })];
    tend(match, mechanics, hq);
    run(match, 2 * TICKS_PER_SECOND);
    expect(buildingHp(match, 0, hq)).toBe(560);
    expect(at(match, mechanics[0]!)).not.toEqual(at(match, mechanics[1]!));
  });

  it("costs no Credits, for a Vehicle or a Building", () => {
    const match = stage();
    const mechanics = [addTestUnit(match, 0, "mechanic", { x: 19, y: ROW }), addTestUnit(match, 0, "mechanic", { x: 19, y: ROW + 4 })];
    const raider = hurt(match, 0, "raider", 20, ROW, 20);
    const refinery = building(match, 0, "refinery", 20, ROW + 4, 300);
    const credits = getPlayerView(match, 0).credits;
    tend(match, [mechanics[0]!], raider);
    tend(match, [mechanics[1]!], refinery);
    runUntil(match, () => hp(match, raider) === 120 && buildingHp(match, 0, refinery) === 900);
    // The starting Harvester is still on its way to Ore this early, so nothing has been earned either.
    expect(getPlayerView(match, 0).credits).toBe(credits);
  });

  it("ends when the Building is destroyed, leaving the Mechanic idle where it stood", () => {
    const match = stage();
    const turret = building(match, 0, "turret", 20, ROW, 100);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 19, y: ROW });
    tend(match, [mechanic], turret);
    run(match, 5);
    setTestBuildingHp(match, turret, 0);
    run(match, 2 * TICKS_PER_SECOND);
    expect(getPlayerView(match, 0).buildings.some((b) => b.id === turret)).toBe(false);
    expect(at(match, mechanic)).toEqual({ x: 19.5, y: ROW + 0.5 });
    expect(getPlayerView(match, 0).tends).toEqual([]);
  });
});

describe("a Mechanic with nothing to do", () => {
  it("walks to a damaged Vehicle within 6 Cells and repairs it to full health by itself", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    const raider = hurt(match, 0, "raider", 20, ROW, 30);
    runUntil(match, () => hp(match, raider) === 120);
    expect(Math.floor(at(match, mechanic).x)).toBe(19);
  });

  it("walks to a damaged Building within 6 Cells of its footprint and repairs it to full health by itself", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    // The near wall is 5.5 Cells off, though the middle of the HQ is 7.
    const hq = building(match, 0, "hq", 20, ROW, 1400);
    runUntil(match, () => buildingHp(match, 0, hq) === 1500);
    expect(Math.floor(at(match, mechanic).x)).toBe(19);
  });

  it("ignores a damaged Vehicle and a damaged Building beyond the seek radius", () => {
    expect(TEND.seekRadius).toBe(6);
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    const raider = hurt(match, 0, "raider", 21, ROW, 30);
    const barracks = building(match, 0, "barracks", 14, ROW + 8, 100);
    run(match, 10 * TICKS_PER_SECOND);
    expect(hp(match, raider)).toBe(30);
    expect(buildingHp(match, 0, barracks)).toBe(100);
    expect(at(match, mechanic)).toEqual({ x: 14.5, y: ROW + 0.5 });
  });

  it("goes to the nearer of a damaged Vehicle and a damaged Building first, then to the other", () => {
    const match = stage();
    addTestUnit(match, 0, "mechanic", { x: 20, y: ROW });
    const turret = building(match, 0, "turret", 22, ROW, 300);
    const raider = hurt(match, 0, "raider", 16, ROW, 60);
    runUntil(match, () => buildingHp(match, 0, turret) === 400);
    expect(hp(match, raider)).toBe(60);
    runUntil(match, () => hp(match, raider) === 120);
  });

  it("leaves hurt Infantry, whole Vehicles and Buildings, and the other Player's damaged ones alone", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 20, y: ROW });
    const rifleman = hurt(match, 0, "rifleman", 22, ROW, 10);
    // Nothing armed of the Player's own is near, so their Harvester is left standing to be ignored.
    const whole = addTestUnit(match, 0, "harvester", { x: 20, y: ROW + 2 });
    issueCommand(match, 0, { type: "stop", unitIds: [whole] });
    building(match, 0, "barracks", 16, ROW);
    // Both of theirs are out of the hurt Rifleman's range: he still shoots.
    const theirVehicle = hurt(match, 1, "harvester", 19, ROW - 3, 30);
    issueCommand(match, 1, { type: "stop", unitIds: [theirVehicle] });
    const theirs = building(match, 1, "hospital", 17, ROW + 4, 100);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, mechanic)).toEqual({ x: 20.5, y: ROW + 0.5 });
    expect(hp(match, rifleman)).toBe(10);
    expect(hp(match, theirVehicle)).toBe(30);
    expect(buildingHp(match, 1, theirs)).toBe(100);
  });

  it("does not go off to repair while it has a Command in progress, and does once it has arrived", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    const passed = building(match, 0, "turret", 20, ROW + 2, 100);
    const atTheEnd = hurt(match, 0, "raider", 33, ROW, 30);
    const goal = { x: 30, y: ROW };
    issueCommand(match, 0, { type: "move", unitIds: [mechanic], target: goal });
    runUntil(match, () => at(match, mechanic).x === goal.x + 0.5 && at(match, mechanic).y === goal.y + 0.5);
    expect(buildingHp(match, 0, passed)).toBe(100);
    expect(hp(match, atTheEnd)).toBe(30);
    runUntil(match, () => hp(match, atTheEnd) === 120);
    expect(buildingHp(match, 0, passed)).toBe(100);
  });
});

describe("what a Player view shows of a repair", () => {
  it("lists a Building under repair at the centre of its footprint, on every Tick it is worked on and on no other", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 17, y: ROW });
    const max = BUILDING_STATS.refinery.maxHp;
    const refinery = building(match, 0, "refinery", 20, ROW, max - 45);
    expect(getPlayerView(match, 0).tends).toEqual([]);
    tend(match, [mechanic], refinery);
    const worked: number[] = [];
    for (let t = 0; t < 8 * TICKS_PER_SECOND; t++) {
      const before = buildingHp(match, 0, refinery);
      const tick = getPlayerView(match, 0).tick;
      advanceTick(match);
      const view = getPlayerView(match, 0);
      if (view.tends.length > 0) {
        // The Refinery covers Cells 20..22 by 8..9.
        expect(view.tends).toEqual([{ targetId: refinery, x: 21.5, y: ROW + 1, tick }]);
        // The entry names a Building that is in the same view.
        expect(view.buildings.some((b) => b.id === refinery)).toBe(true);
        worked.push(tick);
      } else {
        expect(buildingHp(match, 0, refinery)).toBe(before);
      }
    }
    // 45 health at 15 a second is 60 Ticks of work, one after the other, and none once it is full.
    expect(worked).toHaveLength(60);
    expect(worked.at(-1)! - worked[0]!).toBe(59);
    expect(buildingHp(match, 0, refinery)).toBe(max);
  });

  it("lists a Building once however many Mechanics are at work on it", () => {
    const match = stage();
    const barracks = building(match, 0, "barracks", 20, ROW, 100);
    const mechanics = [addTestUnit(match, 0, "mechanic", { x: 19, y: ROW }), addTestUnit(match, 0, "mechanic", { x: 22, y: ROW })];
    tend(match, mechanics, barracks);
    run(match, 3);
    expect(getPlayerView(match, 0).tends).toHaveLength(1);
  });

  it("shows the other Player a repair only while that Player can see the Building now, not while it is only remembered", () => {
    const match = stage();
    const barracks = building(match, 0, "barracks", 20, ROW, 100);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 19, y: ROW });
    tend(match, [mechanic], barracks);
    run(match, 3);
    expect(getPlayerView(match, 0).tends).toHaveLength(1);
    expect(getPlayerView(match, 1).tends).toEqual([]);
    // A Harvester of the other Player parks in sight of it: now that Player sees the repair too.
    const watcher = addTestUnit(match, 1, "harvester", { x: 21, y: ROW + 3 });
    issueCommand(match, 1, { type: "stop", unitIds: [watcher] });
    run(match, 3);
    expect(getPlayerView(match, 1).tends).toEqual(getPlayerView(match, 0).tends);
    expect(getPlayerView(match, 1).tends).toHaveLength(1);
    // It drives off: the Barracks is remembered, at the health last seen, and the repair is no longer shown.
    issueCommand(match, 1, { type: "move", unitIds: [watcher], target: { x: 21, y: ROW + 20 } });
    runUntil(match, () => getPlayerView(match, 1).buildings.find((b) => b.id === barracks)!.remembered);
    const lastSeen = buildingHp(match, 1, barracks);
    run(match, TICKS_PER_SECOND);
    expect(getPlayerView(match, 0).tends).toHaveLength(1);
    expect(getPlayerView(match, 1).tends).toEqual([]);
    expect(buildingHp(match, 1, barracks)).toBe(lastSeen);
    expect(buildingHp(match, 0, barracks)).toBeGreaterThan(lastSeen);
  });
});

describe("repairs and replays", () => {
  it("gives the same result from the same seed and Commands", () => {
    const play = (): string => {
      const match = stage();
      const mechanics = [addTestUnit(match, 0, "mechanic", { x: 14, y: ROW }), addTestUnit(match, 0, "mechanic", { x: 15, y: ROW + 3 })];
      const raider = hurt(match, 0, "raider", 22, ROW, 7);
      building(match, 0, "turret", 18, ROW + 5, 120);
      building(match, 0, "barracks", 10, ROW + 2, 300);
      tend(match, mechanics, raider);
      run(match, 2 * TICKS_PER_SECOND);
      issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 26, y: ROW + 2 } });
      const seen: string[] = [];
      for (let t = 0; t < 30 * TICKS_PER_SECOND; t++) {
        advanceTick(match);
        const view = getPlayerView(match, 0);
        seen.push(JSON.stringify([view.units, view.buildings, view.tends]));
      }
      return seen.join("\n");
    };
    expect(play()).toBe(play());
  });
});

describe("a Mechanic and a Harvester that drives off", () => {
  it("leaves it alone while it is beyond the seek radius, and Repairs it once it has stopped within it", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 14, y: ROW });
    const harvester = hurt(match, 0, "harvester", 15, ROW, 100);
    issueCommand(match, 0, { type: "stop", unitIds: [harvester] });
    runUntil(match, () => hp(match, harvester) > 100);
    // Faster than the Mechanic, and 14 Cells is well beyond the leash: the Mechanic is left behind.
    issueCommand(match, 0, { type: "move", unitIds: [harvester], target: { x: 29, y: ROW } });
    runUntil(match, () => at(match, harvester).x === 29.5);
    run(match, 5 * TICKS_PER_SECOND);
    const stood = at(match, mechanic);
    const left = hp(match, harvester);
    expect(left).toBeLessThan(UNIT_STATS.harvester.maxHp);
    expect(29.5 - stood.x).toBeGreaterThan(TEND.seekRadius);
    run(match, 5 * TICKS_PER_SECOND);
    expect(at(match, mechanic)).toEqual(stood);
    expect(hp(match, harvester)).toBe(left);
    // It drives back and parks 4 Cells from the Mechanic.
    issueCommand(match, 0, { type: "move", unitIds: [harvester], target: { x: Math.floor(stood.x) + 4, y: ROW } });
    runUntil(match, () => hp(match, harvester) === UNIT_STATS.harvester.maxHp);
    expect(at(match, harvester).x).toBe(Math.floor(stood.x) + 4.5);
  });
});
