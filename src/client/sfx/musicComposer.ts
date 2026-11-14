import { createRng, nextFloat, nextInt, type Rng } from "../../sim";

// The background music as data (ADR 0003: there are no audio files). The
// composer is pure: a seed, a mood and a section number always give the same
// Section, with no clock and no DOM, so it is unit tested without a browser.
// musicPlayer.ts turns the notes into Web Audio.
//
// A piece is an endless row of Sections. Each one is eight bars of chords,
// bass, lead and drums built from its own random stream, so no two are alike,
// while the key and tempo come from the seed alone and hold the piece
// together. Every pitch is picked as a degree of the key's scale, which is
// what keeps the whole thing in key.

/** What the music is for: the Match itself, or the screen after it ends. */
export type Mood = "match" | "victory" | "defeat";
/** How busy a Section is. A piece moves between them so it rises and falls. */
export type SectionKind = "calm" | "build" | "drive";
export type Voice = "chords" | "bass" | "lead" | "drums";
export type Drum = "kick" | "snare" | "hat";

export const STEPS_PER_BAR = 16;
export const BARS_PER_SECTION = 8;

export interface PitchedNote {
  readonly voice: "chords" | "bass" | "lead";
  /** Sixteenth-note steps from the Section's start. */
  readonly step: number;
  /** How many steps it is held. */
  readonly steps: number;
  /** MIDI note number (60 is middle C). */
  readonly midi: number;
  /** Loudness within its voice, 0..1. */
  readonly level: number;
}

export interface DrumHit {
  readonly voice: "drums";
  readonly step: number;
  readonly drum: Drum;
  readonly level: number;
}

export type Note = PitchedNote | DrumHit;

export interface Key {
  /** Pitch class of the home note, 0 (C) to 11 (B). */
  readonly tonic: number;
  /** The seven pitch classes of the scale, from the tonic up. */
  readonly pitchClasses: readonly number[];
}

export interface Section {
  readonly mood: Mood;
  readonly index: number;
  readonly kind: SectionKind;
  readonly key: Key;
  readonly bars: number;
  /** Seconds one step lasts: the tempo. */
  readonly stepSeconds: number;
  /** Which voices play in this Section; the others sit it out. */
  readonly voices: readonly Voice[];
  /** Ordered by step. */
  readonly notes: readonly Note[];
}

type Mode = "aeolian" | "dorian" | "major";

/** Semitones above the tonic for each scale degree. */
const MODES: Record<Mode, readonly number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

/**
 * Four-bar chord progressions as scale degrees (0 is the home chord). Each
 * mode's list leaves out the degree whose chord is diminished there, which
 * sounds sour held under a melody.
 */
const PROGRESSIONS: Record<Mode, readonly (readonly number[])[]> = {
  aeolian: [
    [0, 5, 2, 6],
    [0, 3, 5, 4],
    [0, 6, 5, 6],
    [0, 2, 3, 5],
    [3, 0, 5, 6],
    [5, 6, 0, 0],
    [0, 4, 5, 2],
  ],
  dorian: [
    [0, 3, 0, 6],
    [0, 2, 3, 6],
    [0, 6, 3, 0],
    [0, 3, 6, 2],
    [0, 1, 3, 0],
    [0, 4, 3, 6],
    [3, 6, 0, 0],
  ],
  major: [
    [0, 3, 4, 0],
    [0, 5, 3, 4],
    [3, 4, 0, 5],
    [0, 2, 3, 4],
    [3, 0, 4, 5],
  ],
};

/** Four Sections in a row; a piece strings these together so it swells and settles rather than wandering. */
const FORMS: readonly (readonly SectionKind[])[] = [
  ["calm", "build", "drive", "drive"],
  ["calm", "calm", "build", "drive"],
  ["build", "drive", "calm", "drive"],
  ["calm", "build", "drive", "build"],
  ["build", "drive", "drive", "calm"],
];

const MOOD_SALT: Record<Mood, number> = { match: 11, victory: 12, defeat: 13 };
const PIECE_SALT = 1;
const FORM_SALT = 2;

