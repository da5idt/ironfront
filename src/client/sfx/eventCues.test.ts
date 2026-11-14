import { describe, expect, it } from "vitest";
import type { PresentationEvent, Weapon } from "../presentation";
import { alertForEvent, soundsForEvent } from "./eventCues";

const from = { x: 3, y: 4 };
const to = { x: 9, y: 4 };
const at = { x: 12, y: 7 };

describe("sounds for presentation events", () => {
  const shot = (weapon: Weapon, landsInSight: boolean): PresentationEvent => ({
    kind: "shotFired",
    weapon,
    shooter: 7,
    from,
    to,
    landsInSight,
  });

  it("plays each weapon's own sound where the shot was fired from", () => {
    expect(soundsForEvent(shot("rifle", false))).toEqual([{ name: "rifle", at: from }]);
    expect(soundsForEvent(shot("raiderGun", false))).toEqual([{ name: "raiderGun", at: from }]);
    expect(soundsForEvent(shot("turretCannon", false))).toEqual([{ name: "turretCannon", at: from }]);
  });

  it("plays the impact too, where the shot lands, when the Player can see that Cell", () => {
    // Spec #16: every shot that is seen to land is heard to land.
    expect(soundsForEvent(shot("rifle", true))).toEqual([
      { name: "rifle", at: from },
      { name: "impact", at: to },
    ]);
  });

  it("plays an impact where a shot from out of sight lands", () => {
    expect(soundsForEvent({ kind: "impact", at })).toEqual([{ name: "impact", at }]);
  });

  it("plays a small explosion for a vehicle and a softer sound for a Rifleman", () => {
    expect(soundsForEvent({ kind: "unitDied", unit: "raider", vehicle: true, owner: 1, at })).toEqual([
      { name: "smallExplosion", at },
    ]);
    expect(soundsForEvent({ kind: "unitDied", unit: "rifleman", vehicle: false, owner: 1, at })).toEqual([
      { name: "unitDeath", at },
    ]);
  });

  it("plays a large explosion where a Building is destroyed", () => {
    expect(soundsForEvent({ kind: "buildingDestroyed", building: "hq", owner: 0, at })).toEqual([
      { name: "largeExplosion", at },
    ]);
  });

  it("plays Building placed on the Map, and the ready sounds as interface sounds heard wherever the view is", () => {
    expect(soundsForEvent({ kind: "buildingPlaced", building: "barracks", owner: 1, at })).toEqual([
      { name: "buildingPlaced", at },
    ]);
    expect(soundsForEvent({ kind: "buildingReady" })).toEqual([{ name: "buildingReady" }]);
    expect(soundsForEvent({ kind: "unitTrained", unit: "rifleman" })).toEqual([{ name: "unitTrained" }]);
  });

  it("plays nothing for under attack, which is an alert and not an effect", () => {
    expect(soundsForEvent({ kind: "underAttack", hit: "building", at, nearOwnBuildings: true })).toEqual([]);
  });
});

describe("the alert a presentation event raises", () => {
  it("tells the person their Building is ready and their Unit is ready", () => {
    expect(alertForEvent({ kind: "buildingReady" }, 0)).toEqual({ kind: "buildingReady" });
    expect(alertForEvent({ kind: "unitTrained", unit: "raider" }, 0)).toEqual({ kind: "unitTrained" });
  });

  it("tells the person when their Buildings are under attack: a Building hit, or a Unit among their Buildings", () => {
    expect(alertForEvent({ kind: "underAttack", hit: "building", at, nearOwnBuildings: true }, 0)).toEqual({ kind: "buildingsUnderAttack" });
    expect(alertForEvent({ kind: "underAttack", hit: "unit", at, nearOwnBuildings: true }, 0)).toEqual({ kind: "buildingsUnderAttack" });
  });

  it("does not raise it when a Unit is hit somewhere out on the Map", () => {
    // The alert is "Your buildings are taking fire"; a skirmish at the far end of the Map is not that.
    expect(alertForEvent({ kind: "underAttack", hit: "unit", at, nearOwnBuildings: false }, 0)).toBeNull();
  });

  it("tells the person of their own losses, and not of the other Player's", () => {
    const unit = (owner: 0 | 1): PresentationEvent => ({ kind: "unitDied", unit: "rifleman", vehicle: false, owner, at });
    const building = (owner: 0 | 1): PresentationEvent => ({ kind: "buildingDestroyed", building: "turret", owner, at });
    expect(alertForEvent(unit(0), 0)).toEqual({ kind: "unitFallen" });
    expect(alertForEvent(unit(1), 0)).toBeNull();
    expect(alertForEvent(building(0), 0)).toEqual({ kind: "buildingLost" });
    expect(alertForEvent(building(1), 0)).toBeNull();
    // The same events seen from the other chair.
    expect(alertForEvent(unit(1), 1)).toEqual({ kind: "unitFallen" });
    expect(alertForEvent(building(0), 1)).toBeNull();
  });

  it("says nothing for shots, impacts and Buildings going down", () => {
    const quiet: PresentationEvent[] = [
      { kind: "shotFired", weapon: "rifle", shooter: 1, from: at, to: at, landsInSight: true },
      { kind: "impact", at },
      { kind: "buildingPlaced", building: "barracks", owner: 0, at },
    ];
    for (const event of quiet) expect(alertForEvent(event, 0)).toBeNull();
  });
});
