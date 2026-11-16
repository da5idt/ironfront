import { describe, expect, it } from "vitest";
import {
  advanceTick,
  type BuildingKind,
  type BuildingView,
  type Command,
  createMatch,
  getPlayerView,
  issueCommand,
  type Match,
  OPPONENT,
  type PlayerId,
  TICKS_PER_SECOND,
  type UnitKind,
} from "../sim";
import { RIVERFORD } from "../game/maps/riverford";
import { openMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp, setTestCredits } from "../sim/testing/setup";
import { createOpponent, type Opponent, THINK_EVERY_TICKS } from "./opponent";

// The Opponent's Hospital, Medics and Mechanics, through its own seam: its
// Player view in, Commands out. It plays Player 0 on openMap(40, 40): HQ on
// (0..2, 0..2), Refinery on (4..6, 0..1), rally point at about (6, 6).

const PLENTY = 20_000;

/** Player 0's base with these Buildings added to the starting HQ and Refinery, and Credits to spare. */
function base(extra: readonly BuildingKind[]): Match {
  const match = createMatch(openMap(40, 40), 1);
  const sites = [
    { x: 10, y: 0 },
    { x: 14, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 0, y: 14 },
  ];
  extra.forEach((kind, i) => addTestBuilding(match, 0, kind, sites[i]!));
  setTestCredits(match, 0, PLENTY);
  advanceTick(match);
  return match;
}

const BUILD_ORDER_DONE: readonly BuildingKind[] = ["barracks", "refinery", "vehicleFactory", "turret"];

/** Thinks once and issues what comes back, as the client does. */
function thinkOnce(match: Match, opponent: Opponent, player: PlayerId = 0): Command[] {
  const commands = opponent.think(getPlayerView(match, player));
  for (const command of commands) issueCommand(match, player, command);
  return commands;
}

/** Plays Player 0 as the Opponent for `ticks` and returns every Command it gave. */
function play(match: Match, opponent: Opponent, ticks: number, player: PlayerId = 0): Command[] {
  const given: Command[] = [];
  for (let t = 0; t < ticks; t++) {
    if (t % THINK_EVERY_TICKS === 0) given.push(...thinkOnce(match, opponent, player));
    advanceTick(match);
  }
  return given;
}

function own(match: Match, kind: BuildingKind): BuildingView {
  return getPlayerView(match, 0).buildings.find((b) => b.owner === 0 && b.kind === kind)!;
}

function count(match: Match, kind: UnitKind): number {
  return getPlayerView(match, 0).units.filter((u) => u.owner === 0 && u.kind === kind).length;
}

const SECONDS = TICKS_PER_SECOND;

/**
 * An Opponent for Player 0 whose first wave has set off, which is when it begins to spend on support.
 * It is shown one view in which the time for a first wave has come, six more Riflemen wait and the other
 * Player's HQ is known. The wave's Commands are not issued, so its Units stay where they are.
 */
function opponentPastItsFirstWave(match: Match): Opponent {
  for (let i = 0; i < 6; i++) addTestUnit(match, 0, "rifleman", { x: 30 + i, y: 4 });
  const opponent = createOpponent(0, 1);
  const view = getPlayerView(match, 0);
  const othersHq = getPlayerView(match, 1).buildings.filter((b) => b.owner === 1 && b.kind === "hq");
  const commands = opponent.think({ ...view, tick: OPPONENT.firstWaveTick, buildings: [...view.buildings, ...othersHq] });
  expect(commands.some((c) => c.type === "attackMove")).toBe(true);
  return opponent;
}

describe("Computer Opponent's Hospital", () => {
  it("starts a Hospital once its build order is standing and its first wave has set off", () => {
    const match = base(BUILD_ORDER_DONE);
    expect(thinkOnce(match, opponentPastItsFirstWave(match))).toContainEqual({ type: "startBuilding", kind: "hospital" });
  });

  it("starts no Hospital before its first wave has set off, but goes on to the next Turret", () => {
    const match = base(BUILD_ORDER_DONE);
    const commands = thinkOnce(match, createOpponent(0, 1));
    expect(commands).toContainEqual({ type: "startBuilding", kind: "turret" });
    expect(commands).not.toContainEqual({ type: "startBuilding", kind: "hospital" });
  });

  it("builds what the build order still lacks before a Hospital", () => {
    const match = base(["barracks", "refinery", "vehicleFactory"]);
    const commands = thinkOnce(match, createOpponent(0, 1));
    expect(commands).toContainEqual({ type: "startBuilding", kind: "turret" });
    expect(commands).not.toContainEqual({ type: "startBuilding", kind: "hospital" });
  });

  it("builds only one Hospital", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    expect(thinkOnce(match, createOpponent(0, 1))).not.toContainEqual({ type: "startBuilding", kind: "hospital" });
  });
});

