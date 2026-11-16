import type { EntityId, UnitView } from "../sim";
import type { Point, Selection } from "./selection";

// Control Groups: the person's saved selections, 1 to 9. Client state like the
// selection itself, not a rule of the Match: the Simulation never hears of
// them. Kept pure so the rules are unit tested without a browser.

/** The Units saved under each group number. A Unit is in at most one group. */
export type ControlGroups = ReadonlyMap<number, ReadonlySet<EntityId>>;

export const NO_GROUPS: ControlGroups = new Map();

export const FIRST_GROUP = 1;
export const LAST_GROUP = 9;
/** A second press of a group's key within this long also centres the camera on the group. */
export const RECENTRE_WITHIN_MS = 400;

function isGroup(group: number): boolean {
  return Number.isInteger(group) && group >= FIRST_GROUP && group <= LAST_GROUP;
}

/**
 * Saves the selected Units as a group, replacing what the number held and
 * taking those Units out of any other group. Saving nothing changes nothing:
 * a slip of Shift+number with no Units selected must not wipe a group.
 */
export function saveGroup(groups: ControlGroups, group: number, selection: Selection): ControlGroups {
  if (!isGroup(group) || selection.size === 0) return groups;
  const next = new Map<number, ReadonlySet<EntityId>>();
  for (const [n, ids] of groups) {
    if (n === group) continue;
    const kept = new Set([...ids].filter((id) => !selection.has(id)));
    if (kept.size > 0) next.set(n, kept);
  }
  next.set(group, new Set(selection));
  return next;
}

/**
 * The selection a group's key gives: its living Units on the Map, or null (leave the selection alone)
 * when it has none. Those riding as Passengers take no Command, so they are left out until they get out.
 */
export function selectGroup(groups: ControlGroups, group: number, units: readonly UnitView[]): Selection | null {
  const ids = groups.get(group);
  if (!ids) return null;
  const living = units.filter((u) => ids.has(u.id)).map((u) => u.id);
  return living.length > 0 ? new Set(living) : null;
}

/**
 * Drops Units that no longer exist. Returns `groups` itself when nothing was dropped.
 * A Passenger still exists: it is off the Map, so the view lists it only inside its
 * Troop Carrier, and it keeps its group for when it gets out. One lost with its
 * Troop Carrier is listed nowhere and is dropped like any other.
 */
export function pruneGroups(groups: ControlGroups, units: readonly UnitView[]): ControlGroups {
  if (groups.size === 0) return groups;
  const alive = new Set<EntityId>();
  for (const u of units) {
    alive.add(u.id);
    for (const p of u.passengers ?? []) alive.add(p.id);
  }
  let dropped = false;
  const next = new Map<number, ReadonlySet<EntityId>>();
  for (const [n, ids] of groups) {
    const kept = new Set([...ids].filter((id) => alive.has(id)));
    if (kept.size !== ids.size) dropped = true;
    if (kept.size > 0) next.set(n, kept);
  }
  return dropped ? next : groups;
}

/** Each grouped Unit's group number, for drawing it on the Unit. */
export function groupNumbers(groups: ControlGroups): Map<EntityId, number> {
  const numbers = new Map<EntityId, number>();
  for (const [n, ids] of groups) for (const id of ids) numbers.set(id, n);
  return numbers;
}

/** The middle of a group's living Units, in Cells, or null when it has none. */
export function groupCentre(groups: ControlGroups, group: number, units: readonly UnitView[]): Point | null {
  const ids = groups.get(group);
  const living = ids ? units.filter((u) => ids.has(u.id)) : [];
  if (living.length === 0) return null;
  return {
    x: living.reduce((sum, u) => sum + u.x, 0) / living.length,
    y: living.reduce((sum, u) => sum + u.y, 0) / living.length,
  };
}

/** The last press of a group's key: which group, and when (milliseconds). */
export interface GroupKeyPress {
  readonly group: number;
  readonly atMs: number;
}

/** Whether this press of a group's key is a quick second one, which also centres the camera, and the press to remember. */
export function groupPress(
  last: GroupKeyPress | null,
  group: number,
  nowMs: number,
): { readonly centre: boolean; readonly last: GroupKeyPress } {
  const centre = last !== null && last.group === group && nowMs - last.atMs <= RECENTRE_WITHIN_MS;
  return { centre, last: { group, atMs: nowMs } };
}
