import type { Match } from "../match";
import { addBuilding, type MatchState } from "../state";
import type { BuildingKind, CellPos, PlayerId } from "../types";

/**
 * Puts a Building on the Map directly, skipping cost and placement rules, so
 * tests can shape the ground (or block a route mid-move) before building
 * Commands exist. Like the real thing, it fills the footprint's Cells.
 */
export function addTestBuilding(match: Match, owner: PlayerId, kind: BuildingKind, at: CellPos): void {
  // Match is opaque outside src/sim; this helper lives inside it on purpose.
  addBuilding(match as unknown as MatchState, owner, kind, at);
}
