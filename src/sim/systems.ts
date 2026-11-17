import { buildProgress, deliverFreeHarvesters, dropOrphanedProduction } from "./building";
import { fight, removeDead } from "./combat";
import { updateFog } from "./fog";
import { harvestOre } from "./harvest";
import { moveUnits, noteMovesAtTickStart } from "./movement";
import { boardTroopCarriers, collectPassengers, forgetShownPassengerEvents, getOutUnderFire } from "./passengers";
import { tendTargets } from "./tend";
import { trainUnits } from "./training";
import type { MatchState } from "./state";
import { decideVictory } from "./victory";

// The rules that run every Tick, in this order. Features add their system here.
// Fog of War stays last so it sees where everything ended up this Tick, and
// Victory comes after the dead are removed, so it sees who has Buildings left.
// Passengers get out under fire straight after the fight and before the dead
// are removed, so those of a Troop Carrier destroyed this Tick still get out.
// The moves under way are noted before anything walks, which is how Collecting
// knows a Troop Carrier arrived this Tick.
// Collecting comes after the fight, which is what tells it that a Troop Carrier
// lost health on the Tick it stopped, and before the Tend, so an idle support
// Unit is taken in before it looks for work.
export type System = (m: MatchState) => void;

export const SYSTEMS: readonly System[] = [
  forgetShownPassengerEvents,
  noteMovesAtTickStart,
  buildProgress,
  trainUnits,
  deliverFreeHarvesters,
  moveUnits,
  boardTroopCarriers,
  harvestOre,
  fight,
  getOutUnderFire,
  collectPassengers,
  tendTargets,
  removeDead,
  dropOrphanedProduction,
  decideVictory,
  updateFog,
];