/** Stirs whole numbers into one seed, so each Section gets a random stream unrelated to its neighbours'. */
function mix(...parts: readonly number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function pick<T>(rng: Rng, from: readonly T[]): T {
  return from[nextInt(rng, from.length)] as T;
}

interface Piece {
  readonly tonic: number;
  readonly matchMode: Mode;
  readonly beatsPerMinute: number;
}

/** What holds for the whole piece, so every Section of a seed shares it. */
function pieceOf(seed: number): Piece {
  const rng = createRng(mix(seed, PIECE_SALT));
  return {
    tonic: nextInt(rng, 12),
    matchMode: nextFloat(rng) < 0.5 ? "aeolian" : "dorian",
    beatsPerMinute: 96 + nextInt(rng, 5) * 4,
  };
}

/** Victory lifts the same home note into major; defeat sinks into plain minor. */
function modeFor(piece: Piece, mood: Mood): Mode {
  if (mood === "victory") return "major";
  if (mood === "defeat") return "aeolian";
  return piece.matchMode;
}

/** The key every note of that seed and mood stays in. */
export function keyFor(seed: number, mood: Mood): Key {
  const piece = pieceOf(seed);
  return { tonic: piece.tonic, pitchClasses: MODES[modeFor(piece, mood)].map((interval) => (piece.tonic + interval) % 12) };
}

const DEFEAT_BEATS_PER_MINUTE = 66;

function kindOf(seed: number, mood: Mood, index: number): SectionKind {
  if (mood === "defeat") return "calm";
  if (mood === "victory") return index % 2 === 0 ? "build" : "drive";
  // The very first Section is always calm: the music fades up under the opening rather than bursting in.
  if (index === 0) return "calm";
  const form = pick(createRng(mix(seed, FORM_SALT, Math.floor(index / 4))), FORMS);
  return form[index % 4] as SectionKind;
}

function chooseVoices(rng: Rng, mood: Mood, kind: SectionKind): Voice[] {
  const chance = (p: number): boolean => nextFloat(rng) < p;
  let on: Record<Voice, boolean>;
  if (mood === "defeat") on = { chords: true, bass: chance(0.7), lead: chance(0.6), drums: false };
  else if (mood === "victory") on = { chords: true, bass: true, lead: chance(0.9), drums: true };
  else if (kind === "calm") on = { chords: true, bass: chance(0.6), lead: chance(0.6), drums: chance(0.25) };
  else if (kind === "build") on = { chords: chance(0.85), bass: true, lead: chance(0.5), drums: true };
  else on = { chords: chance(0.75), bass: true, lead: chance(0.85), drums: true };
  // Chords alone are a drone; a quiet Section still needs something moving over them.
  if (!on.bass && !on.lead) on.lead = true;
  return (["chords", "bass", "lead", "drums"] as const).filter((voice) => on[voice]);
}

/** Composes one Section. Pure: the same seed, mood and index always give the same Section. */
export function composeSection(seed: number, mood: Mood, index: number): Section {
  const piece = pieceOf(seed);
  const mode = modeFor(piece, mood);
  const scale: Scale = { tonic: piece.tonic, intervals: MODES[mode] };
  const rng = createRng(mix(seed, MOOD_SALT[mood], index));
  const kind = kindOf(seed, mood, index);
  const voices = chooseVoices(rng, mood, kind);

  // Two four-bar halves: the second repeats the first or moves somewhere else.
  const first = pick(rng, PROGRESSIONS[mode]);
  const second = nextFloat(rng) < 0.5 ? first : pick(rng, PROGRESSIONS[mode]);
  const chords = [...first, ...second];

  const notes: Note[] = [];
  if (voices.includes("chords")) notes.push(...chordNotes(rng, scale, chords, kind));
  if (voices.includes("bass")) notes.push(...bassNotes(rng, scale, chords, kind));
  if (voices.includes("lead")) notes.push(...leadNotes(rng, scale, chords, kind));
  if (voices.includes("drums")) notes.push(...drumHits(rng, kind));
  // Array sort is stable, so notes on the same step keep their voice order and the result stays deterministic.
  notes.sort((a, b) => a.step - b.step);

  const beatsPerMinute = mood === "defeat" ? DEFEAT_BEATS_PER_MINUTE : piece.beatsPerMinute;
  return {
    mood,
    index,
    kind,
    key: keyFor(seed, mood),
    bars: BARS_PER_SECTION,
    stepSeconds: 60 / beatsPerMinute / 4,
    voices,
    notes,
  };
}

interface Scale {
  readonly tonic: number;
  readonly intervals: readonly number[];
}

/** Pitch class of a scale degree; degrees past 6 wrap round to the next octave's. */
function pitchClass(scale: Scale, degree: number): number {
  return (scale.tonic + (scale.intervals[((degree % 7) + 7) % 7] as number)) % 12;
}

/** The one MIDI note of that pitch class within the octave starting at `low`. */
function inOctaveFrom(low: number, pc: number): number {
  return low + ((((pc - low) % 12) + 12) % 12);
}

/** The nearest scale note below `midi`: how the bass walks into the next chord. */
function scaleNoteBelow(scale: Scale, midi: number): number {
  const inScale = (m: number): boolean => scale.intervals.includes((((m - scale.tonic) % 12) + 12) % 12);
  let m = midi - 1;
  while (!inScale(m)) m--;
  return m;
}

// --- chords ---

/** Each chord tone lands in this octave whatever the chord, so the pad moves by small steps between chords. */
const CHORD_LOW = 55;

/** Where in the bar the chord sounds, as [step, steps held]. */
const CHORD_RHYTHMS: Record<SectionKind, readonly (readonly (readonly [number, number])[])[]> = {
  calm: [[[0, 16]]],
  build: [[[0, 16]], [[0, 8], [8, 8]], [[0, 6], [6, 10]]],
  drive: [
    [[0, 16]],
    [[0, 3], [6, 3], [12, 3]],
    [[2, 2], [6, 2], [10, 2], [14, 2]],
    [[0, 4], [6, 2], [8, 4], [14, 2]],
  ],
};

function chordNotes(rng: Rng, scale: Scale, chords: readonly number[], kind: SectionKind): PitchedNote[] {
  const rhythm = pick(rng, CHORD_RHYTHMS[kind]);
  // A seventh on top softens the calm Sections; in the busy ones it only muddies the stabs.
  const tones = kind === "calm" && nextFloat(rng) < 0.4 ? [0, 2, 4, 6] : [0, 2, 4];
  const notes: PitchedNote[] = [];
  chords.forEach((degree, bar) => {
    for (const [at, steps] of rhythm) {
      for (const tone of tones) {
        notes.push({
          voice: "chords",
          step: bar * STEPS_PER_BAR + at,
          steps,
          midi: inOctaveFrom(CHORD_LOW, pitchClass(scale, degree + tone)),
          level: at === 0 ? 0.8 : 0.6,
        });
      }
    }
  });
  return notes;
}

// --- bass ---

const BASS_LOW = 36;

type BassSlot = "root" | "fifth" | "octave" | "rest";

/** One bar's bass pattern, one entry per slot of `slotSteps` steps. */
function bassPattern(rng: Rng, kind: SectionKind): { slots: BassSlot[]; slotSteps: number } {
  if (kind === "calm") {
    // A long root, sometimes answered by the fifth at the end of the bar.
    return { slots: ["root", "rest", "rest", nextFloat(rng) < 0.5 ? "fifth" : "rest"], slotSteps: 4 };
  }
  const count = kind === "build" ? 8 : 16;
  const restChance = kind === "build" ? 0.25 : 0.45;
  const slots: BassSlot[] = [];
  for (let i = 0; i < count; i++) {
    const roll = nextFloat(rng);
    // The downbeat always states the root, so the chord is never in doubt.
    if (i === 0) slots.push("root");
    else if (roll < restChance) slots.push("rest");
    else if (roll < restChance + 0.15) slots.push("fifth");
    else if (roll < restChance + 0.3) slots.push("octave");
    else slots.push("root");
  }
  return { slots, slotSteps: STEPS_PER_BAR / count };
}

function bassNotes(rng: Rng, scale: Scale, chords: readonly number[], kind: SectionKind): PitchedNote[] {
  const { slots, slotSteps } = bassPattern(rng, kind);
  const notes: PitchedNote[] = [];
  chords.forEach((degree, bar) => {
    const root = inOctaveFrom(BASS_LOW, pitchClass(scale, degree));
    const fifth = inOctaveFrom(root, pitchClass(scale, degree + 4));
    // The last bar of each half walks up the scale into the next chord's root instead of finishing its pattern.
    const walks = kind !== "calm" && bar % 4 === 3;
    slots.forEach((slot, i) => {
      const at = i * slotSteps;
      if (slot === "rest" || (walks && at >= 12)) return;
      // Held until the next note of the bar (or the bar's end), so a calm root rings and a busy line stays tight.
      let held = slotSteps;
      if (kind === "calm") while (i + held / slotSteps < slots.length && slots[i + held / slotSteps] === "rest") held += slotSteps;
      notes.push({
        voice: "bass",
        step: bar * STEPS_PER_BAR + at,
        steps: held,
        midi: slot === "root" ? root : slot === "fifth" ? fifth : root + 12,
        level: i === 0 ? 1 : 0.75,
      });
    });
    if (walks) {
      const next = inOctaveFrom(BASS_LOW, pitchClass(scale, chords[(bar + 1) % chords.length] as number));
      const near = scaleNoteBelow(scale, next);
      const far = scaleNoteBelow(scale, near);
      notes.push({ voice: "bass", step: bar * STEPS_PER_BAR + 12, steps: 2, midi: far, level: 0.8 });
      notes.push({ voice: "bass", step: bar * STEPS_PER_BAR + 14, steps: 2, midi: near, level: 0.9 });
    }
  });
  return notes;
}

// --- lead ---

/** The lead's range in scale degrees above its lowest tonic: about an octave and a half. */
const LEAD_LOW_DEGREE = 2;
const LEAD_HIGH_DEGREE = 12;
const MOTIF_STEPS = 2 * STEPS_PER_BAR;

/** Note lengths in steps the lead draws from: long and spare when calm, quicker when driving. */
const LEAD_LENGTHS: Record<SectionKind, readonly number[]> = {
  calm: [4, 6, 8, 8, 12],
  build: [2, 4, 4, 6, 8],
  drive: [2, 2, 3, 4, 4, 6],
};
/** Mostly steps to the next scale note, now and then a leap of a third: what makes a line singable. */
const LEAD_MOVES: readonly number[] = [-2, -1, -1, 0, 1, 1, 2];

interface MotifSlot {
  readonly at: number;
  readonly steps: number;
  readonly rest: boolean;
  readonly move: number;
}

function leadMotif(rng: Rng, kind: SectionKind): MotifSlot[] {
  const slots: MotifSlot[] = [];
  let at = 0;
  while (at < MOTIF_STEPS) {
    const steps = Math.min(pick(rng, LEAD_LENGTHS[kind]), MOTIF_STEPS - at);
    slots.push({ at, steps, rest: at > 0 && nextFloat(rng) < 0.2, move: pick(rng, LEAD_MOVES) });
    at += steps;
  }
  return slots;
}

/**
 * A two-bar motif played four times over the eight bars. The rhythm stays;
 * the second and fourth times change the back half of the melody, like a
 * question and its answers. Notes on the strong beats are pulled onto the
 * bar's chord, so the line agrees with the harmony without being tied to it.
 */
function leadNotes(rng: Rng, scale: Scale, chords: readonly number[], kind: SectionKind): PitchedNote[] {
  const motif = leadMotif(rng, kind);
  // Sometimes the lead waits out the first half and comes in over the second.
  const firstPhrase = nextFloat(rng) < 0.25 ? 2 : 0;
  // The lead's lowest tonic, between F#3 and F4, so its range sits above the chords and below shrill.
  const base = inOctaveFrom(54, scale.tonic);
  const midiOf = (degree: number): number =>
    base + 12 * Math.floor(degree / 7) + (scale.intervals[((degree % 7) + 7) % 7] as number);

  const notes: PitchedNote[] = [];
  let degree = (chords[0] as number) + pick(rng, [0, 2, 4]) + 7;
  for (let phrase = 0; phrase < chords.length / 2; phrase++) {
    const varied = phrase % 2 === 1;
    for (const slot of motif) {
      const move = varied && slot.at >= STEPS_PER_BAR ? pick(rng, LEAD_MOVES) : slot.move;
      if (phrase < firstPhrase) continue;
      degree += move;
      const chord = chords[phrase * 2 + Math.floor(slot.at / STEPS_PER_BAR)] as number;
      if (slot.at % 8 === 0) degree = nearestChordTone(degree, chord);
      while (degree > LEAD_HIGH_DEGREE) degree -= 7;
      while (degree < LEAD_LOW_DEGREE) degree += 7;
      if (slot.rest) continue;
      notes.push({
        voice: "lead",
        step: phrase * MOTIF_STEPS + slot.at,
        steps: slot.steps,
        midi: midiOf(degree),
        level: slot.at % 8 === 0 ? 1 : 0.8,
      });
    }
  }
  return notes;
}

/** The root, third or fifth of the chord closest to `degree` (the lower one on a tie). */
function nearestChordTone(degree: number, chord: number): number {
  for (const offset of [0, -1, 1, -2, 2]) {
    const tone = (((degree + offset - chord) % 7) + 7) % 7;
    if (tone === 0 || tone === 2 || tone === 4) return degree + offset;
  }
  return degree;
}

// --- drums ---

const KICK_PATTERNS: readonly (readonly number[])[] = [
  [0, 6, 8],
  [0, 8, 10],
  [0, 3, 8, 11],
  [0, 4, 8, 12],
  [0, 7, 8, 14],
];

function drumHits(rng: Rng, kind: SectionKind): DrumHit[] {
  const hits: DrumHit[] = [];
  const hit = (bar: number, at: number, drum: Drum, level: number): void =>
    void hits.push({ voice: "drums", step: bar * STEPS_PER_BAR + at, drum, level });

  if (kind === "calm") {
    // Only a soft tick on the beat: enough to keep time without waking the Section up.
    for (let bar = 0; bar < BARS_PER_SECTION; bar++) for (let at = 0; at < STEPS_PER_BAR; at += 4) hit(bar, at, "hat", at === 0 ? 0.5 : 0.35);
    return hits;
  }

  const kicks = kind === "build" ? (nextFloat(rng) < 0.5 ? [0, 8] : [0, 8, 10]) : pick(rng, KICK_PATTERNS);
  const hatEvery = kind === "drive" && nextFloat(rng) < 0.5 ? 1 : 2;
  const fills = nextFloat(rng) < 0.7;
  for (let bar = 0; bar < BARS_PER_SECTION; bar++) {
    // The last half bar becomes a rising snare roll that leads into the next Section.
    const fillFrom = fills && bar === BARS_PER_SECTION - 1 ? 8 : STEPS_PER_BAR;
    for (const at of kicks) if (at < fillFrom) hit(bar, at, "kick", at === 0 ? 1 : 0.8);
    if (kind === "drive") for (const at of [4, 12]) if (at < fillFrom) hit(bar, at, "snare", 0.9);
    for (let at = 0; at < fillFrom; at += hatEvery) hit(bar, at, "hat", at % 4 === 0 ? 0.7 : at % 2 === 0 ? 0.5 : 0.3);
    for (let at = fillFrom; at < STEPS_PER_BAR; at++) hit(bar, at, "snare", 0.4 + (0.5 * (at - fillFrom)) / 8);
  }
  return hits;
}
