import { type CellPos, type Command, type EntityId, isTroopCarrier, OPPONENT, type PlayerView, type UnitView } from "../sim";
import { hqCentre, isOpenGround, type Standing } from "./base";
import { rallyPoint } from "./economy";
import { distanceToCell, STUCK_THINKS } from "./tactics";

// The Computer Opponent's Troop Carriers while they are at home. An empty one
// that finishes a move Collects the idle Infantry within its Collecting radius,
// and at the rally point those are the Medics and Mechanics, who must stay. So a
// Troop Carrier at home never drives to the rally point: it waits on a Parking Cell
// of its own, and anyone it Collected on arriving is put out again and sent
// back. Once it stands it Collects nobody, so it needs no more Commands.

/**
 * Where a Troop Carrier at home is with its Parking Cell: on its way there, on
 * its way a second time after stopping before it, parked, or stopped far from
 * it, which comes with the Tick from which it is sent there again.
 */
type Parking =
  | { readonly state: "driving" | "drivingAgain" | "parked" }
  | { readonly state: "farOff"; readonly sendAgainAt: number };

/** The Opponent's notes on its Troop Carriers at home: a Player view does not say what a Unit is doing. */
export interface CarrierMemory {
  readonly parking: Map<EntityId, Parking>;
  /** Units a Troop Carrier at home was told to put out, to send back once they are seen on the Map. */
  readonly putOut: Set<EntityId>;
}

export function createCarrierMemory(): CarrierMemory {
  return { parking: new Map(), putOut: new Set() };
}

/**
 * Where to look for a Parking Cell, in the order tried, as Cells along the
 * line from the HQ to the Map's middle and Cells across it: each a little
 * farther out than the rally point, so base Buildings rarely take it, and far
 * enough round that the Units crowding the rally point are out of reach.
 */
const PARKING_OFFSETS: readonly (readonly [along: number, across: number])[] = [
  [6, 6],
  [6, -6],
  [4, 7],
  [4, -7],
  [0, 8],
  [0, -8],
  [7, 4],
  [7, -4],
];

export function ownCarriers(view: PlayerView): UnitView[] {
  return view.units.filter((u) => u.owner === view.playerId && isTroopCarrier(u.kind));
}

/** The Cell a Troop Carrier waits on at home: to one side of the rally point, on open ground. */
export function parkingCell(view: PlayerView): CellPos {
  const hq = hqCentre(view);
  const dx = view.map.width / 2 - hq.x;
  const dy = view.map.height / 2 - hq.y;
  const len = Math.hypot(dx, dy) || 1;
  for (const [along, across] of PARKING_OFFSETS) {
    const cell = {
      x: Math.round(hq.x + (dx * along - dy * across) / len),
      y: Math.round(hq.y + (dy * along + dx * across) / len),
    };
    if (isOpenGround(view, cell)) return cell;
  }
  // Nowhere to one side: the rally point, where whoever it Collects is put out again.
  return rallyPoint(view);
}

/** Sends a Troop Carrier to its Parking Cell and notes that it is on its way there: `state` says whether for the first time or again. */
export function driveToParking(
  view: PlayerView,
  memory: CarrierMemory,
  standing: Standing,
  carrier: UnitView,
  state: "driving" | "drivingAgain" = "driving",
): Command {
  memory.parking.set(carrier.id, { state });
  standing.restart(carrier.id);
  return { type: "move", unitIds: [carrier.id], target: parkingCell(view) };
}

/**
 * Brings home a Troop Carrier whose wave has ended while it was out with
 * Passengers: it drives to its Parking Cell, and everyone inside is noted to
 * be sent back to the rally point once out, wherever that happens.
 */
export function recall(view: PlayerView, memory: CarrierMemory, standing: Standing, carrier: UnitView): Command {
  for (const p of carrier.passengers ?? []) memory.putOut.add(p.id);
  return driveToParking(view, memory, standing, carrier);
}

/** Whether the Troop Carrier waits at home, stopped and empty: ready for a wave's Riflemen to Board. */
export function isParked(memory: CarrierMemory, carrier: UnitView): boolean {
  return memory.parking.get(carrier.id)?.state === "parked" && carrier.passengers?.length === 0;
}

/**
 * Commands for the Troop Carriers at home, which is every own one not `away`
 * with a wave: drive to the Parking Cell, and Unload anyone inside. One that
 * stops short of the Parking Cell is sent once more. If it stops short again
 * it counts as parked where it stands, but only near home: one far off, as a
 * Troop Carrier recalled from the front can be, is never parked, or the next
 * wave would be told to Board it out there. That one is sent again now and
 * then, as its way home may open.
 */
export function parkCommands(
  view: PlayerView,
  memory: CarrierMemory,
  standing: Standing,
  away: EntityId | null,
): Command[] {
  const carriers = ownCarriers(view);
  for (const id of memory.parking.keys()) {
    if (!carriers.some((c) => c.id === id)) memory.parking.delete(id);
  }
  const commands: Command[] = [];

  const outNow = view.units.filter((u) => memory.putOut.has(u.id)).map((u) => u.id);
  // Those still inside had no free Cell to get out onto, and are noted again below.
  memory.putOut.clear();
  if (outNow.length > 0) commands.push({ type: "move", unitIds: outNow, target: rallyPoint(view) });

  const unloading: EntityId[] = [];
  for (const carrier of carriers) {
    if (carrier.id === away) continue;
    const inside = carrier.passengers ?? [];
    if (inside.length > 0) {
      unloading.push(carrier.id);
      for (const p of inside) memory.putOut.add(p.id);
    }
    const parking = memory.parking.get(carrier.id);
    if (parking === undefined) {
      commands.push(driveToParking(view, memory, standing, carrier));
      continue;
    }
    // Still on its way, or only just stopped.
    if (parking.state !== "parked" && standing.thinks(carrier.id) < STUCK_THINKS) continue;
    const fromParkingCell = distanceToCell(parkingCell(view), carrier);
    switch (parking.state) {
      case "parked":
        break;
      case "driving":
        if (fromParkingCell <= OPPONENT.parkedWithinCells) {
          memory.parking.set(carrier.id, { state: "parked" });
          break;
        }
        // Stopped somewhere else on its way: it is sent once more.
        commands.push(driveToParking(view, memory, standing, carrier, "drivingAgain"));
        break;
      case "drivingAgain":
        // Stopped short twice, it has no way there. Sent a third time at once it would stop short again, think
        // after think. Near home it waits where it is, where a wave can still Board it; far off it waits to be sent.
        memory.parking.set(
          carrier.id,
          fromParkingCell <= OPPONENT.parkedNoWayCells
            ? { state: "parked" }
            : { state: "farOff", sendAgainAt: view.tick + OPPONENT.parkAgainTicks },
        );
        break;
      case "farOff":
        // Due again: it is sent, and once more if it stops short.
        if (view.tick >= parking.sendAgainAt) commands.push(driveToParking(view, memory, standing, carrier));
        break;
    }
  }
  if (unloading.length > 0) commands.unshift({ type: "unload", unitIds: unloading });
  return commands;
}
