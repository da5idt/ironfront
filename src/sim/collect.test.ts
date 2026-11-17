import { describe, expect, it } from "vitest";
import {
  advanceTick,
  type CellPos,
  createMatch,
  getPlayerView,
  issueCommand,
  type Match,
  TICKS_PER_SECOND,
  UNIT_STATS,
  type UnitView,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, find, LONG_DRIVE, run, runUntil, setTestCredits, setTestDriveFrom, setTestUnitHp, stage } from "./testing/setup";
import { BUILDING_STATS, TEND, TROOP_CARRIER } from "./tuning";

// Staged round Cell (20, 8) of a wide open Map, far from both starting bases in
// the corners, so only the Units put there take part.
const ROW = 8;
const COL = 20;
const STOP = { x: COL, y: ROW } as const;
/** The same Map with water ("~") in the Cells named. */
function stageWithWater(water: readonly CellPos[]): Match {
  const rows = Array.from({ length: 40 }, () => ".".repeat(50).split(""));
  for (const cell of water) rows[cell.y]![cell.x] = "~";
  return createMatch(testMap(rows.map((r) => r.join(""))), 1);
}
/** How many Cells before a stop the Troop Carriers staged here set off: a Drive well over long enough. */
const FAR_OFF = 2 * LONG_DRIVE;
/** How many rows off a Troop Carrier's row a Rifleman is put to hit it as it passes: within his range, out of its way. */
const IN_RANGE = Math.floor(UNIT_STATS.rifleman.range);
/** Long enough to show that a Troop Carrier which stands is not Collecting. */
const A_WHILE = 3 * TICKS_PER_SECOND;

const isAt = (match: Match, id: number, cell: CellPos): boolean => {
  const u = find(match, id);
  return u !== undefined && u.x === cell.x + 0.5 && u.y === cell.y + 0.5;
};

const passengerIds = (match: Match, carrier: number): number[] => find(match, carrier)!.passengers!.map((p) => p.id);

const at = (dx: number, dy: number): CellPos => ({ x: COL + dx, y: ROW + dy });

/** Sends Units to a Cell by a move Command and runs until the first of them stands on it. */
function moveTo(match: Match, unitIds: number[], target: CellPos): void {
  expect(issueCommand(match, 0, { type: "move", unitIds, target })).toEqual({ ok: true });
  runUntil(match, () => isAt(match, unitIds[0]!, target));
}

/**
 * Runs to the end of the last Tick before the one in which the Troop Carrier,
 * driving along its row over open ground, reaches `stop`.
 */
function runToTheTickBeforeItStops(match: Match, carrier: number, stop: CellPos = STOP): void {
  const step = UNIT_STATS.troopCarrier.speed / TICKS_PER_SECOND;
  runUntil(match, () => stop.x + 0.5 - find(match, carrier)!.x <= step + 1e-9);
  expect(isAt(match, carrier, stop)).toBe(false);
}

/** An empty Troop Carrier that has driven to `stop` from far enough off to be Collecting there, and stands, with whoever it Collected on stopping. */
function driveUp(match: Match, stop: CellPos = STOP): number {
  const carrier = addTestUnit(match, 0, "troopCarrier", { x: stop.x - FAR_OFF, y: stop.y });
  moveTo(match, [carrier], stop);
  return carrier;
}

/**
 * Sends the Troop Carrier along its row to STOP and runs until it is on its way and nearer the stop than a Drive
 * that ends in Collecting is long.
 */
function driveToShortOfStop(match: Match, carrier: number): void {
  expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
  runUntil(match, () => COL + 0.5 - find(match, carrier)!.x < TROOP_CARRIER.collectAfterCells);
  expect(isAt(match, carrier, STOP)).toBe(false);
}

/** A Troop Carrier a long Drive short of STOP on its row, with one Passenger who has just Boarded it. */
function carrierWithPassenger(match: Match, kind: "rifleman" | "medic" = "rifleman"): { carrier: number; passenger: number } {
  const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
  const passenger = addTestUnit(match, 0, kind, at(-FAR_OFF - 1, 0));
  expect(issueCommand(match, 0, { type: "board", unitIds: [passenger], targetId: carrier })).toEqual({ ok: true });
  run(match, 1);
  return { carrier, passenger };
}

