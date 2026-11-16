import { describe, expect, it } from "vitest";
import {
  advanceTick,
  createMatch,
  ECONOMY,
  getPlayerView,
  isArmed,
  issueCommand,
  type Match,
  type PlayerId,
  TICKS_PER_SECOND,
  TRAINS,
  UNIT_STATS,
  type UnitView,
} from "./index";
import { openMap } from "./testing/maps";
import { addTestBuilding, addTestUnit } from "./testing/setup";

// Staged along row 8 of a wide open Map, far from both starting bases in the
// corners, so only the Units put there take part.
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

/** Adds a Building for the Player and returns its id. */
function building(match: Match, owner: PlayerId, kind: "vehicleFactory" | "barracks" | "turret", x: number, y: number): number {
  addTestBuilding(match, owner, kind, { x, y });
  return getPlayerView(match, owner).buildings.find((b) => b.x === x && b.y === y)!.id;
}

const carriers = (match: Match, owner: PlayerId): UnitView[] =>
  getPlayerView(match, owner).units.filter((u) => u.owner === owner && u.kind === "troopCarrier");

describe("the Troop Carrier", () => {
  it("has its numbers in the tuning file: 600 Credits, 220 health, speed 3.5, a gun of damage 5 at range 4", () => {
    expect(UNIT_STATS.troopCarrier).toMatchObject({
      name: "Troop Carrier",
      class: "vehicle",
      cost: 600,
      maxHp: 220,
      speed: 3.5,
      damage: 5,
      range: 4,
    });
    expect(isArmed(UNIT_STATS.troopCarrier)).toBe(true);
  });

  it("is a light gun on a fast Vehicle: it hits less hard than a Raider, and is slower than one but far faster than Infantry", () => {
    const perSecond = (kind: "troopCarrier" | "raider") => UNIT_STATS[kind].damage / UNIT_STATS[kind].reloadTicks;
    expect(perSecond("troopCarrier")).toBeLessThan(perSecond("raider"));
    expect(UNIT_STATS.troopCarrier.speed).toBeLessThan(UNIT_STATS.raider.speed);
    expect(UNIT_STATS.troopCarrier.speed).toBeGreaterThan(UNIT_STATS.rifleman.speed * 2);
  });

  it("is trained at the Vehicle Factory, after the Raider and the Harvester, and nowhere else", () => {
    const trained = TRAINS.vehicleFactory!;
    expect(trained.slice(0, 2)).toEqual(["raider", "harvester"]);
    // Last in the panel, whatever else the Vehicle Factory comes to train before it.
    expect(trained.at(-1)).toBe("troopCarrier");
    expect(
      Object.entries(TRAINS)
        .filter(([, kinds]) => kinds.includes("troopCarrier"))
        .map(([b]) => b),
    ).toEqual(["vehicleFactory"]);
    const match = stage();
    const barracks = building(match, 0, "barracks", 10, 10);
    expect(issueCommand(match, 0, { type: "train", buildingId: barracks, kind: "troopCarrier" }).ok).toBe(false);
  });

  it("is paid for when queued and steps out beside the Vehicle Factory at full health when trained", () => {
    const match = stage();
    const factory = building(match, 0, "vehicleFactory", 10, 10);
    expect(issueCommand(match, 0, { type: "train", buildingId: factory, kind: "troopCarrier" })).toEqual({ ok: true });
    expect(getPlayerView(match, 0).credits).toBe(ECONOMY.startingCredits - 600);
    run(match, UNIT_STATS.troopCarrier.trainTicks - 1);
    expect(carriers(match, 0)).toEqual([]);
    run(match, 1);
    const [carrier] = carriers(match, 0);
    expect(carrier).toMatchObject({ hp: 220, maxHp: 220 });
    // Beside the 3 by 3 footprint at (10, 10): within one Cell of it, and not on it.
    const cell = { x: Math.floor(carrier!.x), y: Math.floor(carrier!.y) };
    expect(cell.x >= 9 && cell.x <= 13 && cell.y >= 9 && cell.y <= 13).toBe(true);
    expect(cell.x >= 10 && cell.x <= 12 && cell.y >= 10 && cell.y <= 12).toBe(false);
  });

  it("moves where it is told at 3.5 Cells a second", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 10, y: ROW });
    expect(issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: 31, y: ROW } })).toEqual({ ok: true });
    run(match, 2 * TICKS_PER_SECOND);
    expect(find(match, carrier)!.x).toBeCloseTo(10.5 + 7, 5);
    // 21 Cells at 3.5 a second is 6 seconds.
    run(match, 4 * TICKS_PER_SECOND);
    expect(find(match, carrier)).toMatchObject({ x: 31.5, y: ROW + 0.5 });
  });

  it("fires at an enemy it is sent to attack, 5 health a shot from 4 Cells off", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 10, y: ROW });
    // A Harvester does not fire back or run, so every point of health lost is the gun's.
    const target = addTestUnit(match, 1, "harvester", { x: 14, y: ROW });
    issueCommand(match, 1, { type: "stop", unitIds: [target] });
    expect(issueCommand(match, 0, { type: "attack", unitIds: [carrier], targetId: target })).toEqual({ ok: true });
    run(match, 1);
    expect(find(match, target)!.hp).toBe(UNIT_STATS.harvester.maxHp - 5);
    // In range from where it stood: it did not have to close in.
    expect(find(match, carrier)!.x).toBe(10.5);
    run(match, UNIT_STATS.troopCarrier.reloadTicks);
    expect(find(match, target)!.hp).toBe(UNIT_STATS.harvester.maxHp - 10);
  });

  it("fires by itself at an enemy that comes into range while it stands idle", () => {
    const match = stage();
    addTestUnit(match, 0, "troopCarrier", { x: 10, y: ROW });
    const target = addTestUnit(match, 1, "harvester", { x: 13, y: ROW });
    issueCommand(match, 1, { type: "stop", unitIds: [target] });
    run(match, 1);
    expect(find(match, target)!.hp).toBe(UNIT_STATS.harvester.maxHp - 5);
  });

  it("takes part in an Attack-move: it stops to fight an enemy on the route, then carries on and arrives", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 14, y: ROW });
    const enemy = addTestUnit(match, 1, "rifleman", { x: 27, y: ROW });
    expect(issueCommand(match, 0, { type: "attackMove", unitIds: [carrier], target: { x: 40, y: ROW } })).toEqual({ ok: true });
    runUntil(match, () => find(match, enemy)!.hp < UNIT_STATS.rifleman.maxHp);
    const stoodAt = find(match, carrier)!.x;
    expect(27.5 - stoodAt).toBeLessThanOrEqual(UNIT_STATS.troopCarrier.range);
    runUntil(match, () => find(match, enemy) === undefined);
    expect(find(match, carrier)!.x).toBe(stoodAt);
    runUntil(match, () => find(match, carrier)!.x === 40.5);
  });

  it("is targeted like other armed Units: an idle enemy Rifleman and a Turret fire at it, and enough fire destroys it", () => {
    const match = stage();
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 10, y: ROW });
    issueCommand(match, 0, { type: "move", unitIds: [carrier], target: { x: 10, y: ROW } });
    addTestUnit(match, 1, "rifleman", { x: 13, y: ROW });
    run(match, 1);
    expect(find(match, carrier)!.hp).toBe(220 - UNIT_STATS.rifleman.damage);

    const other = stage();
    const second = addTestUnit(other, 0, "troopCarrier", { x: 10, y: ROW });
    building(other, 1, "turret", 14, ROW);
    run(other, 2);
    expect(find(other, second)!.hp).toBeLessThan(220);
    runUntil(other, () => find(other, second) === undefined);
  });

  it("comes first on an enemy's Attack-move, ahead of an unarmed Unit just as near", () => {
    const match = stage();
    const raider = addTestUnit(match, 1, "raider", { x: 32, y: ROW });
    // One Cell either side of the route, so both come into range on the same Tick; the Harvester has the lower id.
    const harvester = addTestUnit(match, 0, "harvester", { x: 22, y: ROW + 1 });
    issueCommand(match, 0, { type: "stop", unitIds: [harvester] });
    const carrier = addTestUnit(match, 0, "troopCarrier", { x: 22, y: ROW - 1 });
    issueCommand(match, 1, { type: "attackMove", unitIds: [raider], target: { x: 22, y: ROW } });
    runUntil(match, () => find(match, carrier)!.hp <= 220 - 3 * UNIT_STATS.raider.damage);
    expect(find(match, harvester)!.hp).toBe(UNIT_STATS.harvester.maxHp);
  });

  it("plays out the same from the same seed", () => {
    const fight = (): unknown => {
      const match = createMatch(openMap(50, 40), 7);
      const carrier = addTestUnit(match, 0, "troopCarrier", { x: 14, y: ROW });
      addTestUnit(match, 1, "rifleman", { x: 27, y: ROW });
      addTestUnit(match, 1, "raider", { x: 29, y: ROW + 1 });
      issueCommand(match, 0, { type: "attackMove", unitIds: [carrier], target: { x: 40, y: ROW } });
      run(match, 300);
      return [getPlayerView(match, 0).units, getPlayerView(match, 1).units];
    };
    expect(fight()).toEqual(fight());
  });
});
