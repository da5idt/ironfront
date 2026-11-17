import { type CellPos, type Command, type EntityId, isTroopCarrier, type PlayerView, type UnitView } from "../sim";
import { hqCentre, isOpenGround, type Standing } from "./base";
import { rallyPoint } from "./economy";
import { distanceToCell, STUCK_THINKS } from "./tactics";

// The Computer Opponent's Troop Carriers while they are at home. An empty one
// that finishes a move Collects the idle Infantry within two Cells, and at the
// rally point those are the Medics and Mechanics, who must stay. So a Troop
// Carrier at home never drives to the rally point: it waits on a parking Cell
// of its own, and anyone it Collected on arriving is put out again and sent
// back. Once it stands it Collects nobody, so it needs no more Commands.

/** The Opponent's notes on its Troop Carriers at home: a Player view does not say what a Unit is doing. */
export interface CarrierMemory {
  /**
   * Whether each is on its way to its parking Cell, on its way there a second
   * time after stopping short of it, or parked.
   */
  readonly parking: Map<EntityId, "driving" | "drivingAgain" | "parked">;
  /** Units a Troop Carrier at home was told to put out, to send back once they are seen on the Map. */
  readonly putOut: Set<EntityId>;
}

export function createCarrierMemory(): CarrierMemory {
  return { parking: new Map(), putOut: new Set() };
}

/**
 * Where to look for a parking Cell, in the order tried, as Cells along the
 * line from the HQ to the Map's middle and Cells across it: about eight Cells
 * out, a little past the rally point so base Buildings rarely take it, and far
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
/** How near its parking Cell a Troop Carrier that has stopped counts as parked: others may stand on the Cell itself. */
const PARKED_WITHIN = 3;

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

/** Sends a Troop Carrier to its parking Cell and notes that it is on its way. */
export function driveToParking(view: PlayerView, memory: CarrierMemory, standing: Standing, carrier: UnitView): Command {
  memory.parking.set(carrier.id, "driving");
  standing.restart(carrier.id);
  return { type: "move", unitIds: [carrier.id], target: parkingCell(view) };
}

/**
 * Brings home a Troop Carrier whose wave has ended while it was out with
 * Passengers: it drives to its parking Cell, and everyone inside is noted to
 * be sent back to the rally point once out, wherever that happens.
 */
export function recall(view: PlayerView, memory: CarrierMemory, standing: Standing, carrier: UnitView): Command {
  for (const p of carrier.passengers ?? []) memory.putOut.add(p.id);
  return driveToParking(view, memory, standing, carrier);
}

/** Whether the Troop Carrier waits at home, stopped and empty: ready for a wave's Riflemen to Board. */
export function isParked(memory: CarrierMemory, carrier: UnitView): boolean {
  return memory.parking.get(carrier.id) === "parked" && carrier.passengers?.length === 0;
}

/**
 * Commands for the Troop Carriers at home, which is every own one not `away`
 * with a wave: drive to the parking Cell, and Unload anyone inside. One that
 * stops short of the parking Cell is sent once more, then counts as parked.
 */
export function parkCommands(
  view: PlayerView,
  memory: CarrierMemory,
  standing: Standing,
  away: EntityId | null,
): Command[] {
  const carriers = ownCarriers(view);
  for (const id of memory.parking.keys()) if (!carriers.some((c) => c.id === id)) memory.parking.delete(id);
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
    if (parking === "parked" || (parking !== undefined && standing.thinks(carrier.id) < STUCK_THINKS)) continue;
    const arrived = distanceToCell(parkingCell(view), carrier) <= PARKED_WITHIN;
    // Stopped short twice, it has no way there: it waits where it is, where a wave can still Board it.
    // Sent a third time it would stop short again, think after think, and never count as parked.
    if (parking === "drivingAgain" || (parking === "driving" && arrived)) {
      memory.parking.set(carrier.id, "parked");
      continue;
    }
    // New, or stopped somewhere else on its way: it is sent, the second time for the last.
    commands.push(driveToParking(view, memory, standing, carrier));
    if (parking === "driving") memory.parking.set(carrier.id, "drivingAgain");
  }
  if (unloading.length > 0) commands.unshift({ type: "unload", unitIds: unloading });
  return commands;
}
