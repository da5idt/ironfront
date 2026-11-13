// The Simulation's public seam (ADR 0002). Everything outside src/sim, tests
// included, goes through these exports.
export { createMatch, issueCommand, advanceTick, getPlayerView, getMatchStatus } from "./match";
export type { Match } from "./match";
export type { Command, CommandResult } from "./commands";
export type { MapDef, StartDef } from "./mapdef";
export type { MatchStatus } from "./state";
export type { PlayerView, UnitView, BuildingView, MapView, ShotView } from "./view";
export type { Visibility } from "./fog";
export * from "./types";
export { HQ_BUILDS } from "./building";
export type { ProductionView } from "./building";
export { UNIT_STATS, BUILDING_STATS, ECONOMY, PLACEMENT, TICKS_PER_SECOND } from "./tuning";
export { canPlaceBuilding } from "./placement";
