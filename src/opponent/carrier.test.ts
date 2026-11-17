import { describe, expect, it } from "vitest";
import {
  advanceTick,
  type BuildingKind,
  type Command,
  createMatch,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type MapDef,
  type Match,
  OPPONENT,
  TROOP_CARRIER,
  type UnitKind,
  type UnitView,
} from "../sim";
import { RIVERFORD } from "../game/maps/riverford";
import { testMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp, setTestCredits, setTestUnitHp } from "../sim/testing/setup";
import { createOpponent, THINK_EVERY_TICKS } from "./opponent";
import { BUILD_ORDER_DONE, type Given, opponentPastItsFirstWave, play, PLENTY, SECONDS, base as stagedBase } from "./testing/stage";

// The Opponent's Troop Carrier, through its own seam: its Player view in,
// Commands out. It plays Player 0 on openMap(40, 40): HQ on (0..2, 0..2),
// Refinery on (4..6, 0..1), rally point at about (6, 6). Player 1's HQ covers
// (37..39, 37..39).

const SITES = [
  { x: 10, y: 0 },
  { x: 14, y: 0 },
  { x: 18, y: 0 },
  { x: 22, y: 0 },
  { x: 26, y: 0 },
];

/** Player 0's base with these Buildings added to the starting HQ and Refinery. */
const base = (extra: readonly BuildingKind[], map?: MapDef): Match => stagedBase(extra, SITES, map);

const ownUnits = (match: Match): UnitView[] => getPlayerView(match, 0).units.filter((u) => u.owner === 0);
const unit = (match: Match, id: number): UnitView | undefined => ownUnits(match).find((u) => u.id === id);
const ofKind = (match: Match, kind: UnitKind): UnitView[] => ownUnits(match).filter((u) => u.kind === kind);
const trains = (given: readonly Given[], kind: UnitKind): Given[] =>
  given.filter((g) => g.command.type === "train" && g.command.kind === kind);

/** A Troop Carrier of Player 0 at `at` with Units of these kinds inside, put in by Board Commands. */
function carrying(match: Match, at: { x: number; y: number }, kinds: readonly UnitKind[]): { carrier: number; inside: number[] } {
  const carrier = addTestUnit(match, 0, "troopCarrier", at);
  const inside = kinds.map((kind, i) => addTestUnit(match, 0, kind, { x: at.x - 1 + (i % 3), y: at.y + 1 + Math.floor(i / 3) }));
  expect(issueCommand(match, 0, { type: "board", unitIds: inside, targetId: carrier })).toEqual({ ok: true });
  for (let t = 0; t < 10 * SECONDS && unit(match, carrier)!.passengers!.length < kinds.length; t++) advanceTick(match);
  expect(unit(match, carrier)!.passengers!.map((p) => p.id)).toEqual(expect.arrayContaining(inside));
  return { carrier, inside };
}

describe("Computer Opponent counting its Passengers", () => {
  it("trains no replacement for Medics and Mechanics that are only inside its Troop Carrier", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    carrying(match, { x: 20, y: 20 }, ["medic", "medic", "mechanic", "mechanic"]);
    setTestCredits(match, 0, PLENTY);
    const commands = createOpponent(0, 1).think(getPlayerView(match, 0));
    const trained = commands.flatMap((c) => (c.type === "train" ? [c.kind] : []));
    expect(trained).toContain("rifleman");
    expect(trained).not.toContain("medic");
    expect(trained).not.toContain("mechanic");
  });

  it("still counts a Mechanic inside its Troop Carrier as at work on the Building it was sent to", () => {
    const match = base([...BUILD_ORDER_DONE, "hospital"]);
    const first = addTestUnit(match, 0, "mechanic", RALLY);
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: RALLY.x + 1, y: RALLY.y + 1 });
    const damaged = (kind: BuildingKind, by: number): number => {
      const building = getPlayerView(match, 0).buildings.find((b) => b.owner === 0 && b.kind === kind)!;
      setTestBuildingHp(match, building.id, building.maxHp - by);
      return building.id;
    };
    const factory = damaged("vehicleFactory", 400);
    const hospital = damaged("hospital", 100);
    const opponent = createOpponent(0, 1);
    expect(opponent.think(getPlayerView(match, 0))).toContainEqual({ type: "tend", unitIds: [first], targetId: factory });

    // It Boards the Troop Carrier beside it before it has taken a step.
    expect(issueCommand(match, 0, { type: "board", unitIds: [first], targetId: carrier })).toEqual({ ok: true });
    for (let t = 0; t < 5 * SECONDS && unit(match, carrier)!.passengers!.length === 0; t++) advanceTick(match);
    expect(unit(match, carrier)!.passengers).toEqual([{ id: first, kind: "mechanic" }]);
    const second = addTestUnit(match, 0, "mechanic", { x: RALLY.x - 1, y: RALLY.y });
    // The worse-off Vehicle Factory already has its Mechanic, so the new one goes to the Hospital.
    const commands = opponent.think(getPlayerView(match, 0));
    expect(commands.filter((c) => c.type === "tend")).toEqual([{ type: "tend", unitIds: [second], targetId: hospital }]);
  });
});

