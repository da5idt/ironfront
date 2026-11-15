import { describe, expect, it } from "vitest";
import { createMatch, getPlayerView, type PlayerView, TICKS_PER_SECOND } from "../sim";
import { openMap } from "../sim/testing/maps";
import { addTestUnit } from "../sim/testing/setup";
import { nearest, waveReady, waveThreshold } from "./tactics";

describe("attack wave threshold", () => {
  it("starts at six Units and asks for three more each wave", () => {
    expect([0, 1, 2, 3].map(waveThreshold)).toEqual([6, 9, 12, 15]);
  });

  it("levels off so the Opponent keeps attacking late in a Match", () => {
    expect(waveThreshold(20)).toBe(24);
    expect(waveThreshold(100)).toBe(24);
  });
});

describe("when a wave may go", () => {
  const minute = 60 * TICKS_PER_SECOND;

  it("holds the first wave until four and a half minutes in, however big the army", () => {
    expect(waveReady({ wave: 0, army: 30, tick: 4 * minute, lastWaveTick: null })).toBe(false);
    expect(waveReady({ wave: 0, army: 30, tick: 4.5 * minute, lastWaveTick: null })).toBe(true);
  });

  it("needs the wave's threshold of Units", () => {
    expect(waveReady({ wave: 0, army: 5, tick: 10 * minute, lastWaveTick: null })).toBe(false);
    expect(waveReady({ wave: 2, army: 11, tick: 20 * minute, lastWaveTick: 10 * minute })).toBe(false);
    expect(waveReady({ wave: 2, army: 12, tick: 20 * minute, lastWaveTick: 10 * minute })).toBe(true);
  });

  it("leaves at least ninety seconds between waves", () => {
    expect(waveReady({ wave: 1, army: 30, tick: 7 * minute, lastWaveTick: 6 * minute })).toBe(false);
    expect(waveReady({ wave: 1, army: 30, tick: 7.5 * minute, lastWaveTick: 6 * minute })).toBe(true);
  });
});

// openMap(40, 40): Player 1's HQ covers (37..39, 37..39), its Refinery (33..35, 38..39).
// Player 1 looks at Player 0's things, seen by a Rifleman of its own
// at (29,29), as the Opponent only knows what its view holds.
function sceneFor(stage: (match: ReturnType<typeof createMatch>) => void): PlayerView {
  const match = createMatch(openMap(40, 40), 1);
  stage(match);
  addTestUnit(match, 1, "rifleman", { x: 29, y: 29 });
  return getPlayerView(match, 1);
}

describe("nearest", () => {
  it("breaks a tie for nearest by the lowest id, whatever order they are listed in", () => {
    const view = sceneFor((m) => {
      addTestUnit(m, 0, "harvester", { x: 30, y: 30 });
      addTestUnit(m, 0, "harvester", { x: 28, y: 30 });
    });
    const enemies = view.units.filter((u) => u.owner === 0 && u.y === 30.5).reverse();
    const lowest = Math.min(...enemies.map((u) => u.id));
    expect(enemies[0]!.id).not.toBe(lowest);
    expect(nearest(enemies, { x: 29.5, y: 30.5 })?.id).toBe(lowest);
    expect(nearest(enemies, { x: 20.5, y: 30.5 }, 5)).toBeNull();
  });
});
