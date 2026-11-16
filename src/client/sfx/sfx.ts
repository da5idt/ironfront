import type { Vec } from "../../sim";
import type { PresentationEvent } from "../presentation";
import { soundsForEvent } from "./eventCues";
import { hear, type Listener } from "./hearing";
import {
  applyMixerAction,
  loadSettings,
  type MixerAction,
  type MixerSettings,
  saveSettings,
  type SettingsStorage,
} from "./mixer";
import { RECIPES, recipeDuration, type SoundName } from "./recipes";

// The one way the game makes a sound effect and changes the sound settings.
// It decides whether a sound plays and how loud (distance from the view,
// per-sound caps and gaps) and hands the playing to a SoundOutput: the Web Audio
// engine in the game, a recorder in tests.

/** What actually makes the noise. engine.ts is the real one. */
export interface SoundOutput {
  /** Seconds on the output's clock, or null while nothing can play (before the first input, or paused). */
  now(): number | null;
  /** Plays a sound now. `gain` is 0..1 on top of the channel's volume; `pan` is -1 (left) to 1 (right). */
  start(name: SoundName, gain: number, pan: number): void;
  applySettings(settings: MixerSettings): void;
}

export interface Sfx {
  settings(): MixerSettings;
  /** Changes the settings, applies them at once and saves them. */
  apply(action: MixerAction): void;
  /** Where the person playing is looking; call when the camera moves. */
  setListener(listener: Listener): void;
  /**
   * Plays a sound effect. With a Map position it gets quieter with distance
   * from the view's centre and is skipped when too far; without one it is an
   * interface sound, heard in full.
   */
  play(name: SoundName, at?: Vec): void;
  /** Plays the sound effects of a presentation event, if it has any. */
  playEvent(event: PresentationEvent): void;
}

/**
 * How much louder (in gain, 0..1) a sound with a gap must be than an earlier
 * start of it not to be held back by that start: half the drop from the centre
 * of the view to its corner. The gap is there so that work near by does not
 * drone; a faint start far off must not use it to silence work in front of
 * the person. At most four starts can each be this much louder than the last.
 */
export const CLEARLY_LOUDER = 0.25;

/** One start of a sound, on the output's clock. */
interface Started {
  readonly start: number;
  readonly end: number;
  readonly gain: number;
}

export function createSfx(output: SoundOutput, storage: SettingsStorage | null): Sfx {
  let settings = loadSettings(storage);
  output.applySettings(settings);
  let listener: Listener | null = null;
  /** The starts of each sound that still count: playing, or within the sound's gap. */
  const recent = new Map<SoundName, Started[]>();

  const sfx: Sfx = {
    settings: () => settings,
    apply(action) {
      settings = applyMixerAction(settings, action);
      output.applySettings(settings);
      saveSettings(storage, settings);
    },
    setListener(next) {
      listener = next;
    },
    play(name, at) {
      const now = output.now();
      // A sound that cannot play now is dropped: played late it would be about nothing on screen.
      if (now === null) return;
      const heard = at && listener ? hear(listener, at) : { gain: 1, pan: 0 };
      if (!heard) return;
      const recipe = RECIPES[name];
      const gap = recipe.gap;
      // Checked after the distance, so one skipped far away does not silence the next one near by.
      const starts = (recent.get(name) ?? []).filter((s) => s.end > now || now - s.start < (gap ?? 0));
      recent.set(name, starts);
      // For a sound with a gap, a start clearly fainter than this one holds it back neither by the gap nor by the cap.
      const counted = gap === undefined ? starts : starts.filter((s) => heard.gain < s.gain + CLEARLY_LOUDER);
      if (gap !== undefined && counted.some((s) => now - s.start < gap)) return;
      if (counted.filter((s) => s.end > now).length >= recipe.cap) return;
      starts.push({ start: now, end: now + recipeDuration(recipe), gain: heard.gain });
      output.start(name, heard.gain, heard.pan);
    },
    playEvent(event) {
      for (const cue of soundsForEvent(event)) sfx.play(cue.name, cue.at);
    },
  };
  return sfx;
}