const RALLY = { x: 6, y: 6 };
const apart = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const holdsSomeone = (match: Match): boolean => ofKind(match, "troopCarrier").some((c) => c.passengers!.length > 0);

describe("Computer Opponent keeping its Troop Carrier clear of its Medics and Mechanics", () => {
  const SUPPORTED: readonly BuildingKind[] = [...BUILD_ORDER_DONE, "hospital"];

  it("parks a new Troop Carrier away from the rally point, so it never Collects the Medics and Mechanics waiting there", () => {
    const match = base(SUPPORTED);
    const waiting = (["medic", "medic", "mechanic", "mechanic"] as const).map((kind, i) =>
      addTestUnit(match, 0, kind, { x: RALLY.x - 1 + i, y: RALLY.y }),
    );
    setTestCredits(match, 0, PLENTY);
    const opponent = opponentPastItsFirstWave(match);
    let tookSomeone = false;
    for (let t = 0; t < 60 * SECONDS; t += THINK_EVERY_TICKS) {
      play(match, opponent, THINK_EVERY_TICKS);
      tookSomeone ||= holdsSomeone(match);
    }
    const [carrier] = ofKind(match, "troopCarrier");
    expect(carrier).toBeDefined();
    expect(tookSomeone).toBe(false);
    // Twice as far off as it reaches when Collecting.
    for (const id of waiting) expect(apart(unit(match, id)!, carrier!)).toBeGreaterThan(2 * TROOP_CARRIER.collectRadius);
  });

  it("has a Troop Carrier that holds a Medic and a Mechanic Unload, and sends them back to the rally point", () => {
    const match = base(SUPPORTED);
    const { carrier, inside } = carrying(match, { x: 20, y: 20 }, ["medic", "mechanic"]);
    const opponent = createOpponent(0, 1);
    expect(opponent.think(getPlayerView(match, 0))).toContainEqual({ type: "unload", unitIds: [carrier] });
    play(match, opponent, 30 * SECONDS);
    expect(unit(match, carrier)!.passengers).toEqual([]);
    for (const id of inside) expect(apart(unit(match, id)!, RALLY)).toBeLessThan(3);
  });
});

describe("Computer Opponent training a Troop Carrier", () => {
  it("trains its Troop Carrier once its build order stands and its first wave has set off, and then no more", () => {
    const match = base(BUILD_ORDER_DONE);
    setTestCredits(match, 0, PLENTY);
    const given = play(match, opponentPastItsFirstWave(match), 90 * SECONDS);
    expect(trains(given, "troopCarrier")).toHaveLength(OPPONENT.mostTroopCarriers);
    expect(ofKind(match, "troopCarrier")).toHaveLength(OPPONENT.mostTroopCarriers);
  });

  it("trains none while its build order still lacks a Building", () => {
    const match = base(["barracks", "refinery", "vehicleFactory"]);
    setTestCredits(match, 0, PLENTY);
    // The Turret is started at once; the Credits are topped up so only the build order holds it back.
    const given = play(match, createOpponent(0, 1), 5 * SECONDS);
    expect(trains(given, "raider").length).toBeGreaterThan(0);
    expect(trains(given, "troopCarrier")).toEqual([]);
  });
});

