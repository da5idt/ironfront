import { describe, expect, it } from "vitest";
import { soundsForEvent } from "./eventSounds";

const from = { x: 3, y: 4 };
const to = { x: 9, y: 4 };
const at = { x: 12, y: 7 };

describe("sounds for presentation events", () => {
  const shot = (weapon: "rifle" | "raiderGun" | "turretCannon", landsInSight: boolean) =>
    ({ kind: "shotFired", weapon, from, to, landsInSight }) as const;

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

  it("plays an impact where the shot lands", () => {
    expect(soundsForEvent({ kind: "impact", at })).toEqual([{ name: "impact", at }]);
  });

  it("plays a small explosion for a vehicle and a softer sound for a soldier", () => {
    expect(soundsForEvent({ kind: "unitDied", vehicle: true, at })).toEqual([{ name: "smallExplosion", at }]);
    expect(soundsForEvent({ kind: "unitDied", vehicle: false, at })).toEqual([{ name: "unitDeath", at }]);
  });

  it("plays a large explosion where a Building is destroyed", () => {
    expect(soundsForEvent({ kind: "buildingDestroyed", at })).toEqual([{ name: "largeExplosion", at }]);
  });

  it("plays Building placed on the Map, and the ready sounds as interface sounds heard wherever the view is", () => {
    expect(soundsForEvent({ kind: "buildingPlaced", at })).toEqual([{ name: "buildingPlaced", at }]);
    expect(soundsForEvent({ kind: "buildingReady" })).toEqual([{ name: "buildingReady" }]);
    expect(soundsForEvent({ kind: "unitTrained" })).toEqual([{ name: "unitTrained" }]);
  });
});
