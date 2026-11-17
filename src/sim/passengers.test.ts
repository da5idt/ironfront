import { describe, expect, it } from "vitest";
import {
  advanceTick,
  type CellPos,
  createMatch,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
  UNIT_STATS,
  type UnitKind,
  type UnitView,
} from "./index";
import { openMap, testMap } from "./testing/maps";
import {
  addTestBuilding,
  addTestUnit,
  find,
  LONG_DRIVE,
  removeTestBuilding,
  run,
  runUntil,
  setTestBuildingHp,
  setTestUnitHp,
  snapshot,
  stage,
} from "./testing/setup";
import { TEND } from "./tuning";

// Staged round Cell (20, 8) of a wide open Map, far from both starting bases in
// the corners, so only the Units put there take part.
const ROW = 8;
const COL = 20;
const cellOf = (u: UnitView) => ({ x: Math.floor(u.x), y: Math.floor(u.y) });

/** True when the Unit stands in a Cell touching the other's Cell, corners included, and not in it. */
function isBeside(match: Match, id: number, otherId: number): boolean {
  const a = cellOf(find(match, id)!);
  const b = cellOf(find(match, otherId)!);
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  return d === 1;
}

/** The Passengers of a Troop Carrier as its owner sees them. */
const passengers = (match: Match, carrier: number) => find(match, carrier)!.passengers!;
const passengerIds = (match: Match, carrier: number): number[] => passengers(match, carrier).map((p) => p.id);

const board = (match: Match, unitIds: number[], targetId: number, player: PlayerId = 0) =>
  issueCommand(match, player, { type: "board", unitIds, targetId });
const unload = (match: Match, unitIds: number[], player: PlayerId = 0) =>
  issueCommand(match, player, { type: "unload", unitIds });

/** The eight Cells beside (COL, ROW), the two to the left and right first. */
const BESIDE = [
  { x: COL - 1, y: ROW },
  { x: COL + 1, y: ROW },
  { x: COL, y: ROW - 1 },
  { x: COL, y: ROW + 1 },
  { x: COL - 1, y: ROW - 1 },
  { x: COL + 1, y: ROW - 1 },
  { x: COL - 1, y: ROW + 1 },
  { x: COL + 1, y: ROW + 1 },
] as const;

/** A Troop Carrier at (COL, ROW) with these kinds inside, in this order. Returns the carrier's id and theirs. */
function withPassengers(match: Match, kinds: readonly UnitKind[], owner: PlayerId = 0): { carrier: number; boarded: number[] } {
  const carrier = addTestUnit(match, owner, "troopCarrier", { x: COL, y: ROW });
  const boarded: number[] = [];
  for (const kind of kinds) {
    // One at a time from the same Cell beside it, so the order they are inside in is known.
    const id = addTestUnit(match, owner, kind, BESIDE[0]);
    expect(board(match, [id], carrier, owner)).toEqual({ ok: true });
    run(match, 1);
    boarded.push(id);
  }
  expect(passengerIds(match, carrier)).toEqual(boarded);
  return { carrier, boarded };
}

const FIVE = ["rifleman", "rifleman", "rifleman", "rifleman", "rifleman"] as const;