describe("Computer Opponent's Medics and Mechanics", () => {
  const SUPPORTED: readonly BuildingKind[] = [...BUILD_ORDER_DONE, "hospital"];

  it("trains no Medic, Mechanic or Troop Carrier before its first wave has set off, whatever it could pay for", () => {
    const match = base(SUPPORTED);
    const given = play(match, createOpponent(0, 1), 90 * SECONDS);
    const trained = given.flatMap((c) => (c.type === "train" ? [c.kind] : []));
    expect(trained).toContain("rifleman");
    expect(trained).toContain("raider");
    expect(trained.filter((kind) => kind === "medic" || kind === "mechanic" || kind === "troopCarrier")).toEqual([]);
  });

  it("trains two Medics and two Mechanics and then no more", () => {
    const match = base(SUPPORTED);
    play(match, opponentPastItsFirstWave(match), 90 * SECONDS);
    expect({ medics: count(match, "medic"), mechanics: count(match, "mechanic") }).toEqual({ medics: 2, mechanics: 2 });
    expect({ medics: OPPONENT.mostMedics, mechanics: OPPONENT.mostMechanics }).toEqual({ medics: 2, mechanics: 2 });
  });

  it("trains another when it sees it has lost one", () => {
    const match = base(SUPPORTED);
    const opponent = opponentPastItsFirstWave(match);
    play(match, opponent, 90 * SECONDS);
    setTestCredits(match, 0, PLENTY);
    const view = getPlayerView(match, 0);
    const lost = (kind: UnitKind) => {
      const gone = view.units.find((u) => u.owner === 0 && u.kind === kind)!;
      return { ...view, units: view.units.filter((u) => u !== gone) };
    };
    expect(opponent.think(lost("medic"))).toContainEqual({ type: "train", buildingId: own(match, "hospital").id, kind: "medic" });
    expect(opponent.think(lost("mechanic"))).toContainEqual({
      type: "train",
      buildingId: own(match, "vehicleFactory").id,
      kind: "mechanic",
    });
  });
});

