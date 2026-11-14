import { describe, expect, it } from "vitest";
import type { PresentationEvent } from "../presentation";
import { alertForEvent } from "./eventCues";

const at = { x: 3.5, y: 4.5 };

describe("the alert a presentation event raises", () => {
  it("tells the person their Building is ready and their Unit is ready", () => {
    expect(alertForEvent({ kind: "buildingReady" }, 0)).toEqual({ kind: "buildingReady" });
    expect(alertForEvent({ kind: "unitTrained", unit: "raider" }, 0)).toEqual({ kind: "unitReady" });
  });

  it("tells the person when their base is under attack: a Building hit, or a Unit among their Buildings", () => {
    expect(alertForEvent({ kind: "underAttack", hit: "building", at, inBase: true }, 0)).toEqual({ kind: "baseUnderAttack" });
    expect(alertForEvent({ kind: "underAttack", hit: "unit", at, inBase: true }, 0)).toEqual({ kind: "baseUnderAttack" });
  });

  it("does not call it the base when a Unit is hit somewhere out on the Map", () => {
    // Spec #16: the alert is "Base under attack"; a skirmish at the far end of the Map is not that.
    expect(alertForEvent({ kind: "underAttack", hit: "unit", at, inBase: false }, 0)).toBeNull();
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
      { kind: "shotFired", weapon: "rifle", shooter: 1, from: at, to: at, landsInSight: true },
      { kind: "impact", at },
      { kind: "buildingPlaced", building: "barracks", owner: 0, at },
    ];
    for (const event of quiet) expect(alertForEvent(event, 0)).toBeNull();
  });
});
