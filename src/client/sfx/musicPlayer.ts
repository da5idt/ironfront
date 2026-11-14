import { renderRecipe, type SoundEngine, type StartedAudio } from "./engine";
import type { Drum, Mood, PitchedNote } from "./musicComposer";
import { advanceTimeline, startTimeline, type TimedNote, type Timeline } from "./musicTimeline";
import type { Layer } from "./recipes";

// The Web Audio side of the music: thin, and checked by ear and by an offline
// render rather than unit tests. What to play comes from the composer and
// when from the timeline; this file only owns the timer and the instruments.
//
// It plays into the mixer's music channel and never touches that node's
// gain, so volume, mute and mute-all work without the music knowing. Pausing
// suspends the audio context (engine.ts): notes already scheduled freeze with
// its clock and carry on after, and the timeline hands out nothing new while
// the clock stands still, so there is nothing to do here for pause.

/** How often the timer asks the timeline for more notes. */
const PUMP_MS = 100;
/**
 * How far ahead of the audio clock notes are scheduled. Browsers hold a
 * hidden tab's timers back to about one a second, so this has to be longer
 * than that for the music to play on unbroken behind another tab.
 */
const LOOK_AHEAD_SECONDS = 1.6;
/** The whole music's level under the channel's own volume: quiet enough that effects and alerts sit on top. */
const MUSIC_LEVEL = 0.42;
/** A change of mood fades the old music out and the new in over about this long, rather than cutting. */
const MOOD_FADE_SECONDS = 0.5;
/** The new mood's first note waits this long, so it lands after the old music has mostly gone. */
const MOOD_GAP_SECONDS = 0.6;

export interface Music {
  /** Which music plays: the Match's, Victory's or defeat's. Call as often as you like; only a change does anything. */
  setMood(mood: Mood): void;
  /** For checking from the dev hook that the music is running; nothing in the game reads it. */
  status(): { readonly mood: Mood; readonly section: number | null; readonly notesScheduled: number };
}

/** Starts the music once sound has started (the first click or key press) and keeps it going. */
export function createMusic(engine: Pick<SoundEngine, "whenStarted">, seed: number): Music {
  let mood: Mood = "match";
  let playing: { readonly audio: StartedAudio; bus: GainNode; timeline: Timeline } | null = null;
  /** Each change of mood starts a new piece, so a second Match does not open with the first one's music. */
  let pieces = 0;
  let notesScheduled = 0;

  function newBus(audio: StartedAudio, at: number): GainNode {
    const bus = new GainNode(audio.context, { gain: 0 });
    bus.gain.setTargetAtTime(MUSIC_LEVEL, at, MOOD_FADE_SECONDS / 3);
    bus.connect(audio.channels.music);
    return bus;
  }

  function pump(): void {
    if (!playing) return;
    const now = playing.audio.context.currentTime;
    const advanced = advanceTimeline(playing.timeline, now, now + LOOK_AHEAD_SECONDS);
    playing.timeline = advanced.timeline;
    for (const timed of advanced.due) playNote(playing.audio.context, playing.bus, timed);
    notesScheduled += advanced.due.length;
  }

  engine.whenStarted((audio) => {
    const now = audio.context.currentTime;
    playing = { audio, bus: newBus(audio, now), timeline: startTimeline(seed, mood, now + MOOD_GAP_SECONDS) };
    // A timer and not the game's frame loop: frames stop altogether in a hidden tab, timers only slow down.
    setInterval(pump, PUMP_MS);
    pump();
  });

  return {
    setMood(next) {
      if (next === mood) return;
      mood = next;
      pieces++;
      if (!playing) return;
      const { audio, bus } = playing;
      const now = audio.context.currentTime;
      // Notes already scheduled on the old bus fade away with it. It is left connected: with no notes it is silent and costs nothing.
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, MOOD_FADE_SECONDS / 3);
      playing.bus = newBus(audio, now + MOOD_GAP_SECONDS / 2);
      playing.timeline = startTimeline((seed + pieces * 7919) >>> 0, mood, now + MOOD_GAP_SECONDS);
      pump();
    },
    status() {
      return { mood, section: playing ? playing.timeline.section.index : null, notesScheduled };
    },
  };
}

/**
 * Builds one note's nodes and schedules them on the context's clock. Takes
 * any context, so the same instruments play in the game and render into an
 * OfflineAudioContext for checking.
 */
