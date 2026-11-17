import { describe, expect, it } from "vitest";
import { advanceTick, getPlayerView, issueCommand, type Match, type PlayerId } from "./index";
import {
  addTestBuilding,
  addTestUnit,
  at,
  find,
  hp,
  hurt,
  run,
  runUntil,
  setTestBuildingHp,
  setTestUnitHp,
  snapshot,
  stage,
  tend,
} from "./testing/setup";
import { TEND, tendRate, TICKS_PER_SECOND, UNIT_STATS } from "./tuning";

// Staged along row 8 of the open Map, with the starting Riflemen out of every radius used here.
const ROW = 8;
/** A Rifleman's full health: every patient here is one unless it says otherwise. */
const FULL = UNIT_STATS.rifleman.maxHp;
/** Health a second a Medic Heals. */
const HEAL = tendRate("medic", "infantry");
/** The seek radius in whole Cells: a target this many Cells along the row is the farthest an idle Medic goes to. */
const REACH = Math.floor(TEND.seekRadius);
/** How far marchAway sends a patient: well beyond the leash and the seek radius together. */
const MARCH = 30;

/** Adds a Building for the Player, sets its health and returns its id. */
function damagedBuilding(match: Match, owner: PlayerId, x: number, y: number, health: number): number {
  addTestBuilding(match, owner, "barracks", { x, y });
  const id = getPlayerView(match, owner).buildings.find((b) => b.x === x && b.y === y)!.id;
  setTestBuildingHp(match, id, health);
  return id;
}

const buildingHp = (match: Match, owner: PlayerId, id: number): number =>
  getPlayerView(match, owner).buildings.find((b) => b.id === id)!.hp;

/** Marches the patient far along the row and returns where the Medic stands once it is there. */
function marchAway(match: Match, medic: number, patient: number): { x: number; y: number } {
  const from = at(match, patient).x;
  issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: Math.floor(from) + MARCH, y: ROW } });
  runUntil(match, () => at(match, patient).x === from + MARCH);
  return at(match, medic);
}

