import { describe, expect, it } from "vitest";
import { advanceTick, createMatch, getPlayerView, issueCommand, type Match } from "../sim";
import { openMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp, setTestOre, setTestUnitHp } from "../sim/testing/setup";
import { rightClickCommands, unloadCommand } from "./commandChoice";

// Real Player views of a small staged Match, so the choice is made from what the client is really given.
const stage = (): Match => createMatch(openMap(40, 30), 1);
const view = (match: Match) => getPlayerView(match, 0);
/** The middle of a Cell, as a click on a Unit standing there. */
const on = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

describe("a right-click on an own Troop Carrier", () => {
  it("with Infantry selected issues Board for them", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 15, y: 10 });
    const medic = addTestUnit(match, 0, "medic", { x: 15, y: 11 });
    expect(rightClickCommands(view(match), new Set([rifleman, medic]), on(20, 10))).toEqual([
      { type: "board", unitIds: [rifleman, medic], targetId: carrier },
    ]);
  });

  it("issues Board for the Infantry only: selected Vehicles, the Troop Carrier itself among them, get no Command", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 15, y: 10 });
    const raider = addTestUnit(match, 0, "raider", { x: 15, y: 12 });
    const other = addTestUnit(match, 0, "troopCarrier", { x: 15, y: 14 });
    expect(rightClickCommands(view(match), new Set([carrier, raider, rifleman, other]), on(20, 10))).toEqual([
      { type: "board", unitIds: [rifleman], targetId: carrier },
    ]);
  });

  it("gives Commands the Simulation accepts, and the Infantry get in", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 19, y: 10 });
    for (const command of rightClickCommands(view(match), new Set([rifleman]), on(20, 10))) {
      expect(issueCommand(match, 0, command)).toEqual({ ok: true });
    }
    advanceTick(match);
    expect(view(match).units.find((u) => u.id === carrier)!.passengers).toEqual([{ id: rifleman, kind: "rifleman" }]);
  });

  it("with no Infantry selected is a move to its Cell, as before", () => {
    const match = stage();
    addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const raider = addTestUnit(match, 0, "raider", { x: 15, y: 12 });
    expect(rightClickCommands(view(match), new Set([raider]), on(20, 10))).toEqual([
      { type: "move", unitIds: [raider], target: { x: 20, y: 10 } },
    ]);
  });
});

