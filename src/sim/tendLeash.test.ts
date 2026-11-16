import { describe, expect, it } from "vitest";
import { advanceTick, createMatch, getPlayerView, issueCommand, type Match, TEND, TICKS_PER_SECOND } from "./index";
import { openMap } from "./testing/maps";
import { addTestUnit, setTestUnitHp } from "./testing/setup";

// Staged along row 20 of a wide open Map, far from both starting bases.
const ROW = 20;
const stage = (): Match => createMatch(openMap(80, 40), 1);

function run(match: Match, ticks: number): void {
  for (let t = 0; t < ticks; t++) advanceTick(match);
}

function runUntil(match: Match, done: () => boolean, limit = 3000): void {
  for (let t = 0; t < limit; t++) {
    if (done()) return;
    advanceTick(match);
  }
  throw new Error(`still not so after ${limit} Ticks`);
}

const find = (match: Match, id: number) => getPlayerView(match, 0).units.find((u) => u.id === id)!;

/** A row of Riflemen at 1 health, a Cell apart, from `x` eastward. */
function hurtColumn(match: Match, x: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const id = addTestUnit(match, 0, "rifleman", { x: x + i, y: ROW });
    setTestUnitHp(match, id, 1);
    return id;
  });
}

describe("an idle Medic and a hurt group that marches off", () => {
  it.each([2, 4, 8])("goes no further than one leash after a column of %i, however many are hurt", (count) => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 10, y: ROW });
    const column = hurtColumn(match, 11, count);
    // The column stands long enough for the Medic to be at work on the nearest.
    runUntil(match, () => find(match, column[0]!).hp > 1);
    issueCommand(match, 0, { type: "move", unitIds: column, target: { x: 70, y: ROW } });
    runUntil(match, () => column.every((id) => find(match, id).x > 60));
    run(match, 10 * TICKS_PER_SECOND);
    // It began at 10.5; the one it was at work on began a Cell on.
    expect(find(match, medic).x).toBeLessThan(10.5 + 1 + TEND.leash);
  });

  it("does not set off by itself after a hurt Unit that marches past without stopping", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 30, y: ROW });
    const stood = find(match, medic);
    const passer = addTestUnit(match, 0, "rifleman", { x: 15, y: ROW + 2 });
    setTestUnitHp(match, passer, 1);
    issueCommand(match, 0, { type: "move", unitIds: [passer], target: { x: 60, y: ROW + 2 } });
    runUntil(match, () => {
      expect(find(match, medic)).toMatchObject({ x: stood.x, y: stood.y });
      return find(match, passer).x === 60.5;
    });
    expect(find(match, passer).hp).toBe(1);
  });

  it("goes by itself to a hurt Unit that marched up and stopped within the seek radius", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 30, y: ROW });
    const comer = addTestUnit(match, 0, "rifleman", { x: 15, y: ROW + 2 });
    setTestUnitHp(match, comer, 1);
    issueCommand(match, 0, { type: "move", unitIds: [comer], target: { x: 33, y: ROW + 2 } });
    runUntil(match, () => find(match, comer).hp === 50);
    expect(find(match, comer).x).toBe(33.5);
  });
});

describe("a Tend Command on a target that then walks toward the Medic", () => {
  it("is carried out: a target coming nearer does not trip the leash", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 5, y: ROW });
    const patient = addTestUnit(match, 0, "rifleman", { x: 25, y: ROW });
    setTestUnitHp(match, patient, 1);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [medic], targetId: patient })).toEqual({ ok: true });
    // 19 Cells toward the Medic: far more than the leash from where the patient stood.
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: 6, y: ROW } });
    runUntil(match, () => find(match, patient).hp === 50);
  });

  it("still ends at the leash when the target walks on past the Medic and away", () => {
    const match = stage();
    const medic = addTestUnit(match, 0, "medic", { x: 30, y: ROW });
    const patient = addTestUnit(match, 0, "rifleman", { x: 36, y: ROW + 1 });
    setTestUnitHp(match, patient, 1);
    expect(issueCommand(match, 0, { type: "tend", unitIds: [medic], targetId: patient })).toEqual({ ok: true });
    issueCommand(match, 0, { type: "move", unitIds: [patient], target: { x: 5, y: ROW + 1 } });
    runUntil(match, () => find(match, patient).x === 5.5);
    run(match, 5 * TICKS_PER_SECOND);
    // Given up once the patient was a leash from both where it stood and where the Medic stood.
    expect(find(match, medic).x).toBeGreaterThan(30.5 - TEND.leash - 1);
    expect(find(match, patient).hp).toBeLessThan(50);
  });
});