describe("Computer Opponent's Mechanics and its damaged Buildings", () => {
  // The Hospital on (0..1, 14..15) and the Vehicle Factory on (0.., 10..) are both
  // more than a support Unit's seek radius of 6 from the rally point.
  const RALLY = { x: 6, y: 6 };

  function staged(mechanics: number): { match: Match; mechanics: number[] } {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    const ids = Array.from({ length: mechanics }, (_, i) => addTestUnit(match, 0, "mechanic", { x: RALLY.x + i, y: RALLY.y }));
    advanceTick(match);
    return { match, mechanics: ids };
  }

  function damage(match: Match, kind: BuildingKind, by: number): BuildingView {
    const building = own(match, kind);
    setTestBuildingHp(match, building.id, building.maxHp - by);
    return building;
  }

  const tends = (commands: readonly Command[]) => commands.filter((c) => c.type === "tend");

  it("gives an idle Mechanic a Tend Command onto a damaged Building of its own", () => {
    const { match, mechanics } = staged(1);
    const hospital = damage(match, "hospital", 300);
    const commands = createOpponent(0, 1).think(getPlayerView(match, 0));
    expect(tends(commands)).toEqual([{ type: "tend", unitIds: mechanics, targetId: hospital.id }]);
    for (const command of commands) expect(issueCommand(match, 0, command), JSON.stringify(command)).toEqual({ ok: true });
  });

  it("gives no Tend Command while every Building is whole", () => {
    const { match } = staged(2);
    expect(tends(play(match, createOpponent(0, 1), 5 * SECONDS))).toEqual([]);
  });

  it("gives the Command once, and the Building is whole again a while later", () => {
    const { match, mechanics } = staged(1);
    const hospital = damage(match, "hospital", 300);
    const given = play(match, createOpponent(0, 1), 60 * SECONDS);
    expect(tends(given)).toEqual([{ type: "tend", unitIds: mechanics, targetId: hospital.id }]);
    expect(own(match, "hospital").hp).toBe(hospital.maxHp);
  });

  it("sends the Mechanic back to the rally point when the work is done", () => {
    const { match, mechanics } = staged(1);
    damage(match, "hospital", 300);
    play(match, createOpponent(0, 1), 90 * SECONDS);
    const mechanic = getPlayerView(match, 0).units.find((u) => u.id === mechanics[0])!;
    expect(Math.hypot(mechanic.x - RALLY.x, mechanic.y - RALLY.y)).toBeLessThan(3);
  });

  it("spreads two Mechanics over two damaged Buildings, the worse off first", () => {
    const { match, mechanics } = staged(2);
    const hospital = damage(match, "hospital", 100);
    const factory = damage(match, "vehicleFactory", 400);
    expect(tends(createOpponent(0, 1).think(getPlayerView(match, 0)))).toEqual([
      { type: "tend", unitIds: [mechanics[0]], targetId: factory.id },
      { type: "tend", unitIds: [mechanics[1]], targetId: hospital.id },
    ]);
  });

  it("puts both Mechanics on the only damaged Building, in one Command", () => {
    const { match, mechanics } = staged(2);
    const hospital = damage(match, "hospital", 300);
    expect(tends(createOpponent(0, 1).think(getPlayerView(match, 0)))).toEqual([
      { type: "tend", unitIds: mechanics, targetId: hospital.id },
    ]);
  });

  it("keeps its Mechanics away from a Building while the other Player's Units are in sight near it", () => {
    const { match } = staged(1);
    damage(match, "hospital", 300);
    addTestUnit(match, 1, "raider", { x: 4, y: 16 });
    advanceTick(match);
    expect(tends(createOpponent(0, 1).think(getPlayerView(match, 0)))).toEqual([]);
  });
});

describe("Computer Opponent's Medics and Mechanics when a wave sets off", () => {
  it("sends neither with a wave nor as its scout", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    // Older than the Raiders: a wave takes the oldest Units waiting at home.
    const support = (["medic", "medic", "mechanic", "mechanic"] as const).map((kind, i) =>
      addTestUnit(match, 0, kind, { x: 5 + i, y: 6 }),
    );
    // More Raiders than a first wave needs, so one leaves as soon as waves may.
    for (let i = 0; i < 8; i++) addTestUnit(match, 0, "raider", { x: 4 + i, y: 8 });
    const given = play(match, createOpponent(0, 1), OPPONENT.firstWaveTick + 30 * SECONDS);
    const sentOut = given.filter((c) => c.type === "attackMove" || c.type === "attack" || c.type === "move");
    expect(sentOut.some((c) => c.type === "attackMove" && c.unitIds.length >= 6)).toBe(true);
    expect(sentOut.flatMap((c) => c.unitIds).filter((id) => support.includes(id))).toEqual([]);
  });
});

describe("Computer Opponent's Hospital on Riverford against a passive Player", () => {
  it("builds its Hospital after its build order, then keeps Medics and Mechanics", () => {
    const match = createMatch(RIVERFORD, 7);
    const opponent = createOpponent(1, 7);
    let orderStoodAtHospital: boolean | null = null;
    for (let t = 0; t < 8 * 60 * SECONDS && orderStoodAtHospital === null; t += THINK_EVERY_TICKS) {
      const started = play(match, opponent, THINK_EVERY_TICKS, 1).some(
        (c) => c.type === "startBuilding" && c.kind === "hospital",
      );
      if (!started) continue;
      const kinds = getPlayerView(match, 1)
        .buildings.filter((b) => b.owner === 1)
        .map((b) => b.kind);
      orderStoodAtHospital =
        kinds.filter((k) => k === "refinery").length === 2 &&
        (["barracks", "vehicleFactory", "turret"] as const).every((k) => kinds.includes(k));
    }
    expect(orderStoodAtHospital).toBe(true);
    play(match, opponent, 4 * 60 * SECONDS, 1);
    const units = getPlayerView(match, 1).units.filter((u) => u.owner === 1);
    expect(units.filter((u) => u.kind === "medic")).toHaveLength(2);
    expect(units.filter((u) => u.kind === "mechanic")).toHaveLength(2);
  });
});