describe("Board", () => {
  it("walks Infantry to an own Troop Carrier and takes them in when beside it: off the view's Units, in the owner's Passengers", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: COL - 6, y: ROW });
    expect(passengers(match, carrier)).toEqual([]);
    expect(board(match, [rifleman], carrier)).toEqual({ ok: true });
    run(match, 1);
    // Still walking: six Cells off, it is not inside on the Tick of the Command.
    expect(find(match, rifleman)).toBeDefined();
    expect(passengers(match, carrier)).toEqual([]);
    runUntil(match, () => find(match, rifleman) === undefined);
    expect(passengers(match, carrier)).toEqual([{ id: rifleman, kind: "rifleman" }]);
    expect(getPlayerView(match, 0).units.some((u) => u.id === rifleman)).toBe(false);
    // The Troop Carrier did not move to fetch it.
    expect(find(match, carrier)).toMatchObject({ x: COL + 0.5, y: ROW + 0.5 });
  });

  it("takes five Infantry of any kind; a sixth stops beside the Troop Carrier", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const infantry = (["rifleman", "medic", "rifleman", "medic", "rifleman", "rifleman"] as const).map((kind, i) =>
      addTestUnit(match, 0, kind, { x: COL - 4 - i, y: ROW + 1 }),
    );
    expect(board(match, infantry, carrier)).toEqual({ ok: true });
    runUntil(match, () => passengers(match, carrier).length === 5);
    // Nearest arrive first, so the one that began farthest off is left out.
    expect(passengerIds(match, carrier)).toEqual(infantry.slice(0, 5));
    expect(passengers(match, carrier).map((p) => p.kind)).toEqual(["rifleman", "medic", "rifleman", "medic", "rifleman"]);
    const sixth = infantry[5]!;
    runUntil(match, () => isBeside(match, sixth, carrier));
    // It stops in the Cell it was stepping into: one Cell takes a Rifleman under a second.
    run(match, 20);
    const stoodAt = { x: find(match, sixth)!.x, y: find(match, sixth)!.y };
    expect(stoodAt).toEqual({ x: COL - 1 + 0.5, y: ROW + 1 + 0.5 });
    run(match, 60);
    expect(find(match, sixth)).toMatchObject(stoodAt);
    expect(isBeside(match, sixth, carrier)).toBe(true);
    expect(passengers(match, carrier)).toHaveLength(5);
  });

  it("shows the other Player a Troop Carrier with no Passengers to count", () => {
    const match = stage();
    const { carrier } = withPassengers(match, FIVE);
    addTestUnit(match, 1, "harvester", { x: COL + 3, y: ROW });
    run(match, 1);
    const seen = getPlayerView(match, 1).units.find((u) => u.id === carrier)!;
    expect(seen.kind).toBe("troopCarrier");
    expect(seen.passengers).toBeNull();
    // And no Passenger is in either view's Units, even standing in sight.
    expect(getPlayerView(match, 1).units.filter((u) => u.owner === 0)).toHaveLength(1);
    // An empty one looks just the same to the other Player.
    const empty = stage();
    const bare = addTestUnit(empty, 0, "troopCarrier", { x: COL, y: ROW });
    addTestUnit(empty, 1, "harvester", { x: COL + 3, y: ROW });
    run(empty, 1);
    expect({ ...seen, id: bare }).toEqual(getPlayerView(empty, 1).units.find((u) => u.id === bare));
  });

  it("is rejected, with the Match unchanged, for Vehicles as Passengers, another Player's Troop Carrier, or a target that is not a Troop Carrier", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const raider = addTestUnit(match, 0, "raider", { x: COL - 3, y: ROW });
    const second = addTestUnit(match, 0, "troopCarrier", { x: COL - 3, y: ROW + 2 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: COL - 2, y: ROW - 2 });
    const theirs = addTestUnit(match, 1, "troopCarrier", { x: COL + 2, y: ROW });
    const before = snapshot(match);
    expect(board(match, [raider], carrier).ok).toBe(false);
    expect(board(match, [second], carrier).ok).toBe(false);
    expect(board(match, [rifleman], theirs).ok).toBe(false);
    expect(board(match, [rifleman], raider).ok).toBe(false);
    expect(board(match, [rifleman], rifleman).ok).toBe(false);
    expect(board(match, [rifleman], 9999).ok).toBe(false);
    expect(board(match, [], carrier).ok).toBe(false);
    // The other Player's Units are not this Player's to send.
    expect(board(match, [rifleman], theirs, 1).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    run(match, 40);
    expect(find(match, rifleman)).toMatchObject({ x: COL - 2 + 0.5, y: ROW - 2 + 0.5 });
  });

  it("gives the same reason for a Troop Carrier of the other Player seen or unseen, so a rejection tells nothing of what is out of sight", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", { x: COL, y: ROW });
    const seen = addTestUnit(match, 1, "troopCarrier", { x: COL + 2, y: ROW });
    const unseen = addTestUnit(match, 1, "troopCarrier", { x: COL + 25, y: ROW + 20 });
    expect(getPlayerView(match, 0).units.some((u) => u.id === unseen)).toBe(false);
    const reason = board(match, [rifleman], seen);
    expect(reason.ok).toBe(false);
    expect(board(match, [rifleman], unseen)).toEqual(reason);
    expect(board(match, [rifleman], 9999)).toEqual(reason);
  });

  it("leaves Vehicles in the Command where they are and Boards the Infantry", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const raider = addTestUnit(match, 0, "raider", { x: COL - 3, y: ROW });
    const medic = addTestUnit(match, 0, "medic", { x: COL - 2, y: ROW + 1 });
    expect(board(match, [raider, medic], carrier)).toEqual({ ok: true });
    runUntil(match, () => passengers(match, carrier).length === 1);
    expect(passengers(match, carrier)).toEqual([{ id: medic, kind: "medic" }]);
    expect(find(match, raider)).toMatchObject({ x: COL - 3 + 0.5, y: ROW + 0.5 });
  });

  it("follows a Troop Carrier that drives off, and gets in where it stops", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: COL - 5, y: ROW });
    board(match, [rifleman], carrier);
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: COL + 8, y: ROW + 3 } });
    runUntil(match, () => find(match, rifleman) === undefined);
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
    expect(find(match, carrier)).toMatchObject({ x: COL + 8.5, y: ROW + 3.5 });
  });

  it("ends, leaving the Unit where it is, when the Troop Carrier is destroyed on the way", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const medic = addTestUnit(match, 0, "medic", { x: COL - 8, y: ROW });
    setTestUnitHp(match, carrier, 1);
    board(match, [medic], carrier);
    addTestUnit(match, 1, "rifleman", { x: COL + 3, y: ROW });
    runUntil(match, () => find(match, carrier) === undefined);
    run(match, 2);
    const stoodAt = { x: find(match, medic)!.x, y: find(match, medic)!.y };
    run(match, 40);
    expect(find(match, medic)).toMatchObject(stoodAt);
  });
});