describe("Computer Opponent's wave with a Troop Carrier", () => {
  interface Staged {
    readonly match: Match;
    readonly carrier: number;
    /** The six oldest army Units at home, all Riflemen: the first wave. */
    readonly wave: number[];
  }

  /**
   * A base with a Troop Carrier and more army than a first wave needs: the two
   * starting Riflemen and four more make the wave, two Riflemen and two Raiders
   * (one of them the scout) stay.
   */
  function staged(map?: MapDef): Staged {
    const match = base(BUILD_ORDER_DONE, map);
    const starting = ofKind(match, "rifleman").map((u) => u.id);
    const added = Array.from({ length: 6 }, (_, i) => addTestUnit(match, 0, "rifleman", { x: RALLY.x - 2 + i, y: RALLY.y + 1 }));
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 12, y: 12 });
    for (let i = 0; i < 2; i++) addTestUnit(match, 0, "raider", { x: RALLY.x + i, y: RALLY.y + 3 });
    return { match, carrier, wave: [...starting, ...added.slice(0, 4)] };
  }

  const boards = (given: readonly Given[]) => given.filter((g) => g.command.type === "board");
  /** The wave setting off or being led on: every Attack-move (the scout goes on a plain move). */
  const waveMoves = (given: readonly Given[]) =>
    given.flatMap((g) => (g.command.type === "attackMove" ? [{ tick: g.tick, ...g.command }] : []));
  const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);
  const inside = (match: Match, carrier: number) => sorted(unit(match, carrier)!.passengers!.map((p) => p.id));
  const WAVE_SETS_OFF = OPPONENT.firstWaveTick + 60 * SECONDS;

  it("has as many of the wave's Riflemen as it holds Board it at home, and sets off with them aboard", () => {
    const { match, carrier, wave } = staged();
    let aboardAtSetOff: number[] | null = null;
    const given = play(match, createOpponent(0, 1), WAVE_SETS_OFF, {
      done: (soFar) => {
        if (waveMoves(soFar).length === 0) return false;
        aboardAtSetOff = inside(match, carrier);
        return true;
      },
    });
    expect(boards(given).map((g) => g.command)).toEqual([{ type: "board", unitIds: wave.slice(0, 5), targetId: carrier }]);
    const setOff = waveMoves(given)[0]!;
    expect(boards(given)[0]!.tick).toBeGreaterThanOrEqual(OPPONENT.firstWaveTick);
    expect(setOff.tick).toBeGreaterThan(boards(given)[0]!.tick);
    expect(aboardAtSetOff).toEqual(wave.slice(0, 5));
    // The one of the wave on foot, by Attack-move; the Troop Carrier comes after it.
    expect(setOff.unitIds).toEqual([wave[5]!]);
  });

  it("leaves with whoever is aboard when the others have not reached it in time", () => {
    const match = base(BUILD_ORDER_DONE);
    const near = ofKind(match, "rifleman").map((u) => u.id);
    // Some twenty-eight Cells from where the Troop Carrier parks: more than a Rifleman walks in the time allowed.
    const far = Array.from({ length: 4 }, (_, i) => addTestUnit(match, 0, "rifleman", { x: 1 + i, y: 36 }));
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 12, y: 12 });
    for (let i = 0; i < 2; i++) addTestUnit(match, 0, "raider", { x: RALLY.x + i, y: RALLY.y + 3 });
    let aboardAtSetOff: number[] | null = null;
    const given = play(match, createOpponent(0, 1), WAVE_SETS_OFF, {
      done: (soFar) => {
        if (waveMoves(soFar).length === 0) return false;
        aboardAtSetOff = inside(match, carrier);
        return true;
      },
    });
    expect(boards(given).map((g) => g.command)).toEqual([{ type: "board", unitIds: [...near, ...far.slice(0, 3)], targetId: carrier }]);
    const setOff = waveMoves(given)[0]!;
    expect(aboardAtSetOff).toEqual(near);
    expect(setOff.tick - boards(given)[0]!.tick).toBe(OPPONENT.boardTicks);
    expect(sorted(setOff.unitIds)).toEqual(sorted(far));
  });

  it("Unloads at the gathering point, where its Riflemen join the wave's attack, and drives home empty", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    const given = play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => soFar.some((g) => g.command.type === "unload") });
    const gatherAt = waveMoves(given)[0]!.target;
    expect(given.at(-1)!.command).toEqual({ type: "unload", unitIds: [carrier] });
    expect(apart(unit(match, carrier)!, gatherAt)).toBeLessThanOrEqual(6);
    for (const id of wave.slice(0, 5)) expect(apart(unit(match, id)!, gatherAt)).toBeLessThanOrEqual(7);

    const after = play(match, opponent, 90 * SECONDS);
    expect(boards(after)).toEqual([]);
    // Once it is seen empty it is sent home, by a plain move.
    expect(after.map((g) => g.command)).toContainEqual({ type: "move", unitIds: [carrier], target: expect.anything() });
    const led = new Set(after.flatMap((g) => (g.command.type === "attackMove" || g.command.type === "attack" ? g.command.unitIds : [])));
    expect(wave.filter((id) => !led.has(id))).toEqual([]);
    expect(led.has(carrier)).toBe(false);
    // Home again, on its own Cell and with nobody inside.
    const parked = unit(match, carrier)!;
    expect(parked.passengers).toEqual([]);
    expect(apart(parked, RALLY)).toBeGreaterThan(4);
    expect(apart(parked, { x: 1, y: 1 })).toBeLessThan(12);
  });

  it("has a wave Board a Troop Carrier that could not get to its Parking Cell, where it stopped after a second try", () => {
    // Rock for five Cells every way from the Parking Cell at (1, 9), which itself is open ground.
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 40 }, (_, x) => (x <= 5 && y >= 5 && y <= 13 && !(x === 1 && y === 9) ? "#" : ".")).join(""),
    );
    const { match, carrier, wave } = staged(testMap(rows));
    const given = play(match, createOpponent(0, 1), WAVE_SETS_OFF, { done: (soFar) => waveMoves(soFar).length > 0 });
    const drives = given.filter((g) => g.command.type === "move" && g.command.unitIds.includes(carrier));
    expect(drives.map((g) => g.command)).toEqual([
      { type: "move", unitIds: [carrier], target: { x: 1, y: 9 } },
      { type: "move", unitIds: [carrier], target: { x: 1, y: 9 } },
    ]);
    expect(boards(given).map((g) => g.command)).toEqual([{ type: "board", unitIds: wave.slice(0, 5), targetId: carrier }]);
  });

  it("takes one Troop Carrier with a wave when two are parked", () => {
    const { match, carrier } = staged();
    const second = addTestUnit(match, 0, "troopCarrier", { x: 14, y: 12 });
    const given = play(match, createOpponent(0, 1), WAVE_SETS_OFF, { done: (soFar) => soFar.some((g) => g.command.type === "unload") });
    expect(boards(given)).toHaveLength(1);
    const went = new Set(waveMoves(given).flatMap((c) => c.unitIds.filter((id) => id === carrier || id === second)));
    expect(went.size).toBe(1);
  });

  it("sets off at once when its Troop Carrier is gone before the Riflemen are aboard", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => boards(soFar).length > 0 });
    // Destroyed before anyone has reached it: the next Tick takes it off the Map.
    setTestUnitHp(match, carrier, 0);
    advanceTick(match);
    expect(unit(match, carrier)).toBeUndefined();
    const commands = play(match, opponent, 1).map((g) => g.command);
    expect(commands.filter((c) => c.type === "board")).toEqual([]);
    expect(commands).toContainEqual({ type: "attackMove", unitIds: wave, target: expect.anything() });
  });

  it("sends Riflemen on by foot, and never to Board again, when their Troop Carrier is hit on the way", () => {
    const { match, carrier, wave } = staged();
    // On its way from its Parking Cell at (1, 9) to the gathering point at (25, 28):
    // the Troop Carrier, faster than anyone on foot, meets them first. Raiders reach as far as its own gun.
    for (let i = 0; i < 2; i++) addTestUnit(match, 1, "raider", { x: 12 + i, y: 19 });
    const opponent = createOpponent(0, 1);
    const before = play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => waveMoves(soFar).length > 0 });
    const gatherAt = waveMoves(before)[0]!.target;
    const after = play(match, opponent, 60 * SECONDS);
    expect(boards(after)).toEqual([]);
    // It got out under fire by itself: the Opponent never had to ask.
    expect(after.filter((g) => g.command.type === "unload")).toEqual([]);
    const onFoot = waveMoves(after).filter((c) => c.target.x === gatherAt.x && c.target.y === gatherAt.y);
    expect(sorted(onFoot.flatMap((c) => c.unitIds))).toEqual(wave.slice(0, 5));
    const home = after.filter((g) => g.command.type === "move" && g.command.unitIds.includes(carrier));
    expect(home.length).toBeGreaterThan(0);
    for (const c of ofKind(match, "troopCarrier")) expect(c.passengers).toEqual([]);
  });

  it("keeps its Troop Carrier no farther on than the wave's foremost Unit, and Unloads at the gathering point", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    const before = play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => waveMoves(soFar).length > 0 });
    const gatherAt = waveMoves(before)[0]!.target;
    const onFoot = wave[5]!;
    let farthestAhead = -Infinity;
    let thinks = 0;
    const led: Given[] = [];
    while (thinks < 12 * 60 && inside(match, carrier).length > 0) {
      led.push(...play(match, opponent, THINK_EVERY_TICKS));
      thinks++;
      const ahead = apart(unit(match, onFoot)!, gatherAt) - apart(unit(match, carrier)!, gatherAt);
      farthestAhead = Math.max(farthestAhead, ahead);
    }
    // A few Cells: about what a Unit on foot walks between two looks at where the wave is.
    expect(farthestAhead).toBeLessThanOrEqual(3);
    expect(led.map((g) => g.command)).toContainEqual({ type: "unload", unitIds: [carrier] });
    expect(apart(unit(match, carrier)!, gatherAt)).toBeLessThanOrEqual(6);
    for (const id of wave) expect(apart(unit(match, id)!, gatherAt)).toBeLessThanOrEqual(8);
    // Led now and then, not at every think.
    const toCarrier = led.filter((g) => "unitIds" in g.command && g.command.unitIds.includes(carrier));
    expect(toCarrier.length).toBeGreaterThan(0);
    expect(toCarrier.length).toBeLessThan(thinks / 3);
  });

  it("holds its Troop Carrier at the gathering point until every Passenger has had a free Cell to get out onto", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    // The first time it is told to Unload, all the Cells beside it but one are taken, by Harvesters that soon drive off.
    let ringed = false;
    const ring = (command: Command): void => {
      if (ringed || command.type !== "unload") return;
      ringed = true;
      const at = unit(match, carrier)!;
      const taken = new Set(ownUnits(match).map((u) => `${Math.floor(u.x)},${Math.floor(u.y)}`));
      const beside = [-1, 0, 1]
        .flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: Math.floor(at.x) + dx, y: Math.floor(at.y) + dy })))
        .filter((c) => !taken.has(`${c.x},${c.y}`));
      for (const cell of beside.slice(1)) addTestUnit(match, 0, "harvester", cell);
    };
    const upTo = play(match, opponent, WAVE_SETS_OFF, {
      done: (soFar) => soFar.some((g) => g.command.type === "unload"),
      before: ring,
    });
    const gatherAt = waveMoves(upTo)[0]!.target;
    expect(inside(match, carrier)).toHaveLength(4);

    let homeWithSomeoneInside = false;
    const after = play(match, opponent, 60 * SECONDS, {
      before: (command) => {
        if (command.type === "move" && command.unitIds.includes(carrier)) homeWithSomeoneInside ||= inside(match, carrier).length > 0;
      },
    });
    expect(homeWithSomeoneInside).toBe(false);
    expect(inside(match, carrier)).toEqual([]);
    expect(after.filter((g) => g.command.type === "unload").length).toBeGreaterThan(0);
    // Nobody was driven off: none of the wave was sent anywhere by a plain move, and all of it was led on to the attack.
    const moved = after.flatMap((g) => (g.command.type === "move" ? g.command.unitIds : []));
    expect(wave.filter((id) => moved.includes(id))).toEqual([]);
    const led = new Set(after.flatMap((g) => (g.command.type === "attackMove" || g.command.type === "attack" ? g.command.unitIds : [])));
    expect(wave.filter((id) => !led.has(id))).toEqual([]);
    expect(apart(unit(match, carrier)!, gatherAt)).toBeGreaterThan(10);
  });

  it("sets off before the time allowed is up once nobody is still on the way to Board", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    const before = play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => boards(soFar).length > 0 });
    // A Board that ended without the Unit getting in: from the view, a Unit that stands on the Map.
    expect(issueCommand(match, 0, { type: "stop", unitIds: [wave[4]!] })).toEqual({ ok: true });
    const after = play(match, opponent, OPPONENT.boardTicks + SECONDS, { done: (soFar) => waveMoves(soFar).length > 0 });
    const setOff = waveMoves(after)[0]!;
    expect(setOff.tick - boards(before)[0]!.tick).toBeLessThan(OPPONENT.boardTicks);
    expect(inside(match, carrier)).toEqual(wave.slice(0, 4));
    expect(sorted(setOff.unitIds)).toEqual([wave[4]!, wave[5]!]);
  });

  it("sets off at once when its Troop Carrier puts Units out while the wave is boarding", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => boards(soFar).length > 0 });
    for (let t = 0; t < OPPONENT.boardTicks && inside(match, carrier).length < 2; t += THINK_EVERY_TICKS) {
      play(match, opponent, THINK_EVERY_TICKS);
    }
    const were = inside(match, carrier);
    expect(were.length).toBeGreaterThanOrEqual(2);
    expect(were.length).toBeLessThan(5);
    // What a hit does to it (passengers.ts: a Troop Carrier that loses health Unloads on that Tick).
    setTestUnitHp(match, carrier, unit(match, carrier)!.hp - 20);
    expect(issueCommand(match, 0, { type: "unload", unitIds: [carrier] })).toEqual({ ok: true });
    const given = play(match, opponent, THINK_EVERY_TICKS);
    expect(boards(given)).toEqual([]);
    expect(waveMoves(given).map((c) => sorted(c.unitIds))).toEqual([wave]);
  });

  it("sends a first wave again, without waiting, when every Unit of the first is lost while it Boards", () => {
    const { match, carrier, wave } = staged();
    const opponent = createOpponent(0, 1);
    play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => boards(soFar).length > 0 });
    for (const id of wave) setTestUnitHp(match, id, 0);
    // With those that stayed, more than enough at home for a second wave, which is larger than a first.
    for (let i = 0; i < 6; i++) addTestUnit(match, 0, "rifleman", { x: RALLY.x - 2 + i, y: RALLY.y + 2 });
    // Far sooner than the least time from one wave to the next.
    const given = play(match, opponent, OPPONENT.boardTicks + 10 * SECONDS, { done: (soFar) => waveMoves(soFar).length > 0 });
    expect(boards(given)).toHaveLength(1);
    const boarding = boards(given)[0]!.command;
    expect(boarding).toMatchObject({ type: "board", targetId: carrier });
    const onFoot = waveMoves(given)[0]!.unitIds;
    expect((boarding.type === "board" ? boarding.unitIds.length : 0) + onFoot.length).toBe(OPPONENT.firstWave);
  });

  it("turns the Units waiting to Board on a Unit that comes at its base, and has the wave Board again afterwards", () => {
    const { match, wave } = staged();
    const opponent = createOpponent(0, 1);
    play(match, opponent, WAVE_SETS_OFF, { done: (soFar) => boards(soFar).length > 0 });
    // In sight of the Riflemen at the rally point, and within the ten Cells of a Building that the Opponent defends.
    const raider = addTestUnit(match, 1, "raider", { x: 10, y: 9 });
    const given = play(match, opponent, THINK_EVERY_TICKS);
    const defending = given.flatMap((g) => (g.command.type === "attack" && g.command.targetId === raider ? g.command.unitIds : []));
    expect(wave.filter((id) => !defending.includes(id))).toEqual([]);
    const later = play(match, opponent, 60 * SECONDS, { done: (soFar) => boards(soFar).length > 0 });
    expect(getPlayerView(match, 1).units.some((u) => u.id === raider)).toBe(false);
    expect(boards(later)).toHaveLength(1);
  });
});

