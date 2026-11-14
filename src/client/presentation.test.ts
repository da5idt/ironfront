import { describe, expect, it } from "vitest";
import {
  advanceTick,
  createMatch,
  ECONOMY,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
  TICKS_PER_SECOND,
} from "../sim";
import { openMap, testMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit } from "../sim/testing/setup";
import { type Presentation, type PresentationEvent, present, turretFacing, UNIT_TURN_PER_TICK } from "./presentation";

/** Runs a real Match and shows Player 0's view to the presentation module after every Tick, as the client does. */
function watch(match: Match, player: PlayerId = 0) {
  let state: Presentation = present(null, getPlayerView(match, player)).state;
  const events: PresentationEvent[] = [];
  return {
    get state() {
      return state;
    },
    events,
    run(ticks: number): void {
      for (let t = 0; t < ticks; t++) {
        advanceTick(match);
        const next = present(state, getPlayerView(match, player));
        state = next.state;
        events.push(...next.events);
      }
    },
    unit: (id: number) => state.units.get(id)!,
  };
}

describe("a Unit's facing", () => {
  it("is the way it moves: east 0, then clockwise on screen (south 4, west 8, north 12)", () => {
    const match = createMatch(openMap(30, 30), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    const seen = watch(match);
    const go = (x: number, y: number) => {
      issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x, y } });
      seen.run(12);
      const facing = seen.unit(raider).facing;
      // On to the end, so the next leg starts from where this one was headed.
      seen.run(80);
      return facing;
    };
    expect(go(20, 15)).toBe(0);
    expect(go(20, 22)).toBe(4);
    expect(go(12, 22)).toBe(8);
    expect(go(12, 14)).toBe(12);
    // Down and to the left is halfway between south and west.
    expect(go(6, 20)).toBe(6);
  });

  it("turns a few steps a Tick rather than jumping round, and stays as it was once the Unit stops", () => {
    const match = createMatch(openMap(30, 30), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    const seen = watch(match);
    issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 16, y: 15 } });
    seen.run(10);
    expect(seen.unit(raider).facing).toBe(0);
    issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 4, y: 15 } });
    const turn: number[] = [];
    for (let t = 0; t < 5; t++) {
      seen.run(1);
      turn.push(seen.unit(raider).facing);
    }
    expect(UNIT_TURN_PER_TICK).toBe(2);
    // East to west is 8 of the 16 steps: four Ticks at two steps each.
    expect(turn.slice(1).map((f, i) => Math.min((f - turn[i]! + 16) % 16, (turn[i]! - f + 16) % 16))).toEqual([2, 2, 2, 0]);
    expect(turn[4]).toBe(8);
    seen.run(80);
    expect(seen.unit(raider).moving).toBe(false);
    expect(seen.unit(raider).facing).toBe(8);
  });
});

describe("a Unit that shoots", () => {
  it("faces its target at once and stays facing it between shots", () => {
    const match = createMatch(openMap(30, 30), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    // Straight above it, in range (4 Cells).
    const target = addTestUnit(match, 1, "harvester", { x: 10, y: 12 });
    const seen = watch(match);
    // Its own first facing is not north, so north below comes from the shot.
    expect(seen.unit(raider).facing).not.toBe(12);
    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: target });
    seen.run(1);
    expect(seen.unit(raider).facing).toBe(12);
    seen.run(5);
    expect(seen.unit(raider).facing).toBe(12);
  });

  it("gives a shot fired event with the shooter's weapon, from the shooter to the target", () => {
    const match = createMatch(openMap(30, 30), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 20, y: 15 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 12 });
    addTestUnit(match, 1, "harvester", { x: 22, y: 15 });
    const seen = watch(match);
    // Idle armed Units fire at what comes in range by themselves.
    seen.run(1);
    expect(seen.events).toEqual([
      { kind: "shotFired", weapon: "raiderGun", shooter: raider, from: { x: 10.5, y: 15.5 }, to: { x: 10.5, y: 12.5 } },
      { kind: "shotFired", weapon: "rifle", shooter: rifleman, from: { x: 20.5, y: 15.5 }, to: { x: 22.5, y: 15.5 } },
    ]);
    // Nothing more until a weapon has reloaded.
    seen.run(5);
    expect(seen.events).toHaveLength(2);
  });

  it("out of sight gives only the impact, as the view shows only where the shot landed", () => {
    const match = createMatch(openMap(30, 30), 1);
    // A Harvester sees 3 Cells; the Turret 5 Cells off reaches it from the dark.
    addTestUnit(match, 0, "harvester", { x: 10, y: 15 });
    addTestBuilding(match, 1, "turret", { x: 15, y: 15 });
    const seen = watch(match);
    // The Turret, put there directly, sees its surroundings from the end of the first Tick.
    seen.run(2);
    expect(seen.events).toEqual([{ kind: "impact", at: { x: 10.5, y: 15.5 } }]);
  });
});

