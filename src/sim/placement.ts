import { BUILDING_STATS, PLACEMENT } from "./tuning";
import type { BuildingKind, CellPos, Terrain } from "./types";
import { isPassableTerrain } from "./types";
import type { PlayerView } from "./view";

// Where a Player may place a Building. One rule, two callers: the Simulation
// checks it against the real Match, and the client preview and the Computer
// Opponent check it against a PlayerView. Both describe the ground the same way
// so the rule itself is written once.

interface Footprint {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the placement rule needs to know about the ground, from either side of the seam. */
export interface PlacementGround {
  readonly width: number;
  readonly height: number;
  /** Indexed by y * width + x. */
  readonly terrain: readonly Terrain[];
  /** False for Cells this Player has never seen. */
  explored(x: number, y: number): boolean;
  /** True where a Building or Unit is in the way. */
  occupied(x: number, y: number): boolean;
  /** The placing Player's own Buildings. */
  readonly ownBuildings: readonly Footprint[];
}

/** Why a Building cannot go there, or null when it can. */
export function placementProblem(ground: PlacementGround, kind: BuildingKind, at: CellPos): string | null {
  const { width, height } = BUILDING_STATS[kind];
  const spot = { x: at.x, y: at.y, width, height };
  for (let y = at.y; y < at.y + height; y++) {
    for (let x = at.x; x < at.x + width; x++) {
      if (x < 0 || y < 0 || x >= ground.width || y >= ground.height) return "off the Map";
      if (!isPassableTerrain(ground.terrain[y * ground.width + x]!)) return "impassable ground";
      if (!ground.explored(x, y)) return "Unexplored ground";
      if (ground.occupied(x, y)) return "something is in the way";
    }
  }
  if (!ground.ownBuildings.some((b) => gap(b, spot) <= PLACEMENT.maxGap)) return "too far from own Buildings";
  return null;
}

/** Cells strictly between two footprints, along whichever axis they are furthest apart. */
function gap(a: Footprint, b: Footprint): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.max(dx, dy);
}

function covers(f: Footprint, x: number, y: number): boolean {
  return x >= f.x && y >= f.y && x < f.x + f.width && y < f.y + f.height;
}

/**
 * Whether the Player whose view this is may place `kind` with its top-left
 * Cell at `at`, judged only from what that Player knows. Remembered enemy
 * Buildings count as in the way. The Simulation applies the same rule to the
 * real Match, so it can still refuse a spot where something unseen stands.
 */
export function canPlaceBuilding(view: PlayerView, kind: BuildingKind, at: CellPos): boolean {
  const { map } = view;
  const ground: PlacementGround = {
    width: map.width,
    height: map.height,
    terrain: map.terrain,
    explored: (x, y) => map.visibility[y * map.width + x] !== "unexplored",
    occupied: (x, y) =>
      view.buildings.some((b) => covers(b, x, y)) ||
      view.units.some((u) => Math.floor(u.x) === x && Math.floor(u.y) === y),
    ownBuildings: view.buildings.filter((b) => b.owner === view.playerId),
  };
  return placementProblem(ground, kind, at) === null;
}