describe("an empty Troop Carrier that finishes a move", () => {
  it("tells its Player of each Unit it takes when Collecting, where that Unit stood, as a Board by Command does", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(2, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => passengerIds(match, carrier).length === 1);
    expect(getPlayerView(match, 0).passengerEvents).toMatchObject([
      { type: "board", unitId: rifleman, kind: "rifleman", owner: 0, x: COL + 2 + 0.5, y: ROW + 0.5 },
    ]);
  });

  it("takes the nearest five of seven idle Riflemen, nearest first, and leaves two where they stand", () => {
    const match = stage();
    // Made in an order that is neither nearest first nor farthest first.
    const far0 = addTestUnit(match, 0, "rifleman", at(0, 2));
    const mid1 = addTestUnit(match, 0, "rifleman", at(1, 1));
    const near2 = addTestUnit(match, 0, "rifleman", at(-1, 0));
    const far3 = addTestUnit(match, 0, "rifleman", at(-2, 0));
    const near4 = addTestUnit(match, 0, "rifleman", at(0, -1));
    const mid5 = addTestUnit(match, 0, "rifleman", at(-1, -1));
    const near6 = addTestUnit(match, 0, "rifleman", at(1, 0));
    const carrier = driveUp(match);
    // In on the Tick it stops, from where they stand: nobody walks.
    expect(passengerIds(match, carrier)).toEqual([near2, near4, near6, mid1, mid5]);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([near2, near4, near6, mid1, mid5]);
    expect(isAt(match, far0, at(0, 2))).toBe(true);
    expect(isAt(match, far3, at(-2, 0))).toBe(true);
    expect(isAt(match, carrier, STOP)).toBe(true);
  });

  it("takes the lowest id first of two as near as each other, whatever order the Match keeps them in", () => {
    const match = stage();
    // Far enough below where it will stop for the Drive there to end in Collecting.
    const carrier = addTestUnit(match, 0, "troopCarrier", at(1, -1 + LONG_DRIVE));
    const low = addTestUnit(match, 0, "rifleman", at(0, -1));
    const high = addTestUnit(match, 0, "rifleman", at(2, -1));
    // Boarding and getting out again puts the lower id after the higher one among the Match's Units.
    expect(issueCommand(match, 0, { type: "board", unitIds: [low], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => passengerIds(match, carrier).length === 1);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    moveTo(match, [low], at(0, -1));
    // Straight up, it stops midway between the two.
    moveTo(match, [carrier], at(1, -1));
    expect(passengerIds(match, carrier)).toEqual([low, high]);
  });

  it("takes only own idle Infantry: no Vehicle, and nobody of the other Player's", () => {
    const match = stage();
    const raider = addTestUnit(match, 0, "raider", at(-1, 0));
    const medic = addTestUnit(match, 0, "medic", at(0, 2));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runToTheTickBeforeItStops(match, carrier);
    // Nearer than the own Medic, and put there this late so that it outlasts the Raider's fire to the stop.
    const theirs = addTestUnit(match, 1, "medic", at(1, 0));
    run(match, 1);
    expect(isAt(match, carrier, STOP)).toBe(true);
    expect(passengerIds(match, carrier)).toEqual([medic]);
    expect(isAt(match, theirs, at(1, 0))).toBe(true);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([medic]);
    expect(isAt(match, raider, at(-1, 0))).toBe(true);
  });

  it("never takes a Unit with a Command in progress, however near it walks", () => {
    const match = stage();
    const carrier = driveUp(match);
    const rifleman = addTestUnit(match, 0, "rifleman", at(-6, 1));
    expect(issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: at(6, 1) })).toEqual({ ok: true });
    let nearest = Infinity;
    runUntil(match, () => {
      const u = find(match, rifleman);
      if (u) nearest = Math.min(nearest, Math.hypot(u.x - (COL + 0.5), u.y - (ROW + 0.5)));
      return u === undefined || isAt(match, rifleman, at(6, 1));
    });
    // It passed through the Cell beside the Troop Carrier and walked on.
    expect(nearest).toBe(1);
    expect(isAt(match, rifleman, at(6, 1))).toBe(true);
    expect(passengerIds(match, carrier)).toEqual([]);
  });

  it("leaves a Unit that has a Command in progress on the Tick it stops, though it stands within reach", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(1, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runToTheTickBeforeItStops(match, carrier);
    expect(issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: at(1, 6) })).toEqual({ ok: true });
    run(match, 1);
    expect(isAt(match, carrier, STOP)).toBe(true);
    runUntil(match, () => isAt(match, rifleman, at(1, 6)));
    expect(passengerIds(match, carrier)).toEqual([]);
  });

  it("leaves a Medic at work on a Tend it began by itself, within reach, and the healing goes on", () => {
    const match = stage();
    // Two Cells from the stop, with the hurt Rifleman beside it and out of reach.
    const medic = addTestUnit(match, 0, "medic", at(2, 0));
    const hurt = addTestUnit(match, 0, "rifleman", at(3, 0));
    setTestUnitHp(match, hurt, 1);
    const carrier = driveUp(match);
    expect(find(match, hurt)!.hp).toBeLessThan(UNIT_STATS.rifleman.maxHp);
    expect(passengerIds(match, carrier)).toEqual([]);
    runUntil(match, () => find(match, hurt)!.hp === UNIT_STATS.rifleman.maxHp);
    expect(isAt(match, medic, at(2, 0))).toBe(true);
  });

  it("leaves alone a Medic that is walking to Tend by itself: that is a Tend in progress", () => {
    const match = stage();
    const carrier = driveUp(match);
    const medic = addTestUnit(match, 0, "medic", at(2, 1));
    const hurt = addTestUnit(match, 0, "rifleman", at(-3, -2));
    run(match, A_WHILE);
    // Both idle and beyond the Collecting radius: out of reach.
    expect(passengerIds(match, carrier)).toEqual([]);
    setTestUnitHp(match, hurt, 10);
    // The Medic's way to the hurt Rifleman runs past the Troop Carrier, and every Cell beside the Rifleman is out of reach.
    let nearest = Infinity;
    runUntil(match, () => {
      const u = find(match, medic);
      if (u) nearest = Math.min(nearest, Math.hypot(u.x - (COL + 0.5), u.y - (ROW + 0.5)));
      return u === undefined || find(match, hurt)!.hp === UNIT_STATS.rifleman.maxHp;
    });
    expect(nearest).toBeLessThan(1.5);
    expect(find(match, medic)).toBeDefined();
    expect(find(match, hurt)!.hp).toBe(UNIT_STATS.rifleman.maxHp);
    expect(passengerIds(match, carrier)).toEqual([]);
  });

  it("takes an idle Medic before it goes looking for someone to heal: about to work by itself is still idle", () => {
    // A Medic looks for work on one Tick in every few: each wait puts the stop on a different one of them.
    for (let wait = 0; wait < TEND.seekTicks; wait++) {
      const match = stage();
      const medic = addTestUnit(match, 0, "medic", at(1, 0));
      // In the Medic's sight and out of the Troop Carrier's reach.
      const rifleman = addTestUnit(match, 0, "rifleman", at(4, 0));
      const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
      run(match, wait);
      expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
      runToTheTickBeforeItStops(match, carrier);
      // Hurt just now: the Medic has had no Tick to see it.
      setTestUnitHp(match, rifleman, 10);
      run(match, 1);
      expect(passengerIds(match, carrier)).toEqual([medic]);
      run(match, A_WHILE);
      expect(find(match, rifleman)!.hp).toBe(10);
    }
  });

  it("leaves an idle Unit beyond the Collecting radius, and does not take it when it walks up to the parked Troop Carrier", () => {
    const match = stage();
    const radius = TROOP_CARRIER.collectRadius;
    const rifleman = addTestUnit(match, 0, "rifleman", at(-radius - 1, 0));
    const corner = addTestUnit(match, 0, "rifleman", at(radius, radius));
    const carrier = driveUp(match);
    run(match, 30 * TICKS_PER_SECOND);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(-radius - 1, 0))).toBe(true);
    // As far along as the Collecting radius and as far down: farther off than the radius.
    expect(isAt(match, corner, at(radius, radius))).toBe(true);
    // Sent to the Cell beside it: the person wants it there, not gone.
    moveTo(match, [rifleman], at(-1, 0));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(-1, 0))).toBe(true);
  });

  it("leaves an idle Unit that has no way on foot to it, though it stands within the Collecting radius", () => {
    // Water right across the Map, one row below the stop.
    const match = stageWithWater(Array.from({ length: 50 }, (_, x) => ({ x, y: ROW + 1 })));
    const rifleman = addTestUnit(match, 0, "rifleman", at(0, 2));
    const carrier = driveUp(match);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(0, 2))).toBe(true);
  });

  it("takes an idle Unit that has a short way on foot round what lies between them", () => {
    const match = stageWithWater([at(-1, 1), at(0, 1)]);
    // Two steps from a Cell beside the stop: along the water, then up past its end.
    const rifleman = addTestUnit(match, 0, "rifleman", at(0, 2));
    const carrier = driveUp(match);
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
  });

  it("takes nobody on a stop on which it lost health, nor afterwards", () => {
    const match = stage();
    // Within its reach, and out of the attacker's.
    const medic = addTestUnit(match, 0, "medic", at(-2, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runToTheTickBeforeItStops(match, carrier);
    addTestUnit(match, 1, "rifleman", at(3, 0));
    run(match, 1);
    expect(isAt(match, carrier, STOP)).toBe(true);
    expect(find(match, carrier)!.hp).toBeLessThan(UNIT_STATS.troopCarrier.maxHp);
    expect(passengerIds(match, carrier)).toEqual([]);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, medic, at(-2, 0))).toBe(true);
  });

  it("collects at the end of an Attack-move too", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(1, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "attackMove", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => isAt(match, carrier, STOP));
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
  });

  it("does not collect when it finishes the move with a Passenger inside, nor after that Passenger gets out", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match);
    const waiting = addTestUnit(match, 0, "rifleman", at(1, 0));
    moveTo(match, [carrier], STOP);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([passenger]);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, waiting, at(1, 0))).toBe(true);
  });

  it("does not collect at the end of a move it began empty when a Unit Boarded it on the way", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    const passenger = addTestUnit(match, 0, "rifleman", at(-FAR_OFF - 1, 0));
    const waiting = addTestUnit(match, 0, "rifleman", at(1, 0));
    // The move first: it sets off empty, and the Rifleman beside it gets in on the first Tick of the Drive.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    expect(issueCommand(match, 0, { type: "board", unitIds: [passenger], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => isAt(match, carrier, STOP));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([passenger]);
    expect(isAt(match, waiting, at(1, 0))).toBe(true);
  });

  it("does not collect at the end of a move on which it Unloaded just before the stop: neither those it put out nor anyone else", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match);
    const waiting = addTestUnit(match, 0, "rifleman", at(1, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runToTheTickBeforeItStops(match, carrier);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    // Out beside it, a step from where it stops.
    const out = find(match, passenger)!;
    expect(Math.hypot(out.x - (COL + 0.5), out.y - (ROW + 0.5))).toBeLessThan(TROOP_CARRIER.collectRadius);
    run(match, 1);
    expect(isAt(match, carrier, STOP)).toBe(true);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, passenger)).toMatchObject({ x: out.x, y: out.y });
    expect(isAt(match, waiting, at(1, 0))).toBe(true);
  });

  it("does not collect at the end of a move on which its Passengers got out near the stop because it was hit", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match, "medic");
    // Unarmed, so nobody at the stop shoots back and the fight cannot change who stands there.
    const waiting = addTestUnit(match, 0, "medic", at(1, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    // Hit too near the stop for the Drive from there to end in Collecting, and the attacker walks off: the stop itself is quiet.
    runUntil(match, () => COL + 0.5 - find(match, carrier)!.x < TROOP_CARRIER.collectAfterCells - 1);
    // Off its row, in the column it is in now: within a Rifleman's range of it, and not in its way.
    const attacker = addTestUnit(match, 1, "rifleman", { x: Math.floor(find(match, carrier)!.x), y: ROW + IN_RANGE });
    run(match, 1);
    expect(find(match, carrier)!.hp).toBeLessThan(UNIT_STATS.troopCarrier.maxHp);
    expect(isAt(match, carrier, STOP)).toBe(false);
    expect(find(match, passenger)).toBeDefined();
    expect(issueCommand(match, 1, { type: "move", unitIds: [attacker], target: at(-2, 20) })).toEqual({ ok: true });
    runUntil(match, () => isAt(match, carrier, STOP));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, passenger)).toBeDefined();
    expect(isAt(match, waiting, at(1, 0))).toBe(true);
  });

  it("is Collecting where it stops when an Unload on the way left it empty and it was sent on far enough from there", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match);
    // Beside the Cell it is sent on to, which is off its row and far from where it Unloads.
    const end = at(FAR_OFF, FAR_OFF);
    const waiting = addTestUnit(match, 0, "rifleman", { x: end.x + 1, y: end.y });
    // Unloaded about half way, with no stop Command, and sent on at once.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => find(match, carrier)!.x >= COL - FAR_OFF / 2);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    expect(passengerIds(match, carrier)).toEqual([]);
    moveTo(match, [carrier], end);
    expect(passengerIds(match, carrier)).toEqual([waiting]);
    expect(find(match, passenger)).toBeDefined();
  });

  it("is Collecting where it stops when a hit on the way emptied it far enough before the stop", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match, "medic");
    // Unarmed, so nobody at the stop shoots back and the fight cannot change who stands there.
    const waiting = addTestUnit(match, 0, "medic", at(1, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    // Hit more than a long enough Drive before the stop, and the attacker walks off: the stop itself is quiet.
    runUntil(match, () => find(match, carrier)!.x >= COL - LONG_DRIVE - 1);
    const attacker = addTestUnit(match, 1, "rifleman", at(-LONG_DRIVE - 1, IN_RANGE));
    run(match, 1);
    expect(find(match, carrier)!.hp).toBeLessThan(UNIT_STATS.troopCarrier.maxHp);
    expect(COL + 0.5 - find(match, carrier)!.x).toBeGreaterThan(TROOP_CARRIER.collectAfterCells);
    expect(find(match, passenger)).toBeDefined();
    expect(issueCommand(match, 1, { type: "move", unitIds: [attacker], target: at(-LONG_DRIVE - 1, 20) })).toEqual({ ok: true });
    runUntil(match, () => isAt(match, carrier, STOP));
    expect(passengerIds(match, carrier)).toEqual([waiting]);
    expect(find(match, passenger)).toBeDefined();
  });
});

