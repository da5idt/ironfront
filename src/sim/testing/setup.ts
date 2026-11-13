import type { Match } from "../match";
import { addBuilding, cellIndex, type MatchState, removeBuilding } from "../state";
import type { BuildingKind, CellPos, EntityId, PlayerId } from "../types";

/**
 * Puts a Building on the Map directly, skipping cost and placement rules, so
 * tests can shape the ground (or block a route mid-move) before building
 * Commands exist. Like the real thing, it fills the footprint's Cells.
 */
export function addTestBuilding(match: Match, owner: PlayerId, kind: BuildingKind, at: CellPos): void {
  // Match is opaque outside src/sim; this helper lives inside it on purpose.
  addBuilding(match as unknown as MatchState, owner, kind, at);
}

/** Sets the Ore left in a Cell, so Fog of War tests can change Ore out of sight before harvesting exists. */
export function setTestOre(match: Match, cell: CellPos, amount: number): void {
  const m = match as unknown as MatchState;
  m.ore[cellIndex(m, cell.x, cell.y)] = amount;
}

/**
 * Takes a Building off the Map the way destruction does (removeBuilding), so
 * Fog of War tests can destroy one out of sight before combat exists.
 */
export function removeTestBuilding(match: Match, id: EntityId): void {
  const m = match as unknown as MatchState;
  const building = m.buildings.get(id);
  if (building) removeBuilding(m, building);
}
