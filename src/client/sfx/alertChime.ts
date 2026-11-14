import { renderRecipe, type SoundEngine, type StartedAudio } from "./engine";
import type { Recipe } from "./recipes";

// The chime that stands in for the words when an alert cannot be spoken
// (ADR 0003: made in code like every other sound).

/**
 * A soft bell that dips and comes back up: three sine notes, each with a
 * quiet partial an octave and a fifth above so it rings rather than beeps.
 * The sound effects' own "done" jingles only rise and use plainer waves, so
 * this is told apart from them by ear.
 */
export const ALERT_CHIME: Recipe = {
  cap: 1,
  layers: [
    { kind: "tone", wave: "sine", start: 0, duration: 0.3, gain: 0.4, from: 988, to: 988, attack: 0.005 },
    { kind: "tone", wave: "sine", start: 0, duration: 0.16, gain: 0.08, from: 2964, to: 2964, attack: 0.005 },
    { kind: "tone", wave: "sine", start: 0.14, duration: 0.3, gain: 0.4, from: 784, to: 784, attack: 0.005 },
    { kind: "tone", wave: "sine", start: 0.14, duration: 0.16, gain: 0.08, from: 2352, to: 2352, attack: 0.005 },
    { kind: "tone", wave: "sine", start: 0.28, duration: 0.6, gain: 0.45, from: 1175, to: 1175, attack: 0.005 },
    { kind: "tone", wave: "sine", start: 0.28, duration: 0.3, gain: 0.09, from: 3525, to: 3525, attack: 0.005 },
  ],
};

/** A function that plays the chime on the alerts channel, so it follows that channel's volume and mute. */
export function createAlertChime(engine: Pick<SoundEngine, "whenStarted">): () => void {
  let audio: StartedAudio | null = null;
  engine.whenStarted((started) => (audio = started));
  return () => {
    // Before the first click or key press there is no sound yet; the alert's text still shows.
    if (!audio) return;
    renderRecipe(audio.context, ALERT_CHIME, audio.channels.alerts, audio.context.currentTime);
  };
}