describe("Unload", () => {
  it("puts every Passenger on a free Cell beside the Troop Carrier, nearest first, where they stand idle", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman", "medic", "rifleman", "rifleman", "medic"]);
    expect(unload(match, [carrier])).toEqual({ ok: true });
    expect(passengers(match, carrier)).toEqual([]);
    const cells = boarded.map((id) => cellOf(find(match, id)!));
    // The four Cells sharing an edge are nearer than the corners, so they fill first.
    expect(new Set(cells.slice(0, 4).map((c) => `${c.x},${c.y}`))).toEqual(
      new Set(BESIDE.slice(0, 4).map((c) => `${c.x},${c.y}`)),
    );
    expect(Math.abs(cells[4]!.x - COL) === 1 && Math.abs(cells[4]!.y - ROW) === 1).toBe(true);
    for (const id of boarded) {
      const u = find(match, id)!;
      // In the middle of its Cell, with no slide drawn from where it got in.
      expect([u.x % 1, u.y % 1, u.prevX, u.prevY]).toEqual([0.5, 0.5, u.x, u.y]);
    }
    expect(boarded.map((id) => find(match, id)!.kind)).toEqual(["rifleman", "medic", "rifleman", "rifleman", "medic"]);
    const before = boarded.map((id) => ({ x: find(match, id)!.x, y: find(match, id)!.y }));
    run(match, 60);
    expect(boarded.map((id) => ({ x: find(match, id)!.x, y: find(match, id)!.y }))).toEqual(before);
    expect(passengers(match, carrier)).toEqual([]);
  });

  it("carries its Passengers with it: they get out where the Troop Carrier has driven to, with the health they got in with", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", BESIDE[0]);
    setTestUnitHp(match, rifleman, 23);
    board(match, [rifleman], carrier);
    run(match, 1);
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: COL + 14, y: ROW + 6 } });
    runUntil(match, () => find(match, carrier)!.x === COL + 14.5 && find(match, carrier)!.y === ROW + 6.5);
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
    unload(match, [carrier]);
    // Of the four nearest Cells, as near as each other, the first row by row: the one above.
    expect(find(match, rifleman)).toMatchObject({ hp: 23, x: COL + 14.5, y: ROW + 5.5 });
  });

  it("leaves inside the Passengers that have no free Cell: a Cell with a Unit in it is not free", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE);
    // Five of the eight Cells beside it are held, one of them by the other Player.
    for (const cell of BESIDE.slice(0, 4)) addTestUnit(match, 0, "medic", cell);
    const theirs = addTestUnit(match, 1, "harvester", BESIDE[4]);
    issueCommand(match, 1, { type: "stop", unitIds: [theirs] });
    expect(unload(match, [carrier])).toEqual({ ok: true });
    expect(passengerIds(match, carrier)).toEqual(boarded.slice(3));
    const out = boarded.slice(0, 3).map((id) => cellOf(find(match, id)!));
    expect(new Set(out.map((c) => `${c.x},${c.y}`))).toEqual(new Set(BESIDE.slice(5).map((c) => `${c.x},${c.y}`)));
    // With every Cell held, nobody gets out and the Command is still taken.
    expect(unload(match, [carrier])).toEqual({ ok: true });
    expect(passengerIds(match, carrier)).toEqual(boarded.slice(3));
  });

  it("does not count rock, water or a Building as a free Cell", () => {
    // A pocket of open ground three Cells long, walled by rock and water, in the middle of the Map.
    const rows = Array.from({ length: 40 }, () => ".".repeat(50).split(""));
    for (let y = ROW - 1; y <= ROW + 1; y++) for (let x = COL - 2; x <= COL + 2; x++) rows[y]![x] = y === ROW ? "~" : "#";
    for (const x of [COL - 1, COL, COL + 1]) rows[ROW]![x] = ".";
    const match = createMatch(testMap(rows.map((r) => r.join(""))), 1);
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const boarded = [0, 1, 2].map(() => {
      const id = addTestUnit(match, 0, "rifleman", { x: COL - 1, y: ROW });
      board(match, [id], carrier);
      run(match, 1);
      return id;
    });
    expect(passengerIds(match, carrier)).toEqual(boarded);
    addTestBuilding(match, 0, "turret", { x: COL + 1, y: ROW });
    unload(match, [carrier]);
    expect(passengerIds(match, carrier)).toEqual(boarded.slice(1));
    expect(find(match, boarded[0]!)).toMatchObject({ x: COL - 1 + 0.5, y: ROW + 0.5 });
  });

  it("empties each Troop Carrier named, and is rejected, with the Match unchanged, when none of the Units is an own Troop Carrier", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman", "medic"]);
    const raider = addTestUnit(match, 0, "raider", { x: COL - 4, y: ROW });
    const before = snapshot(match);
    expect(unload(match, [raider]).ok).toBe(false);
    expect(unload(match, []).ok).toBe(false);
    expect(unload(match, [carrier], 1).ok).toBe(false);
    expect(unload(match, boarded).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    expect(unload(match, [raider, carrier])).toEqual({ ok: true });
    expect(passengers(match, carrier)).toEqual([]);
  });

  it("is rejected, with the Match unchanged, when no Troop Carrier named has a Passenger, and accepted when one of them has", () => {
    const match = stage();
    const { carrier } = withPassengers(match, ["rifleman"]);
    const empty = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW + 6 });
    const before = snapshot(match);
    expect(unload(match, [empty]).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    expect(unload(match, [empty, carrier])).toEqual({ ok: true });
    expect(passengers(match, carrier)).toEqual([]);
    const after = snapshot(match);
    expect(unload(match, [empty, carrier]).ok).toBe(false);
    expect(snapshot(match)).toBe(after);
  });

  it("lets a Unit that got out Board again", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman"]);
    unload(match, [carrier]);
    expect(board(match, boarded, carrier)).toEqual({ ok: true });
    run(match, 1);
    expect(passengerIds(match, carrier)).toEqual(boarded);
  });
});

