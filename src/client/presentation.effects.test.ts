import { describe, expect, it } from "vitest";
import { advanceTick, createMatch, getPlayerView, issueCommand, type Match, type PlayerId, TICKS_PER_SECOND } from "../sim";
import { openMap } from "../sim/testing/maps";
import {
  addTestBuilding,
  addTestUnit,
  removeTestBuilding,
  setTestBuildingHp,
  setTestCredits,
} from "../sim/testing/setup";
import { EFFECT_SECONDS, MARK_SECONDS, MAX_EFFECTS, MAX_MARKS } from "./art/effectArt";
import { effectInSight, type Presentation, type PresentationEvent, present } from "./presentation";

/** Runs a real Match and shows one Player's view to the presentation module after every Tick, as the client does. */
function watch(match: Match, player: PlayerId = 0) {
  let state: Presentation = present(null, getPlayerView(match, player)).state;
  const events: PresentationEvent[] = [];
  const run = (ticks: number): void => {
    for (let t = 0; t < ticks; t++) {
      advanceTick(match);
      const next = present(state, getPlayerView(match, player));
      state = next.state;
      events.push(...next.events);
    }
  };
  return {
    get state() {
      return state;
    },
    events,
    run,
    /** Runs until an event of the kind has come, or the Ticks run out. */
    runUntil(kind: PresentationEvent["kind"], ticks: number): void {
      for (let t = 0; t < ticks && !events.some((e) => e.kind === kind); t++) run(1);
    },
    of: <K extends PresentationEvent["kind"]>(kind: K) =>
      events.filter((e): e is Extract<PresentationEvent, { kind: K }> => e.kind === kind),
  };
}

const buildingId = (match: Match, player: PlayerId, kind: string) =>
  getPlayerView(match, player).buildings.find((b) => b.kind === kind && b.owner === player)!.id;

describe("a Unit that dies in sight", () => {
  it("gives a unit died event where it stood, and a vehicle explodes and leaves a wreck", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    // A Harvester, as it stays where it is put: nothing to shoot at and no Ore to go to.
    addTestUnit(match, 1, "harvester", { x: 10, y: 11 });
    const seen = watch(match);
    seen.runUntil("unitDied", 600);
    expect(seen.of("unitDied")).toEqual([
      { kind: "unitDied", unit: "harvester", vehicle: true, owner: 1, at: { x: 10.5, y: 11.5 } },
    ]);
    expect(seen.state.marks).toMatchObject([{ kind: "wreck", unit: "harvester", at: { x: 10.5, y: 11.5 } }]);
    expect(seen.state.effects.filter((e) => e.kind === "smallExplosion")).toMatchObject([{ at: { x: 10.5, y: 11.5 } }]);
    // The other Player's loss is no alarm for this one.
    expect(seen.of("underAttack")).toEqual([]);
  });

  it("a Rifleman falls and leaves a mark, without an explosion", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "rifleman", { x: 10, y: 10 });
    const seen = watch(match);
    seen.runUntil("unitDied", 400);
    expect(seen.of("unitDied")).toMatchObject([{ unit: "rifleman", vehicle: false, owner: 1 }]);
    expect(seen.state.marks).toMatchObject([{ kind: "body", unit: "rifleman", team: 1 }]);
    expect(seen.state.effects.some((e) => e.kind === "fall")).toBe(true);
    expect(seen.state.effects.some((e) => e.kind === "smallExplosion")).toBe(false);
  });

  it("is told to its own Player wherever it was, with an under attack event as it is hit", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 11 });
    const seen = watch(match, 1);
    seen.run(1);
    // Out on its own, with none of its Player's Buildings near: hit, but no attack on the base.
    expect(seen.of("underAttack")).toEqual([{ kind: "underAttack", hit: "unit", at: { x: 10.5, y: 11.5 }, inBase: false }]);
    seen.runUntil("unitDied", 600);
    // Its own sight went with it, so the Cell is Fogged now; its Player still knows it is gone.
    expect(getPlayerView(match, 1).map.visibility[11 * 30 + 10]).toBe("fogged");
    expect(seen.of("unitDied")).toMatchObject([{ unit: "harvester", owner: 1 }]);
    expect(seen.state.marks).toHaveLength(1);
  });
});

