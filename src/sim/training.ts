import type { CommandResult } from "./commands";
import { OK, reject } from "./commands";
import type { CommandHandler } from "./handlers";
import { freeCellAround } from "./building";
import { claimedCells, freeCellNear, orderMoveTo } from "./movement";
import type { BuildingState, MatchState, UnitState } from "./state";
import { inBounds, spawnUnit } from "./state";
import { TRAINING, UNIT_STATS } from "./tuning";
import type { BuildingKind, CellPos, EntityId, PlayerId, UnitKind } from "./types";

// Training: a Barracks or Vehicle Factory works through its own short queue of
// Units. Credits are paid when a Unit is queued, so the queue never stalls for
// lack of Credits; only the first Unit in the queue makes progress.

/** What each Building can train, in panel order. Buildings not listed train nothing. */
export const TRAINS: Readonly<Partial<Record<BuildingKind, readonly UnitKind[]>>> = {
  barracks: ["rifleman"],
  vehicleFactory: ["raider", "harvester"],
};

/** A Building's training as its owner sees it. */
export interface TrainingView {
  /** Queued Units, oldest (the one in training) first. */
  readonly queue: readonly UnitKind[];
  /** How far the first Unit has got: 0 when started, 1 when done. 0 for an empty queue. */
  readonly progress: number;
  readonly rallyPoint: CellPos | null;
}

export function canTrain(kind: BuildingKind): boolean {
  return TRAINS[kind] !== undefined;
}

/** Null for a Building that trains nothing. */
export function trainingView(b: BuildingState): TrainingView | null {
  if (!canTrain(b.kind)) return null;
  const head = b.queue[0];
  const progress = head ? Math.min(1, b.trainTicksDone / UNIT_STATS[head].trainTicks) : 0;
  return { queue: [...b.queue], progress, rallyPoint: b.rallyPoint };
}

function ownTrainer(m: MatchState, player: PlayerId, id: EntityId): BuildingState | string {
  const b = m.buildings.get(id);
  if (!b || b.owner !== player) return "not an own Building";
  if (!canTrain(b.kind)) return "that Building trains nothing";
  return b;
}

/**
 * Per-Tick system: each training Building works one Tick on the first Unit in
 * its queue. A finished Unit steps out onto a free Cell beside the Building;
 * if every nearby Cell is taken it waits, finished, and tries again next Tick.
 */
export function trainUnits(m: MatchState): void {
  for (const b of m.buildings.values()) {
    const head = b.queue[0];
    if (!head) continue;
    if (b.trainTicksDone < UNIT_STATS[head].trainTicks) b.trainTicksDone++;
    if (b.trainTicksDone < UNIT_STATS[head].trainTicks) continue;
    const cell = freeCellAround(m, b);
    if (!cell) continue;
    sendToRallyPoint(m, spawnUnit(m, b.owner, head, cell), b.rallyPoint);
    b.queue.shift();
    b.trainTicksDone = 0;
  }
}

/**
 * A new Unit walks to the rally point, or the nearest free Cell to it. A new Harvester is already harvesting
 * (spawnUnit), and a rally point only steers it: it works the Ore nearest the
 * rally point rather than parking there, because an idle Harvester earns nothing.
 */
function sendToRallyPoint(m: MatchState, u: UnitState, rally: CellPos | null): void {
  if (!rally) return;
  if (u.order.type === "harvest") {
    u.order.field = rally;
    return;
  }
  // Units arrive one at a time, so each takes the nearest Cell no own Unit
  // stands on or is heading for, and a stream of them fills the spot around the rally point.
  const goal = freeCellNear(m, rally, claimedCells(m, u.owner, [u]));
  if (goal) orderMoveTo(m, u, goal);
}

export const handleTrain: CommandHandler<"train"> = (m, player, command): CommandResult => {
  const b = ownTrainer(m, player, command.buildingId);
  if (typeof b === "string") return reject(b);
  if (!TRAINS[b.kind]!.includes(command.kind)) return reject("that Building cannot train that Unit");
  if (b.queue.length >= TRAINING.queueSize) return reject("the queue is full");
  const state = m.players[player];
  const cost = UNIT_STATS[command.kind].cost;
  if (state.credits < cost) return reject("not enough Credits");
  state.credits -= cost;
  b.queue.push(command.kind);
  return OK;
};

/** Any Cell on the Map will do; a blocked one sends new Units to the nearest free Cell. */
export const handleSetRallyPoint: CommandHandler<"setRallyPoint"> = (m, player, command): CommandResult => {
  const b = ownTrainer(m, player, command.buildingId);
  if (typeof b === "string") return reject(b);
  const { x, y } = command.target;
  if (!inBounds(m, x, y)) return reject("target is off the Map");
  b.rallyPoint = { x, y };
  return OK;
};

/**
 * Takes the newest Unit off the queue and refunds it in full. Newest rather
 * than the one in training, so cancelling a mistaken extra click never throws
 * away progress; the one in training goes only once it is alone.
 */
export const handleCancelTraining: CommandHandler<"cancelTraining"> = (m, player, command): CommandResult => {
  const b = ownTrainer(m, player, command.buildingId);
  if (typeof b === "string") return reject(b);
  const kind = b.queue.pop();
  if (!kind) return reject("nothing is being trained");
  m.players[player].credits += UNIT_STATS[kind].cost;
  if (b.queue.length === 0) b.trainTicksDone = 0;
  return OK;
};
