import { describe, expect, it } from "vitest";
import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  type Command,
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
import { openMap, testMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp, setTestOre } from "../sim/testing/setup";
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

describe("Computer Opponent harvesting under Fog of War", () => {
  it("never has a harvest Command refused, even for a field emptied out of its sight", () => {
    // Near Ore at (5,6) with one dig left; far Ore at (15,6), seen full and then dug out unseen.
    const rows = Array.from({ length: 20 }, (_, y) =>
      y === 6 ? ".....*.........*...." : y === 10 ? "#".repeat(20) : ".".repeat(20),
    );
    const match = createMatch(testMap(rows), 1);
    setTestOre(match, { x: 5, y: 6 }, 1);
    const harvester = getPlayerView(match, 0).units.find((u) => u.owner === 0 && u.kind === "harvester")!;
    issueCommand(match, 0, { type: "stop", unitIds: [harvester.id] });
    const scout = addTestUnit(match, 0, "rifleman", { x: 15, y: 4 });
    advanceTick(match);
    issueCommand(match, 0, { type: "move", unitIds: [scout], target: { x: 19, y: 0 } });
    for (let t = 0; t < 10 * TICKS_PER_SECOND; t++) advanceTick(match);
    setTestOre(match, { x: 15, y: 6 }, 0);
    advanceTick(match);

    const opponent = createOpponent(0, 1);
    const results: boolean[] = [];
    for (let t = 0; t < 60 * TICKS_PER_SECOND; t++) {
      if (t % THINK_EVERY_TICKS === 0) {
        for (const command of opponent.think(getPlayerView(match, 0))) {
          const result = issueCommand(match, 0, command);
          if (command.type === "harvest") results.push(result.ok);
        }
      }
      advanceTick(match);
    }
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((ok) => ok)).toBe(true);
  });
});

describe("Computer Opponent defending against an unseen attacker", () => {
  it("walks its defenders to a Cell on the Map beside a Building hit on the Map's bottom edge", () => {
    // Player 1's HQ covers (27..29, 27..29): its bottom row is the Map's last.
    const match = createMatch(openMap(30, 30), 1);
    const opponent = createOpponent(1, 1);
    for (const command of opponent.think(getPlayerView(match, 1))) issueCommand(match, 1, command);
    advanceTick(match);
    const hq = getPlayerView(match, 1).buildings.find((b) => b.owner === 1 && b.kind === "hq")!;
    setTestBuildingHp(match, hq.id, hq.hp - 50);
    const commands = opponent.think(getPlayerView(match, 1));
    const defend = commands.find(
      (c) =>
        c.type === "move" &&
        c.target.x >= hq.x - 1 &&
        c.target.x <= hq.x + hq.width &&
        c.target.y >= hq.y - 1 &&
        c.target.y <= hq.y + hq.height,
    );
    expect(defend).toBeDefined();
    for (const command of commands) expect(issueCommand(match, 1, command), JSON.stringify(command)).toEqual({ ok: true });
  });
});

describe("Computer Opponent attack waves", () => {
  /** Plays Player 1 as the Opponent against a passive Player 0 and keeps every Command it gave. */
  function playRecording(match: Match, ticks: number, onTick?: (tick: number) => void): Command[] {
    const opponent = createOpponent(1, 7);
    const given: Command[] = [];
    const recording: Opponent = {
      think: (view) => {
        const commands = opponent.think(view);
        given.push(...commands);
        return commands;
      },
    };
    play(match, [{ player: 1, opponent: recording }], ticks, onTick);
    return given;
  }

  it("sends a wave by Attack-move, to its gathering point and then onto the other Player's Buildings", () => {
    const match = createMatch(RIVERFORD, 7);
    const given = playRecording(match, 8 * MINUTES);
    const attackMoves = given.filter((c) => c.type === "attackMove");
    // A wave is several Units; the only other Unit sent out alone is the scout, on a plain move.
    const SEVERAL = 3;
    expect(attackMoves.some((c) => c.unitIds.length >= SEVERAL)).toBe(true);
    // Player 0's base is the top-left corner: HQ at (4,4), Refinery at (9,4).
    expect(attackMoves.some((c) => Math.hypot(c.target.x - 7, c.target.y - 6) < 6)).toBe(true);
  });

  // openMap(40, 40): Player 0's HQ covers (0..2, 0..2) and its Refinery (4..6, 0..1); Player 1's HQ
  // covers (37..39, 37..39). Eight Raiders more than a first wave needs, so one leaves as soon as waves may.
  function stagedWave(stage: (match: Match) => void): Match {
    const match = createMatch(openMap(40, 40), 7);
    for (let i = 0; i < 8; i++) addTestUnit(match, 1, "raider", { x: 28 + i, y: 34 });
    stage(match);
    return match;
  }
  const WAVE_HAS_STRUCK = 7 * MINUTES;

  it("kills a Rifleman it meets on the way to its gathering point, far from either base", () => {
    let sentry = 0;
    const match = stagedWave((m) => {
      // On the straight line between the bases, more than twenty Cells from each.
      sentry = addTestUnit(m, 0, "rifleman", { x: 20, y: 20 });
    });
    playRecording(match, WAVE_HAS_STRUCK);
    expect(getPlayerView(match, 0).units.some((u) => u.id === sentry)).toBe(false);
  });

  it("turns on a Turret that covers the Building it came for, before that Building falls", () => {
    const match = stagedWave((m) => {
      // Five Cells from the Cell below the Refinery, where the wave arrives: inside the
      // Turret's range of 5.5 and outside a Raider's 4 and a Rifleman's 3.5.
      addTestBuilding(m, 0, "turret", { x: 1, y: 6 });
    });
    let refineryStoodWhenTurretFell: boolean | null = null;
    playRecording(match, WAVE_HAS_STRUCK, () => {
      if (refineryStoodWhenTurretFell !== null) return;
      const own = getPlayerView(match, 0).buildings.filter((b) => b.owner === 0);
      if (own.some((b) => b.kind === "turret")) return;
      refineryStoodWhenTurretFell = own.some((b) => b.kind === "refinery");
    });
    expect(refineryStoodWhenTurretFell).toBe(true);
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
