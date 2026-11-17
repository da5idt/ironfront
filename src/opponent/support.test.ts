import { describe, expect, it } from "vitest";
import {
  advanceTick,
  type BuildingKind,
  type BuildingView,
  type CellPos,
  type Command,
  createMatch,
  getPlayerView,
  issueCommand,
  type MapDef,
  type Match,
  OPPONENT,
  type PlayerId,
  TEND,
  tendRate,
  UNIT_STATS,
  type UnitKind,
} from "../sim";
import { RIVERFORD } from "../game/maps/riverford";
import { testMap } from "../sim/testing/maps";
import { addTestUnit, setTestBuildingHp, setTestCredits, setTestUnitHp } from "../sim/testing/setup";
import { createOpponent, type Opponent, THINK_EVERY_TICKS } from "./opponent";
import { distanceToCell } from "./tactics";
import { BUILD_ORDER_DONE, opponentPastItsFirstWave, PLENTY, SECONDS, base as stagedBase, play as stagedPlay } from "./testing/stage";

// The Opponent's Hospital, Medics and Mechanics, through its own seam: its
// Player view in, Commands out. It plays Player 0 on openMap(40, 40): HQ on
// (0..2, 0..2), Refinery on (4..6, 0..1), rally point at about (6, 6).

const SITES = [
  { x: 10, y: 0 },
  { x: 14, y: 0 },
  { x: 0, y: 10 },
  { x: 10, y: 10 },
  { x: 0, y: 14 },
];

/** Player 0's base with these Buildings added to the starting HQ and Refinery, and Credits to spare. */
function base(extra: readonly BuildingKind[], map?: MapDef): Match {
  const match = stagedBase(extra, SITES, map);
  setTestCredits(match, 0, PLENTY);
  return match;
}

/** Plays `player` as the Opponent for `ticks` and returns every Command it gave. */
function play(match: Match, opponent: Opponent, ticks: number, player: PlayerId = 0): Command[] {
  return stagedPlay(match, opponent, ticks, { player }).map((g) => g.command);
}

/** Thinks once and issues what comes back, as the client does. */
const thinkOnce = (match: Match, opponent: Opponent): Command[] => play(match, opponent, 1);

function own(match: Match, kind: BuildingKind): BuildingView {
  return getPlayerView(match, 0).buildings.find((b) => b.owner === 0 && b.kind === kind)!;
}

function count(match: Match, kind: UnitKind): number {
  return getPlayerView(match, 0).units.filter((u) => u.owner === 0 && u.kind === kind).length;
}