describe("a Unit that goes from the view out of sight", () => {
  it("is not a death when the Cell it stood in is no longer Visible", () => {
    const match = createMatch(openMap(30, 30), 1);
    // Two Riflemen alone, one each: they fire in step and kill each other in the same Tick,
    // so the Cell of Player 1's is Fogged in the first view without him.
    addTestUnit(match, 0, "rifleman", { x: 10, y: 15 });
    const other = addTestUnit(match, 1, "rifleman", { x: 12, y: 15 });
    const seen = watch(match);
    expect(seen.state.units.has(other)).toBe(true);
    seen.runUntil("unitDied", 400);
    seen.run(1);
    expect(getPlayerView(match, 1).units.some((u) => u.id === other)).toBe(false);
    // Only this Player's own.
    expect(seen.of("unitDied")).toMatchObject([{ owner: 0 }]);
    expect(seen.state.marks).toMatchObject([{ team: 0 }]);
    expect(seen.state.effects.filter((e) => e.kind === "fall")).toHaveLength(1);
  });

  it("is not a death when it has only driven off", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "harvester", { x: 10, y: 15 });
    const other = addTestUnit(match, 1, "harvester", { x: 12, y: 15 });
    const seen = watch(match);
    expect(seen.state.units.has(other)).toBe(true);
    issueCommand(match, 1, { type: "move", unitIds: [other], target: { x: 28, y: 15 } });
    seen.run(200);
    expect(seen.state.units.has(other)).toBe(false);
    expect(seen.events).toEqual([]);
    expect(seen.state.marks).toEqual([]);
  });
});

describe("a Building that is destroyed", () => {
  /** Player 0's Raider beside Player 1's Barracks, which is a few shots from falling. */
  function siege() {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    addTestBuilding(match, 1, "barracks", { x: 12, y: 14 });
    const barracks = buildingId(match, 1, "barracks");
    setTestBuildingHp(match, barracks, 25);
    return { match, barracks };
  }

  it("in sight gives a building destroyed event at its centre, a big explosion and rubble", () => {
    const { match } = siege();
    const seen = watch(match);
    seen.runUntil("buildingDestroyed", 100);
    expect(seen.of("buildingDestroyed")).toEqual([
      { kind: "buildingDestroyed", building: "barracks", owner: 1, at: { x: 13, y: 15 } },
    ]);
    expect(seen.state.marks).toMatchObject([{ kind: "rubble", at: { x: 13, y: 15 }, width: 2, height: 2 }]);
    const blasts = seen.state.effects.filter((e) => e.kind === "bigExplosion" || e.kind === "smallExplosion");
    expect(blasts.filter((e) => e.kind === "bigExplosion")).toHaveLength(1);
    // Smaller blasts go off across the footprint over the next moments.
    expect(blasts.length).toBeGreaterThan(2);
    expect(blasts.some((e) => e.start > seen.state.tick)).toBe(true);
    for (const e of blasts) {
      expect(e.at.x).toBeGreaterThanOrEqual(12);
      expect(e.at.x).toBeLessThanOrEqual(14);
      expect(e.start).toBeGreaterThanOrEqual(seen.state.tick);
    }
  });

  it("is told to its own Player as a loss, after under attack events while it was shot at", () => {
    const { match } = siege();
    const seen = watch(match, 1);
    seen.runUntil("buildingDestroyed", 100);
    expect(seen.of("buildingDestroyed")).toMatchObject([{ owner: 1, building: "barracks" }]);
    expect(seen.of("underAttack").length).toBeGreaterThan(0);
    expect(seen.of("underAttack")[0]).toEqual({ kind: "underAttack", hit: "building", at: { x: 13, y: 15 }, inBase: true });
  });

  it("out of sight gives nothing, not even when the Player comes back and finds it gone", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 1, "barracks", { x: 12, y: 14 });
    const barracks = buildingId(match, 1, "barracks");
    // A Harvester, which looks but does not shoot.
    const scout = addTestUnit(match, 0, "harvester", { x: 10, y: 15 });
    const seen = watch(match);
    expect(seen.state.buildings.get(barracks)?.remembered).toBe(false);
    issueCommand(match, 0, { type: "move", unitIds: [scout], target: { x: 1, y: 15 } });
    seen.run(150);
    // Remembered, as its Cells are Fogged.
    expect(getPlayerView(match, 0).buildings.find((b) => b.id === barracks)?.remembered).toBe(true);
    removeTestBuilding(match, barracks);
    issueCommand(match, 0, { type: "move", unitIds: [scout], target: { x: 10, y: 15 } });
    seen.run(150);
    expect(getPlayerView(match, 0).buildings.some((b) => b.id === barracks)).toBe(false);
    expect(seen.events).toEqual([]);
    expect(seen.state.marks).toEqual([]);
    expect(seen.state.effects).toEqual([]);
  });
});