describe("a Troop Carrier that has stopped and stands", () => {
  it("leaves out the Units it Unloads while it stands there, and collects again once it has driven off and stopped", () => {
    const match = stage();
    const first = addTestUnit(match, 0, "rifleman", at(-1, 0));
    const second = addTestUnit(match, 0, "rifleman", at(0, 1));
    const carrier = driveUp(match);
    expect(passengerIds(match, carrier)).toEqual([first, second]);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, first)).toBeDefined();
    expect(find(match, second)).toBeDefined();
    // A third that walks up now is left out as well: it only stands there.
    const third = addTestUnit(match, 0, "rifleman", at(5, 0));
    moveTo(match, [third], at(2, 0));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    // Off and back: all three are within the Collecting radius of where it stops again.
    moveTo(match, [carrier], at(0, FAR_OFF));
    expect(passengerIds(match, carrier)).toEqual([]);
    moveTo(match, [carrier], STOP);
    expect(passengerIds(match, carrier).sort()).toEqual([first, second, third]);
  });

  it("leaves out the Units that got out because it was hit, while it stands there", () => {
    const match = stage();
    const first = addTestUnit(match, 0, "rifleman", at(-1, 0));
    const second = addTestUnit(match, 0, "rifleman", at(0, 1));
    const carrier = driveUp(match);
    expect(passengerIds(match, carrier)).toEqual([first, second]);
    const attacker = addTestUnit(match, 1, "rifleman", at(3, 0));
    runUntil(match, () => find(match, carrier)!.hp < UNIT_STATS.troopCarrier.maxHp);
    expect(passengerIds(match, carrier)).toEqual([]);
    // The three of them see the attacker off, and nobody climbs back in afterwards.
    runUntil(match, () => find(match, attacker) === undefined);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, first)).toBeDefined();
    expect(find(match, second)).toBeDefined();
    expect(isAt(match, carrier, STOP)).toBe(true);
  });

  it("takes nobody when it is sent to the Cell it stands on: that is no move", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", STOP);
    const rifleman = addTestUnit(match, 0, "rifleman", at(-1, 0));
    expect(issueCommand(match, 0, { type: "board", unitIds: [rifleman], targetId: carrier })).toEqual({ ok: true });
    run(match, 1);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    for (const type of ["move", "attackMove"] as const) {
      expect(issueCommand(match, 0, { type, unitIds: [carrier], target: STOP })).toEqual({ ok: true });
      run(match, A_WHILE);
      expect(passengerIds(match, carrier)).toEqual([]);
    }
    expect(find(match, rifleman)).toBeDefined();
  });

  it("takes nobody back after a nudge into the next Cell: Units that got out stay out while it stands about there", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", at(4, 0));
    const rifleman = addTestUnit(match, 0, "rifleman", at(4, 1));
    expect(issueCommand(match, 0, { type: "board", unitIds: [rifleman], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => passengerIds(match, carrier).length === 1);
    // Stopped by a Command on its way, in the Cell before the stop and off its centre.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => find(match, carrier)!.x < COL + 1.5);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [carrier] })).toEqual({ ok: true });
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    run(match, A_WHILE);
    const before = find(match, carrier)!;
    expect(Math.floor(before.x)).toBe(COL + 1);
    expect(find(match, rifleman)).toBeDefined();
    // On into the next Cell: far less than the Drive that makes it Collecting again.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    run(match, A_WHILE);
    const after = find(match, carrier)!;
    expect(Math.floor(after.x)).not.toBe(Math.floor(before.x));
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(TROOP_CARRIER.collectAfterCells);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, rifleman)).toBeDefined();
  });

  describe("never takes back a Unit that has just got out, whichever way and however far one move takes it", () => {
    const WAYS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
    /** A Troop Carrier with every place taken, so that some get out onto the Cells touching its corners, the farthest there are. */
    function full(match: Match, cell: CellPos): number {
      // Four get out onto the Cells touching its sides first; with fewer than five nobody would stand cornerwise.
      expect(TROOP_CARRIER.capacity).toBeGreaterThan(4);
      const carrier = addTestUnit(match, 0, "troopCarrier", cell);
      const riflemen = Array.from({ length: TROOP_CARRIER.capacity }, (_, i) =>
        addTestUnit(match, 0, "rifleman", { x: cell.x + i - Math.floor(TROOP_CARRIER.capacity / 2), y: cell.y + 2 }),
      );
      expect(issueCommand(match, 0, { type: "board", unitIds: riflemen, targetId: carrier })).toEqual({ ok: true });
      runUntil(match, () => passengerIds(match, carrier).length === riflemen.length);
      return carrier;
    }
    /** Unloads it where `staged` leaves it, sends it each way by each number of Cells, and expects it to stand empty. */
    function expectNobodyTakenBack(staged: (match: Match) => number): void {
      for (const [dx, dy] of WAYS) {
        for (let cells = 1; cells <= LONG_DRIVE + 1; cells++) {
          const match = stage();
          const carrier = staged(match);
          expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
          expect(passengerIds(match, carrier)).toEqual([]);
          const from = find(match, carrier)!;
          const target = { x: Math.floor(from.x) + dx * cells, y: Math.floor(from.y) + dy * cells };
          // Round those standing in its way, so it may stop a Cell or two off; it stands again all the same.
          expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target })).toEqual({ ok: true });
          run(match, 1);
          runUntil(match, () => {
            const u = find(match, carrier)!;
            return u.x === u.prevX && u.y === u.prevY;
          });
          expect(passengerIds(match, carrier), `${cells} Cells by (${dx}, ${dy})`).toEqual([]);
        }
      }
    }

    it("when it Unloads standing on its Cell's centre", () => {
      expectNobodyTakenBack((match) => full(match, STOP));
    });

    it("when it Unloads on its way, at the corner of its Cell farthest from one of those who get out", () => {
      expectNobodyTakenBack((match) => {
        const carrier = full(match, STOP);
        // Cornerwise, so it leaves each Cell by its corner; caught on the last Tick before it does.
        const target = at(LONG_DRIVE, LONG_DRIVE);
        expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target })).toEqual({ ok: true });
        const step = UNIT_STATS.troopCarrier.speed / TICKS_PER_SECOND / Math.SQRT2;
        runUntil(match, () => find(match, carrier)!.x % 1 >= 1 - step);
        return carrier;
      });
    });
  });

  it("is Collecting only where it stops more than TROOP_CARRIER.collectAfterCells from where the move began", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-LONG_DRIVE - (LONG_DRIVE - 1), 0));
    // Beside where the first move ends, which is one Cell too short a Drive.
    const rifleman = addTestUnit(match, 0, "rifleman", at(-LONG_DRIVE, 1));
    moveTo(match, [carrier], at(-LONG_DRIVE, 0));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    // Long enough by less than a Cell, measured from where this move began.
    const waiting = addTestUnit(match, 0, "rifleman", at(1, 0));
    moveTo(match, [carrier], STOP);
    expect(passengerIds(match, carrier)).toEqual([waiting]);
    expect(isAt(match, rifleman, at(-LONG_DRIVE, 1))).toBe(true);
  });

  it("takes nobody at the end of a Drive of exactly TROOP_CARRIER.collectAfterCells: one put out the farthest way would be at its Collecting radius", () => {
    const match = stage();
    // At the Collecting radius exactly, where a Unit is still taken.
    const rifleman = addTestUnit(match, 0, "rifleman", at(TROOP_CARRIER.collectRadius, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    // A place that works out at exactly that far from the stop's centre: most do not, to the last digit, so a few
    // a little off the row are tried.
    const least = TROOP_CARRIER.collectAfterCells;
    const from = Array.from({ length: 1000 }, (_, i) => i / 1024)
      .map((dy) => ({ x: COL + 0.5 - Math.sqrt(least * least - dy * dy), y: ROW + 0.5 + dy }))
      .find((p) => Math.hypot(COL + 0.5 - p.x, ROW + 0.5 - p.y) === least)!;
    expect(from).toBeDefined();
    setTestDriveFrom(match, carrier, from);
    runUntil(match, () => isAt(match, carrier, STOP));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(TROOP_CARRIER.collectRadius, 0))).toBe(true);
  });

  it("does not take back those a partial Unload put out, at a stop near them, after a later Unload elsewhere emptied it", () => {
    // Water above and below the stop's Cell and the two beside it: there only two Passengers have a free Cell.
    const water: CellPos[] = [];
    for (let dx = -1; dx <= 1; dx++) water.push(at(dx, -1), at(dx, 1));
    const match = stageWithWater(water);
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    const riflemen = [1, 2, 3].map((i) => addTestUnit(match, 0, "rifleman", at(-FAR_OFF - i, 0)));
    expect(issueCommand(match, 0, { type: "board", unitIds: riflemen, targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => passengerIds(match, carrier).length === riflemen.length);
    // Sent far past the stop, and told to Unload as it crosses it: two get out, one stays in.
    const past = at(3 * LONG_DRIVE, 0);
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: past })).toEqual({ ok: true });
    runUntil(match, () => Math.floor(find(match, carrier)!.x) === COL);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    expect(passengerIds(match, carrier)).toHaveLength(1);
    const putOut = riflemen.filter((id) => find(match, id) !== undefined);
    expect(putOut.map((id) => Math.floor(find(match, id)!.x)).sort()).toEqual([COL - 1, COL + 1]);
    // Emptied well beyond them, with no stop, which begins a new Drive there.
    runUntil(match, () => find(match, carrier)!.x >= COL + 2 * LONG_DRIVE);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    expect(passengerIds(match, carrier)).toEqual([]);
    const emptiedAt = find(match, carrier)!.x;
    // Back to within its Collecting radius of one of the first two: a long Drive from where it was emptied.
    const back = at(2, 0);
    expect(emptiedAt - (back.x + 0.5)).toBeGreaterThan(TROOP_CARRIER.collectAfterCells);
    moveTo(match, [carrier], back);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    for (const id of riflemen) expect(find(match, id)).toBeDefined();
  });

  it("does not take back those it put out when it is nudged along and then sent a long Drive to a stop near them", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", STOP);
    const riflemen = [-1, 0, 1].map((dx) => addTestUnit(match, 0, "rifleman", at(dx, 2)));
    expect(issueCommand(match, 0, { type: "board", unitIds: riflemen, targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => passengerIds(match, carrier).length === riflemen.length);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    // One of them stands on its row, on the side it will come back to.
    const beside = riflemen.find((id) => isAt(match, id, at(1, 0)))!;
    expect(beside).toBeDefined();
    // Two Cells the other way, then a long Drive from there to a stop that has him at its Collecting radius.
    const nudged = at(-2, 0);
    const stop = at(1 + TROOP_CARRIER.collectRadius, 0);
    expect(stop.x - nudged.x).toBeGreaterThan(TROOP_CARRIER.collectAfterCells);
    moveTo(match, [carrier], nudged);
    moveTo(match, [carrier], stop);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, beside, at(1, 0))).toBe(true);
  });

  it("is Collecting again near where it put Passengers out once a Drive has ended far from there", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match);
    const start = at(-FAR_OFF, 0);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    expect(find(match, passenger)).toBeDefined();
    // Off empty to the stop, where nobody waits, and back: the second Drive ends beside the one it put out.
    moveTo(match, [carrier], STOP);
    expect(passengerIds(match, carrier)).toEqual([]);
    moveTo(match, [carrier], start);
    expect(passengerIds(match, carrier)).toEqual([passenger]);
  });

  it("is Collecting again near where it put Passengers out once a stop Command has ended a Drive far from there", () => {
    const match = stage();
    const { carrier, passenger } = carrierWithPassenger(match);
    const start = at(-FAR_OFF, 0);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    // Off empty and stopped by a Command a long Drive away, short of where it was sent.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: at(FAR_OFF, 0) })).toEqual({ ok: true });
    runUntil(match, () => find(match, carrier)!.x >= COL);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [carrier] })).toEqual({ ok: true });
    // Until it stands: sent back before that, it would still be on the Drive it set off on.
    run(match, A_WHILE);
    moveTo(match, [carrier], start);
    // Setting off from between two Cell centres, its last step can land on the centre a Tick before it stands.
    run(match, 1);
    expect(passengerIds(match, carrier)).toEqual([passenger]);
  });

  it("takes nobody when it is sent somewhere it has no way to and cannot leave its Cell", () => {
    // Two Cells of ground with water all round: the stop, and the Cell on the side away from where it is sent.
    const ring: CellPos[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 1; dx++) if (dy !== 0 || dx === -2 || dx === 1) ring.push(at(dx, dy));
    const match = stageWithWater(ring);
    const carrier = addTestUnit(match, 0, "troopCarrier", STOP);
    const rifleman = addTestUnit(match, 0, "rifleman", at(-1, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: at(10, 0) })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(isAt(match, carrier, STOP)).toBe(true);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(-1, 0))).toBe(true);
  });

  it("is Collecting where a long Drive ends although it was sent there again, by either Command, a little before the stop", () => {
    for (const again of ["move", "attackMove"] as const) {
      const match = stage();
      const rifleman = addTestUnit(match, 0, "rifleman", at(1, 0));
      const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
      // A second click on the same Cell, nearer the stop than collectAfterCells: the Drive is still the one from far off.
      driveToShortOfStop(match, carrier);
      expect(issueCommand(match, 0, { type: again, unitIds: [carrier], target: STOP })).toEqual({ ok: true });
      runUntil(match, () => isAt(match, carrier, STOP));
      expect(passengerIds(match, carrier), again).toEqual([rifleman]);
    }
  });

  it("measures a Drive from where it last stood: a stop Command on the way ends the Drive", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(1, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    driveToShortOfStop(match, carrier);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [carrier] })).toEqual({ ok: true });
    moveTo(match, [carrier], STOP);
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(1, 0))).toBe(true);
  });

  it("takes nobody at the end of a Drive out and back that ends a Cell from where it began, however far it went", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", STOP);
    const rifleman = addTestUnit(match, 0, "rifleman", at(1, 1));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: at(2 * FAR_OFF, 0) })).toEqual({ ok: true });
    // Turned round by a Command, with no stop, once it is far out.
    runUntil(match, () => find(match, carrier)!.x >= COL + FAR_OFF);
    moveTo(match, [carrier], at(1, 0));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(1, 1))).toBe(true);
  });

  it("is Collecting when, on a long enough Drive, it is sent to the Cell it has just reached", () => {
    const match = stage();
    // A long enough Drive short of the Cell it was first sent to.
    const reached = at(LONG_DRIVE - FAR_OFF, 0);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: reached.x, y: reached.y + 1 });
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => Math.floor(find(match, carrier)!.x) === reached.x);
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: reached })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(isAt(match, carrier, reached)).toBe(true);
    // The Drive began where it last stood, not where the second Command found it.
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
  });

  it("takes nobody who walks up after a Command that leaves it standing", () => {
    const match = stage();
    const stopped = driveUp(match);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [stopped] })).toEqual({ ok: true });
    const one = addTestUnit(match, 0, "rifleman", at(4, 0));
    moveTo(match, [one], at(1, 0));
    run(match, A_WHILE);
    expect(passengerIds(match, stopped)).toEqual([]);
    expect(isAt(match, one, at(1, 0))).toBe(true);
  });

  it("still collects where it stops after a Command on the way that was rejected", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(1, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-FAR_OFF, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    run(match, 10);
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: 999, y: 0 } }).ok).toBe(false);
    runUntil(match, () => isAt(match, carrier, STOP));
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
  });

  it("leaves a Mechanic that was told to Repair it on the Map when the Repair is done", () => {
    const match = stage();
    const carrier = driveUp(match);
    setTestUnitHp(match, carrier, UNIT_STATS.troopCarrier.maxHp - 30);
    const mechanic = addTestUnit(match, 0, "mechanic", at(4, 0));
    expect(issueCommand(match, 0, { type: "tend", unitIds: [mechanic], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => find(match, carrier)!.hp === UNIT_STATS.troopCarrier.maxHp);
    run(match, A_WHILE);
    expect(find(match, mechanic)).toBeDefined();
    expect(passengerIds(match, carrier)).toEqual([]);
  });

  it("lets an idle Medic that was sent beside it go and heal by itself", () => {
    const match = stage();
    const carrier = driveUp(match);
    const medic = addTestUnit(match, 0, "medic", at(5, 0));
    const rifleman = addTestUnit(match, 0, "rifleman", at(4, 2));
    moveTo(match, [medic], at(1, 0));
    run(match, A_WHILE);
    setTestUnitHp(match, rifleman, 10);
    runUntil(match, () => find(match, rifleman)!.hp === UNIT_STATS.rifleman.maxHp);
    expect(find(match, medic)).toBeDefined();
    expect(passengerIds(match, carrier)).toEqual([]);
  });

  it("does not take the Units another Troop Carrier Unloads beside it", () => {
    const match = stage();
    const first = addTestUnit(match, 0, "rifleman", at(-1, 0));
    const second = addTestUnit(match, 0, "rifleman", at(0, 1));
    const carrier = driveUp(match);
    expect(passengerIds(match, carrier)).toEqual([first, second]);
    // A second one stops empty a Cell away: nobody is left for it.
    const other = driveUp(match, at(1, 0));
    expect(passengerIds(match, other)).toEqual([]);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(passengerIds(match, other)).toEqual([]);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, first)).toBeDefined();
    expect(find(match, second)).toBeDefined();
  });

  it("takes nobody after it was hit where it stood empty", () => {
    const match = stage();
    const carrier = driveUp(match);
    addTestUnit(match, 1, "rifleman", at(3, 0));
    runUntil(match, () => find(match, carrier)!.hp < UNIT_STATS.troopCarrier.maxHp);
    // Out of the attacker's reach, idle and beside the Troop Carrier.
    const medic = addTestUnit(match, 0, "medic", at(-1, 0));
    for (let t = 0; t < A_WHILE; t++) {
      advanceTick(match);
      expect(passengerIds(match, carrier)).toEqual([]);
    }
    expect(isAt(match, medic, at(-1, 0))).toBe(true);
  });
});

