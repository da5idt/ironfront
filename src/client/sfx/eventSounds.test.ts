import { describe, expect, it } from "vitest";
import { soundForEvent } from "./eventSounds";

const from = { x: 3, y: 4 };
const to = { x: 9, y: 4 };
const at = { x: 12, y: 7 };

describe("sounds for presentation events", () => {
  it("plays each weapon's own sound where the shot was fired from", () => {
    expect(soundForEvent({ kind: "shotFired", weapon: "rifle", from, to })).toEqual({ name: "rifle", at: from });
    expect(soundForEvent({ kind: "shotFired", weapon: "raiderGun", from, to })).toEqual({ name: "raiderGun", at: from });
    expect(soundForEvent({ kind: "shotFired", weapon: "turretCannon", from, to })).toEqual({
      name: "turretCannon",
      at: from,
    });
  });

  it("plays an impact where the shot lands", () => {
    expect(soundForEvent({ kind: "impact", at })).toEqual({ name: "impact", at });
  });

  it("plays a small explosion for a vehicle and a softer sound for a soldier", () => {
    expect(soundForEvent({ kind: "unitDied", vehicle: true, at })).toEqual({ name: "smallExplosion", at });
    expect(soundForEvent({ kind: "unitDied", vehicle: false, at })).toEqual({ name: "unitDeath", at });
  });

  it("plays a large explosion where a Building is destroyed", () => {
    expect(soundForEvent({ kind: "buildingDestroyed", at })).toEqual({ name: "largeExplosion", at });
  });

  it("plays Building placed on the Map, and the ready sounds as interface sounds heard wherever the view is", () => {
    expect(soundForEvent({ kind: "buildingPlaced", at })).toEqual({ name: "buildingPlaced", at });
    expect(soundForEvent({ kind: "buildingReady" })).toEqual({ name: "buildingReady" });
    expect(soundForEvent({ kind: "unitTrained" })).toEqual({ name: "unitTrained" });
  });
});