describe("under attack", () => {
  it("counts a Unit hit beside one of its Player's Buildings as the base being attacked", () => {
    const match = createMatch(openMap(40, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 11 });
    addTestBuilding(match, 1, "refinery", { x: 12, y: 9 });
    const seen = watch(match, 1);
    seen.run(1);
    expect(seen.of("underAttack")).toEqual([{ kind: "underAttack", hit: "unit", at: { x: 10.5, y: 11.5 }, inBase: true }]);
  });

  it("does not count a Unit hit far from every Building of its Player", () => {
    const match = createMatch(openMap(40, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 11 });
    addTestBuilding(match, 1, "refinery", { x: 30, y: 9 });
    const seen = watch(match, 1);
    seen.run(1);
    expect(seen.of("underAttack")).toMatchObject([{ hit: "unit", inBase: false }]);
  });

  it("tells of the Building when a Building and a far-off Unit are hit in the same Tick", () => {
    const match = createMatch(openMap(40, 30), 1);
    // Far from the base, Player 1's Harvester is shot by a Turret...
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 11 });
    // ...while a Raider shoots Player 1's Barracks.
    addTestBuilding(match, 1, "barracks", { x: 32, y: 14 });
    addTestUnit(match, 0, "raider", { x: 30, y: 15 });
    const seen = watch(match, 1);
    seen.run(1);
    expect(seen.of("underAttack")).toEqual([{ kind: "underAttack", hit: "building", at: { x: 33, y: 15 }, inBase: true }]);
  });
});

describe("a shot", () => {
  it("shows a muzzle flash at the shooter, a tracer to the target and an impact there", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    addTestUnit(match, 1, "harvester", { x: 13, y: 15 });
    const seen = watch(match);
    seen.run(1);
    const tick = seen.state.tick;
    expect(seen.state.effects).toMatchObject([
      // East is facing 0.
      { kind: "muzzle", weapon: "raiderGun", at: { x: 10.5, y: 15.5 }, facing: 0, start: tick },
      { kind: "tracer", weapon: "raiderGun", at: { x: 10.5, y: 15.5 }, to: { x: 13.5, y: 15.5 }, start: tick },
      { kind: "impact", weapon: "raiderGun", at: { x: 13.5, y: 15.5 } },
    ]);
    // The impact shows as the tracer gets there, not before.
    expect(seen.state.effects[2]!.start).toBe(seen.state.effects[1]!.end);
  });

  it("says in its event that it lands where the Player can see, so the impact is heard as well as shown", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    addTestUnit(match, 1, "harvester", { x: 13, y: 15 });
    const seen = watch(match);
    seen.run(1);
    expect(seen.of("shotFired")).toMatchObject([{ weapon: "raiderGun", to: { x: 13.5, y: 15.5 }, landsInSight: true }]);
  });

  it("has all three for the Rifleman's rifle and the Turret's cannon too", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "rifleman", { x: 10, y: 15 });
    addTestUnit(match, 1, "harvester", { x: 12, y: 15 });
    addTestBuilding(match, 0, "turret", { x: 20, y: 15 });
    addTestUnit(match, 1, "harvester", { x: 20, y: 12 });
    const seen = watch(match);
    seen.run(1);
    for (const weapon of ["rifle", "turretCannon"]) {
      expect(
        seen.state.effects
          .filter((e) => e.weapon === weapon)
          .map((e) => e.kind)
          .sort(),
      ).toEqual(["impact", "muzzle", "tracer"]);
    }
  });

  it("from out of sight shows only its impact", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "harvester", { x: 10, y: 15 });
    addTestBuilding(match, 1, "turret", { x: 15, y: 15 });
    const seen = watch(match);
    seen.run(2);
    expect(seen.state.effects.map((e) => e.kind)).toEqual(["impact"]);
  });

  it("leaves nothing behind once its effects have played", () => {
    const match = createMatch(openMap(30, 30), 1);
    const raider = addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    const target = addTestUnit(match, 1, "harvester", { x: 13, y: 15 });
    const seen = watch(match);
    seen.run(1);
    expect(seen.state.effects).toHaveLength(3);
    // Off they go, so no second shot follows.
    issueCommand(match, 0, { type: "move", unitIds: [raider], target: { x: 2, y: 15 } });
    issueCommand(match, 1, { type: "move", unitIds: [target], target: { x: 28, y: 15 } });
    const longest = Math.max(EFFECT_SECONDS.muzzle, EFFECT_SECONDS.tracer + EFFECT_SECONDS.impact);
    seen.run(Math.ceil(longest * TICKS_PER_SECOND));
    expect(seen.state.effects).toEqual([]);
  });
});

