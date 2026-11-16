import { describe, expect, it } from "vitest";
import {
  advanceTick,
  createMatch,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
  TEND,
  TEND_RATES,
  tendRate,
  TICKS_PER_SECOND,
  type UnitView,
} from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, setTestBuildingHp, setTestUnitHp } from "./testing/setup";

// Staged along row 8 of a wide open Map, far from both starting bases in the
// corners (and from their Riflemen, who are out of every radius used here).
const ROW = 8;
const stage = (): Match => createMatch(openMap(50, 40), 1);

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

function runUntil(match: Match, done: () => boolean, limit = 1200): number {
  for (let t = 0; t < limit; t++) {
    if (done()) return t;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

/** A Unit as its owner sees it: a Player always sees its own Units. */
const find = (match: Match, id: number): UnitView | undefined =>
  getPlayerView(match, 0).units.find((u) => u.id === id && u.owner === 0) ??
  getPlayerView(match, 1).units.find((u) => u.id === id && u.owner === 1);

const hp = (match: Match, id: number): number => find(match, id)!.hp;
const at = (match: Match, id: number) => ({ x: find(match, id)!.x, y: find(match, id)!.y });

/** Adds a hurt Unit and returns its id. */
function hurt(match: Match, owner: PlayerId, kind: UnitView["kind"], x: number, y: number, health: number): number {
  const id = addTestUnit(match, owner, kind, { x, y });
  setTestUnitHp(match, id, health);
  return id;
}

const tend = (match: Match, unitIds: number[], targetId: number, player: PlayerId = 0) =>
  issueCommand(match, player, { type: "tend", unitIds, targetId });

/** Everything either Player can see, to show that a rejected Command changed nothing. */
const snapshot = (match: Match): string => JSON.stringify([getPlayerView(match, 0), getPlayerView(match, 1)]);

/** Adds a Building for the Player, sets its health and returns its id. */
function damagedBuilding(match: Match, owner: PlayerId, x: number, y: number, health: number): number {
  addTestBuilding(match, owner, "barracks", { x, y });
  const id = getPlayerView(match, owner).buildings.find((b) => b.x === x && b.y === y)!.id;
  setTestBuildingHp(match, id, health);
  return id;
}

const buildingHp = (match: Match, owner: PlayerId, id: number): number =>
  getPlayerView(match, owner).buildings.find((b) => b.id === id)!.hp;

/** Marches the patient 30 Cells along the row and returns where the Medic stands once it is there. */
function marchAway(match: Match, medic: number, patient: number): { x: number; y: number } {
  const from = at(match, patient).x;
  issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: Math.floor(from) + 30, y: ROW } });
  runUntil(match, () => at(match, patient).x === from + 30);
  return at(match, medic);
}