describe("a Troop Carrier with Passengers that is hit", () => {
  it("Unloads its Passengers on that Tick, and the Riflemen that got out defend themselves", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman", "rifleman", "medic", "rifleman", "rifleman"]);
    const enemy = addTestUnit(match, 1, "rifleman", { x: COL + 3, y: ROW });
    expect(passengers(match, carrier)).toHaveLength(5);
    run(match, 1);
    expect(find(match, carrier)!.hp).toBe(UNIT_STATS.troopCarrier.maxHp - UNIT_STATS.rifleman.damage);
    expect(passengers(match, carrier)).toEqual([]);
    for (const id of boarded) expect(isBeside(match, id, carrier)).toBe(true);
    // The Troop Carrier's own gun fired on that Tick; the Riflemen, out by the end of it, fire on the next.
    expect(find(match, enemy)!.hp).toBe(UNIT_STATS.rifleman.maxHp - UNIT_STATS.troopCarrier.damage);
    run(match, 1);
    const shooters = getPlayerView(match, 0).shots.map((s) => `${s.fromX},${s.fromY}`);
    const inRange = boarded
      .map((id) => find(match, id)!)
      .filter((u) => u.kind === "rifleman" && Math.hypot(u.x - (COL + 3.5), u.y - (ROW + 0.5)) <= UNIT_STATS.rifleman.range);
    expect(inRange.length).toBeGreaterThanOrEqual(2);
    for (const u of inRange) expect(shooters).toContain(`${u.x},${u.y}`);
    expect(find(match, enemy)!.hp).toBe(
      UNIT_STATS.rifleman.maxHp - UNIT_STATS.troopCarrier.damage - inRange.length * UNIT_STATS.rifleman.damage,
    );
  });

  it("keeps its Passengers in while nothing hits it, and cannot have them hit inside it", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE);
    // In sight of the other Player, out of range of everything.
    const watcher = addTestUnit(match, 1, "rifleman", { x: COL + 5, y: ROW });
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: COL, y: ROW } });
    run(match, 30);
    expect(passengerIds(match, carrier)).toEqual(boarded);
    expect(getPlayerView(match, 1).units.some((u) => u.id === carrier)).toBe(true);
    // A Passenger is nothing the other Player can see, so it is no target.
    const before = snapshot(match);
    expect(issueCommand(match, 1, { type: "attack", unitIds: [watcher], targetId: boarded[0]! }).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
  });

  it("is destroyed after its Passengers got out, when there are free Cells beside it", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE);
    setTestUnitHp(match, carrier, 1);
    addTestUnit(match, 1, "rifleman", { x: COL + 3, y: ROW });
    run(match, 1);
    expect(find(match, carrier)).toBeUndefined();
    for (const id of boarded) expect(find(match, id)).toMatchObject({ hp: UNIT_STATS.rifleman.maxHp });
  });

  it("takes its Passengers with it when it is destroyed with no free Cell beside it", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE);
    const crowd = BESIDE.map((cell) => addTestUnit(match, 0, "medic", cell));
    setTestUnitHp(match, carrier, 1);
    const enemy = addTestUnit(match, 1, "rifleman", { x: COL + 4, y: ROW });
    expect(issueCommand(match, 1, { type: "attack", unitIds: [enemy], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => find(match, carrier) === undefined);
    for (const id of boarded) expect(find(match, id)).toBeUndefined();
    expect(getPlayerView(match, 0).units.filter((u) => u.owner === 0 && u.kind === "rifleman" && u.x > 10)).toEqual([]);
    for (const id of crowd) expect(find(match, id)).toBeDefined();
    // They do not come back later.
    run(match, 40);
    for (const id of boarded) expect(find(match, id)).toBeUndefined();
  });

  it("loses only the Passengers with no free Cell when it is destroyed with some Cells free", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE);
    for (const cell of BESIDE.slice(0, 6)) addTestUnit(match, 0, "medic", cell);
    setTestUnitHp(match, carrier, 1);
    const enemy = addTestUnit(match, 1, "rifleman", { x: COL + 4, y: ROW });
    issueCommand(match, 1, { type: "attack", unitIds: [enemy], targetId: carrier });
    runUntil(match, () => find(match, carrier) === undefined);
    expect(boarded.map((id) => find(match, id) !== undefined)).toEqual([true, true, false, false, false]);
  });
});