describe("a newly trained Troop Carrier", () => {
  it("collects at its rally point like any other", () => {
    const match = createMatch(openMap(30, 30), 1);
    const site = { x: 10, y: 10 };
    addTestBuilding(match, 0, "vehicleFactory", site);
    const factory = getPlayerView(match, 0).buildings.find((b) => b.kind === "vehicleFactory")!.id;
    // Farther from the Vehicle Factory's far edge than a Drive that ends in Collecting is long, wherever beside it the new Unit appears.
    const rally = { x: site.x + BUILDING_STATS.vehicleFactory.width + LONG_DRIVE + 1, y: site.y + LONG_DRIVE };
    const beside = addTestUnit(match, 0, "rifleman", { x: rally.x + 1, y: rally.y });
    const below = addTestUnit(match, 0, "rifleman", { x: rally.x, y: rally.y + TROOP_CARRIER.collectRadius });
    setTestCredits(match, 0, UNIT_STATS.troopCarrier.cost);
    expect(issueCommand(match, 0, { type: "setRallyPoint", buildingId: factory, target: rally })).toEqual({ ok: true });
    expect(issueCommand(match, 0, { type: "train", buildingId: factory, kind: "troopCarrier" })).toEqual({ ok: true });
    const carrier = (): UnitView | undefined => getPlayerView(match, 0).units.find((u) => u.kind === "troopCarrier");
    runUntil(match, () => carrier() !== undefined && carrier()!.x === rally.x + 0.5 && carrier()!.y === rally.y + 0.5);
    expect(carrier()!.passengers!.map((p) => p.id)).toEqual([beside, below]);
  });
});