describe("an effect under the Fog of War of the moment it is drawn", () => {
  /** A Raider's shot at a Harvester three Cells east of it, and the Map it was fired on. */
  function shot() {
    const match = createMatch(openMap(30, 30), 1);
    addTestUnit(match, 0, "raider", { x: 10, y: 15 });
    addTestUnit(match, 1, "harvester", { x: 13, y: 15 });
    const seen = watch(match);
    seen.run(1);
    const [muzzle, tracer, impact] = seen.state.effects;
    const { map } = getPlayerView(match, 0);
    /** The same Map with every Cell from column `x` eastward no longer Visible. */
    const foggedFrom = (x: number) => ({
      ...map,
      visibility: map.visibility.map((v, i) => (i % map.width >= x ? ("fogged" as const) : v)),
    });
    return { muzzle: muzzle!, tracer: tracer!, impact: impact!, map, foggedFrom };
  }

  it("shows whole while everything it covers is Visible", () => {
    const { muzzle, tracer, impact, map } = shot();
    expect([muzzle, tracer, impact].map((e) => effectInSight(e, map))).toEqual([1, 1, 1]);
  });

  it("is hidden once its Cell is no longer Visible, though it was when the effect began", () => {
    const { muzzle, impact, foggedFrom } = shot();
    // The target's Cell (column 13) has gone into fog; the shooter's (column 10) has not.
    expect(effectInSight(impact, foggedFrom(13))).toBe(0);
    expect(effectInSight(muzzle, foggedFrom(13))).toBe(1);
    expect(effectInSight(muzzle, foggedFrom(10))).toBe(0);
  });

  it("cuts a tracer off at the first Cell that is not Visible", () => {
    const { tracer, foggedFrom } = shot();
    // It flies from x 10.5 to 13.5; with fog from column 12 on, only the first 1.5 of its 3 Cells show.
    expect(effectInSight(tracer, foggedFrom(12))).toBeCloseTo(0.5, 1);
    expect(effectInSight(tracer, foggedFrom(10))).toBe(0);
  });
});

describe("wrecks and marks", () => {
  it("stay for their lifetime and are gone after it", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "turret", { x: 10, y: 14 });
    addTestUnit(match, 1, "harvester", { x: 10, y: 11 });
    const seen = watch(match);
    seen.runUntil("unitDied", 600);
    const [wreck] = seen.state.marks;
    expect(wreck!.end - wreck!.start).toBe(MARK_SECONDS.wreck * TICKS_PER_SECOND);
    seen.run(MARK_SECONDS.wreck * TICKS_PER_SECOND - 1);
    expect(seen.state.marks).toHaveLength(1);
    seen.run(1);
    expect(seen.state.marks).toEqual([]);
  });
});

describe("a big fight", () => {
  it("never holds more effects or marks than the caps", () => {
    const match = createMatch(openMap(60, 60), 1);
    // Two lines of 70 Raiders each, all in range of the other line: far more shots and deaths than the caps.
    for (let i = 0; i < 70; i++) {
      addTestUnit(match, 0, "raider", { x: 10 + (i % 35), y: 20 + Math.floor(i / 35) });
      addTestUnit(match, 1, "raider", { x: 10 + (i % 35), y: 23 + Math.floor(i / 35) });
    }
    const seen = watch(match);
    let mostEffects = 0;
    let mostMarks = 0;
    for (let t = 0; t < 600; t++) {
      seen.run(1);
      mostEffects = Math.max(mostEffects, seen.state.effects.length);
      mostMarks = Math.max(mostMarks, seen.state.marks.length);
    }
    expect(seen.of("unitDied").length).toBeGreaterThan(MAX_MARKS);
    expect(mostEffects).toBe(MAX_EFFECTS);
    expect(mostMarks).toBe(MAX_MARKS);
  });

  it("keeps the newest wreck when the cap is reached, and lets the oldest go", () => {
    const match = createMatch(openMap(60, 60), 1);
    for (let i = 0; i < 70; i++) {
      addTestUnit(match, 0, "raider", { x: 10 + (i % 35), y: 20 + Math.floor(i / 35) });
      addTestUnit(match, 1, "raider", { x: 10 + (i % 35), y: 23 + Math.floor(i / 35) });
    }
    const seen = watch(match);
    for (let t = 0; t < 600 && seen.of("unitDied").length <= MAX_MARKS; t++) seen.run(1);
    const deaths = seen.of("unitDied");
    expect(deaths.length).toBeGreaterThan(MAX_MARKS);
    expect(seen.state.marks.at(-1)).toMatchObject({ at: deaths.at(-1)!.at });
    expect(seen.state.marks.some((m) => m.at.x === deaths[0]!.at.x && m.at.y === deaths[0]!.at.y)).toBe(false);
  });
});