describe("a Passenger", () => {
  it("takes no Command while inside and is no target: such Commands are rejected with the Match unchanged", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman", "medic"]);
    const [rifleman, medic] = boarded as [number, number];
    const outside = addTestUnit(match, 0, "rifleman", { x: COL - 4, y: ROW });
    setTestUnitHp(match, outside, 20);
    const medicOutside = addTestUnit(match, 0, "medic", { x: COL - 5, y: ROW + 3 });
    // In sight and in reach, so nothing but being inside stands in a Passenger's way.
    const enemy = addTestUnit(match, 1, "harvester", { x: COL + 3, y: ROW });
    const before = snapshot(match);
    const target = { x: COL + 9, y: ROW };
    expect(issueCommand(match, 0, { type: "move", unitIds: boarded, target }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "attackMove", unitIds: boarded, target }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "attack", unitIds: [rifleman], targetId: enemy }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [medic], targetId: outside }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "stop", unitIds: boarded }).ok).toBe(false);
    expect(board(match, boarded, carrier).ok).toBe(false);
    expect(unload(match, boarded).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [medicOutside], targetId: rifleman }).ok).toBe(false);
    expect(board(match, [medicOutside], rifleman).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
  });

  it("stays inside when a Command names it along with Units on the Map, which do as they are told", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman", "medic"]);
    const outside = addTestUnit(match, 0, "rifleman", { x: COL - 4, y: ROW });
    expect(issueCommand(match, 0, { type: "move", unitIds: [...boarded, outside], target: { x: COL - 9, y: ROW } })).toEqual({ ok: true });
    runUntil(match, () => find(match, outside)!.x === COL - 9 + 0.5);
    expect(passengerIds(match, carrier)).toEqual(boarded);
    expect(find(match, carrier)).toMatchObject({ x: COL + 0.5, y: ROW + 0.5 });
  });

  it("gets no fresh reload from being a Passenger: a Rifleman that fired, got in and got out does not fire again at once", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", BESIDE[0]);
    // In the Rifleman's range from where it stands and from where it will get out; unarmed, so nothing hits the Troop Carrier.
    addTestUnit(match, 1, "medic", { x: COL + 2, y: ROW });
    const shotsBy = (id: number): number => {
      const u = find(match, id)!;
      return getPlayerView(match, 0).shots.filter((shot) => shot.fromX === u.x && shot.fromY === u.y).length;
    };
    run(match, 1);
    expect(shotsBy(rifleman)).toBe(1);
    expect(UNIT_STATS.rifleman.reloadTicks).toBeGreaterThan(3);
    expect(board(match, [rifleman], carrier)).toEqual({ ok: true });
    run(match, 1);
    expect(passengerIds(match, carrier)).toEqual([rifleman]);
    expect(unload(match, [carrier])).toEqual({ ok: true });
    run(match, 1);
    expect(shotsBy(rifleman)).toBe(0);
  });

  it("goes by itself, when it gets out, to the Tend target it gave up on at the leash, now that it has stopped", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 5, y: ROW });
    const patient = addTestUnit(match, 0, "rifleman", { x: 6, y: ROW });
    setTestUnitHp(match, patient, 1);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [medic], targetId: patient })).toEqual({ ok: true });
    // The patient marches 30 Cells off; the Medic gives up on it at the leash, 8 Cells out, and stands.
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: 36, y: ROW } });
    runUntil(match, () => find(match, patient)!.x > 6.5 + TEND.leash + 3);
    const stood = find(match, medic)!;
    run(match, 1);
    expect(find(match, medic)).toMatchObject({ x: stood.x, y: stood.y });
    // An empty Troop Carrier stops beside the Medic and Collects it while the patient still marches: no Command names the Medic.
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: Math.floor(stood.x), y: ROW + 1 + LONG_DRIVE });
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: Math.floor(stood.x), y: ROW + 1 } });
    runUntil(match, () => passengerIds(match, carrier).length === 1);
    expect(passengerIds(match, carrier)).toEqual([medic]);
    expect(find(match, patient)!.x).toBeLessThan(30);
    // It drives ahead and waits where the patient will stop, and puts the Medic out beside it on the Tick it does.
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: 35, y: ROW + 1 } });
    runUntil(match, () => find(match, patient)!.x === 36.5);
    expect(find(match, carrier)).toMatchObject({ x: 35.5, y: ROW + 1.5 });
    const left = find(match, patient)!.hp;
    expect(unload(match, [carrier])).toEqual({ ok: true });
    expect(find(match, medic)).toMatchObject({ x: 35.5, y: ROW + 0.5 });
    // At its second look: the first finds the patient in a new place, the second finds it has not moved since.
    run(match, 2 * TEND.seekTicks + 2);
    expect(find(match, patient)!.hp).toBeGreaterThan(left);
  });

  it("has forgotten, when it gets out, the Tend target it found no way to", () => {
    // A pocket of open ground, 3 by 3 Cells, in a ring of rock with one Cell left open as a door.
    const centre: CellPos = { x: 20, y: 16 };
    const door: CellPos = { x: 18, y: 16 };
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 50 }, (_, x) => {
        const ring = Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y)) === 2;
        return ring && !(x === door.x && y === door.y) ? "#" : ".";
      }).join(""),
    );
    const match = createMatch(testMap(rows), 1);
    // The door shut by an own whole Turret, which nothing Repairs, and a damaged Raider inside.
    addTestBuilding(match, 0, "turret", door);
    const turret = getPlayerView(match, 0).buildings.find((b) => b.x === door.x && b.y === door.y)!.id;
    const raider = addTestUnit(match, 0, "raider", centre);
    setTestUnitHp(match, raider, 30);
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 17, y: 16 });
    // Two looks, the first to see that the Raider stands still: it stands as near as it can get already, so it gives up on the spot and backs off.
    let ticks = 2 * TEND.seekTicks;
    run(match, ticks);
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 17, y: 15 - LONG_DRIVE });
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: 17, y: 15 } });
    ticks += runUntil(match, () => passengerIds(match, carrier).length === 1);
    expect(passengerIds(match, carrier)).toEqual([mechanic]);
    // The door opens and the Troop Carrier puts the Mechanic out beside the Raider.
    removeTestBuilding(match, turret);
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: 19, y: 16 } });
    ticks += runUntil(match, () => find(match, carrier)!.x === 19.5);
    expect(unload(match, [carrier])).toEqual({ ok: true });
    expect(isBeside(match, mechanic, raider)).toBe(true);
    ticks += TEND.seekTicks + 2;
    run(match, TEND.seekTicks + 2);
    // Well inside the back-off it had before it Boarded.
    expect(ticks).toBeLessThan(TEND.backOffTicks);
    expect(find(match, raider)!.hp).toBeGreaterThan(30);
  });

  it("is not healed inside, and an idle Medic does not go looking for it", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const hurt = addTestUnit(match, 0, "rifleman", BESIDE[0]);
    setTestUnitHp(match, hurt, 10);
    board(match, [hurt], carrier);
    run(match, 1);
    const medic = addTestUnit(match, 0, "medic", { x: COL - 4, y: ROW });
    run(match, 60);
    expect(find(match, medic)).toMatchObject({ x: COL - 4 + 0.5, y: ROW + 0.5 });
    unload(match, [carrier]);
    expect(find(match, hurt)!.hp).toBe(10);
    // Out again, it is found and healed.
    runUntil(match, () => find(match, hurt)!.hp > 10);
  });

  it("is given up by a Medic sent to Tend it, once it gets in", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const hurt = addTestUnit(match, 0, "rifleman", BESIDE[0]);
    setTestUnitHp(match, hurt, 10);
    const medic = addTestUnit(match, 0, "medic", { x: COL - 5, y: ROW });
    issueCommand(match, 0, { type: "tend", unitIds: [medic], targetId: hurt });
    board(match, [hurt], carrier);
    run(match, 1);
    expect(passengerIds(match, carrier)).toEqual([hurt]);
    run(match, 2);
    const stoodAt = find(match, medic)!.x;
    run(match, 60);
    expect(find(match, medic)!.x).toBe(stoodAt);
    expect(stoodAt).toBeLessThan(COL - 3);
  });

  it("gives no sight from where it got in: the ground it left goes Fogged once its Troop Carrier has driven off", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", BESIDE[0]);
    board(match, [rifleman], carrier);
    run(match, 1);
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: COL + 20, y: ROW } });
    runUntil(match, () => find(match, carrier)!.x === COL + 20.5);
    const view = getPlayerView(match, 0);
    expect(view.map.visibility[ROW * view.map.width + COL - 1]).toBe("fogged");
    expect(view.map.visibility[ROW * view.map.width + COL + 20]).toBe("visible");
  });

  it("counts as a living Unit for Victory when both Players lose their last Building in the same Tick", () => {
    // As in the Victory tests: each HQ is the Player's only Building, one shot from destruction,
    // with a Rifleman of the other Player beside it. Each Player starts with three Units.
    const match = createMatch(openMap(20, 20), 1);
    const own = (owner: PlayerId, kind: string) => getPlayerView(match, owner).buildings.find((b) => b.owner === owner && b.kind === kind)!;
    const hqs = [own(0, "hq"), own(1, "hq")];
    for (const owner of [0, 1] as const) {
      removeTestBuilding(match, own(owner, "refinery").id);
      setTestBuildingHp(match, hqs[owner]!.id, 5);
    }
    const p0 = addTestUnit(match, 0, "rifleman", { x: 16, y: 18 });
    const p1 = addTestUnit(match, 1, "rifleman", { x: 3, y: 1 });
    // Five Units each on the Map once Player 1's Medic is inside its Troop Carrier, which it is
    // by the end of the Tick the HQs fall in.
    addTestUnit(match, 0, "medic", { x: 8, y: 3 });
    const carrier = addTestUnit(match, 1, "troopCarrier", { x: 10, y: 10 });
    const medic = addTestUnit(match, 1, "medic", { x: 9, y: 10 });
    expect(board(match, [medic], carrier, 1)).toEqual({ ok: true });
    issueCommand(match, 0, { type: "attack", unitIds: [p0], targetId: hqs[1]!.id });
    issueCommand(match, 1, { type: "attack", unitIds: [p1], targetId: hqs[0]!.id });
    run(match, 1);
    // Five against five would go to Player 0; the Passenger makes it six.
    expect(getMatchStatus(match)).toEqual({ state: "victory", winner: 1 });
    const end = getPlayerView(match, 1).units.filter((u) => u.owner === 1);
    expect(end).toHaveLength(5);
    expect(end.find((u) => u.id === carrier)!.passengers).toEqual([{ id: medic, kind: "medic" }]);
    expect(getPlayerView(match, 0).units.filter((u) => u.owner === 0)).toHaveLength(5);
  });
});

