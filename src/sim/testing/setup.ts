import type { Match } from "../match";
import { addBuilding, type MatchState, spawnUnit } from "../state";
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

/**
 * Puts a Unit on the Map directly, skipping training, so tests can stage a
 * fight before training exists. Returns the new Unit's id.
 */
export function addTestUnit(match: Match, owner: PlayerId, kind: UnitKind, at: CellPos): EntityId {
  return spawnUnit(match as unknown as MatchState, owner, kind, at).id;
}