describe("a right-click on an own Unit or Building below full health", () => {
  it("with a Medic selected on a hurt Rifleman issues Tend, which the Simulation accepts", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 15, y: 10 });
    const hurt = addTestUnit(match, 0, "rifleman", { x: 20, y: 10 });
    setTestUnitHp(match, hurt, 10);
    const commands = rightClickCommands(view(match), new Set([medic]), on(20, 10));
    expect(commands).toEqual([{ type: "tend", unitIds: [medic], targetId: hurt }]);
    expect(issueCommand(match, 0, commands[0]!)).toEqual({ ok: true });
  });

  it("at full health behaves as before: a move to its Cell", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 15, y: 10 });
    addTestUnit(match, 0, "rifleman", { x: 20, y: 10 });
    expect(rightClickCommands(view(match), new Set([medic]), on(20, 10))).toEqual([
      { type: "move", unitIds: [medic], target: { x: 20, y: 10 } },
    ]);
  });

  it("with a Mechanic selected on a damaged Vehicle issues Tend", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 15, y: 10 });
    const raider = addTestUnit(match, 0, "raider", { x: 20, y: 10 });
    setTestUnitHp(match, raider, 30);
    expect(rightClickCommands(view(match), new Set([mechanic]), on(20, 10))).toEqual([
      { type: "tend", unitIds: [mechanic], targetId: raider },
    ]);
  });

  it("with a Mechanic selected on a damaged Building issues Tend, anywhere on its footprint", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 15, y: 10 });
    addTestBuilding(match, 0, "barracks", { x: 20, y: 10 });
    const barracks = view(match).buildings.find((b) => b.kind === "barracks")!.id;
    setTestBuildingHp(match, barracks, 100);
    const commands = rightClickCommands(view(match), new Set([mechanic]), { x: 21.7, y: 11.2 });
    expect(commands).toEqual([{ type: "tend", unitIds: [mechanic], targetId: barracks }]);
    expect(issueCommand(match, 0, commands[0]!)).toEqual({ ok: true });
  });

  it("on a Building at full health gives no Tend: everyone moves to the Cell, as before", () => {
    const match = stage();
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 15, y: 10 });
    addTestBuilding(match, 0, "barracks", { x: 20, y: 10 });
    expect(rightClickCommands(view(match), new Set([mechanic]), on(20, 10))).toEqual([
      { type: "move", unitIds: [mechanic], target: { x: 20, y: 10 } },
    ]);
  });

  it("in a mixed selection only the Units that can help Tend, and the rest get no Command", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 15, y: 10 });
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 15, y: 11 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 15, y: 12 });
    const raider = addTestUnit(match, 0, "raider", { x: 15, y: 13 });
    const hurt = addTestUnit(match, 0, "rifleman", { x: 20, y: 10 });
    setTestUnitHp(match, hurt, 10);
    expect(rightClickCommands(view(match), new Set([medic, mechanic, rifleman, raider]), on(20, 10))).toEqual([
      { type: "tend", unitIds: [medic], targetId: hurt },
    ]);
    setTestUnitHp(match, raider, 30);
    expect(rightClickCommands(view(match), new Set([medic, mechanic, rifleman]), on(15, 13))).toEqual([
      { type: "tend", unitIds: [mechanic], targetId: raider },
    ]);
  });

  it("with nobody selected who can help is as before: a Medic moves to a damaged Vehicle's Cell", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 15, y: 10 });
    const raider = addTestUnit(match, 0, "raider", { x: 20, y: 10 });
    setTestUnitHp(match, raider, 30);
    expect(rightClickCommands(view(match), new Set([medic]), on(20, 10))).toEqual([
      { type: "move", unitIds: [medic], target: { x: 20, y: 10 } },
    ]);
  });

  it("never tells a hurt Medic to Tend itself, while another selected Medic does Tend it", () => {
    const match = stage();
    const hurt = addTestUnit(match, 0, "medic", { x: 20, y: 10 });
    const other = addTestUnit(match, 0, "medic", { x: 15, y: 10 });
    setTestUnitHp(match, hurt, 10);
    expect(rightClickCommands(view(match), new Set([hurt]), on(20, 10))).toEqual([
      { type: "move", unitIds: [hurt], target: { x: 20, y: 10 } },
    ]);
    expect(rightClickCommands(view(match), new Set([hurt, other]), on(20, 10))).toEqual([
      { type: "tend", unitIds: [other], targetId: hurt },
    ]);
  });

  it("on a damaged Troop Carrier with a Mechanic and Riflemen selected: the Mechanic Tends and the Riflemen Board", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 15, y: 10 });
    const first = addTestUnit(match, 0, "rifleman", { x: 15, y: 11 });
    const second = addTestUnit(match, 0, "rifleman", { x: 15, y: 12 });
    const medic = addTestUnit(match, 0, "medic", { x: 15, y: 13 });
    setTestUnitHp(match, carrier, 100);
    const commands = rightClickCommands(view(match), new Set([first, mechanic, second, medic]), on(20, 10));
    expect(commands).toEqual([
      { type: "tend", unitIds: [mechanic], targetId: carrier },
      { type: "board", unitIds: [first, second, medic], targetId: carrier },
    ]);
    for (const command of commands) expect(issueCommand(match, 0, command)).toEqual({ ok: true });
  });

  it("on a Troop Carrier at full health the Mechanic Boards with the rest", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const mechanic = addTestUnit(match, 0, "mechanic", { x: 15, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 15, y: 11 });
    expect(rightClickCommands(view(match), new Set([mechanic, rifleman]), on(20, 10))).toEqual([
      { type: "board", unitIds: [mechanic, rifleman], targetId: carrier },
    ]);
  });

  it("on the other Player's damaged Unit or Building is an attack, never a Tend", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 18, y: 10 });
    const theirs = addTestUnit(match, 1, "rifleman", { x: 20, y: 10 });
    setTestUnitHp(match, theirs, 10);
    expect(rightClickCommands(view(match), new Set([medic]), on(20, 10))).toEqual([
      { type: "attack", unitIds: [medic], targetId: theirs },
    ]);
  });
});

