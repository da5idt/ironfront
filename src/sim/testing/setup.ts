import type { Match } from "../match";
import { addBuilding, cellIndex, type MatchState, removeBuilding, spawnUnit } from "../state";
import type { BuildingKind, CellPos, EntityId, PlayerId, UnitKind } from "../types";

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

/** Sets a Player's Credits, so tests reach "can't afford" without a long economy run. */
export function setTestCredits(match: Match, player: PlayerId, credits: number): void {
  (match as unknown as MatchState).players[player].credits = credits;
}

/**
 * Puts a Unit on the Map directly, skipping training, so tests can stage a
 * fight before training exists. Returns the new Unit's id.
 */
export function addTestUnit(match: Match, owner: PlayerId, kind: UnitKind, at: CellPos): EntityId {
  return spawnUnit(match as unknown as MatchState, owner, kind, at).id;
}
