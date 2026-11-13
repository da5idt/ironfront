import { BUILDING_STATS, type BuildingKind, canPlaceBuilding, type CellPos, type PlayerView } from "../sim";

// Where the Computer Opponent puts a finished Building. It asks the same
// placement rule the person's preview uses, so it never tries a spot the
// Simulation would refuse on what it knows.

/** How far from the wanted spot to look before giving up. */
const SEARCH_RADIUS = 12;

/**
 * The legal spot for `kind` whose footprint centre is nearest `near`, or null.
 * Ties go to the top-most, then left-most spot so the choice is the same every
 * run. On top of the placement rule it keeps a Cell of space round every
 * Building, so the base never walls its own Units in, and keeps off Ore.
 */
export function findBuildSite(view: PlayerView, kind: BuildingKind, near: CellPos): CellPos | null {
  const { width, height } = BUILDING_STATS[kind];
  const cx = near.x + 0.5;
  const cy = near.y + 0.5;
  let best: CellPos | null = null;
  let bestD = Infinity;
  for (let y = near.y - SEARCH_RADIUS; y <= near.y + SEARCH_RADIUS; y++) {
    for (let x = near.x - SEARCH_RADIUS; x <= near.x + SEARCH_RADIUS; x++) {
      const d = (x + width / 2 - cx) ** 2 + (y + height / 2 - cy) ** 2;
      // Scanning top-left first, so only a strictly nearer spot replaces the best.
      if (d >= bestD) continue;
      const at = { x, y };
      if (!canPlaceBuilding(view, kind, at) || coversOre(view, at, width, height) || crowded(view, at, width, height)) {
        continue;
      }
      best = at;
      bestD = d;
    }
  }
  return best;
}

function coversOre(view: PlayerView, at: CellPos, width: number, height: number): boolean {
  for (let y = at.y; y < at.y + height; y++) {
    for (let x = at.x; x < at.x + width; x++) if (view.map.ore[y * view.map.width + x]! > 0) return true;
  }
  return false;
}

/** True when any Building stands within one Cell of the footprint. */
function crowded(view: PlayerView, at: CellPos, width: number, height: number): boolean {
  return view.buildings.some(
    (b) => b.x <= at.x + width && b.x + b.width >= at.x && b.y <= at.y + height && b.y + b.height >= at.y,
  );
}