describe("what else a Unit shows", () => {
  it("a Rifleman steps while he walks and stands still when he stops", () => {
    const match = createMatch(openMap(30, 30), 1);
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 10, y: 15 });
    const seen = watch(match);
    expect(seen.unit(rifleman)).toMatchObject({ moving: false, frame: 0 });
    issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: { x: 13, y: 15 } });
    const frames = new Set<number>();
    for (let t = 0; t < 20; t++) {
      seen.run(1);
      expect(seen.unit(rifleman).moving).toBe(true);
      frames.add(seen.unit(rifleman).frame);
    }
    // Stand, left stride and right stride all come by within a second of walking.
    expect([...frames].sort()).toEqual([0, 1, 2]);
    seen.run(60);
    expect(seen.unit(rifleman)).toMatchObject({ moving: false, frame: 0, walked: 0 });
  });

  it("a Harvester shows its load: empty, part full while it digs, full on the way back, empty again after unloading", () => {
    // One Ore Cell at (5,7), a few Cells below Player 0's Refinery (4,0, 3 by 2), as in the Simulation's harvest tests.
    const rows = Array.from({ length: 20 }, (_, y) => (y === 7 ? ".....*" + ".".repeat(14) : ".".repeat(20)));
    const match = createMatch(testMap(rows), 1);
    const seen = watch(match);
    const harvester = () => [...seen.state.units.values()].find((u) => u.kind === "harvester" && u.owner === 0)!;
    const loads: number[] = [];
    for (let t = 0; t < 30 * TICKS_PER_SECOND && getPlayerView(match, 0).credits === ECONOMY.startingCredits; t++) {
      seen.run(1);
      if (loads.at(-1) !== harvester().load) loads.push(harvester().load);
    }
    expect(loads).toEqual([0, 1, 2, 0]);
  });
});

describe("a new start", () => {
  it("carries nothing over into a new Match, whose Ticks begin again", () => {
    const first = createMatch(openMap(30, 30), 1);
    addTestBuilding(first, 0, "turret", { x: 10, y: 14 });
    addTestUnit(first, 1, "harvester", { x: 10, y: 10 });
    const seen = watch(first);
    seen.run(10);
    expect(seen.state.turrets.size).toBe(1);
    const next = present(seen.state, getPlayerView(createMatch(openMap(30, 30), 2), 0));
    expect(next.state.tick).toBe(0);
    expect(next.state.turrets.size).toBe(0);
    expect(next.events).toEqual([]);
  });

  it("shows the same Tick again unchanged, as when the view is refreshed after a Command", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 10 });
    const seen = watch(match);
    seen.run(1);
    const again = present(seen.state, getPlayerView(match, 0));
    expect(again.state).toBe(seen.state);
    // The shot is not heard twice.
    expect(again.events).toEqual([]);
  });
});

describe("a Turret's aim", () => {
  it("turns to its target when it fires and holds there after the target has gone", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    const turret = getPlayerView(match, 0).buildings.find((b) => b.kind === "turret")!.id;
    // A Harvester, as it cannot shoot back.
    const target = addTestUnit(match, 1, "harvester", { x: 10, y: 10 });
    const seen = watch(match);
    // At rest it points south-east (2).
    expect(turretFacing(seen.state, turret)).toBe(2);
    seen.run(1);
    expect(seen.events[0]).toEqual({
      kind: "shotFired",
      weapon: "turretCannon",
      shooter: turret,
      from: { x: 10.5, y: 14.5 },
      to: { x: 10.5, y: 10.5 },
    });
    // It swings round to north (12) the short way, a step a Tick.
    expect(turretFacing(seen.state, turret)).toBe(1);
    seen.run(5);
    expect(turretFacing(seen.state, turret)).toBe(12);
    // The Harvester drives off east, out of range and out of sight.
    issueCommand(match, 1, { type: "move", unitIds: [target], target: { x: 28, y: 10 } });
    seen.run(160);
    expect(getPlayerView(match, 0).units.some((u) => u.id === target)).toBe(false);
    // Its last shot went after the Harvester to the north-east, and there the gun stays.
    expect(turretFacing(seen.state, turret)).toBe(14);
    const shots = seen.events.length;
    seen.run(100);
    expect(seen.events).toHaveLength(shots);
    expect(turretFacing(seen.state, turret)).toBe(14);
  });

  it("follows a target that moves, shot by shot", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    const turret = getPlayerView(match, 0).buildings.find((b) => b.kind === "turret")!.id;
    const harvester = addTestUnit(match, 1, "harvester", { x: 10, y: 10 });
    const seen = watch(match);
    seen.run(10);
    expect(turretFacing(seen.state, turret)).toBe(12);
    // Round to the Turret's west side, staying in range.
    issueCommand(match, 1, { type: "move", unitIds: [harvester], target: { x: 6, y: 14 } });
    seen.run(100);
    expect(turretFacing(seen.state, turret)).toBe(8);
  });
});