describe("what a Player is told of Units getting in and out", () => {
  const events = (match: Match, player: PlayerId = 0) => getPlayerView(match, player).passengerEvents;
  const cellVisible = (match: Match, player: PlayerId, x: number, y: number): boolean => {
    const { map } = getPlayerView(match, player);
    return map.visibility[Math.floor(y) * map.width + Math.floor(x)] === "visible";
  };

  it("tells the owner of each Unit that gets in, in the view of that Tick only, where the Unit stood", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
    const medic = addTestUnit(match, 0, "medic", BESIDE[0]);
    expect(events(match)).toEqual([]);
    board(match, [medic], carrier);
    run(match, 1);
    const view = getPlayerView(match, 0);
    expect(view.passengerEvents).toEqual([
      { type: "board", unitId: medic, kind: "medic", owner: 0, x: COL - 1 + 0.5, y: ROW + 0.5, tick: view.tick - 1 },
    ]);
    run(match, 1);
    expect(events(match)).toEqual([]);
  });

  it("tells nothing for a Unit that found the Troop Carrier full", () => {
    const match = stage();
    const { carrier } = withPassengers(match, FIVE);
    const sixth = addTestUnit(match, 0, "rifleman", BESIDE[0]);
    run(match, 1);
    board(match, [sixth], carrier);
    // It tries the door on the Tick of the Command, and that Tick's view is the one that would tell of it.
    run(match, 1);
    expect(find(match, sixth)).toBeDefined();
    expect(events(match)).toEqual([]);
  });

  it("tells the owner of each Passenger an Unload Command lets out, in the next Tick's view, at the Cell it got out onto", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, ["rifleman", "medic"]);
    run(match, 1);
    unload(match, [carrier]);
    run(match, 1);
    const view = getPlayerView(match, 0);
    // The four Cells sharing a side with it are as near as each other, and are taken row by row.
    expect(view.passengerEvents).toEqual([
      { type: "unload", unitId: boarded[0], kind: "rifleman", owner: 0, x: COL + 0.5, y: ROW - 1 + 0.5, tick: view.tick - 1 },
      { type: "unload", unitId: boarded[1], kind: "medic", owner: 0, x: COL - 1 + 0.5, y: ROW + 0.5, tick: view.tick - 1 },
    ]);
    expect(find(match, boarded[0]!)).toMatchObject({ x: COL + 0.5, y: ROW - 1 + 0.5 });
    run(match, 1);
    expect(events(match)).toEqual([]);
  });

  it("tells of the Passengers that get out under fire, and of none that stayed in", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE);
    // Six of the eight Cells beside it are taken, so only two can get out.
    BESIDE.slice(2).forEach((cell) => addTestUnit(match, 0, "medic", cell));
    const enemy = addTestUnit(match, 1, "rifleman", { x: COL + 3, y: ROW });
    // Told whom to shoot, as a Medic stands nearer to it than the Troop Carrier does.
    expect(issueCommand(match, 1, { type: "attack", unitIds: [enemy], targetId: carrier })).toEqual({ ok: true });
    runUntil(match, () => passengers(match, carrier).length < 5, 20);
    expect(passengerIds(match, carrier)).toEqual(boarded.slice(2));
    expect(events(match).map((e) => [e.type, e.unitId])).toEqual([
      ["unload", boarded[0]],
      ["unload", boarded[1]],
    ]);
  });

  it("tells the other Player only of those in Cells it sees now, and nothing of who is still inside", () => {
    const match = stage();
    const { carrier, boarded } = withPassengers(match, FIVE, 1);
    // A Harvester watches from the right: it sees the near side of the Troop Carrier and not the far side.
    addTestUnit(match, 0, "harvester", { x: COL + UNIT_STATS.harvester.sight, y: ROW });
    run(match, 1);
    unload(match, [carrier], 1);
    run(match, 1);
    expect(events(match, 1).map((e) => e.unitId)).toEqual(boarded);
    const seen = events(match, 0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(boarded.length);
    for (const e of seen) expect(cellVisible(match, 0, e.x, e.y)).toBe(true);
    for (const e of events(match, 1).filter((e) => !seen.some((s) => s.unitId === e.unitId))) {
      expect(cellVisible(match, 0, e.x, e.y)).toBe(false);
    }
    expect(getPlayerView(match, 0).units.find((u) => u.id === carrier)?.passengers ?? null).toBeNull();
  });

  it("tells the other Player of a Unit getting in where it sees the Cell, and not where it does not", () => {
    const match = stage();
    const carrier = addTestUnit(match, 1, "troopCarrier", { x: COL, y: ROW });
    const near = addTestUnit(match, 1, "medic", BESIDE[1]);
    const far = addTestUnit(match, 1, "medic", BESIDE[0]);
    addTestUnit(match, 0, "harvester", { x: COL + 1 + UNIT_STATS.harvester.sight, y: ROW });
    run(match, 1);
    expect(cellVisible(match, 0, BESIDE[1].x, ROW)).toBe(true);
    expect(cellVisible(match, 0, BESIDE[0].x, ROW)).toBe(false);
    board(match, [near, far], carrier, 1);
    run(match, 1);
    expect(events(match, 1).map((e) => e.unitId).sort()).toEqual([near, far].sort());
    expect(events(match, 0)).toMatchObject([{ type: "board", unitId: near, owner: 1 }]);
  });
});

