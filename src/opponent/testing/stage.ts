import { expect } from "vitest";
import {
  advanceTick,
  type BuildingKind,
  type CellPos,
  type Command,
  createMatch,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type MapDef,
  type Match,
  OPPONENT,
  type PlayerId,
  TICKS_PER_SECOND,
} from "../../sim";
import { openMap } from "../../sim/testing/maps";
import { addTestBuilding, addTestUnit } from "../../sim/testing/setup";
import { createOpponent, type Opponent, THINK_EVERY_TICKS } from "../opponent";

// Staging shared by the Computer Opponent's tests. Everything here reaches its
// state the way a Match does, by Commands and Ticks, so the Opponent is only
// ever shown a view the Simulation made.

export const SECONDS = TICKS_PER_SECOND;
export const PLENTY = 20_000;
export const BUILD_ORDER_DONE: readonly BuildingKind[] = ["barracks", "refinery", "vehicleFactory", "turret"];

/**
 * A Match on `map` (an open one of 40 by 40 Cells unless given) with these
 * Buildings added to Player 0's starting HQ and Refinery, one on each of `sites` in turn.
 */
export function base(extra: readonly BuildingKind[], sites: readonly CellPos[], map: MapDef = openMap(40, 40)): Match {
  const match = createMatch(map, 1);
  extra.forEach((kind, i) => addTestBuilding(match, 0, kind, sites[i]!));
  advanceTick(match);
  return match;
}

export interface Given {
  readonly tick: number;
  readonly command: Command;
}

export interface PlayOptions {
  /** Asked after each think with every Command given so far; play ends when it says so. */
  readonly done?: (given: readonly Given[]) => boolean;
  /** Called with each Command just before it is issued, so a test can stage what it meets. */
  readonly before?: (command: Command) => void;
  /** The Player the Opponent plays; Player 0 unless given. */
  readonly player?: PlayerId;
}

/** Plays the Opponent for `ticks`, or until `done`, and returns every Command it gave. */
export function play(match: Match, opponent: Opponent, ticks: number, options: PlayOptions = {}): Given[] {
  const { done, before, player = 0 } = options;
  const given: Given[] = [];
  for (let t = 0; t < ticks && getMatchStatus(match).state === "running"; t++) {
    if (t % THINK_EVERY_TICKS === 0) {
      const view = getPlayerView(match, player);
      for (const command of opponent.think(view)) {
        before?.(command);
        expect(issueCommand(match, player, command), JSON.stringify(command)).toEqual({ ok: true });
        given.push({ tick: view.tick, command });
      }
      if (done?.(given)) break;
    }
    advanceTick(match);
  }
  return given;
}

/** Where `opponentPastItsFirstWave` puts the other Player's Barracks: far from Player 0's base on a Map of 40 by 40 Cells. */
const OUTPOST: CellPos = { x: 32, y: 9 };

/**
 * An Opponent for Player 0 whose first wave has just set off, which is when it
 * begins to spend on support. Six more Riflemen stand far from the base, in
 * sight of a Barracks of the other Player but out of range of it, so the
 * Opponent knows a Building to attack from its first view. The Match is left
 * alone until waves may be sent; then the Opponent thinks once on its own
 * view and its Commands are issued, so the wave is really on its way.
 */
export function opponentPastItsFirstWave(match: Match): Opponent {
  addTestBuilding(match, 1, "barracks", OUTPOST);
  for (let i = 0; i < 6; i++) addTestUnit(match, 0, "rifleman", { x: OUTPOST.x - 2 + i, y: OUTPOST.y - 5 });
  while (getPlayerView(match, 0).tick < OPPONENT.firstWaveTick) advanceTick(match);
  const opponent = createOpponent(0, 1);
  const given = play(match, opponent, 1);
  expect(given.some((g) => g.command.type === "attackMove")).toBe(true);
  return opponent;
}
