import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { matchGrid, type MovePlan, planMove, stepAlong, unitCell } from "./movement";
import { cellsWithinSteps } from "./pathfinding";
import type { MatchState, PassengerEvent, UnitState } from "./state";
import { cellIndex, isMoving, isWalkable, ownUnits } from "./state";
import { isBeside, standGoal } from "./tend";
import { isInfantry, isTroopCarrier, passengerRoom, TROOP_CARRIER } from "./tuning";
import type { CellPos, EntityId, PlayerId } from "./types";

// Passengers: Infantry inside Troop Carriers. Rules:
// - A Passenger is off the Map. It is kept in its Troop Carrier's list and
//   taken out of the Match's Units, so it holds no Cell, cannot be seen, hit,
//   Tended or given a Command, does not fire and gives no sight. It keeps its
//   id and its health, and counts as a living Unit for Victory.
// - A Board Command names one own Troop Carrier. Each Infantry Unit in it walks
//   until it is in a Cell touching the Troop Carrier's and gets in if there is
//   room. It follows a Troop Carrier that drives off. With no room it stops
//   beside it. Vehicles in the Command are left as they were.
// - An Unload Command puts every Passenger on a free Cell beside the Troop
//   Carrier, nearest first, in the order they got in. A free Cell is walkable
//   with no Unit in it. Passengers with no free Cell stay inside. Those that
//   get out are idle, so the armed ones defend themselves at once.
// - A Troop Carrier that loses health Unloads on that Tick, before the dead are
//   removed: if it was destroyed, its Passengers get out first and only those
//   with no free Cell are lost with it.
// - Collecting happens once, on the Tick a Troop Carrier finishes a move or an
//   Attack-move that took it far enough, in a straight line, from where it
//   began (TROOP_CARRIER.collectAfterCells), that it began with no Passengers
//   and had none on since: idle Infantry of its own Player within the
//   Collecting radius get in from where they stand, nearest first and lowest
//   id first among those as near as each other, while there is room. Idle is
//   the test used everywhere: no Command in progress, and a Tend a support
//   Unit began by itself counts as one.
// - It takes only those with a short way on foot to a Cell touching its own
//   (or already in one): a Board Command would have had them walk, so a Unit
//   across water or behind a wall is no more taken than it could have Boarded.
// - That is all of it. One that stands takes nobody, so a Unit sent beside a
//   parked Troop Carrier stays on the Map, and so do those that got out; a
//   move that ends nearer than that to where it began (sent to
//   where it stands, nudged a Cell along, or with no way to go) is standing. A move on which it held a Passenger, or put one
//   out, ends without Collecting (Units Unloaded a step from the stop are not
//   gathered up again), and so does a stop on a Tick it lost health (what it
//   took would be out again at the next hit). It is Collecting again once it
//   is sent off empty and stops that far from where it set off.
// - Nothing tells this file that a move began or ended. Each move and
//   Attack-move order carries how it began (`MoveStart`, which the order types
//   require), and movement.ts notes the one a Unit begins each Tick on.
// - Every Unit that gets in or out is noted for the Player views (drawing and
//   sound), by the two functions every way in and out goes through.
// - Only own Units and an own target: a Player always sees those, so whether a
//   Board or Unload Command is accepted never depends on anything out of sight.

/** A Unit walking to a Troop Carrier to get in. */
export interface Boarding {
  readonly type: "board";
  readonly carrierId: EntityId;
  /** The walk to a Cell beside the Troop Carrier, or null while standing. */
  walk: MovePlan | null;
}

function hasRoom(carrier: UnitState): boolean {
  return carrier.passengers.length < passengerRoom(carrier.kind);
}

/** The Player's own live Unit with that id that can carry Passengers. */
function ownCarrier(m: MatchState, player: PlayerId, id: EntityId): UnitState | undefined {
  const u = m.units.get(id);
  return u && u.owner === player && u.hp > 0 && isTroopCarrier(u.kind) ? u : undefined;
}

/**
 * The Unit gets into the Troop Carrier now, wherever the two are: callers
 * decide who may and from how far. False, with nothing changed, when there is
 * no room or the Unit is not on the Map.
 */
