import { type SoundEvent, soundForEvent } from "./eventSounds";
import { hear, type Listener, type MapPos } from "./hearing";
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
// per-sound caps) and hands the playing to a SoundOutput: the Web Audio
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
  /** Where the player is looking; call when the camera moves. */
  setListener(listener: Listener): void;
  /**
   * Plays a sound effect. With a Map position it gets quieter with distance
   * from the view's centre and is skipped when too far; without one it is an
   * interface sound, heard in full.
   */
  play(name: SoundName, at?: MapPos): void;
  /** Plays the sound of a presentation event. */
  playEvent(event: SoundEvent): void;
}

export function createSfx(output: SoundOutput, storage: SettingsStorage | null): Sfx {
  let settings = loadSettings(storage);
  output.applySettings(settings);
  let listener: Listener | null = null;
  /** When each playing copy of a sound ends, on the output's clock. */
  const playing = new Map<SoundName, number[]>();

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
      const ends = (playing.get(name) ?? []).filter((end) => end > now);
      if (ends.length < recipe.cap) {
        ends.push(now + recipeDuration(recipe));
        output.start(name, heard.gain, heard.pan);
      }
      playing.set(name, ends);
    },
    playEvent(event) {
      const cue = soundForEvent(event);
      sfx.play(cue.name, cue.at);
    },
  };
  return sfx;
}