describe("building and training", () => {
  it("gives building ready when the HQ finishes, and building placed when the Building goes down", () => {
    const match = createMatch(openMap(30, 30), 1);
    const seen = watch(match);
    // The Map's start gives each Player an HQ in its corner.
    expect(issueCommand(match, 0, { type: "startBuilding", kind: "barracks" }).ok).toBe(true);
    seen.runUntil("buildingReady", 1000);
    expect(seen.of("buildingReady")).toEqual([{ kind: "buildingReady" }]);
    seen.run(5);
    // Once, not on every Tick it waits.
    expect(seen.of("buildingReady")).toHaveLength(1);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 8, y: 0 } }).ok).toBe(true);
    seen.run(1);
    expect(seen.of("buildingPlaced")).toEqual([
      { kind: "buildingPlaced", building: "barracks", owner: 0, at: { x: 9, y: 1 } },
    ]);
    const barracks = buildingId(match, 0, "barracks");
    // It rises from the ground: the build-up notes live in the presentation.
    expect(seen.state.buildUps.placedAt.get(barracks)).toBe(seen.state.tick);
    seen.run(3);
    expect(seen.of("buildingPlaced")).toHaveLength(1);
  });

  it("gives building placed for the other Player's Building going up in sight, not for one coming into sight", () => {
    const match = createMatch(openMap(40, 30), 1);
    // Player 1's base is in the bottom right corner; this Barracks has stood apart from it all along.
    addTestBuilding(match, 1, "barracks", { x: 20, y: 5 });
    const old = buildingId(match, 1, "barracks");
    // A Harvester looks without shooting; it sees 3 Cells.
    const scout = addTestUnit(match, 0, "harvester", { x: 30, y: 24 });
    const seen = watch(match);
    issueCommand(match, 1, { type: "startBuilding", kind: "barracks" });
    seen.run(400);
    expect(issueCommand(match, 1, { type: "placeBuilding", at: { x: 33, y: 24 } }).ok).toBe(true);
    seen.run(1);
    expect(seen.of("buildingPlaced")).toEqual([
      { kind: "buildingPlaced", building: "barracks", owner: 1, at: { x: 34, y: 25 } },
    ]);
    // The other Player's HQ finishing is not this Player's news.
    expect(seen.of("buildingReady")).toEqual([]);
    issueCommand(match, 0, { type: "move", unitIds: [scout], target: { x: 20, y: 8 } });
    seen.run(300);
    expect(seen.state.buildings.get(old)?.remembered).toBe(false);
    expect(seen.of("buildingPlaced")).toHaveLength(1);
  });

  it("gives unit trained when a Barracks' Rifleman steps out, and not for a Unit cancelled from the queue", () => {
    const match = createMatch(openMap(30, 30), 1);
    addTestBuilding(match, 0, "barracks", { x: 5, y: 5 });
    const barracks = buildingId(match, 0, "barracks");
    const seen = watch(match);
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    seen.run(10);
    issueCommand(match, 0, { type: "cancelTraining", buildingId: barracks });
    seen.run(10);
    expect(seen.of("unitTrained")).toEqual([]);
    issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "rifleman" });
    seen.runUntil("unitTrained", 1000);
    expect(seen.of("unitTrained")).toEqual([{ kind: "unitTrained", unit: "rifleman" }]);
  });

  it("gives no unit trained for the Harvester that comes with a Refinery, nor for the other Player's Units", () => {
    const match = createMatch(openMap(30, 30), 1);
    // In sight of Player 0's HQ, so the Rifleman it trains steps out into view.
    addTestBuilding(match, 1, "barracks", { x: 5, y: 6 });
    setTestCredits(match, 1, 5000);
    const seen = watch(match);
    const count = (owner: PlayerId, kind: string) =>
      [...seen.state.units.values()].filter((u) => u.owner === owner && u.kind === kind).length;
    expect([count(0, "harvester"), count(1, "rifleman")]).toEqual([1, 0]);
    issueCommand(match, 0, { type: "startBuilding", kind: "refinery" });
    issueCommand(match, 1, { type: "train", buildingId: buildingId(match, 1, "barracks"), kind: "rifleman" });
    // A Rifleman takes five seconds to train.
    seen.run(105);
    expect(count(1, "rifleman")).toBe(1);
    seen.run(345);
    expect(issueCommand(match, 0, { type: "placeBuilding", at: { x: 8, y: 0 } }).ok).toBe(true);
    seen.run(20);
    expect(count(0, "harvester")).toBe(2);
    expect(seen.of("unitTrained")).toEqual([]);
  });
});
