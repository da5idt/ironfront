import { describe, expect, it } from "vitest";
import type { PresentationEvent } from "../presentation";
import { alertForEvent, soundEventFor } from "./eventCues";

const at = { x: 3.5, y: 4.5 };

describe("the alert a presentation event raises", () => {
  it("tells the person their Building is ready and their Unit is ready", () => {
    expect(alertForEvent({ kind: "buildingReady" }, 0)).toEqual({ kind: "buildingReady" });
    expect(alertForEvent({ kind: "unitTrained", unit: "raider" }, 0)).toEqual({ kind: "unitReady" });
  });

  it("tells the person when their base is under attack", () => {
    expect(alertForEvent({ kind: "underAttack", at }, 0)).toEqual({ kind: "baseUnderAttack" });
  });

  it("tells the person of their own losses, and not of the other Player's", () => {
    const unit = (owner: 0 | 1): PresentationEvent => ({ kind: "unitDied", unit: "rifleman", vehicle: false, owner, at });
    const building = (owner: 0 | 1): PresentationEvent => ({ kind: "buildingDestroyed", building: "turret", owner, at });
    expect(alertForEvent(unit(0), 0)).toEqual({ kind: "unitLost" });
    expect(alertForEvent(unit(1), 0)).toBeNull();
    expect(alertForEvent(building(0), 0)).toEqual({ kind: "buildingLost" });
    expect(alertForEvent(building(1), 0)).toBeNull();
    // The same events seen from the other chair.
    expect(alertForEvent(unit(1), 1)).toEqual({ kind: "unitLost" });
    expect(alertForEvent(building(0), 1)).toBeNull();
  });

  it("says nothing for shots, impacts and Buildings going down", () => {
    const quiet: PresentationEvent[] = [
      { kind: "shotFired", weapon: "rifle", shooter: 1, from: at, to: at },
      { kind: "impact", at },
      { kind: "buildingPlaced", building: "barracks", owner: 0, at },
    ];
    for (const event of quiet) expect(alertForEvent(event, 0)).toBeNull();
  });
});

describe("the sound effect a presentation event makes", () => {
  it("is the event itself for everything that has a sound", () => {
    const loud: PresentationEvent[] = [
      { kind: "shotFired", weapon: "turretCannon", shooter: null, from: at, to: at },
      { kind: "impact", at },
      { kind: "unitDied", unit: "harvester", vehicle: true, owner: 1, at },
      { kind: "buildingDestroyed", building: "hq", owner: 0, at },
      { kind: "buildingPlaced", building: "barracks", owner: 1, at },
      { kind: "buildingReady" },
      { kind: "unitTrained", unit: "rifleman" },
    ];
    for (const event of loud) expect(soundEventFor(event)).toBe(event);
  });

  it("is none for under attack, which is an alert and not an effect", () => {
    expect(soundEventFor({ kind: "underAttack", at })).toBeNull();
  });
});
