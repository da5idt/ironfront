import type { CommandResult } from "../commands";
import { updateFog } from "../fog";
import { advanceTick, createMatch, getPlayerView, issueCommand, type Match } from "../match";
import { addBuilding, cellIndex, type MatchState, removeBuilding, spawnUnit } from "../state";
import type { BuildingKind, CellPos, EntityId, PlayerId, UnitKind, Vec } from "../types";
import type { UnitView } from "../view";
import { TROOP_CARRIER } from "../tuning";
import { openMap } from "./maps";

/** The fewest whole Cells along a row or a column that make a drive long enough to end in Collecting. */
export const LONG_ENOUGH = Math.ceil(TROOP_CARRIER.collectAfterCells);

/**
 * A Match on a wide open Map. Its starting bases are in the corners, so a test
 * that stages its Units along a row near the middle has only those take part.
 */
export function stage(): Match {
  return createMatch(openMap(50, 40), 1);
}

export function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

/** Advances the Match until `done` is true and returns how many Ticks that took; throws when it is still not so at the limit. */
export function runUntil(match: Match, done: () => boolean, limit = 1200): number {
  for (let t = 0; t < limit; t++) {
    if (done()) return t;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

/** A Unit as its owner sees it: a Player always sees its own Units. Undefined once it is gone. */
export function find(match: Match, id: EntityId): UnitView | undefined {
  return (
    getPlayerView(match, 0).units.find((u) => u.id === id && u.owner === 0) ??
    getPlayerView(match, 1).units.find((u) => u.id === id && u.owner === 1)
  );
}

export function hp(match: Match, id: EntityId): number {
  return find(match, id)!.hp;
}

export function at(match: Match, id: EntityId): Vec {
  const unit = find(match, id)!;
  return { x: unit.x, y: unit.y };
}

/** Adds a Unit at that health and returns its id. */
export function hurt(match: Match, owner: PlayerId, kind: UnitKind, x: number, y: number, health: number): EntityId {
  const id = addTestUnit(match, owner, kind, { x, y });
  setTestUnitHp(match, id, health);
  return id;
}

export function tend(match: Match, unitIds: EntityId[], targetId: EntityId, player: PlayerId = 0): CommandResult {
  return issueCommand(match, player, { type: "tend", unitIds, targetId });
}

/** Everything either Player can see, to show that a rejected Command changed nothing. */
export function snapshot(match: Match): string {
  return JSON.stringify([getPlayerView(match, 0), getPlayerView(match, 1)]);
}

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
  const m = match as unknown as MatchState;
  const id = spawnUnit(m, owner, kind, at).id;
  // As if it had stood there last Tick, so it can be seen and attacked at once.
  updateFog(m);
  return id;
}

/** Sets a Building's health, so tests can stage its destruction without a long fight. */
export function setTestBuildingHp(match: Match, id: EntityId, hp: number): void {
  const building = (match as unknown as MatchState).buildings.get(id);
  if (building) building.hp = hp;
}

/** Sets a Unit's health, so tests can stage a hurt Unit without a fight. */
export function setTestUnitHp(match: Match, id: EntityId, hp: number): void {
  const unit = (match as unknown as MatchState).units.get(id);
  if (unit) unit.hp = hp;
}
