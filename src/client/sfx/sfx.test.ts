import { describe, expect, it } from "vitest";
import { applyMixerAction, DEFAULT_SETTINGS, type MixerSettings } from "./mixer";
import { RECIPES, recipeDuration, type SoundName } from "./recipes";
import { createSfx, type SoundOutput } from "./sfx";
import { memoryStorage } from "./testing/memoryStorage";

/**
 * Stands in for the Web Audio engine (engine.ts, createSoundEngine) and
 * copies how it behaves before sound has started, which is what `time` null
 * means here:
 * - now() is null (the engine's is `audio && !paused ? currentTime : null`);
 * - start() silently does nothing (the engine's begins `if (!audio) return`).
 * Once started, start() records what it was asked to play, and
 * applySettings() records the settings at any time, as the engine keeps them
 * for when sound does start.
 */
function fakeOutput(now: number | null = 0) {
  const started: { name: SoundName; gain: number; pan: number }[] = [];
  const applied: MixerSettings[] = [];
  const output: SoundOutput & { time: number | null } = {
    time: now,
    now: () => output.time,
    start: (name, gain, pan) => {
      if (output.time === null) return;
      started.push({ name, gain, pan });
    },
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

  it("leaves a sound's gap between two starts of it, though the first has ended and many ask every Tick", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    const gap = RECIPES.heal.gap!;
    const tick = 1 / 20;
    // Four Units being healed, each asking on every Tick for three gaps and a bit.
    const ticks = Math.floor((gap * 3.5) / tick);
    for (let t = 0; t < ticks; t++) {
      output.time = t * tick;
      for (let unit = 0; unit < 4; unit++) sfx.play("heal", { x: 50 + unit, y: 40 });
    }
    expect(started.map((s) => s.name)).toEqual(["heal", "heal", "heal", "heal"]);
    // Another sound keeps its own time: the tool sound is not held back by the heal's gap.
    sfx.play("repair", { x: 50, y: 40 });
    expect(started).toHaveLength(5);
  });

  it("does not let a faint far start of a sound with a gap hold back a clearly louder one near by", () => {
    for (const name of ["heal", "repair"] as const) {
      const { output, started } = fakeOutput();
      const sfx = createSfx(output, null);
      sfx.setListener(listener);
      const far = { x: 50, y: 40 + 1.5 * listener.reach };
      const near = { x: 50, y: 40 };
      sfx.play(name, far);
      // On the same Tick, while the faint one still sounds, and a Tick later.
      sfx.play(name, near);
      expect(started.map((s) => s.gain)).toEqual([started[0]!.gain, 1]);
      expect(started[0]!.gain).toBeLessThan(0.25);
      // The near one keeps the gap from then on, against near and far alike: work all over the Map is still no drone.
      const tick = 1 / 20;
      for (let t = 1; t * tick < RECIPES[name].gap!; t++) {
        output.time = t * tick;
        sfx.play(name, near);
        sfx.play(name, far);
      }
      expect(started).toHaveLength(2);
      output.time = RECIPES[name].gap!;
      sfx.play(name, far);
      expect(started).toHaveLength(3);
    }
  });

  it("holds back, within the gap, one only a little louder than the last start", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    // A quarter of the way to the view's corner, then the centre.
    sfx.play("heal", { x: 50, y: 45 });
    sfx.play("heal", { x: 50, y: 40 });
    expect(started).toHaveLength(1);
  });

  it("does not let a far sound that was skipped hold back the next one near by", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    sfx.play("repair", { x: 50, y: 140 });
    sfx.play("repair", { x: 50, y: 40 });
    expect(started).toEqual([{ name: "repair", gain: 1, pan: 0 }]);
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

describe("Units getting into and out of a Troop Carrier", () => {
  const at = { x: 62, y: 40 };

  it("are heard through the effects, quieter and to one side when off-centre, and not at all far from the view", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    sfx.playEvent({ kind: "unitBoarded", unit: "rifleman", owner: 0, at });
    sfx.playEvent({ kind: "unitUnloaded", unit: "rifleman", owner: 0, at });
    expect(started.map((s) => s.name)).toEqual(["board", "unload"]);
    for (const s of started) {
      expect(s.gain).toBeLessThan(1);
      expect(s.pan).toBeGreaterThan(0);
    }
    sfx.playEvent({ kind: "unitBoarded", unit: "rifleman", owner: 0, at: { x: 50, y: 140 } });
    expect(started).toHaveLength(2);
  });

  it("do not stack: five getting in at once sound as no more than the cap", () => {
    const { output, started } = fakeOutput();
    const sfx = createSfx(output, null);
    sfx.setListener(listener);
    for (let i = 0; i < 5; i++) sfx.playEvent({ kind: "unitBoarded", unit: "rifleman", owner: 0, at });
    expect(started).toHaveLength(RECIPES.board.cap);
  });
});
