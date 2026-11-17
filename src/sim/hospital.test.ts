import { describe, expect, it } from "vitest";
import { createMatch, getMatchStatus, getPlayerView, HQ_BUILDS, issueCommand, type Match, type PlayerId, TRAINS } from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit, removeTestBuilding, run, setTestBuildingHp } from "./testing/setup";
import { BUILDING_STATS, ECONOMY, isArmed } from "./tuning";

const HOSPITAL = BUILDING_STATS.hospital;

const own = (match: Match, owner: PlayerId, kind: string) =>
  getPlayerView(match, owner).buildings.filter((b) => b.owner === owner && b.kind === kind);

describe("the Hospital", () => {
  it("is unarmed", () => {
    expect(isArmed(HOSPITAL)).toBe(false);
  });

  it("is the fifth thing the HQ builds, after the four it built before", () => {
    expect(HQ_BUILDS).toEqual(["refinery", "barracks", "vehicleFactory", "turret", "hospital"]);
  });

  it("is built and placed by either Player like any Building", () => {
    // openMap(30, 30): Player 0's HQ is at the top left, Player 1's at the bottom right.
    for (const [player, at] of [[0, { x: 0, y: 6 }], [1, { x: 28, y: 22 }]] as const) {
      const match = createMatch(openMap(30, 30), 1);
      expect(issueCommand(match, player, { type: "startBuilding", kind: "hospital" })).toEqual({ ok: true });
      expect(getPlayerView(match, player).credits).toBe(ECONOMY.startingCredits - HOSPITAL.cost);
      run(match, HOSPITAL.buildTicks - 1);
      expect(getPlayerView(match, player).production).toMatchObject({ kind: "hospital", ready: false });
      run(match, 1);
      expect(getPlayerView(match, player).production).toEqual({ kind: "hospital", progress: 1, ready: true });
      expect(issueCommand(match, player, { type: "placeBuilding", at }), `Player ${player}`).toEqual({ ok: true });
      expect(own(match, player, "hospital")).toEqual([
        expect.objectContaining({ x: at.x, y: at.y, width: HOSPITAL.width, height: HOSPITAL.height, hp: HOSPITAL.maxHp, maxHp: HOSPITAL.maxHp }),
      ]);
      expect(getPlayerView(match, player).production).toBeNull();
    }
  });

  it("follows the usual placement rules: not on another Building, not far from the Player's own", () => {
    const match = createMatch(openMap(30, 30), 1);
    issueCommand(match, 0, { type: "startBuilding", kind: "hospital" });
    run(match, HOSPITAL.buildTicks);
    expect(getPlayerView(match, 0).production?.ready).toBe(true);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 1, y: 1 } }).ok).toBe(false);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 14, y: 14 } }).ok).toBe(false);
    expect(getPlayerView(match, 0).production?.ready).toBe(true);
  });

  it("trains the Medic and nothing else", () => {
    expect(TRAINS.hospital).toEqual(["medic"]);
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "hospital", { x: 0, y: 6 });
    const hospital = own(match, 0, "hospital")[0]!;
    expect(hospital.training).toEqual({ queue: [], progress: 0, rallyPoint: null });
    expect(issueCommand(match, 0, { type: "train", buildingId: hospital.id, kind: "rifleman" }).ok).toBe(false);
  });

  it("is destroyed like any Building when its health runs out", () => {
    const match = createMatch(openMap(20, 20), 1);
    addTestBuilding(match, 1, "hospital", { x: 14, y: 12 });
    const hospital = own(match, 1, "hospital")[0]!;
    setTestBuildingHp(match, hospital.id, 5);
    const raider = addTestUnit(match, 0, "raider", { x: 12, y: 12 });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: hospital.id })).toEqual({ ok: true });
    run(match, 1);
    expect(getPlayerView(match, 0).buildings.some((b) => b.id === hospital.id)).toBe(false);
    expect(getPlayerView(match, 1).buildings.some((b) => b.id === hospital.id)).toBe(false);
  });

  it("counts for Victory: a Player whose last Building is a Hospital is in the Match until it falls", () => {
    const match = createMatch(openMap(20, 20), 1);
    addTestBuilding(match, 1, "hospital", { x: 14, y: 12 });
    const hospital = own(match, 1, "hospital")[0]!;
    for (const b of getPlayerView(match, 1).buildings) {
      if (b.owner === 1 && b.id !== hospital.id) removeTestBuilding(match, b.id);
    }
    run(match, 3);
    expect(getMatchStatus(match)).toEqual({ state: "running" });
    setTestBuildingHp(match, hospital.id, 5);
    const raider = addTestUnit(match, 0, "raider", { x: 12, y: 12 });
    issueCommand(match, 0, { type: "attack", unitIds: [raider], targetId: hospital.id });
    run(match, 1);
    expect(getMatchStatus(match)).toEqual({ state: "victory", winner: 0 });
  });
});
