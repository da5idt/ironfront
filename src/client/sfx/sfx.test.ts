import { describe, expect, it } from "vitest";
import { applyMixerAction, DEFAULT_SETTINGS, type MixerSettings } from "./mixer";
import { RECIPES, recipeDuration, type SoundName } from "./recipes";
import { createSfx, type SoundOutput } from "./sfx";
import { memoryStorage } from "./testing/memoryStorage";

/**
 * Stands in for the Web Audio engine (engine.ts): a clock that is null until
 * sound has started, and a record of what it was asked to play.
 */
function fakeOutput(now: number | null = 0) {
  const started: { name: SoundName; gain: number; pan: number }[] = [];
  const applied: MixerSettings[] = [];
  const output: SoundOutput & { time: number | null } = {
    time: now,
    now: () => output.time,
    start: (name, gain, pan) => void started.push({ name, gain, pan }),
    applySettings: (settings) => void applied.push(settings),
  };
  return { output, started, applied };
}

const listener = { x: 50, y: 40, reach: 20 };

describe("playing a sound", () => {
  it("plays an interface sound in full, in the middle", () => {
    const { output, started } = fakeOutput();
    createSfx(output, null).play("menuClick");
    expect(started).toEqual([{ name: "menuClick", gain: 1, pan: 0 }]);
  });

  it("plays a sound on the Map quieter the farther it is from the view's centre", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    sfx.play("impact", { x: 50, y: 40 });
    sfx.play("impact", { x: 62, y: 40 });
    expect(started[0]).toEqual({ name: "impact", gain: 1, pan: 0 });
    expect(started[1]!.gain).toBeLessThan(1);
    expect(started[1]!.pan).toBeGreaterThan(0);
  });

  it("skips a sound too far from the view", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    sfx.play("largeExplosion", { x: 50, y: 140 });
    expect(started).toEqual([]);
  });

  it("stops at the sound's cap, and plays it again once one has finished", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    const cap = RECIPES.rifle.cap;
    for (let i = 0; i < cap + 4; i++) sfx.play("rifle");
    expect(started).toHaveLength(cap);
    // Another sound has its own count.
    sfx.play("impact");
    expect(started).toHaveLength(cap + 1);

    output.time = recipeDuration(RECIPES.rifle) / 2;
    sfx.play("rifle");
    expect(started).toHaveLength(cap + 1);
    output.time = recipeDuration(RECIPES.rifle) + 0.01;
    sfx.play("rifle");
    expect(started).toHaveLength(cap + 2);
  });

  it("does not count a skipped far sound against the cap", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    for (let i = 0; i < 5; i++) sfx.play("buildingPlaced", { x: 50, y: 140 });
    sfx.play("buildingPlaced", { x: 50, y: 40 });
    expect(started).toHaveLength(1);
  });

  it("plays nothing, and holds nothing back for later, while sound has not started", () => {
    const { output, started } = fakeOutput(null);
    const sfx = createSfx(output, null);
    for (let i = 0; i < 5; i++) sfx.play("buildingReady");
    expect(started).toEqual([]);
    output.time = 0;
    sfx.play("buildingReady");
    expect(started).toHaveLength(1);
  });

  it("plays the sound of a presentation event where it happened", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    sfx.playEvent({ kind: "unitDied", unit: "raider", vehicle: true, owner: 1, at: { x: 50, y: 40 } });
    sfx.playEvent({ kind: "buildingDestroyed", building: "turret", owner: 1, at: { x: 50, y: 140 } });
    sfx.playEvent({ kind: "unitTrained", unit: "rifleman" });
    // An alert only: no effect.
    sfx.playEvent({ kind: "underAttack", hit: "building", at: { x: 50, y: 40 }, nearOwnBuildings: true });
    expect(started.map((s) => s.name)).toEqual(["smallExplosion", "unitTrained"]);
  });
});

describe("sound settings", () => {
  it("starts from the saved settings and hands them to the output", () => {
    const { output, applied } = fakeOutput();
    const sfx = createSfx(output, null);
    expect(sfx.settings()).toEqual(DEFAULT_SETTINGS);
    expect(applied).toEqual([DEFAULT_SETTINGS]);
  });

  it("applies a change at once and remembers it for the next visit", () => {
    const storage = memoryStorage();
    const first = fakeOutput();
    const sfx = createSfx(first.output, storage);
    sfx.apply({ type: "volume", channel: "music", step: -1 });
    sfx.apply({ type: "muteAll" });
    let expected = applyMixerAction(DEFAULT_SETTINGS, { type: "volume", channel: "music", step: -1 });
    expected = applyMixerAction(expected, { type: "muteAll" });
    expect(sfx.settings()).toEqual(expected);
    expect(first.applied.at(-1)).toEqual(expected);

    const second = fakeOutput();
    expect(createSfx(second.output, storage).settings()).toEqual(expected);
    expect(second.applied).toEqual([expected]);
  });
});