describe("the Tend Command", () => {
  it("sends a Medic to a hurt Rifleman, heals it to full health at the Medic's rate, and leaves the Medic idle", () => {
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
    expect(hp(match, rifleman) - before).toBe(HEAL);
    // Whole health points all the way, so a health bar never shows a sliver missing.
    runUntil(match, () => {
      expect(Number.isInteger(hp(match, rifleman))).toBe(true);
      return hp(match, rifleman) === FULL;
    });
    run(match, 3 * TICKS_PER_SECOND);
    expect(hp(match, rifleman)).toBe(FULL);
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
    runUntil(match, () => hp(match, other) === UNIT_STATS.medic.maxHp);

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

  it("is rejected, with the Match unchanged, for another Player's target or for only another Player's Units", () => {
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

  it("is obeyed by the Player's own Units when it names another Player's Units with them, and those are left as they were", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const theirMedic = addTestUnit(match, 1, "medic", { x: 14, y: ROW + 2 });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 10);
    expect(tend(match, [theirMedic, medic], patient)).toEqual({ ok: true });
    runUntil(match, () => hp(match, patient) === FULL);
    expect(Math.floor(at(match, medic).x)).toBe(19);
    expect(at(match, theirMedic)).toEqual({ x: 14.5, y: ROW + 2.5 });
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
    runUntil(match, () => hp(match, patient) === FULL);
    expect(at(match, rifleman)).toEqual({ x: 14.5, y: ROW + 10.5 });
  });

  it("is rejected for a target at full health, and leaves a Medic on a move walking", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const rifleman = addTestUnit(match, 0, "rifleman", { x: 16, y: ROW + 2 });
    issueCommand(match, 0, { type: "move", unitIds: [medic], target: { x: 24, y: ROW } });
    run(match, 5);
    const before = snapshot(match);
    expect(tend(match, [medic], rifleman).ok).toBe(false);
    expect(snapshot(match)).toBe(before);
    runUntil(match, () => at(match, medic).x === 24.5);
  });

  it("restores nothing in the Tick the Medic is killed", () => {
    // Health comes in whole points on some Ticks only, so every Tick of a second of work is tried.
    for (let after = 0; after < TICKS_PER_SECOND; after++) {
      const match = stage();
      const medic = addTestUnit(match, 0, "medic", { x: 19, y: ROW });
      const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
      tend(match, [medic], patient);
      run(match, after);
      const before = hp(match, patient);
      setTestUnitHp(match, medic, 0);
      advanceTick(match);
      expect(find(match, medic)).toBeUndefined();
      expect(hp(match, patient)).toBe(before);
      expect(getPlayerView(match, 0).tends).toEqual([]);
    }
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
    expect(gained(1)).toBe(2 * HEAL);
    expect(gained(2)).toBe(4 * HEAL);
  });

  it("costs no Credits", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 19, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
    const credits = getPlayerView(match, 0).credits;
    tend(match, [medic], patient);
    runUntil(match, () => hp(match, patient) === FULL);
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
    runUntil(match, () => hp(match, next) === FULL);
  });

  it("is replaced by a new Command: a Medic told to move walks off and the healing stops", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 19, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 5);
    tend(match, [medic], patient);
    run(match, TICKS_PER_SECOND);
    issueCommand(match, 0, { type: "move", unitIds: [medic], target: { x: 30, y: ROW } });
    const then = hp(match, patient);
    expect(then).toBe(5 + HEAL);
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
    runUntil(match, () => hp(match, patient) === FULL);
    expect(at(match, patient)).toEqual({ x: 25.5, y: ROW + 0.5 });
    expect(Math.floor(at(match, medic).x)).toBe(24);
  });

  it("gives up when the target moves beyond the leash from where it was", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 20, ROW, 10);
    tend(match, [medic], patient);
    const goal = 20 + Math.ceil(TEND.leash) + 6;
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: goal, y: ROW } });
    runUntil(match, () => at(match, patient).x === goal + 0.5);
    // No faster than the target, the Medic was still as far behind as it began when the target passed the leash:
    // it stopped about a leash from its own start.
    const stood = at(match, medic);
    expect(Math.abs(stood.x - (14.5 + TEND.leash))).toBeLessThan(1.5);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    expect(hp(match, patient)).toBe(10);
  });

  it("holds to the leash when it starts beside a target that marches off: it stops within the leash and stays there", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    tend(match, [medic], patient);
    const stood = marchAway(match, medic, patient);
    // The patient's start was 15.5; the Medic walks a Cell behind it and stops once the patient is a leash out.
    expect(stood.x).toBeLessThan(15.5 + TEND.leash);
    expect(hp(match, patient)).toBeLessThan(FULL);
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
    runUntil(match, () => hp(match, patient) === FULL);
    expect(Math.floor(at(match, medic).x)).toBe(15 + MARCH - 1);
  });

  it("does not set off by itself after a target that is still marching, whether or not the Medic has been given a Command since", () => {
    const follows = (command: boolean): number => {
      const match = stage();
      const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
      const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
      tend(match, [medic], patient);
      issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: 45, y: ROW } });
      // The Medic walks a Cell behind and gives up as the patient passes the leash, measured from 15.5.
      runUntil(match, () => at(match, patient).x > 15.5 + TEND.leash + 1);
      const stood = at(match, medic);
      expect(stood.x).toBeLessThan(15.5 + TEND.leash);
      if (command) expect(issueCommand(match, 0, { type: "stop", unitIds: [medic] })).toEqual({ ok: true });
      runUntil(match, () => at(match, patient).x === 45.5);
      return at(match, medic).x - stood.x;
    };
    // It stays where it gave up: by itself it goes only to a target that stands still.
    expect(follows(false)).toBe(0);
    expect(follows(true)).toBe(0);
  });
});