describe("the Tend Command", () => {
  it("sends a Medic to a hurt Rifleman, heals it to full health at 8 a second, and leaves the Medic idle", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const rifleman = hurt(match, 0, "rifleman", 20, ROW, 10);
    expect(tend(match, [medic], rifleman)).toEqual({ ok: true });
    // Nothing is healed from a distance: the Medic has to walk there first.
    run(match, TICKS_PER_SECOND);
    expect(hp(match, rifleman)).toBe(10);
    runUntil(match, () => hp(match, rifleman) > 10);
    // Beside it: in the next Cell along, not on top of it.
    expect(Math.floor(at(match, medic).x)).toBe(19);
    const before = hp(match, rifleman);
    run(match, TICKS_PER_SECOND);
    expect(hp(match, rifleman) - before).toBe(8);
    // Whole health points all the way, so a health bar never shows a sliver missing.
    runUntil(match, () => {
      expect(Number.isInteger(hp(match, rifleman))).toBe(true);
      return hp(match, rifleman) === 50;
    });
    run(match, 3 * TICKS_PER_SECOND);
    expect(hp(match, rifleman)).toBe(50);
    // Idle again: when the healed Rifleman walks off, the Medic stays where it is.
    const stood = at(match, medic);
    issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: { x: 23, y: ROW } });
    run(match, 4 * TICKS_PER_SECOND);
    expect(at(match, rifleman)).toEqual({ x: 23.5, y: ROW + 0.5 });
    expect(at(match, medic)).toEqual(stood);
  });

  it("heals another Medic, and never the Medic itself", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const other = hurt(match, 0, "medic", 21, ROW, 5);
    expect(tend(match, [medic], other)).toEqual({ ok: true });
    runUntil(match, () => hp(match, other) === 40);

    // A hurt Medic by itself stays hurt, and cannot be Tended onto itself.
    const alone = stage();
    const hurtMedic = hurt(alone, 0, "medic", 20, ROW, 15);
    expect(tend(alone, [hurtMedic], hurtMedic).ok).toBe(false);
    run(alone, 5 * TICKS_PER_SECOND);
    expect(hp(alone, hurtMedic)).toBe(15);
  });

  it("does nothing for a Vehicle or a Building: the Command is rejected and the Match is unchanged", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const raider = hurt(match, 0, "raider", 21, ROW, 30);
    const barracks = damagedBuilding(match, 0, 20, ROW + 1, 100);
    const before = snapshot(match);
    expect(tend(match, [medic], raider).ok).toBe(false);
    expect(tend(match, [medic], barracks).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    run(match, 5 * TICKS_PER_SECOND);
    expect(hp(match, raider)).toBe(30);
    expect(buildingHp(match, 0, barracks)).toBe(100);
    expect(at(match, medic)).toEqual({ x: 20.5, y: ROW + 0.5 });
  });

  it("is rejected, with the Match unchanged, for another Player's target or another Player's Units", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const theirs = hurt(match, 1, "rifleman", 21, ROW + 3, 10);
    const theirMedic = addTestUnit(match, 1, "medic", { x: 22, y: ROW + 3 });
    const mine = hurt(match, 0, "rifleman", 20, ROW + 12, 10);
    const before = snapshot(match);
    expect(tend(match, [medic], theirs).ok).toBe(false);
    expect(tend(match, [theirMedic], mine).ok).toBe(false);
    expect(tend(match, [], mine).ok).toBe(false);
    expect(tend(match, [medic], 987654).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
  });

  it("gives the same answer for another Player's Unit whether or not it can be seen, and for a Unit that is not there", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    const seen = hurt(match, 1, "rifleman", 21, ROW + 3, 10);
    const unseen = hurt(match, 1, "rifleman", 40, ROW + 20, 10);
    expect(getPlayerView(match, 0).units.some((u) => u.id === seen)).toBe(true);
    expect(getPlayerView(match, 0).units.some((u) => u.id === unseen)).toBe(false);
    const answer = tend(match, [medic], seen);
    expect(answer.ok).toBe(false);
    expect(tend(match, [medic], unseen)).toEqual(answer);
    expect(tend(match, [medic], 987654)).toEqual(answer);
  });

  it("is rejected when no Unit in it can help the target, and leaves a Unit that cannot help as it was when one can", () => {
    const match = stage();
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 14, y: ROW });
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW + 1 });
    const patient = hurt(match, 0, "rifleman", 22, ROW, 10);
    const before = snapshot(match);
    expect(tend(match, [rifleman], patient).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    // The Rifleman is on a move of its own, which the Tend it cannot join must not replace.
    issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: { x: 14, y: ROW + 10 } });
    expect(tend(match, [rifleman, medic], patient)).toEqual({ ok: true });
    runUntil(match, () => hp(match, patient) === 50);
    expect(at(match, rifleman)).toEqual({ x: 14.5, y: ROW + 10.5 });
  });

  it("heals at twice the rate with two Medics on one target", () => {
    const gained = (medics: number): number => {
      const match = stage();
      const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
      const ids = Array.from({ length: medics }, (_, i) => addTestUnit(match, 0, "medic", { x: 19 + 2 * i, y: ROW }));
      expect(tend(match, ids, patient)).toEqual({ ok: true });
      run(match, 2 * TICKS_PER_SECOND);
      return hp(match, patient) - 5;
    };
    expect(gained(1)).toBe(16);
    expect(gained(2)).toBe(32);
  });

  it("costs no Credits", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 19, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
    const credits = getPlayerView(match, 0).credits;
    tend(match, [medic], patient);
    runUntil(match, () => hp(match, patient) === 50);
    expect(getPlayerView(match, 0).credits).toBe(credits);
  });

  it("ends when the target dies, leaving the Medic idle where it stood", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 24, ROW, 10);
    tend(match, [medic], patient);
    run(match, TICKS_PER_SECOND);
    setTestUnitHp(match, patient, 0);
    run(match, 2);
    expect(find(match, patient)).toBeUndefined();
    const stood = at(match, medic);
    run(match, 3 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    // Idle, not stuck on the dead target: it sees to the next hurt Unit that turns up close by.
    const next = hurt(match, 0, "rifleman", Math.floor(stood.x) + 2, ROW, 10);
    runUntil(match, () => hp(match, next) === 50);
  });

  it("is replaced by a new Command: a Medic told to move walks off and the healing stops", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 19, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
    tend(match, [medic], patient);
    run(match, TICKS_PER_SECOND);
    issueCommand(match, 0, { type: "move", unitIds: [medic], target: { x: 30, y: ROW } });
    const then = hp(match, patient);
    expect(then).toBe(13);
    runUntil(match, () => at(match, medic).x === 30.5);
    expect(hp(match, patient)).toBe(then);
  });

  it("follows a target that moves a short way, and heals it where it stops", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 10);
    tend(match, [medic], patient);
    // The target sets off at once, 5 Cells along: the Medic, no faster, catches it up only where it stops.
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: 25, y: ROW } });
    runUntil(match, () => hp(match, patient) === 50);
    expect(at(match, patient)).toEqual({ x: 25.5, y: ROW + 0.5 });
    expect(Math.floor(at(match, medic).x)).toBe(24);
  });

  it("gives up when the target moves beyond the leash of 8 Cells from where it was", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 10);
    tend(match, [medic], patient);
    expect(TEND.leash).toBe(8);
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: 34, y: ROW } });
    runUntil(match, () => at(match, patient).x === 34.5);
    // The Medic stopped when the target passed 8 Cells from its start, about 6 Cells behind it.
    const stood = at(match, medic);
    expect(stood.x).toBeGreaterThan(21);
    expect(stood.x).toBeLessThan(24);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    expect(hp(match, patient)).toBe(10);
  });

  it("holds to the leash when it starts beside a target that marches off: it stops within 8 Cells and stays there", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    tend(match, [medic], patient);
    const stood = marchAway(match, medic, patient);
    // The patient's start was 15.5; the Medic walks a Cell behind it and stops once the patient is 8 Cells out.
    expect(stood.x).toBeLessThan(15.5 + 8);
    expect(hp(match, patient)).toBeLessThan(50);
    const left = hp(match, patient);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    expect(hp(match, patient)).toBe(left);
  });

  it("is obeyed again for a target the Medic gave up on at the leash", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    tend(match, [medic], patient);
    const stood = marchAway(match, medic, patient);
    run(match, 2 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    expect(tend(match, [medic], patient)).toEqual({ ok: true });
    runUntil(match, () => hp(match, patient) === 50);
    expect(Math.floor(at(match, medic).x)).toBe(44);
  });

  it("lets the Medic go back to that target by itself once the Medic has been given any Command", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    tend(match, [medic], patient);
    const stood = marchAway(match, medic, patient);
    // The patient comes back and stops 3 Cells from the Medic, well inside the seek radius: still left alone.
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: Math.floor(stood.x) + 3, y: ROW } });
    runUntil(match, () => at(match, patient).x === Math.floor(stood.x) + 3.5);
    const left = hp(match, patient);
    run(match, 5 * TICKS_PER_SECOND);
    expect(hp(match, patient)).toBe(left);
    expect(at(match, medic)).toEqual(stood);
    expect(issueCommand(match, 0, { type: "stop", unitIds: [medic] })).toEqual({ ok: true });
    runUntil(match, () => hp(match, patient) === 50);
  });
});

