import type { MatchStatus, PlayerId } from "../../sim";
import { composeSection, type Mood, type Note, type Section, STEPS_PER_BAR } from "./musicComposer";

// Where the music has got to, and which notes are due next. Pure: the player
// (musicPlayer.ts) owns the audio clock and the timer and asks here, with the
// clock's time, what to schedule. That keeps the one tricky part of playback,
// what happens when the clock and the timer fall out of step, unit tested.
//
// The two ways they fall out of step:
// - Paused: the audio clock stops while the timer keeps firing. The same
//   time asked again gives nothing new, so nothing piles up.
// - A hidden tab: the browser holds the timer back while the clock runs on,
//   so the next note's time is already past. The music then picks up at its
//   next note from now, rather than dropping the notes it missed or playing
//   them all at once to catch up.

export interface Timeline {
  readonly seed: number;
  readonly section: Section;
  /** The next step of the Section to hand out. */
  readonly step: number;
  /** When that step sounds, in the audio clock's seconds. */
  readonly stepAt: number;
  /** Index of the first of the Section's notes not handed out yet. */
  readonly nextNote: number;
}

export interface TimedNote {
  readonly note: Note;
  /** When it starts, in the audio clock's seconds. */
  readonly at: number;
  /** How long it is held. Drum hits ring for as long as their sound does, so theirs is 0. */
  readonly seconds: number;
}

/** A note is never asked for closer to now than this: Web Audio starts late notes at once, which smears the rhythm. */
export const MIN_LEAD_SECONDS = 0.05;

/** The Match's music, Victory's or defeat's, as the person playing sees the result. */
export function moodFor(status: MatchStatus, me: PlayerId): Mood {
  if (status.state !== "victory") return "match";
  return status.winner === me ? "victory" : "defeat";
}

/** A piece from its first Section, whose first step sounds at `at`. */
export function startTimeline(seed: number, mood: Mood, at: number): Timeline {
  return { seed, section: composeSection(seed, mood, 0), step: 0, stepAt: at, nextNote: 0 };
}

/**
 * The notes that start before `until`, given the clock reads `now`, and the
 * timeline moved past them. Call it as often as you like: each note is handed
 * out once.
 */
export function advanceTimeline(timeline: Timeline, now: number, until: number): { timeline: Timeline; due: TimedNote[] } {
  let { section, step, nextNote } = timeline;
  let stepAt = Math.max(timeline.stepAt, now + MIN_LEAD_SECONDS);
  const due: TimedNote[] = [];
  while (stepAt < until) {
    while (nextNote < section.notes.length && (section.notes[nextNote] as Note).step === step) {
      const note = section.notes[nextNote] as Note;
      due.push({ note, at: stepAt, seconds: note.voice === "drums" ? 0 : note.steps * section.stepSeconds });
      nextNote++;
    }
    stepAt += section.stepSeconds;
    step++;
    if (step >= section.bars * STEPS_PER_BAR) {
      section = composeSection(timeline.seed, section.mood, section.index + 1);
      step = 0;
      nextNote = 0;
    }
  }
  return { timeline: { seed: timeline.seed, section, step, stepAt, nextNote }, due };
}
