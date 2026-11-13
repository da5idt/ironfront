import type { MatchState } from "./state";
import { type PlayerId, PLAYER_IDS } from "./types";

// Victory: a Player with no Buildings left loses at the end of that Tick.
//
// Both Players can lose their last Building in the same Tick, as every shot
// lands before the dead are removed. A Match always names a winner, so that
// case goes to the Player with more Units left, who could still have fought
// on; with as many Units each it goes to Player 0. The rule is arbitrary but
// fixed, so replays agree, and the case needs two last Buildings to fall in
// the same twentieth of a second.

function hasBuildings(m: MatchState, player: PlayerId): boolean {
  for (const b of m.buildings.values()) if (b.owner === player) return true;
  return false;
}

function unitCount(m: MatchState, player: PlayerId): number {
  let n = 0;
  for (const u of m.units.values()) if (u.owner === player) n++;
  return n;
}

/** Per-Tick system, after the dead are removed: ends the Match once a Player has no Buildings. */
export function decideVictory(m: MatchState): void {
  const losers = PLAYER_IDS.filter((p) => !hasBuildings(m, p));
  if (losers.length === 0) return;
  if (losers.length === 1) {
    m.status = { state: "victory", winner: losers[0] === 0 ? 1 : 0 };
    return;
  }
  m.status = { state: "victory", winner: unitCount(m, 1) > unitCount(m, 0) ? 1 : 0 };
}