describe("a Medic with nothing to do", () => {
  it("holds to the leash on a target it went to by itself: it stops within 8 Cells and stays there", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    // Long enough for a look: the Medic is at work without being told.
    runUntil(match, () => hp(match, patient) > 1);
    const stood = marchAway(match, medic, patient);
    expect(stood.x).toBeLessThan(15.5 + 8);
    expect(hp(match, patient)).toBeLessThan(50);
    const left = hp(match, patient);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    expect(hp(match, patient)).toBe(left);
  });

  it("walks to a hurt Infantry Unit within 6 Cells and heals it to full health by itself", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 10);
    expect(TEND.seekRadius).toBe(6);
    runUntil(match, () => hp(match, patient) === 50);
    expect(Math.floor(at(match, medic).x)).toBe(19);
  });

  it("ignores a hurt Infantry Unit beyond the seek radius", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 21, ROW, 10);
    run(match, 10 * TICKS_PER_SECOND);
    expect(hp(match, patient)).toBe(10);
    expect(at(match, medic)).toEqual({ x: 14.5, y: ROW + 0.5 });
  });

  it("goes to the nearest of two hurt Units first, then to the other", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    // The farther one is added first, so going by id would pick it.
    const far = hurt(match, 0, "rifleman", 25, ROW, 10);
    const near = hurt(match, 0, "rifleman", 17, ROW, 10);
    runUntil(match, () => hp(match, near) > 10 || hp(match, far) > 10);
    expect(hp(match, far)).toBe(10);
    runUntil(match, () => hp(match, near) === 50);
    expect(hp(match, far)).toBe(10);
    // The other is 7 Cells from where the Medic now stands, so it is left alone until it comes nearer.
    run(match, 5 * TICKS_PER_SECOND);
    expect(hp(match, far)).toBe(10);
    issueCommand(match, 0, { type: "move", unitIds: [far], target: { x: 23, y: ROW } });
    runUntil(match, () => hp(match, far) === 50);
    expect(medic).toBeGreaterThan(0);
  });

  it("leaves Units at full health, Vehicles, Buildings and the other Player's hurt Units alone", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    addTestUnit(match, 0, "rifleman", { x: 22, y: ROW });
    const raider = hurt(match, 0, "raider", 20, ROW + 2, 30);
    const barracks = damagedBuilding(match, 0, 17, ROW, 100);
    const theirs = hurt(match, 1, "medic", 20, ROW - 3, 10);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual({ x: 20.5, y: ROW + 0.5 });
    expect(hp(match, raider)).toBe(30);
    expect(buildingHp(match, 0, barracks)).toBe(100);
    expect(hp(match, theirs)).toBe(10);
  });

  it("does not go off to heal while it has a Command in progress, and does once it has arrived", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    // Two Cells off the Medic's route, in easy reach all the way along it.
    const passed = hurt(match, 0, "rifleman", 20, ROW + 2, 10);
    const atTheEnd = hurt(match, 0, "rifleman", 33, ROW, 10);
    const goal = { x: 30, y: ROW };
    issueCommand(match, 0, { type: "move", unitIds: [medic], target: goal });
    runUntil(match, () => at(match, medic).x === goal.x + 0.5 && at(match, medic).y === goal.y + 0.5);
    expect(hp(match, passed)).toBe(10);
    expect(hp(match, atTheEnd)).toBe(10);
    runUntil(match, () => hp(match, atTheEnd) === 50);
    expect(hp(match, passed)).toBe(10);
  });
});

