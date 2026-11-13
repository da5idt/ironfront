import { harvestOre } from "./harvest";
import { moveUnits } from "./movement";
import type { MatchState } from "./state";

// The rules that run every Tick, in this order. Features add their system here.
export type System = (m: MatchState) => void;

export const SYSTEMS: readonly System[] = [moveUnits, harvestOre];
