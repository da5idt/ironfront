import {
  type BuildingView,
  type CellPos,
  type Command,
  type EntityId,
  isTroopCarrier,
  type PlayerView,
  tendRate,
  UNIT_STATS,
  type UnitView,
} from "../sim";
import { enemyBuildingAt, enemyUnitAt, ownBuildingAt, type Point, type Selection, unitAt } from "./selection";

// Which Commands a right-click and the Unload key give. Pure, like placing.ts:
// main.ts feeds in the Player view, the selection and the point, issues what
// comes back and plays the sounds. Everything is chosen from the Player view,
// so nothing out of sight can sway it (Fog of War).

/**
 * The Commands a right-click at `point` (a Map position in Cell units) gives
 * for the selected Units, in the order to issue them; none with nothing
 * selected or off the Map. From first to last:
 * - on the other Player's Unit or Building: everyone attacks it. A Unit
 *   standing in front of a Building is the more urgent target.
 * - on an own Unit or Building: the selected Units that have a job to do on
 *   it get that job, and the others get no Command, so they stay at what they
 *   were doing. The jobs are Tend, for those that can help it while it is
 *   below full health, and Board, for Infantry on a Troop Carrier.
 * - otherwise it is a click on the ground: on Ore the Harvesters harvest it,
 *   and everyone else moves to the Cell.
 */
export function rightClickCommands(view: PlayerView, selection: Selection, point: Point): Command[] {
  const cell: CellPos = { x: Math.floor(point.x), y: Math.floor(point.y) };
  if (selection.size === 0 || cell.x < 0 || cell.y < 0 || cell.x >= view.map.width || cell.y >= view.map.height) return [];
  const me = view.playerId;
  const unitIds: EntityId[] = [...selection];

  const enemy = enemyUnitAt(view.units, point, me) ?? enemyBuildingAt(view.buildings, point, me);
  if (enemy) return [{ type: "attack", unitIds, targetId: enemy.id }];

  // A Unit standing at a Building's wall is the nearer thing under the point, as with an attack.
  const selected = view.units.filter((u) => u.owner === me && selection.has(u.id));
  for (const own of [unitAt(view.units, point, me), ownBuildingAt(view.buildings, point, me)]) {
    // Nobody has a job to do on itself: a hurt Medic cannot heal itself, nor a Troop Carrier get into itself.
    const jobs = own ? ownTargetCommands(selected.filter((u) => u.id !== own.id), own) : [];
    if (jobs.length > 0) return jobs;
  }

  return groundCommands(view, unitIds, cell);
}

/**
 * The Commands for a right-click on an own Unit or Building, for the selected
 * Units other than that one; none when nobody selected has a job to do on it.
 * Each rule takes its Units out of `free`, so a Unit gets at most one Command
 * and an earlier rule wins.
 */
function ownTargetCommands(selected: readonly UnitView[], target: UnitView | BuildingView): Command[] {
  const commands: Command[] = [];
  const free = [...selected];
  /** Takes the Units the rule wants out of `free` and returns their ids. */
  const take = (wanted: (u: UnitView) => boolean): EntityId[] => {
    const ids = free.filter(wanted).map((u) => u.id);
    for (const id of ids) free.splice(free.findIndex((u) => u.id === id), 1);
    return ids;
  };
  // A Building has a footprint, a Unit a kind.
  const unit = "width" in target ? null : target;

  // Tend comes before Board: on a damaged Troop Carrier the Mechanic repairs it and the others still get in.
  if (target.hp < target.maxHp) {
    const targetClass = unit ? UNIT_STATS[unit.kind].class : "building";
    const helpers = take((u) => tendRate(u.kind, targetClass) > 0);
    if (helpers.length > 0) commands.push({ type: "tend", unitIds: helpers, targetId: target.id });
  }

  if (unit && isTroopCarrier(unit.kind)) {
    const infantry = take((u) => UNIT_STATS[u.kind].class === "infantry");
    if (infantry.length > 0) commands.push({ type: "board", unitIds: infantry, targetId: target.id });
  }
  return commands;
}

/** A right-click on the ground: on Ore the selected Harvesters harvest it, and everything else walks there. */
function groundCommands(view: PlayerView, unitIds: readonly EntityId[], cell: CellPos): Command[] {
  const onOre = (view.map.ore[cell.y * view.map.width + cell.x] ?? 0) > 0;
  const harvesters = onOre
    ? view.units.filter((u) => unitIds.includes(u.id) && u.kind === "harvester").map((u) => u.id)
    : [];
  const others = unitIds.filter((id) => !harvesters.includes(id));
  const commands: Command[] = [];
  if (harvesters.length > 0) commands.push({ type: "harvest", unitIds: harvesters, target: cell });
  if (others.length > 0) commands.push({ type: "move", unitIds: others, target: cell });
  return commands;
}

/** True for a Command that points at a Cell of the ground, which is then marked there. */
export function groundTarget(command: Command): CellPos | null {
  return command.type === "move" || command.type === "harvest" ? command.target : null;
}

/** The Unload key: every selected Troop Carrier Unloads, with Passengers or without. Null, so nothing happens, with none selected. */
export function unloadCommand(view: PlayerView, selection: Selection): Extract<Command, { type: "unload" }> | null {
  const carriers = view.units
    .filter((u) => u.owner === view.playerId && selection.has(u.id) && isTroopCarrier(u.kind))
    .map((u) => u.id);
  return carriers.length > 0 ? { type: "unload", unitIds: carriers } : null;
}