function getIn(m: MatchState, u: UnitState, carrier: UnitState): boolean {
  if (u === carrier || !hasRoom(carrier) || m.units.get(u.id) !== u) return false;
  m.units.delete(u.id);
  u.order = { type: "idle" };
  // Becoming a Passenger ends its Tend back-offs: no look reaches a Passenger
  // to end them one by one, and it will get out somewhere else.
  // Its reload is left as it was, or getting in and out would be a way to fire faster.
  u.tendBackOff.clear();
  carrier.passengers.push(u);
  // Whatever move the Troop Carrier is on no longer ends in Collecting, even if this one is out again before the stop.
  if (isMoving(carrier.order)) carrier.order.start.empty = false;
  note(m, "board", u);
  return true;
}

/**
 * Puts the Troop Carrier's Passengers on the free Cells beside it, nearest
 * first, and returns how many got out. The rest stay inside.
 */
export function unloadPassengers(m: MatchState, carrier: UnitState): number {
  if (carrier.passengers.length === 0) return 0;
  const cells = freeCellsBeside(m, carrier);
  const out = carrier.passengers.splice(0, cells.length);
  out.forEach((p, i) => {
    const cell = cells[i]!;
    // No position before this one: drawn sliding out from where it got in, it would cross the Map.
    p.x = p.prevX = cell.x + 0.5;
    p.y = p.prevY = cell.y + 0.5;
    p.order = { type: "idle" };
    m.units.set(p.id, p);
    note(m, "unload", p);
  });
  return out.length;
}

function note(m: MatchState, type: PassengerEvent["type"], u: UnitState): void {
  m.passengerEvents.push({ type, unitId: u.id, kind: u.kind, owner: u.owner, x: u.x, y: u.y, tick: m.tick });
}

/**
 * Per-Tick system, first of all: drops what the last Tick's views have shown.
 * What a Command did since that Tick is of this one and stays, which is why
 * the list is not simply emptied as the shots are.
 */
export function forgetShownPassengerEvents(m: MatchState): void {
  if (m.passengerEvents.length > 0) m.passengerEvents = m.passengerEvents.filter((e) => e.tick >= m.tick);
}

/** The walkable Cells touching the Troop Carrier's with no Unit in them, nearest to it first. */
function freeCellsBeside(m: MatchState, carrier: UnitState): CellPos[] {
  const held = new Set<number>();
  for (const u of m.units.values()) held.add(cellIndex(m, Math.floor(u.x), Math.floor(u.y)));
  const at = unitCell(carrier);
  const free: { cell: CellPos; d: number }[] = [];
  for (let y = at.y - 1; y <= at.y + 1; y++) {
    for (let x = at.x - 1; x <= at.x + 1; x++) {
      if (!isWalkable(m, x, y) || held.has(cellIndex(m, x, y))) continue;
      free.push({ cell: { x, y }, d: Math.hypot(x + 0.5 - carrier.x, y + 0.5 - carrier.y) });
    }
  }
  // The sort is stable, so Cells as near as each other keep their row-by-row order and replays agree.
  return free.sort((a, b) => a.d - b.d).map((f) => f.cell);
}

export const handleBoard: CommandHandler<"board"> = (m, player, command): CommandResult => {
  const units = ownUnits(m, player, command.unitIds);
  if (units.length === 0) return reject("no own Units selected");
  const carrier = ownCarrier(m, player, command.targetId);
  if (!carrier) return reject("target is not an own Troop Carrier");
  const infantry = units.filter((u) => isInfantry(u.kind));
  if (infantry.length === 0) return reject("only Infantry can Board");
  for (const u of infantry) u.order = { type: "board", carrierId: carrier.id, walk: null };
  return OK;
};

export const handleUnload: CommandHandler<"unload"> = (m, player, command): CommandResult => {
  const carriers = ownUnits(m, player, command.unitIds).filter((u) => isTroopCarrier(u.kind));
  if (carriers.length === 0) return reject("no own Troop Carriers selected");
  // Nothing would happen, and an accepted Command is acknowledged to the person who gave it.
  if (carriers.every((c) => c.passengers.length === 0)) return reject("no Passengers to Unload");
  for (const carrier of carriers) unloadPassengers(m, carrier);
  return OK;
};