describe("Computer Opponent's waves with a Troop Carrier on Riverford when nothing meets them on the way", () => {
  interface CarrierWave {
    readonly carrier: number;
    gatherAt: { x: number; y: number } | null;
    onFoot: number[];
    /** Most Cells the Troop Carrier was nearer the gathering point than the wave's foremost Unit on foot. */
    farthestAhead: number;
    /** Where it was told to Unload, as Cells from the gathering point, and how many were inside. */
    unloaded: { apart: number; inside: number } | null;
  }

  it("brings every Troop Carrier to the gathering point with the wave, and Unloads every Passenger there", () => {
    const match = createMatch(RIVERFORD, 7);
    // Player 0 gives no Commands. Its Turrets stop each wave at its base (its HQ is at (4, 4)), so several are sent,
    // and they reach no farther than the gathering points, which are well short of it.
    for (const at of [{ x: 9, y: 9 }, { x: 12, y: 6 }, { x: 6, y: 12 }, { x: 12, y: 11 }]) addTestBuilding(match, 0, "turret", at);
    const opponent = createOpponent(1, 7);
    const waves: CarrierWave[] = [];
    for (let t = 0; t < 8 * 60 * SECONDS && getMatchStatus(match).state === "running"; t++) {
      if (t % THINK_EVERY_TICKS === 0) {
        const view = getPlayerView(match, 1);
        const own = view.units.filter((u) => u.owner === 1);
        const wave = waves.at(-1);
        const carrier = own.find((u) => u.id === wave?.carrier);
        if (wave?.gatherAt && !wave.unloaded && carrier && carrier.passengers!.length > 0) {
          const left = own.filter((u) => wave.onFoot.includes(u.id)).map((u) => apart(u, wave.gatherAt!));
          if (left.length > 0) wave.farthestAhead = Math.max(wave.farthestAhead, Math.min(...left) - apart(carrier, wave.gatherAt));
        }
        for (const command of opponent.think(view)) {
          expect(issueCommand(match, 1, command), JSON.stringify(command)).toEqual({ ok: true });
          if (command.type === "board") {
            waves.push({ carrier: command.targetId, gatherAt: null, onFoot: [], farthestAhead: -Infinity, unloaded: null });
          }
          const current = waves.at(-1);
          if (!current) continue;
          // The first Attack-move after the Board Command is the wave's Units on foot setting off.
          if (command.type === "attackMove" && !current.gatherAt) {
            current.gatherAt = command.target;
            current.onFoot = [...command.unitIds];
          }
          if (command.type === "unload" && command.unitIds.includes(current.carrier) && current.gatherAt && !current.unloaded) {
            const at = own.find((u) => u.id === current.carrier)!;
            current.unloaded = { apart: apart(at, current.gatherAt), inside: at.passengers!.length };
          }
        }
      }
      advanceTick(match);
    }
    // The first wave goes on foot: there is no Troop Carrier before it has set off. Each one after has as many Riflemen as there is room for Board the Troop Carrier.
    expect(waves.length).toBeGreaterThanOrEqual(2);
    for (const wave of waves) {
      expect(wave.unloaded?.inside).toBe(TROOP_CARRIER.capacity);
      expect(wave.unloaded!.apart).toBeLessThanOrEqual(6);
      expect(wave.farthestAhead).toBeLessThanOrEqual(3);
    }
  }, 60_000);
});

