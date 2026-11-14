import { describe, expect, it } from "vitest";
import { composeSection, type Note } from "./musicComposer";
import { advanceTimeline, moodFor, startTimeline, type TimedNote, type Timeline } from "./musicTimeline";

const SEED = 42;

/** Runs the timeline the way the player does: a look ahead of `ahead` seconds, asked for at each of `clock`'s times. */
function pump(timeline: Timeline, clock: readonly number[], ahead: number): { timeline: Timeline; heard: TimedNote[] } {
  const heard: TimedNote[] = [];
  let current = timeline;
  for (const now of clock) {
    const advanced = advanceTimeline(current, now, now + ahead);
    heard.push(...advanced.due);
    current = advanced.timeline;
  }
  return { timeline: current, heard };
}

const every = (from: number, to: number, hop: number): number[] => {
  const times: number[] = [];
  for (let t = from; t < to; t += hop) times.push(t);
  return times;
};

/** The first three Sections' notes in the order they should sound. */
const firstNotes = (): Note[] => [0, 1, 2].flatMap((index) => composeSection(SEED, "match", index).notes);

describe("the music timeline", () => {
  it("hands out every note of each Section once, in order, as the clock reaches it", () => {
    const section = composeSection(SEED, "match", 0);
    const sectionSeconds = section.bars * 16 * section.stepSeconds;
    const { heard } = pump(startTimeline(SEED, "match", 1), every(0, 1 + sectionSeconds * 2.5, 0.1), 0.5);
    const expected = firstNotes();
    expect(heard.length).toBeGreaterThan(section.notes.length * 2);
    expect(heard.map((h) => h.note)).toEqual(expected.slice(0, heard.length));
  });

  it("times each note from the Section's start by its step", () => {
    const section = composeSection(SEED, "match", 0);
    const { heard } = pump(startTimeline(SEED, "match", 2), every(0, 10, 0.1), 0.5);
    for (const { note, at, seconds } of heard) {
      expect(at).toBeCloseTo(2 + note.step * section.stepSeconds, 6);
      if (note.voice !== "drums") expect(seconds).toBeCloseTo(note.steps * section.stepSeconds, 6);
    }
  });

  it("hands out nothing twice when asked again at the same time", () => {
    const first = advanceTimeline(startTimeline(SEED, "match", 0), 0, 3);
    expect(first.due.length).toBeGreaterThan(0);
    expect(advanceTimeline(first.timeline, 0, 3).due).toEqual([]);
  });

  it("hands out nothing more while the clock stands still, as it does while paused", () => {
    const { timeline } = pump(startTimeline(SEED, "match", 0), every(0, 5, 0.1), 1);
    expect(pump(timeline, new Array<number>(50).fill(5), 1).heard).toEqual([]);
  });

  it("carries on from the next note after a stall, neither skipping what was missed nor bunching it up", () => {
    const before = pump(startTimeline(SEED, "match", 0), every(0, 5, 0.1), 1);
    // The clock ran 30 seconds with nobody asking: a hidden tab whose timers were held back.
    const after = advanceTimeline(before.timeline, 35, 36);
    const all = [...before.heard, ...after.due];
    expect(all.map((h) => h.note)).toEqual(firstNotes().slice(0, all.length));
    expect(after.due.length).toBeGreaterThan(0);
    for (const { at } of after.due) {
      expect(at).toBeGreaterThanOrEqual(35);
      expect(at).toBeLessThan(36);
    }
    // One second's worth of notes, spaced as written, not thirty seconds' worth at once.
    const starts = [...new Set(after.due.map((h) => h.at))];
    const section = composeSection(SEED, "match", 0);
    for (let i = 1; i < starts.length; i++) {
      expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(section.stepSeconds - 1e-9);
    }
  });

  it("never asks for a note in the past", () => {
    const { heard } = pump(startTimeline(SEED, "match", 0), [0, 0.1, 4, 4.05, 9, 20, 20.3], 0.4);
    const asked = [0, 0.1, 4, 4.05, 9, 20, 20.3];
    let previous = -1;
    for (const { at } of heard) {
      expect(at).toBeGreaterThanOrEqual(previous);
      previous = at;
    }
    expect(heard.length).toBeGreaterThan(0);
    // Each batch lies at or after the time it was asked for.
    let current = startTimeline(SEED, "match", 0);
    for (const now of asked) {
      const advanced = advanceTimeline(current, now, now + 0.4);
      for (const { at } of advanced.due) expect(at).toBeGreaterThanOrEqual(now);
      current = advanced.timeline;
    }
  });
});

describe("the music's mood", () => {
  it("follows the Match: its own music while running, then Victory or defeat for the person playing", () => {
    expect(moodFor({ state: "running" }, 0)).toBe("match");
    expect(moodFor({ state: "victory", winner: 0 }, 0)).toBe("victory");
    expect(moodFor({ state: "victory", winner: 1 }, 0)).toBe("defeat");
  });
});