/** One Tick of a Board: get in if beside the Troop Carrier and it has room, otherwise walk to a Cell beside it. */
function advanceBoard(m: MatchState, u: UnitState, boarding: Boarding): void {
  const carrier = ownCarrier(m, u.owner, boarding.carrierId);
  if (!carrier) {
    u.order = { type: "idle" };
    return;
  }
  const beside = isBeside(unitCell(u), carrier);
  if (beside && getIn(m, u, carrier)) return;
  // Beside a full one while still walking: stop in the Cell being stepped into, not on the far side of it.
  const next = beside ? boarding.walk?.path[0] : undefined;
  if (next && isBeside(next, carrier)) boarding.walk = { goal: next, path: [next] };
  // Not in: walk to a Cell beside it, again whenever it has driven off from the one picked.
  if (!boarding.walk || !isBeside(boarding.walk.goal, carrier)) {
    // Standing beside a full one: this is where a Unit with no place stops.
    const goal = beside && !boarding.walk ? null : standGoal(m, u, carrier);
    if (!goal) {
      u.order = { type: "idle" };
      return;
    }
    boarding.walk = planMove(m, u, goal);
  }
  if (stepAlong(m, u, boarding.walk) === "arrived") {
    boarding.walk = null;
    // The route ran out short of the Troop Carrier: it cannot be reached, so give up.
    if (!isBeside(unitCell(u), carrier)) u.order = { type: "idle" };
  }
}

/** Per-Tick system: walks every Unit on a Board, and makes Passengers of those beside their Troop Carrier. */
export function boardTroopCarriers(m: MatchState): void {
  for (const u of m.units.values()) {
    if (u.order.type === "board") advanceBoard(m, u, u.order);
  }
}

/** Per-Tick system, straight after the fight: a Troop Carrier that lost health this Tick Unloads. */
export function getOutUnderFire(m: MatchState): void {
  // A copy, as Passengers getting out join the Units being walked.
  for (const u of [...m.units.values()]) {
    if (u.passengers.length > 0 && m.damaged.has(u.id)) unloadPassengers(m, u);
  }
}

/**
 * The Cells a Unit can be taken from when the Troop Carrier is Collecting, as
 * cellIndex values: its own, those touching it, and those a short way on foot
 * from one of them.
 */
function cellsInWalkingReach(m: MatchState, carrier: UnitState): Set<number> {
  const at = unitCell(carrier);
  const beside: CellPos[] = [];
  for (let y = at.y - 1; y <= at.y + 1; y++) {
    for (let x = at.x - 1; x <= at.x + 1; x++) if (isWalkable(m, x, y)) beside.push({ x, y });
  }
  return cellsWithinSteps(matchGrid(m), beside, TROOP_CARRIER.collectWalk);
}

/** The idle Infantry of the Troop Carrier's Player it takes when Collecting, in the order it takes them. */
function idleInfantryNear(m: MatchState, carrier: UnitState): UnitState[] {
  const near: { unit: UnitState; d: number }[] = [];
  let reach: Set<number> | undefined;
  for (const u of m.units.values()) {
    if (u.owner !== carrier.owner || u.hp <= 0 || u.order.type !== "idle" || !isInfantry(u.kind)) continue;
    const d = Math.hypot(u.x - carrier.x, u.y - carrier.y);
    if (d > TROOP_CARRIER.collectRadius) continue;
    // Worked out only once somebody is near enough: most stops are among nobody.
    reach ??= cellsInWalkingReach(m, carrier);
    const cell = unitCell(u);
    if (reach.has(cellIndex(m, cell.x, cell.y))) near.push({ unit: u, d });
  }
  // The id settles ties: the Match's Units are not in id order once some have been Passengers and got out.
  return near.sort((a, b) => a.d - b.d || a.unit.id - b.unit.id).map((n) => n.unit);
}

/**
 * Per-Tick system, after the fight: Collecting. Each Troop Carrier that began
 * the Tick on a move and now stands idle has just finished it, and takes
 * the idle Infantry near it if the move ended far enough from where it began,
 * it has been empty since it set off, and it lost no health on this Tick. It runs
 * before idle support Units look for work, so one that is only about to is
 * taken.
 */
export function collectPassengers(m: MatchState): void {
  // A copy, as the Units it takes leave the Units being walked.
  for (const carrier of [...m.units.values()]) {
    const start = carrier.moveAtTickStart;
    if (!start || carrier.order.type !== "idle" || !isTroopCarrier(carrier.kind)) continue;
    // One that Boarded on the Tick of the stop got in after the move was over, so the count is asked too.
    if (!start.empty || carrier.passengers.length > 0 || m.damaged.has(carrier.id)) continue;
    if (Math.hypot(carrier.x - start.from.x, carrier.y - start.from.y) < TROOP_CARRIER.collectAfterCells) continue;
    for (const u of idleInfantryNear(m, carrier)) {
      if (!getIn(m, u, carrier)) break;
    }
  }
}