describe("a Medic with nothing to do", () => {
  it("holds to the leash on a target it went to by itself: it stops within the leash and stays there", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    // Long enough for a look: the Medic is at work without being told.
    runUntil(match, () => hp(match, patient) > 1);
    const stood = marchAway(match, medic, patient);
    expect(stood.x).toBeLessThan(15.5 + TEND.leash);
    expect(hp(match, patient)).toBeLessThan(FULL);
    const left = hp(match, patient);
    run(match, 10 * TICKS_PER_SECOND);
    expect(at(match, medic)).toEqual(stood);
    expect(hp(match, patient)).toBe(left);
  });

  it("goes back to a target it left at the leash once that target has stopped within the seek radius", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 16, y: ROW });
    const rifleman = hurt(match, 0, "rifleman", 19, ROW, 5);
    // The Medic is on its way without being told when the Rifleman sets off, to a Cell beyond the leash.
    const goal = 19 + Math.ceil(TEND.leash) + 1;
    runUntil(match, () => at(match, medic).x > 16.5);
    issueCommand(match, 0, { type: "move", unitIds: [rifleman], target: { x: goal, y: ROW } });
    runUntil(match, () => at(match, rifleman).x === goal + 0.5);
    expect(hp(match, rifleman)).toBeLessThan(FULL);
    // The Medic gave up short of it; the Rifleman has stopped, so it is hurt and in reach like any other.
    expect(at(match, rifleman).x - at(match, medic).x).toBeLessThan(TEND.seekRadius);
    runUntil(match, () => hp(match, rifleman) === FULL);
    expect(Math.floor(at(match, medic).x)).toBe(goal - 1);
  });

  it("goes back to a target it left at the leash when that target comes back and stops within the seek radius", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 15, ROW, 1);
    runUntil(match, () => hp(match, patient) > 1);
    const stood = marchAway(match, medic, patient);
    const left = hp(match, patient);
    // Stopped far beyond the seek radius: left alone.
    run(match, 5 * TICKS_PER_SECOND);
    expect(hp(match, patient)).toBe(left);
    expect(at(match, medic)).toEqual(stood);
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: Math.floor(stood.x) + 3, y: ROW } });
    runUntil(match, () => hp(match, patient) === FULL);
    // Healed where it stopped: the Medic did not set off until then.
    expect(at(match, patient).x).toBe(Math.floor(stood.x) + 3.5);
  });

  it("walks to a hurt Infantry Unit within the seek radius and heals it to full health by itself", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 14 + REACH, ROW, 10);
    runUntil(match, () => hp(match, patient) === FULL);
    expect(Math.floor(at(match, medic).x)).toBe(14 + REACH - 1);
  });

  it("ignores a hurt Infantry Unit beyond the seek radius", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 14, y: ROW });
    const patient = hurt(match, 0, "rifleman", 14 + REACH + 1, ROW, 10);
    run(match, 10 * TICKS_PER_SECOND);
    expect(hp(match, patient)).toBe(10);
    expect(at(match, medic)).toEqual({ x: 14.5, y: ROW + 0.5 });
  });

  it("goes to the nearest of two hurt Units first, then to the other", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 20, y: ROW });
    // The farther one is added first, so going by id would pick it.
    const far = hurt(match, 0, "rifleman", 20 + REACH - 1, ROW, 10);
    const near = hurt(match, 0, "rifleman", 17, ROW, 10);
    runUntil(match, () => hp(match, near) > 10 || hp(match, far) > 10);
    expect(hp(match, far)).toBe(10);
    runUntil(match, () => hp(match, near) === FULL);
    expect(hp(match, far)).toBe(10);
    // The Medic now stands at 18, a Cell beyond the seek radius from the other, so that one is left alone until it comes nearer.
    run(match, 5 * TICKS_PER_SECOND);
    expect(hp(match, far)).toBe(10);
    issueCommand(match, 0, { type: "move", unitIds: [far], target: { x: 18 + REACH - 1, y: ROW } });
    runUntil(match, () => hp(match, far) === FULL);
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
    runUntil(match, () => hp(match, atTheEnd) === FULL);
    expect(hp(match, passed)).toBe(10);
  });
});

describe("what a Player view shows of a Tend", () => {
  it("lists the target, where it is and the Tick, on every Tick a Medic is at work on it and on no other", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 17, y: ROW });
    const missing = 6;
    const patient = hurt(match, 0, "rifleman", 20, ROW, FULL - missing);
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
    // As many Ticks of work as the missing health takes at the Medic's rate, one after the other, and none once it is full.
    const ticks = Math.ceil((missing * TICKS_PER_SECOND) / HEAL);
    expect(worked).toHaveLength(ticks);
    expect(worked.at(-1)! - worked[0]!).toBe(ticks - 1);
    expect(hp(match, patient)).toBe(FULL);
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

describe("Tend replays", () => {
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
