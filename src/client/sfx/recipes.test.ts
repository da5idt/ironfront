import { describe, expect, it } from "vitest";
import { type Layer, RECIPES, recipeDuration, SOUND_NAMES } from "./recipes";

const frequencies = (layer: Layer): number[] => [layer.from, layer.to];

describe("sound recipes", () => {
  it("has one recipe for every sound the ticket lists", () => {
    expect([...SOUND_NAMES].sort()).toEqual(
      [
        "rifle",
        "raiderGun",
        "turretCannon",
        "impact",
        "smallExplosion",
        "largeExplosion",
        "unitDeath",
        "buildingPlaced",
        "buildingReady",
        "unitTrained",
        "orderAck",
        "menuClick",
        "cantBuild",
      ].sort(),
    );
    for (const name of SOUND_NAMES) expect(RECIPES[name].layers.length).toBeGreaterThan(0);
  });

  it("lasts as long as its last layer", () => {
    expect(
      recipeDuration({
        cap: 1,
        layers: [
          { kind: "tone", wave: "sine", start: 0, duration: 0.2, gain: 0.5, from: 440, to: 440 },
          { kind: "tone", wave: "sine", start: 0.15, duration: 0.25, gain: 0.5, from: 660, to: 660 },
        ],
      }),
    ).toBeCloseTo(0.4);
  });

  it.each(SOUND_NAMES)("%s is short, audible and inside what speakers can play", (name) => {
    const recipe = RECIPES[name];
    const duration = recipeDuration(recipe);
    expect(duration).toBeGreaterThan(0.01);
    expect(duration).toBeLessThanOrEqual(1.5);
    expect(Number.isInteger(recipe.cap)).toBe(true);
    expect(recipe.cap).toBeGreaterThanOrEqual(1);
    expect(recipe.cap).toBeLessThanOrEqual(4);
    for (const layer of recipe.layers) {
      expect(layer.start).toBeGreaterThanOrEqual(0);
      expect(layer.duration).toBeGreaterThan(0);
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.gain).toBeLessThanOrEqual(1);
      for (const hz of frequencies(layer)) {
        expect(hz).toBeGreaterThanOrEqual(20);
        expect(hz).toBeLessThanOrEqual(12000);
      }
    }
  });

  it("keeps interface sounds brief so they never trail behind the click", () => {
    for (const name of ["menuClick", "orderAck", "cantBuild"] as const) {
      expect(recipeDuration(RECIPES[name])).toBeLessThanOrEqual(0.3);
    }
  });

  it("lets a large explosion ring longer than a small one, and a cannon longer than a rifle", () => {
    expect(recipeDuration(RECIPES.largeExplosion)).toBeGreaterThan(recipeDuration(RECIPES.smallExplosion));
    expect(recipeDuration(RECIPES.turretCannon)).toBeGreaterThan(recipeDuration(RECIPES.rifle));
  });
});