describe("Board and Unload", () => {
  it("play out the same from the same seed and Commands", () => {
    const play = (): unknown => {
      const match = createMatch(openMap(50, 40), 7);
      const carrier = addTestUnit(match, 0, "troopCarrier", { x: COL, y: ROW });
      const infantry = (["rifleman", "medic", "rifleman", "rifleman", "rifleman", "rifleman", "medic"] as const).map((kind, i) =>
        addTestUnit(match, 0, kind, { x: COL - 3 - (i % 4), y: ROW - 1 + Math.floor(i / 4) * 2 }),
      );
      const log: unknown[] = [];
      board(match, infantry, carrier);
      run(match, 120);
      log.push(getPlayerView(match, 0).units);
      issueCommand(match, 0, { type: "attackMove", unitIds: [carrier], target: { x: COL + 12, y: ROW + 2 } });
      addTestUnit(match, 1, "rifleman", { x: COL + 15, y: ROW + 2 });
      addTestUnit(match, 1, "raider", { x: COL + 16, y: ROW + 4 });
      run(match, 100);
      log.push(getPlayerView(match, 0).units, getPlayerView(match, 1).units);
      unload(match, [carrier]);
      run(match, 200);
      log.push(getPlayerView(match, 0), getPlayerView(match, 1));
      return log;
    };
    const first = play() as [UnitView[], ...unknown[]];
    expect(play()).toEqual(first);
    // And it is a run in which Units did Board: five inside after the first stretch.
    expect(first[0].find((u) => u.kind === "troopCarrier")!.passengers).toHaveLength(5);
  });
});