describe("collecting", () => {
  it("plays out the same from the same seed and Commands", () => {
    const play = (): { seen: string; most: number } => {
      const match = createMatch(openMap(50, 40), 7);
      const kinds = ["rifleman", "medic", "rifleman", "rifleman", "medic", "rifleman", "rifleman"] as const;
      kinds.forEach((kind, i) => addTestUnit(match, 0, kind, at(-2 + (i % 4), -1 + Math.floor(i / 4) * 2)));
      const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
      const second = addTestUnit(match, 0, "troopCarrier", at(8, 1));
      issueCommand(match, 0, { type: "move", unitIds: [carrier, second], target: STOP });
      const attacker = addTestUnit(match, 1, "rifleman", at(12, 0));
      issueCommand(match, 1, { type: "attackMove", unitIds: [attacker], target: STOP });
      let most = 0;
      for (let t = 0; t < 12 * TICKS_PER_SECOND; t++) {
        advanceTick(match);
        most = Math.max(most, passengerIds(match, carrier).length + passengerIds(match, second).length);
      }
      return { seen: JSON.stringify([getPlayerView(match, 0), getPlayerView(match, 1)]), most };
    };
    const first = play();
    expect(play()).toEqual(first);
    // All seven were collected between the two, or the same result would say little.
    expect(first.most).toBe(7);
  });
});