export function playNote(context: BaseAudioContext, destination: AudioNode, timed: TimedNote): void {
  const { note, at } = timed;
  if (note.voice === "drums") {
    renderRecipe(context, { layers: DRUMS[note.drum] }, destination, at, { gain: note.level, pan: DRUM_PAN[note.drum], pitch: 1 });
    return;
  }
  const instrument = INSTRUMENTS[note.voice];
  const end = at + timed.seconds;
  const frequency = 440 * 2 ** ((note.midi - 69) / 12);
  const peak = instrument.level * note.level;

  // Attack, a fall to the held level, then a release after the note ends.
  const envelope = new GainNode(context, { gain: 0 });
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(peak, at + instrument.attack);
  envelope.gain.setTargetAtTime(peak * instrument.sustain, at + instrument.attack, instrument.decay / 3);
  envelope.gain.setTargetAtTime(0, Math.max(end, at + instrument.attack), instrument.release / 3);
  // Raw square and saw waves are harsh; the filter takes the edge off so the music stays in the background.
  const filter = new BiquadFilterNode(context, { type: "lowpass", frequency: instrument.cutoff, Q: 0.7 });
  filter.connect(envelope).connect(destination);

  for (const part of instrument.oscillators) {
    const oscillator = new OscillatorNode(context, { type: part.wave, frequency, detune: part.detune });
    const level = new GainNode(context, { gain: part.gain });
    oscillator.connect(level).connect(filter);
    oscillator.start(at);
    // Three release times on, the note has faded to a twentieth: far enough down to cut without a click.
    oscillator.stop(Math.max(end, at + instrument.attack) + instrument.release);
  }
}

interface Instrument {
  readonly oscillators: readonly { readonly wave: OscillatorType; readonly detune: number; readonly gain: number }[];
  /** Low-pass cutoff in Hz. */
  readonly cutoff: number;
  /** Peak loudness of a note at full level. */
  readonly level: number;
  /** Seconds to rise to the peak. */
  readonly attack: number;
  /** Seconds to fall from the peak to the held level. */
  readonly decay: number;
  /** The held level as a share of the peak. */
  readonly sustain: number;
  /** Seconds to fade after the note ends. */
  readonly release: number;
}

const INSTRUMENTS: Record<PitchedNote["voice"], Instrument> = {
  // A soft pad: two saws a few cents apart beat slowly against each other, which gives it width.
  chords: {
    oscillators: [
      { wave: "sawtooth", detune: -7, gain: 0.5 },
      { wave: "sawtooth", detune: 7, gain: 0.5 },
    ],
    cutoff: 1100,
    level: 0.11,
    attack: 0.06,
    decay: 0.4,
    sustain: 0.75,
    release: 0.3,
  },
  // A round bass with a little square on top, so it can still be heard on small speakers that have no real low end.
  bass: {
    oscillators: [
      { wave: "triangle", detune: 0, gain: 1 },
      { wave: "square", detune: 0, gain: 0.22 },
    ],
    cutoff: 520,
    level: 0.21,
    attack: 0.008,
    decay: 0.2,
    sustain: 0.7,
    release: 0.08,
  },
  // A plain square lead, plucked and then held softly.
  lead: {
    oscillators: [
      { wave: "square", detune: 0, gain: 0.8 },
      { wave: "triangle", detune: 5, gain: 0.5 },
    ],
    cutoff: 2600,
    level: 0.1,
    attack: 0.012,
    decay: 0.25,
    sustain: 0.55,
    release: 0.18,
  },
};

/** Drum hits use the effects' recipe layers (recipes.ts), so they are built by the same code. */
const DRUMS: Record<Drum, readonly Layer[]> = {
  kick: [{ kind: "tone", wave: "sine", start: 0, duration: 0.17, gain: 0.42, from: 135, to: 44 }],
  snare: [
    { kind: "noise", filter: "bandpass", q: 0.8, start: 0, duration: 0.13, gain: 0.26, from: 2100, to: 1500 },
    { kind: "tone", wave: "triangle", start: 0, duration: 0.07, gain: 0.14, from: 200, to: 150 },
  ],
  hat: [{ kind: "noise", filter: "highpass", start: 0, duration: 0.045, gain: 0.1, from: 7000, to: 9000 }],
};

/** The hat a little to one side and the snare a little to the other, as on a drum kit. */
const DRUM_PAN: Record<Drum, number> = { kick: 0, snare: -0.15, hat: 0.25 };
