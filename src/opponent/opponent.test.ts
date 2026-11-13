import { describe, expect, it } from "vitest";
import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  createMatch,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type Match,
  type MatchStatus,
  OPPONENT,
  type PlayerId,
  TICKS_PER_SECOND,
} from "../sim";
import { addTestUnit } from "../sim/testing/setup";
import { createOpponent, type Opponent, THINK_EVERY_TICKS } from "./opponent";

interface Seat {
  readonly player: PlayerId;
  readonly opponent: Opponent;
}

/** Runs the Match the way the client does: each Opponent thinks on its cadence and its Commands are issued. */
function play(match: Match, seats: readonly Seat[], ticks: number, onTick?: (tick: number) => void): void {
  for (let t = 0; t < ticks && getMatchStatus(match).state === "running"; t++) {
    if (t % THINK_EVERY_TICKS === 0) {
      for (const { player, opponent } of seats) {
        for (const command of opponent.think(getPlayerView(match, player))) issueCommand(match, player, command);
      }
    }
    advanceTick(match);
    onTick?.(t);
  }
}

const MINUTES = 60 * TICKS_PER_SECOND;

describe("Computer Opponent on Riverford against a passive Player", () => {
  it("builds a Barracks, trains Units and destroys every one of the passive Player's Buildings", () => {
    const match = createMatch(RIVERFORD, 7);
    let builtBarracks = false;
    let trained = false;
    play(match, [{ player: 1, opponent: createOpponent(1, 7) }], 20 * MINUTES, (tick) => {
      if (tick % 100 !== 0) return;
      const own = getPlayerView(match, 1);
      if (own.buildings.some((b) => b.owner === 1 && b.kind === "barracks")) builtBarracks = true;
      // Player 1 starts with two Riflemen; any more were trained.
      if (own.units.filter((u) => u.owner === 1 && u.kind !== "harvester").length > 2) trained = true;
    });
    expect(builtBarracks).toBe(true);
    expect(trained).toBe(true);
    expect(getMatchStatus(match)).toEqual<MatchStatus>({ state: "victory", winner: 1 });
  });

  it("works through its build order: Barracks, a second Refinery, a Vehicle Factory and a Turret", () => {
    const match = createMatch(RIVERFORD, 7);
    play(match, [{ player: 1, opponent: createOpponent(1, 7) }], 4 * MINUTES);
    const kinds = getPlayerView(match, 1)
      .buildings.filter((b) => b.owner === 1)
      .map((b) => b.kind);
    expect(kinds.filter((k) => k === "refinery")).toHaveLength(2);
    expect(kinds).toEqual(expect.arrayContaining(["barracks", "vehicleFactory", "turret"]));
  });

  it("holds its first attack until about four and a half minutes in", () => {
    const match = createMatch(RIVERFORD, 7);
    // Player 0's base: HQ at (4,4), Refinery at (9,4).
    let firstArmyNearBase: number | null = null;
    play(match, [{ player: 1, opponent: createOpponent(1, 7) }], 8 * MINUTES, (tick) => {
      if (firstArmyNearBase !== null || tick % 20 !== 0) return;
      const near = getPlayerView(match, 1).units.filter(
        (u) => u.owner === 1 && u.kind !== "harvester" && Math.hypot(u.x - 7, u.y - 6) < 12,
      );
      // One Unit is the scout; an attack is several.
      if (near.length >= 3) firstArmyNearBase = tick;
    });
    expect(firstArmyNearBase).not.toBeNull();
    expect(firstArmyNearBase!).toBeGreaterThan(4.5 * MINUTES);
    expect(firstArmyNearBase!).toBeLessThan(6.5 * MINUTES);
  });
});

describe("Computer Opponent scouting and defence on Riverford", () => {
  it("sends a scout that finds the other base within a minute and a half", () => {
    const match = createMatch(RIVERFORD, 7);
    play(match, [{ player: 1, opponent: createOpponent(1, 7) }], 1.5 * MINUTES);
    const known = getPlayerView(match, 1).buildings.filter((b) => b.owner === 0);
    expect(known.length).toBeGreaterThan(0);
  });

  it("then explores round its own base, so it knows every Ore Field near home within four minutes", () => {
    const match = createMatch(RIVERFORD, 7);
    play(match, [{ player: 1, opponent: createOpponent(1, 7) }], 4 * MINUTES);
    const { map } = getPlayerView(match, 1);
    // Player 1's HQ centre is (58,58); its side of the river holds four Ore Fields within 28 Cells.
    const unseenOre: number[] = [];
    for (let i = 0; i < map.terrain.length; i++) {
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      if (Math.hypot(x - 58, y - 58) <= OPPONENT.homeExploreRadius && RIVERFORD.rows[y]![x] === "*") {
        if (map.visibility[i] === "unexplored") unseenOre.push(i);
      }
    }
    expect(unseenOre).toEqual([]);
  });

  it("turns its army on enemy Units shooting at its base", () => {
    const match = createMatch(RIVERFORD, 7);
    const opponent = createOpponent(1, 7);
    play(match, [{ player: 1, opponent }], 3 * MINUTES);
    // Player 1's HQ covers (57..59, 57..59); its army waits at the rally point
    // near (53,53), out of range of the HQ's far corner.
    const raiders = [
      addTestUnit(match, 0, "raider", { x: 61, y: 60 }),
      addTestUnit(match, 0, "raider", { x: 61, y: 61 }),
    ];
    play(match, [{ player: 1, opponent }], 30 * TICKS_PER_SECOND);
    const left = getPlayerView(match, 1).units.filter((u) => raiders.includes(u.id));
    expect(left).toEqual([]);
  });
});

describe("Computer Opponent against itself on Riverford", () => {
  it("one side wins within thirty minutes; neither economy starves into a stalemate", () => {
    const match = createMatch(RIVERFORD, 3);
    play(
      match,
      [
        { player: 0, opponent: createOpponent(0, 11) },
        { player: 1, opponent: createOpponent(1, 12) },
      ],
      30 * MINUTES,
    );
    expect(getMatchStatus(match).state).toBe("victory");
  }, 60_000);
});

describe("Computer Opponent determinism", () => {
  it("plays the same Match twice from the same seeds", () => {
    const run = () => {
      const match = createMatch(RIVERFORD, 3);
      play(
        match,
        [
          { player: 0, opponent: createOpponent(0, 11) },
          { player: 1, opponent: createOpponent(1, 12) },
        ],
        4 * MINUTES,
      );
      return [getPlayerView(match, 0), getPlayerView(match, 1)];
    };
    expect(run()).toEqual(run());
  });
});
