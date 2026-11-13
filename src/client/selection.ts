import type { BuildingView, EntityId, PlayerId, UnitView } from "../sim";

// Which Units the person has selected. This is client state, not part of the
// Match: selecting changes nothing until a Command is issued. Kept pure so the
// hit testing and box rules are unit tested without a browser.

export type Selection = ReadonlySet<EntityId>;

/** A Map position in Cell units. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How far from a Unit's centre a click still hits it, in Cells. */
export const UNIT_HIT_RADIUS = 0.5;
/** Mouse travel below this, in screen pixels, is a click rather than a drag. */
export const DRAG_THRESHOLD_PX = 5;

/** The player's own Unit nearest to the point within hit range, or null. */
export function unitAt(units: readonly UnitView[], p: Point, player: PlayerId): UnitView | null {
  return nearestHit(units, p, (u) => u.owner === player);
}

/** The other Player's Unit nearest to the point within hit range, or null. */
export function enemyUnitAt(units: readonly UnitView[], p: Point, player: PlayerId): UnitView | null {
  return nearestHit(units, p, (u) => u.owner !== player);
}

/** The player's own Building whose footprint holds the point, or null. */
export function ownBuildingAt(buildings: readonly BuildingView[], p: Point, player: PlayerId): BuildingView | null {
  return (
    buildings.find(
      (b) => b.owner === player && p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height,
    ) ?? null
  );
}

function nearestHit(units: readonly UnitView[], p: Point, wanted: (u: UnitView) => boolean): UnitView | null {
  let best: UnitView | null = null;
  let bestD = UNIT_HIT_RADIUS;
  for (const u of units) {
    if (!wanted(u)) continue;
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d <= bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

/** Ids of the player's own Units whose centre lies in the box spanned by two corners. */
export function unitsInBox(units: readonly UnitView[], a: Point, b: Point, player: PlayerId): EntityId[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return units
    .filter((u) => u.owner === player && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1)
    .map((u) => u.id);
}

/** A click selects just the hit Unit; with shift it toggles it in or out instead. */
export function clickSelect(sel: Selection, hit: EntityId | null, shift: boolean): Selection {
  if (!shift) return new Set(hit === null ? [] : [hit]);
  if (hit === null) return sel;
  const next = new Set(sel);
  if (next.has(hit)) next.delete(hit);
  else next.add(hit);
  return next;
}

/** A box replaces the selection; with shift it adds to it. */
export function boxSelect(sel: Selection, ids: readonly EntityId[], shift: boolean): Selection {
  return new Set(shift ? [...sel, ...ids] : ids);
}

/** Drops Units that no longer exist. Returns `sel` itself when nothing was dropped. */
export function pruneSelection(sel: Selection, units: readonly UnitView[]): Selection {
  if (sel.size === 0) return sel;
  const alive = new Set(units.map((u) => u.id));
  for (const id of sel) {
    if (!alive.has(id)) return new Set([...sel].filter((x) => alive.has(x)));
  }
  return sel;
}

export function isDrag(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD_PX;
}