describe("Computer Opponent's Hospital", () => {
  it("builds a Hospital next once its build order is standing and its first wave has set off", () => {
    const match = base(BUILD_ORDER_DONE);
    // The HQ may be busy with a Turret begun before the wave left; whatever it starts after that is the Hospital.
    const given = play(match, opponentPastItsFirstWave(match), 60 * SECONDS);
    expect(given.flatMap((c) => (c.type === "startBuilding" ? [c.kind] : []))[0]).toBe("hospital");
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

  it("trains the Medics and Mechanics it keeps and then no more", () => {
    const match = base(SUPPORTED);
    play(match, opponentPastItsFirstWave(match), 90 * SECONDS);
    expect({ medics: count(match, "medic"), mechanics: count(match, "mechanic") }).toEqual({
      medics: OPPONENT.mostMedics,
      mechanics: OPPONENT.mostMechanics,
    });
  });

  it("trains another when it sees it has lost one", () => {
    const match = base(SUPPORTED);
    const opponent = opponentPastItsFirstWave(match);
    play(match, opponent, 90 * SECONDS);
    setTestCredits(match, 0, PLENTY);
    // Destroyed: the next Tick takes it off the Map, and the Opponent's next view is without it.
    const lose = (kind: UnitKind): void => {
      setTestUnitHp(match, getPlayerView(match, 0).units.find((u) => u.owner === 0 && u.kind === kind)!.id, 0);
      advanceTick(match);
      expect(count(match, kind)).toBe(OPPONENT[kind === "medic" ? "mostMedics" : "mostMechanics"] - 1);
    };
    lose("medic");
    expect(thinkOnce(match, opponent)).toContainEqual({ type: "train", buildingId: own(match, "hospital").id, kind: "medic" });
    lose("mechanic");
    expect(thinkOnce(match, opponent)).toContainEqual({
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

  it("leaves a Building its Mechanic found no way to alone for a while, and sends the Mechanic back to the rally point", () => {
    // Rock on every Cell beside the Hospital on (0..1, 14..15): nowhere for a Mechanic to stand.
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 40 }, (_, x) => (x <= 2 && y >= 13 && y <= 16 && !(x <= 1 && (y === 14 || y === 15)) ? "#" : ".")).join(""),
    );
    const match = base([...BUILD_ORDER_DONE, "hospital"], testMap(rows));
    const mechanic = addTestUnit(match, 0, "mechanic", { x: RALLY.x + 8, y: RALLY.y + 4 });
    const hospital = damage(match, "hospital", 300);
    const opponent = createOpponent(0, 1);
    const tend = { type: "tend", unitIds: [mechanic], targetId: hospital.id };
    // Half the time it leaves the Building alone for: the one Command, and none after the Mechanic has stopped.
    expect(tends(play(match, opponent, OPPONENT.leaveAloneTicks / 2))).toEqual([tend]);
    const waiting = getPlayerView(match, 0).units.find((u) => u.id === mechanic)!;
    expect(Math.hypot(waiting.x - RALLY.x, waiting.y - RALLY.y)).toBeLessThan(3);
    // Then it is tried once more, as the way may have opened.
    expect(tends(play(match, opponent, OPPONENT.leaveAloneTicks))).toEqual([tend]);
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

describe("Computer Opponent's Medics and the rally point", () => {
  const RALLY = { x: 6, y: 6 };
  /** How far from the rally point the Opponent lets a Medic stand. */
  const STRAYED_AT_MOST = OPPONENT.medicStrayCells;
  const medicMoves = (commands: readonly Command[], medic: number) =>
    commands.filter((c) => c.type === "move" && c.unitIds.includes(medic));
  const unit = (match: Match, id: number) => getPlayerView(match, 0).units.find((u) => u.id === id)!;
  /** The staged Map is this many Cells each way. */
  const MAP_CELLS = 40;
  /**
   * Longer than the Opponent waits before it takes a Medic to have no way to a hurt Unit, with time over for the
   * walk back to the rally point from anywhere on the staged Map.
   */
  const GIVEN_UP_AND_HOME = OPPONENT.medicGiveUpTicks + Math.ceil(MAP_CELLS / UNIT_STATS.medic.speed) * SECONDS;
  /** Longer than one Medic takes to Heal a Rifleman from any health. */
  const ONE_HEAL = Math.ceil(UNIT_STATS.rifleman.maxHp / tendRate("medic", "infantry") + 1) * SECONDS;
  /** A Cell near the top of the Map, far from the rally point, that `mapWithIsland` rings with water. */
  const ISLAND = { x: 19, y: 8 };
  /** An open Map with water in every Cell touching `island`: nobody walks there. */
  const mapWithIsland = (island: CellPos): string[] =>
    Array.from({ length: MAP_CELLS }, (_, y) =>
      Array.from({ length: MAP_CELLS }, (_, x) => (Math.max(Math.abs(x - island.x), Math.abs(y - island.y)) === 1 ? "~" : ".")).join(""),
    );

  it("sends a Medic that went off to Heal back to the rally point, once nobody near it is hurt", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    const medic = addTestUnit(match, 0, "medic", RALLY);
    // Within the seek radius, so it goes by itself.
    const hurt = addTestUnit(match, 0, "rifleman", { x: RALLY.x + TEND.seekRadius - 1, y: RALLY.y });
    setTestUnitHp(match, hurt, 10);
    const opponent = createOpponent(0, 1);

    const whileHealing: Command[] = [];
    for (let t = 0; t < 120 * SECONDS && unit(match, hurt).hp < unit(match, hurt).maxHp; t += THINK_EVERY_TICKS) {
      whileHealing.push(...play(match, opponent, THINK_EVERY_TICKS));
    }
    expect(unit(match, hurt).hp).toBe(unit(match, hurt).maxHp);
    expect(distanceToCell(RALLY, unit(match, medic))).toBeGreaterThan(STRAYED_AT_MOST);
    // Given no move while it works: one would end its Tend.
    expect(medicMoves(whileHealing, medic)).toEqual([]);

    const after = play(match, opponent, 30 * SECONDS);
    expect(medicMoves(after, medic)).toEqual([{ type: "move", unitIds: [medic], target: RALLY }]);
    expect(distanceToCell(RALLY, unit(match, medic))).toBeLessThan(1.5);
  });

  it("sends a strayed Medic back although a hurt Rifleman is near, when that one is on the move and so never Healed by it", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    const medic = addTestUnit(match, 0, "medic", { x: 16, y: 8 });
    // Up and down a line three Cells from the Medic, so never farther from it than the seek radius, and never standing.
    const ends = [
      { x: 19, y: 5 },
      { x: 19, y: 11 },
    ];
    const hurt = addTestUnit(match, 0, "rifleman", ends[0]!);
    setTestUnitHp(match, hurt, 10);
    const opponent = createOpponent(0, 1);

    const given: Command[] = [];
    let goal = 1;
    let farthest = 0;
    expect(issueCommand(match, 0, { type: "move", unitIds: [hurt], target: ends[goal]! })).toEqual({ ok: true });
    for (let t = 0; t < 20 * SECONDS; t += THINK_EVERY_TICKS) {
      given.push(...play(match, opponent, THINK_EVERY_TICKS));
      const at = unit(match, hurt);
      if (!medicMoves(given, medic).length) farthest = Math.max(farthest, Math.hypot(at.x - unit(match, medic).x, at.y - unit(match, medic).y));
      // Turned round well before it would stop.
      if (distanceToCell(ends[goal]!, at) > 1.5) continue;
      goal = 1 - goal;
      expect(issueCommand(match, 0, { type: "move", unitIds: [hurt], target: ends[goal]! })).toEqual({ ok: true });
    }
    expect(farthest).toBeLessThanOrEqual(TEND.seekRadius);
    expect(unit(match, hurt).hp).toBe(10);
    expect(medicMoves(given, medic)).toEqual([{ type: "move", unitIds: [medic], target: RALLY }]);
    expect(distanceToCell(RALLY, unit(match, medic))).toBeLessThan(STRAYED_AT_MOST);
  });
  it("leaves a strayed Medic out until it has Healed both of two hurt Riflemen standing still near it", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: 20 });
    // One beside it and one near the edge of its seek radius: both stand still all through the first
    // one's Heal, as the Medic does.
    const beside = addTestUnit(match, 0, "rifleman", { x: 21, y: 20 });
    const farther = addTestUnit(match, 0, "rifleman", { x: 20, y: 20 + TEND.seekRadius - 2 });
    setTestUnitHp(match, beside, 10);
    setTestUnitHp(match, farther, 10);
    expect(distanceToCell(RALLY, unit(match, medic))).toBeGreaterThan(STRAYED_AT_MOST);

    const given = play(match, createOpponent(0, 1), 2 * ONE_HEAL + GIVEN_UP_AND_HOME);
    expect(unit(match, beside).hp).toBe(unit(match, beside).maxHp);
    expect(unit(match, farther).hp).toBe(unit(match, farther).maxHp);
    // Home once both are whole.
    expect(medicMoves(given, medic)).toEqual([{ type: "move", unitIds: [medic], target: RALLY }]);
  });

  it("sends a strayed Medic back from a hurt Rifleman that stands still near it but that it has no way to", () => {
    const island = ISLAND;
    const match = base([...BUILD_ORDER_DONE, "hospital"], testMap(mapWithIsland(island)));
    const hurt = addTestUnit(match, 0, "rifleman", island);
    setTestUnitHp(match, hurt, 10);
    // Well within its seek radius, and far from the rally point.
    const medic = addTestUnit(match, 0, "medic", { x: island.x - TEND.seekRadius / 2, y: island.y });
    expect(distanceToCell(RALLY, unit(match, medic))).toBeGreaterThan(STRAYED_AT_MOST);

    const given = play(match, createOpponent(0, 1), GIVEN_UP_AND_HOME);
    expect(unit(match, hurt)).toMatchObject({ hp: 10, x: island.x + 0.5, y: island.y + 0.5 });
    expect(medicMoves(given, medic)).toEqual([{ type: "move", unitIds: [medic], target: RALLY }]);
    expect(distanceToCell(RALLY, unit(match, medic))).toBeLessThan(STRAYED_AT_MOST);
  });

  it("sends a strayed Medic back from a hurt Rifleman it has no way to while another Medic Heals a Unit beside it", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"], testMap(mapWithIsland(ISLAND)));
    const stranded = addTestUnit(match, 0, "rifleman", ISLAND);
    setTestUnitHp(match, stranded, 10);
    // In a row away from the island: the Medic at work, the Rifleman it Heals, and the Medic standing by.
    const by = { x: ISLAND.x - TEND.seekRadius / 2, y: ISLAND.y };
    const atWork = addTestUnit(match, 0, "medic", { x: by.x - 2, y: by.y });
    const cells = [
      { x: by.x - 1, y: by.y },
      { x: by.x - 1, y: by.y + 1 },
    ];
    const healed = addTestUnit(match, 0, "rifleman", cells[0]!);
    setTestUnitHp(match, healed, 1);
    const standingBy = addTestUnit(match, 0, "medic", by);
    expect(distanceToCell(RALLY, unit(match, standingBy))).toBeGreaterThan(STRAYED_AT_MOST);
    // Kept on the move between two Cells that touch both Medics' Cells, so only the Medic told to Heals him:
    // by itself a Medic goes to nobody who is moving.
    expect(issueCommand(match, 0, { type: "tend", unitIds: [atWork], targetId: healed })).toEqual({ ok: true });
    const opponent = createOpponent(0, 1);
    let next = 1;
    let sentBack: Command[] = [];
    for (let t = 0; sentBack.length === 0 && unit(match, healed).hp < unit(match, healed).maxHp; t += THINK_EVERY_TICKS) {
      expect(issueCommand(match, 0, { type: "move", unitIds: [healed], target: cells[next]! })).toEqual({ ok: true });
      next = 1 - next;
      sentBack = medicMoves(play(match, opponent, THINK_EVERY_TICKS), standingBy);
    }
    // Given up on the stranded one while the Heal beside it was still going on: that Heal is not its own.
    expect(sentBack).toEqual([{ type: "move", unitIds: [standingBy], target: RALLY }]);
    expect(unit(match, healed).hp).toBeLessThan(unit(match, healed).maxHp);
    expect(getPlayerView(match, 0).tends.map((t) => t.targetId)).toEqual([healed]);
    expect(unit(match, stranded).hp).toBe(10);
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
