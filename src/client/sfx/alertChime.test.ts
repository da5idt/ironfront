import { describe, expect, it } from "vitest";
import { ALERT_CHIME } from "./alertChime";
import { UNSPOKEN_GAP_S } from "./alerts";
import { RECIPES, recipeDuration, SOUND_NAMES } from "./recipes";

describe("the alert chime", () => {
  it("is over before the next unspoken alert may chime", () => {
    expect(recipeDuration(ALERT_CHIME)).toBeLessThan(UNSPOKEN_GAP_S);
  });

  it("is not one of the sound effects played again", () => {
    for (const name of SOUND_NAMES) expect(RECIPES[name].layers, name).not.toEqual(ALERT_CHIME.layers);
  });

  it("stays inside what speakers can play", () => {
    for (const layer of ALERT_CHIME.layers) {
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.gain).toBeLessThanOrEqual(1);
      for (const hz of [layer.from, layer.to]) {
        expect(hz).toBeGreaterThanOrEqual(20);
        expect(hz).toBeLessThanOrEqual(20_000);
      }
    }
  });
});
