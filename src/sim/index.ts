// The Simulation's public seam (ADR 0002). Everything outside src/sim goes
// through these exports, and so do tests of the rules. The one exception is a
// pure helper module with real logic of its own (pathfinding): its tests may
// import it directly, since it has no Match to drive.
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
export { UNIT_STATS, BUILDING_STATS, ECONOMY, PLACEMENT, TRAINING, OPPONENT, TICKS_PER_SECOND } from "./tuning";
export { createRng, nextFloat, nextInt } from "./rng";
export type { Rng } from "./rng";
export { TRAINS } from "./training";
export type { TrainingView } from "./training";
export { canPlaceBuilding } from "./placement";
