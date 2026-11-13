import { describe, expect, it } from "vitest";
import { createMatch, getPlayerView, type PlayerView, TICKS_PER_SECOND } from "../sim";
import { openMap } from "../sim/testing/maps";
import { addTestBuilding, addTestUnit } from "../sim/testing/setup";
import { chooseTarget, nearest, waveReady, waveThreshold } from "./tactics";

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
// Player 1 picks targets among Player 0's things, seen by a Rifleman of its own
// at (29,29), as the Opponent only knows what its view holds. Reach is eight Cells.
function sceneFor(stage: (match: ReturnType<typeof createMatch>) => void): PlayerView {
  const match = createMatch(openMap(40, 40), 1);
  stage(match);
  addTestUnit(match, 1, "rifleman", { x: 29, y: 29 });
  return getPlayerView(match, 1);
}

describe("target choice", () => {
  it("goes for an armed enemy Unit in reach before anything else", () => {
    let rifleman = 0;
    const view = sceneFor((m) => {
      addTestUnit(m, 0, "harvester", { x: 30, y: 30 });
      rifleman = addTestUnit(m, 0, "rifleman", { x: 33, y: 30 });
      addTestBuilding(m, 0, "barracks", { x: 30, y: 33 });
    });
    expect(chooseTarget(view, { x: 30.5, y: 31.5 })).toBe(rifleman);
  });

  it("goes for an unarmed Unit in reach before a Building", () => {
    let harvester = 0;
    const view = sceneFor((m) => {
      harvester = addTestUnit(m, 0, "harvester", { x: 30, y: 30 });
      addTestBuilding(m, 0, "barracks", { x: 30, y: 32 });
    });
    expect(chooseTarget(view, { x: 30.5, y: 34.5 })).toBe(harvester);
  });

  it("ignores enemy Units out of reach and goes for the nearest enemy Building", () => {
    const view = sceneFor((m) => {
      addTestUnit(m, 0, "rifleman", { x: 30, y: 20 });
      // A second Rifleman of Player 1's, so that far one is Visible, not just unseen.
      addTestUnit(m, 1, "rifleman", { x: 31, y: 21 });
      addTestBuilding(m, 0, "barracks", { x: 30, y: 32 });
      addTestBuilding(m, 0, "barracks", { x: 25, y: 32 });
    });
    const near = view.buildings.find((b) => b.owner === 0 && b.x === 30)!;
    expect(chooseTarget(view, { x: 30.5, y: 30.5 })).toBe(near.id);
  });

  it("takes out a Turret in reach before other Buildings, since it shoots back", () => {
    const view = sceneFor((m) => {
      addTestBuilding(m, 0, "barracks", { x: 30, y: 32 });
      addTestBuilding(m, 0, "turret", { x: 30, y: 26 });
    });
    const turret = view.buildings.find((b) => b.kind === "turret")!;
    expect(chooseTarget(view, { x: 30.5, y: 30.5 })).toBe(turret.id);
  });

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

  it("gives null when no enemy is known", () => {
    expect(
      chooseTarget(
        sceneFor(() => {}),
        { x: 30.5, y: 30.5 },
      ),
    ).toBeNull();
  });
});