describe("what a Player view shows of a Tend", () => {
  it("lists the target, where it is and the Tick, on every Tick a Medic is at work on it and on no other", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 17, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 44);
    expect(getPlayerView(match, 0).tends).toEqual([]);
    tend(match, [medic], patient);
    const worked: number[] = [];
    for (let t = 0; t < 6 * TICKS_PER_SECOND; t++) {
      const before = hp(match, patient);
      const tick = getPlayerView(match, 0).tick;
      advanceTick(match);
      const tends = getPlayerView(match, 0).tends;
      if (tends.length > 0) {
        expect(tends).toEqual([{ targetId: patient, x: 20.5, y: ROW + 0.5, tick }]);
        worked.push(tick);
      } else {
        // Health only ever goes up on a Tick that is listed.
        expect(hp(match, patient)).toBe(before);
      }
    }
    // 6 health at 8 a second is 15 Ticks of work, one after the other, and none once it is full.
    expect(worked).toHaveLength(15);
    expect(worked.at(-1)! - worked[0]!).toBe(14);
    expect(hp(match, patient)).toBe(50);
  });

  it("lists a target once however many Medics are at work on it", () => {
    const match = stage();
    const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
    const medics = [addTestUnit(match, 0, "medic", { x: 19, y: ROW }), addTestUnit(match, 0, "medic", { x: 21, y: ROW })];
    tend(match, medics, patient);
    run(match, 3);
    expect(getPlayerView(match, 0).tends).toHaveLength(1);
  });

  it("shows the other Player a Tend only where that Player can see the target", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 19, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
    tend(match, [medic], patient);
    run(match, 3);
    expect(getPlayerView(match, 0).tends).toHaveLength(1);
    expect(getPlayerView(match, 1).tends).toEqual([]);
    // A Harvester of the other Player parks in sight of it: now that Player sees it too.
    const watcher = addTestUnit(match, 1, "harvester", { x: 20, y: ROW + 2 });
    issueCommand(match, 1, { type: "stop", unitIds: [watcher] });
    run(match, 3);
    expect(getPlayerView(match, 1).tends).toEqual(getPlayerView(match, 0).tends);
    expect(getPlayerView(match, 1).tends).toHaveLength(1);
  });
});

