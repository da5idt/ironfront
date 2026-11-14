import { describe, expect, it } from "vitest";
import { composeSection, type Key, keyFor, type Mood, type Section, type Voice } from "./musicComposer";

const MOODS: readonly Mood[] = ["match", "victory", "defeat"];

// The scales as any music theory text gives them, in semitones above the home note.
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const semitonesAboveTonic = (key: Key): number[] =>
  key.pitchClasses.map((pc) => (pc - key.tonic + 12) % 12).sort((a, b) => a - b);

/** A Match's music from its start until at least twelve minutes have gone by. */
function twelveMinutes(seed: number): Section[] {
  const sections: Section[] = [];
  let seconds = 0;
  for (let index = 0; seconds < 12 * 60; index++) {
    const section = composeSection(seed, "match", index);
    sections.push(section);
    seconds += section.bars * 16 * section.stepSeconds;
  }
  return sections;
}

describe("the music composer", () => {
  it("gives the same notes for the same seed, mood and section", () => {
    for (const mood of MOODS) {
      expect(composeSection(1234, mood, 5)).toEqual(composeSection(1234, mood, 5));
    }
  });

  it("gives different notes for a different seed", () => {
    expect(composeSection(1, "match", 3).notes).not.toEqual(composeSection(2, "match", 3).notes);
  });

  it("plays the Match in a minor key, Victory in the major of the same home note and defeat in its minor", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const match = keyFor(seed, "match");
      expect([NATURAL_MINOR, DORIAN]).toContainEqual(semitonesAboveTonic(match));
      expect(semitonesAboveTonic(keyFor(seed, "victory"))).toEqual(MAJOR);
      expect(semitonesAboveTonic(keyFor(seed, "defeat"))).toEqual(NATURAL_MINOR);
      expect(keyFor(seed, "victory").tonic).toBe(match.tonic);
      expect(keyFor(seed, "defeat").tonic).toBe(match.tonic);
    }
  });

  it("keeps every note in key, in every mood", () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const mood of MOODS) {
        const key = keyFor(seed, mood);
        for (let index = 0; index < 40; index++) {
          const section = composeSection(seed, mood, index);
          expect(section.key).toEqual(key);
          for (const note of section.notes) {
            if (note.voice === "drums") continue;
            expect(key.pitchClasses, `seed ${seed} ${mood} section ${index} ${note.voice} midi ${note.midi}`).toContain(
              note.midi % 12,
            );
          }
        }
      }
    }
  });

  it("keeps every note inside its Section, in step order, at a pitch that can be heard as a note", () => {
    for (const mood of MOODS) {
      for (let index = 0; index < 40; index++) {
        const section = composeSection(77, mood, index);
        const length = section.bars * 16;
        let previous = 0;
        for (const note of section.notes) {
          expect(note.step).toBeGreaterThanOrEqual(previous);
          previous = note.step;
          expect(note.level).toBeGreaterThan(0);
          expect(note.level).toBeLessThanOrEqual(1);
          if (note.voice === "drums") {
            expect(note.step).toBeLessThan(length);
            continue;
          }
          expect(note.steps).toBeGreaterThan(0);
          expect(note.step + note.steps).toBeLessThanOrEqual(length);
          // MIDI 28 is the low E of a bass guitar (41 Hz); 96 is C7, where a synth lead turns shrill.
          expect(note.midi).toBeGreaterThanOrEqual(28);
          expect(note.midi).toBeLessThanOrEqual(96);
        }
      }
    }
  });

  it("does not repeat a Section in twelve minutes of a Match", () => {
    for (const seed of [3, 4, 5]) {
      const heard = twelveMinutes(seed).map((section) => JSON.stringify(section.notes));
      expect(new Set(heard).size).toBe(heard.length);
    }
  });

  it("moves between calm, build and drive Sections, with each voice dropping in and out", () => {
    for (const seed of [3, 4, 5]) {
      const sections = twelveMinutes(seed);
      expect(new Set(sections.map((s) => s.kind))).toEqual(new Set(["calm", "build", "drive"]));
      for (const voice of ["chords", "bass", "lead", "drums"] satisfies Voice[]) {
        const playing = sections.filter((s) => s.voices.includes(voice)).length;
        expect(playing, `${voice} plays somewhere`).toBeGreaterThan(0);
        expect(playing, `${voice} sits out somewhere`).toBeLessThan(sections.length);
      }
    }
  });

  it("uses several chord progressions over a Match", () => {
    for (const seed of [3, 4, 5]) {
      // A progression shows as the bass notes on each bar's first step, whatever octave or rhythm they have.
      const progressions = new Set(
        twelveMinutes(seed)
          .filter((s) => s.voices.includes("bass"))
          .map((s) => s.notes.filter((n) => n.voice === "bass" && n.step % 16 === 0).map((n) => "midi" in n && n.midi % 12).join()),
      );
      expect(progressions.size).toBeGreaterThanOrEqual(4);
    }
  });

  it("lists exactly the voices that play", () => {
    for (let index = 0; index < 40; index++) {
      const section = composeSection(9, "match", index);
      expect(new Set(section.notes.map((n) => n.voice))).toEqual(new Set(section.voices));
    }
  });

  it("opens a Match calmly", () => {
    for (let seed = 1; seed <= 10; seed++) expect(composeSection(seed, "match", 0).kind).toBe("calm");
  });

  it("slows down and drops the drums for defeat", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (let index = 0; index < 6; index++) {
        const defeat = composeSection(seed, "defeat", index);
        expect(defeat.voices).not.toContain("drums");
        expect(defeat.stepSeconds).toBeGreaterThan(composeSection(seed, "match", index).stepSeconds);
      }
    }
  });

  it("keeps a tempo between 60 and 120 beats a minute", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const mood of MOODS) {
        const beatsPerMinute = 60 / (composeSection(seed, mood, 0).stepSeconds * 4);
        expect(beatsPerMinute).toBeGreaterThanOrEqual(60);
        expect(beatsPerMinute).toBeLessThanOrEqual(120);
      }
    }
  });
});
