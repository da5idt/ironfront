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
import { TROOP_CARRIER } from "./tuning";
import { addTestBuilding, addTestUnit, find, run, runUntil, setTestCredits, setTestUnitHp, stage } from "./testing/setup";
import { TEND } from "./tuning";

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
  const carrier = addTestUnit(match, 0, "troopCarrier", { x: stop.x - 8, y: stop.y });
  moveTo(match, [carrier], stop);
  return carrier;
}

describe("an empty Troop Carrier that finishes a move", () => {
  it("tells its Player of each Unit it takes when Collecting, where that Unit stood, as a Board by Command does", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(2, 0));
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: STOP.x - 8, y: STOP.y });
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
    // Far enough below where it will stop for the drive there to end in Collecting.
    const carrier = addTestUnit(match, 0, "troopCarrier", at(1, -1 + TROOP_CARRIER.collectAfterCells));
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
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
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
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
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
      const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
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
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
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
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
    expect(issueCommand(match, 0, { type: "attackMove", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => isAt(match, carrier, STOP));
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
  });

  it("does not collect when it finishes the move with a Passenger inside, nor after that Passenger gets out", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
    const passenger = addTestUnit(match, 0, "rifleman", at(-9, 0));
    expect(issueCommand(match, 0, { type: "board", unitIds: [passenger], targetId: carrier })).toEqual({ ok: true });
    run(match, 1);
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
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
    const passenger = addTestUnit(match, 0, "rifleman", at(-9, 0));
    const waiting = addTestUnit(match, 0, "rifleman", at(1, 0));
    // The move first: it sets off empty, and the Rifleman beside it gets in on the first Tick of the drive.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    expect(issueCommand(match, 0, { type: "board", unitIds: [passenger], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => isAt(match, carrier, STOP));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([passenger]);
    expect(isAt(match, waiting, at(1, 0))).toBe(true);
  });

  it("does not collect at the end of a move during which it Unloaded:neither those it put out nor anyone else", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
    const passenger = addTestUnit(match, 0, "rifleman", at(-9, 0));
    expect(issueCommand(match, 0, { type: "board", unitIds: [passenger], targetId: carrier })).toEqual({ ok: true });
    run(match, 1);
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

  it("does not collect at the end of a move during which its Passengers got out because it was hit", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
    const passenger = addTestUnit(match, 0, "medic", at(-9, 0));
    expect(issueCommand(match, 0, { type: "board", unitIds: [passenger], targetId: carrier })).toEqual({ ok: true });
    run(match, 1);
    // Unarmed, so nobody at the stop shoots back and the fight cannot change who stands there.
    const waiting = addTestUnit(match, 0, "medic", at(1, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    // Hit two Cells short of the stop, and the attacker walks off: the stop itself is quiet.
    runUntil(match, () => find(match, carrier)!.x >= COL - 2);
    const attacker = addTestUnit(match, 1, "rifleman", at(-2, 3));
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
    moveTo(match, [carrier], at(0, 8));
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
    // On into the next Cell: far less than the drive that makes it Collecting again.
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    run(match, A_WHILE);
    const after = find(match, carrier)!;
    expect(Math.floor(after.x)).not.toBe(Math.floor(before.x));
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(TROOP_CARRIER.collectAfterCells);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(find(match, rifleman)).toBeDefined();
  });

  it("is Collecting only where it stops at least the least drive from where the move began", () => {
    const match = stage();
    const least = TROOP_CARRIER.collectAfterCells;
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-least - 1, 0));
    const rifleman = addTestUnit(match, 0, "rifleman", at(-least, 1));
    // One Cell along: the Rifleman is beside it at both ends.
    moveTo(match, [carrier], at(-least, 0));
    run(match, A_WHILE);
    expect(passengerIds(match, carrier)).toEqual([]);
    // The least drive exactly, measured from where this move began, and he is still within its reach.
    const waiting = addTestUnit(match, 0, "rifleman", at(1, 0));
    moveTo(match, [carrier], STOP);
    expect(passengerIds(match, carrier)).toEqual([waiting]);
    expect(isAt(match, rifleman, at(-least, 1))).toBe(true);
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

  it("takes nobody when, on its way, it is sent to the Cell it has just reached", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", at(-3, 1));
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: STOP })).toEqual({ ok: true });
    runUntil(match, () => Math.floor(find(match, carrier)!.x) === COL - 3);
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: at(-3, 0) })).toEqual({ ok: true });
    run(match, A_WHILE);
    expect(Math.floor(find(match, carrier)!.x)).toBe(COL - 3);
    expect(passengerIds(match, carrier)).toEqual([]);
    expect(isAt(match, rifleman, at(-3, 1))).toBe(true);
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
    const carrier = addTestUnit(match, 0, "troopCarrier", at(-8, 0));
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
    addTestBuilding(match, 0, "vehicleFactory", { x: 10, y: 10 });
    const factory = getPlayerView(match, 0).buildings.find((b) => b.kind === "vehicleFactory")!.id;
    const rally = { x: 20, y: 14 };
    const beside = addTestUnit(match, 0, "rifleman", { x: 21, y: 14 });
    const below = addTestUnit(match, 0, "rifleman", { x: 20, y: 16 });
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
