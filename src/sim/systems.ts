import { buildProgress, dropOrphanedProduction } from "./building";
import { fight, removeDead } from "./combat";
import { updateFog } from "./fog";
import { harvestOre } from "./harvest";
import { moveUnits } from "./movement";
import { trainUnits } from "./training";
import type { MatchState } from "./state";
import { decideVictory } from "./victory";

// The rules that run every Tick, in this order. Features add their system here.
// Fog of War stays last so it sees where everything ended up this Tick, and
// Victory comes after the dead are removed, so it sees who has Buildings left.
export type System = (m: MatchState) => void;

export const SYSTEMS: readonly System[] = [
  buildProgress,
  trainUnits,
  moveUnits,
  harvestOre,
  fight,
  removeDead,
  dropOrphanedProduction,
  decideVictory,
  updateFog,
];