describe("Tend numbers and replays", () => {
  it("keeps its numbers in the tuning file: a Medic heals Infantry at 8 a second and helps nothing else", () => {
    expect(TEND_RATES.medic).toEqual({ infantry: 8, vehicle: 0, building: 0 });
    expect(tendRate("medic", "infantry")).toBe(8);
    expect(tendRate("medic", "vehicle")).toBe(0);
    expect(tendRate("medic", "building")).toBe(0);
    expect(tendRate("rifleman", "infantry")).toBe(0);
    expect(tendRate("harvester", "vehicle")).toBe(0);
    expect(TEND).toMatchObject({ seekRadius: 6, leash: 8 });
    // "A slow cadence": no more than a few looks a second, and at least one.
    expect(TEND.seekTicks).toBeGreaterThanOrEqual(TICKS_PER_SECOND / 4);
    expect(TEND.seekTicks).toBeLessThanOrEqual(TICKS_PER_SECOND);
  });

  it("gives the same result from the same seed and Commands", () => {
    const play = (): string => {
      const match = stage();
      const medics = [addTestUnit(match, 0, "medic", { x: 14, y: ROW }), addTestUnit(match, 0, "medic", { x: 15, y: ROW + 3 })];
      const first = hurt(match, 0, "rifleman", 22, ROW, 7);
      hurt(match, 0, "rifleman", 18, ROW + 4, 20);
      hurt(match, 0, "medic", 12, ROW + 2, 3);
      tend(match, medics, first);
      run(match, 2 * TICKS_PER_SECOND);
      issueCommand(match, 0, { type: "move", unitIds: [first], target: { x: 26, y: ROW + 2 } });
      const seen: string[] = [];
      for (let t = 0; t < 20 * TICKS_PER_SECOND; t++) {
        advanceTick(match);
        seen.push(JSON.stringify([getPlayerView(match, 0).units, getPlayerView(match, 0).tends]));
      }
      return seen.join("\n");
    };
    expect(play()).toBe(play());
  });
});