describe("a right-click anywhere else", () => {
  it("on the other Player's Troop Carrier is an attack, never a Board", () => {
    const match = stage();
    const theirs = addTestUnit(match, 1, "troopCarrier", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    expect(rightClickCommands(view(match), new Set([rifleman]), on(20, 10))).toEqual([
      { type: "attack", unitIds: [rifleman], targetId: theirs },
    ]);
  });

  it("on the other Player's Building is an attack, and a Unit in front of a Building is the target before it", () => {
    const match = stage();
    addTestBuilding(match, 1, "barracks", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    const barracks = view(match).buildings.find((b) => b.owner === 1 && b.kind === "barracks")!.id;
    expect(rightClickCommands(view(match), new Set([rifleman]), on(20, 10))).toEqual([
      { type: "attack", unitIds: [rifleman], targetId: barracks },
    ]);
    const guard = addTestUnit(match, 1, "harvester", { x: 19, y: 10 });
    expect(rightClickCommands(view(match), new Set([rifleman]), on(19, 10))).toEqual([
      { type: "attack", unitIds: [rifleman], targetId: guard },
    ]);
  });

  it("on an own Unit that carries nobody is a move to its Cell", () => {
    const match = stage();
    addTestUnit(match, 0, "raider", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    expect(rightClickCommands(view(match), new Set([rifleman]), on(20, 10))).toEqual([
      { type: "move", unitIds: [rifleman], target: { x: 20, y: 10 } },
    ]);
  });

  it("on open ground moves everyone selected to the Cell under the point", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    expect(rightClickCommands(view(match), new Set([rifleman, carrier]), { x: 22.9, y: 12.1 })).toEqual([
      { type: "move", unitIds: [rifleman, carrier], target: { x: 22, y: 12 } },
    ]);
  });

  it("on Ore sends the selected Harvesters to harvest it and moves the rest there", () => {
    const match = stage();
    const harvester = addTestUnit(match, 0, "harvester", { x: 18, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 11 });
    setTestOre(match, { x: 20, y: 10 }, 500);
    expect(rightClickCommands(view(match), new Set([harvester, rifleman]), on(20, 10))).toEqual([
      { type: "harvest", unitIds: [harvester], target: { x: 20, y: 10 } },
      { type: "move", unitIds: [rifleman], target: { x: 20, y: 10 } },
    ]);
    expect(rightClickCommands(view(match), new Set([harvester]), on(20, 10))).toEqual([
      { type: "harvest", unitIds: [harvester], target: { x: 20, y: 10 } },
    ]);
  });

  it("gives no Command with nothing selected, or off the Map", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    expect(rightClickCommands(view(match), new Set(), on(20, 10))).toEqual([]);
    expect(rightClickCommands(view(match), new Set([rifleman]), { x: -0.5, y: 3 })).toEqual([]);
    expect(rightClickCommands(view(match), new Set([rifleman]), { x: 40.2, y: 3 })).toEqual([]);
    expect(rightClickCommands(view(match), new Set([rifleman]), { x: 3, y: 30 })).toEqual([]);
  });
});

describe("the U key", () => {
  it("Unloads every selected Troop Carrier, with Passengers or without, and names no other Unit", () => {
    const match = stage();
    const first = addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const second = addTestUnit(match, 0, "troopCarrier", { x: 24, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    const raider = addTestUnit(match, 0, "raider", { x: 18, y: 12 });
    const command = unloadCommand(view(match), new Set([rifleman, first, raider, second]));
    expect(command).toEqual({ type: "unload", unitIds: [first, second] });
    // Neither holds a Passenger, so the Match rejects it and no acknowledgement plays (main.ts plays one only for an accepted Command).
    expect(issueCommand(match, 0, command!).ok).toBe(false);
  });

  it("does nothing with no Troop Carrier selected", () => {
    const match = stage();
    addTestUnit(match, 0, "troopCarrier", { x: 20, y: 10 });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 18, y: 10 });
    const raider = addTestUnit(match, 0, "raider", { x: 18, y: 12 });
    expect(unloadCommand(view(match), new Set([rifleman, raider]))).toBeNull();
    expect(unloadCommand(view(match), new Set())).toBeNull();
  });
});