describe("Computer Opponent against itself on Riverford", () => {
  it("sets a wave off with a Troop Carrier it trained full of Riflemen, and Unloads them at the gathering point", () => {
    const match = createMatch(RIVERFORD, 3);
    const seats = [
      { player: 0 as const, opponent: createOpponent(0, 11) },
      { player: 1 as const, opponent: createOpponent(1, 12) },
    ];
    let trained = false;
    let boarded: number[] | null = null;
    let boardedBy: number | null = null;
    let setOffWith: UnitKind[] | null = null;
    let unloadedNearGathering: boolean | null = null;
    let gatherAt = { x: 0, y: 0 };
    for (let t = 0; t < 9 * 60 * SECONDS && unloadedNearGathering === null; t++) {
      if (t % THINK_EVERY_TICKS === 0) {
        for (const { player, opponent } of seats) {
          const view = getPlayerView(match, player);
          const carrier = view.units.find((u) => u.owner === player && u.kind === "troopCarrier");
          for (const command of opponent.think(view)) {
            expect(issueCommand(match, player, command), JSON.stringify(command)).toEqual({ ok: true });
            if (command.type === "train" && command.kind === "troopCarrier") trained = true;
            if (command.type === "board" && !boarded) {
              boarded = [...command.unitIds];
              boardedBy = player;
            }
            // That Player's first Attack-move after the Board Command is the wave's Units on foot setting off.
            if (command.type === "attackMove" && boardedBy === player && carrier && !setOffWith) {
              setOffWith = carrier.passengers!.map((p) => p.kind);
              gatherAt = command.target;
            }
            if (command.type === "unload" && boardedBy === player && setOffWith) unloadedNearGathering = apart(carrier!, gatherAt) <= 6;
          }
        }
      }
      advanceTick(match);
    }
    expect(trained).toBe(true);
    expect(boarded).toHaveLength(TROOP_CARRIER.capacity);
    expect(setOffWith).toEqual(Array.from({ length: TROOP_CARRIER.capacity }, () => "rifleman"));
    expect(unloadedNearGathering).toBe(true);
  }, 60_000);
});
