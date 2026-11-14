import { type AlertEvent, type AlertQueue, alertText, EMPTY_ALERTS, raiseAlert, takeAlert } from "./alertQueue";

// The one way the game raises an alert. It says alerts one at a time through
// an AlertVoice (the browser's speech in the game, a recorder in tests) and,
// whenever an alert cannot be spoken, plays a chime and shows its text.
// It keeps no clock: every call is given the time, in seconds of play.

/** What says the words. alertVoice.ts is the real one. */
export interface AlertVoice {
  /**
   * Starts saying `text` at `volume` (0..1). False when it cannot, as there
   * is no voice to say it with. Otherwise `ended` is called once when the
   * words stop: true if they were said (or cut off by cancel), false if the
   * browser refused them.
   */
  say(text: string, volume: number, ended: (said: boolean) => void): boolean;
  /** Stops what is being said, at once. */
  cancel(): void;
}

export interface Alerts {
  /** Reports an event. `nowSeconds` is play time: a clock that stops while the game is paused. */
  raise(event: AlertEvent, nowSeconds: number): void;
  /** Call every frame: says the next alert once the last has ended, and falls silent while paused. */
  update(nowSeconds: number, paused: boolean): void;
  /** The alert text to show on screen now, or null. Only alerts that were not spoken are shown. */
  banner(nowSeconds: number): string | null;
}

/** How long an unspoken alert's text stays on screen. */
export const BANNER_SECONDS = 3;
/** How long an unspoken alert keeps the next one waiting, so each text can be read and the chimes do not run together. */
export const UNSPOKEN_GAP_S = 1.5;
/** Browsers sometimes never report that speech ended; after this long the alert is taken as over. */
const LONGEST_SPEECH_S = 8;

export function createAlerts(parts: {
  readonly voice: AlertVoice;
  /** Plays the chime that stands in for the words. */
  readonly chime: () => void;
  /** The alerts channel's volume, 0..1; 0 when it is muted. */
  readonly volume: () => number;
}): Alerts {
  const { voice, chime, volume } = parts;
  let queue: AlertQueue = EMPTY_ALERTS;
  /** The alert being said. A new object per alert, so a late report about an old one is told apart. */
  let speaking: { readonly since: number } | null = null;
  /** Text the voice was given and then refused, still to be shown. */
  let refused: string | null = null;
  let quietUntil = 0;
  let banner: { readonly text: string; readonly until: number } | null = null;

  function showInstead(text: string, now: number): void {
    chime();
    banner = { text, until: now + BANNER_SECONDS };
    quietUntil = now + UNSPOKEN_GAP_S;
  }

  function stopSpeaking(): void {
    speaking = null;
    voice.cancel();
  }

  return {
    raise(event, nowSeconds) {
      queue = raiseAlert(queue, event, nowSeconds);
    },
    update(now, paused) {
      if (paused) {
        // Cut off rather than held: a browser's own pause of speech is not dependable, and an alert is only a few words.
        if (speaking) stopSpeaking();
        return;
      }
      if (speaking && (volume() === 0 || now - speaking.since > LONGEST_SPEECH_S)) stopSpeaking();
      if (refused !== null) {
        showInstead(refused, now);
        refused = null;
      }
      if (speaking || now < quietUntil) return;
      const next = takeAlert(queue, now);
      queue = next.queue;
      if (next.alert === null) return;
      const text = alertText({ kind: next.alert });
      const level = volume();
      const mine = { since: now };
      // Set before asking, so an end reported straight away is not missed.
      speaking = mine;
      const started =
        level > 0 &&
        voice.say(text, level, (said) => {
          if (speaking !== mine) return;
          speaking = null;
          if (!said) refused = text;
        });
      if (!started) {
        speaking = null;
        showInstead(text, now);
      }
    },
    banner: (now) => (banner && now < banner.until ? banner.text : null),
  };
}
