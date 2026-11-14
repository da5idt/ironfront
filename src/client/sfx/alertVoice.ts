import type { AlertVoice } from "./alerts";

// The browser's speech synthesis as an AlertVoice: thin, and checked in a
// browser rather than unit tested. The one rule that matters lives in
// pickLocalVoice, which is pure and tested: only a voice on the computer
// itself is ever used. A browser may also list voices run by a remote
// service, and speaking with one sends the text there; nothing the game does
// may leave the machine (spec #16), so with no local voice the alert is not
// spoken at all and alerts.ts falls back to the chime and the text.

/** The parts of a SpeechSynthesisVoice the choice is made on. */
export interface VoiceInfo {
  readonly name: string;
  /** A BCP 47 language tag such as "en-GB". */
  readonly lang: string;
  /** True for a voice on the computer; false for one a remote service provides. */
  readonly localService: boolean;
  readonly default: boolean;
}

/** Some browsers write "en_US"; case is not meaningful in a language tag. */
const tag = (lang: string): string => lang.replace(/_/g, "-").toLowerCase();
const language = (lang: string): string => tag(lang).split("-")[0] ?? "";

/**
 * The local voice to speak alerts with, or null when there is none fit for
 * it. The alerts are English words, and a voice for another language reads
 * them badly, so only English voices will do: the browser's own English
 * (say en-GB) first, then any other. With none, the chime and the words on
 * screen serve better.
 */
export function pickLocalVoice<V extends VoiceInfo>(voices: readonly V[], browserLanguage: string): V | null {
  // Strictly true: a voice that does not say where it runs is not trusted to be local.
  const local = voices.filter((v) => v.localService === true && language(v.lang) === "en");
  const wanted = [(v: V) => tag(v.lang) === tag(browserLanguage), () => true];
  for (const fits of wanted) {
    const fitting = local.filter(fits);
    const pick = fitting.find((v) => v.default) ?? fitting[0];
    if (pick) return pick;
  }
  return null;
}

const NO_VOICE: AlertVoice = { say: () => false, cancel: () => {} };

/** The browser's voice, or one that never speaks where the browser has no speech synthesis. */
export function createAlertVoice(): AlertVoice {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return NO_VOICE;
  }
  const synth = window.speechSynthesis;
  // The list is empty at first in most browsers and arrives later, announced by voiceschanged.
  let voices: SpeechSynthesisVoice[] = [];
  const loadVoices = (): void => {
    try {
      voices = synth.getVoices();
    } catch {
      voices = [];
    }
  };
  loadVoices();
  // Older Safari has speech synthesis that is not an event target; there the list is simply read again before each alert.
  synth.addEventListener?.("voiceschanged", loadVoices);
  /** Held on to while it speaks: some browsers drop an utterance nobody references and then never report its end. */
  let current: SpeechSynthesisUtterance | null = null;

  return {
    say(text, volume, ended) {
      if (voices.length === 0) loadVoices();
      const voice = pickLocalVoice(voices, navigator.language);
      if (!voice) return false;
      const utterance = new SpeechSynthesisUtterance(text);
      // Always named: an utterance without a voice gets the browser's default, which may be a remote one.
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.volume = Math.min(1, Math.max(0, volume));
      const finish = (said: boolean): void => {
        if (current !== utterance) return;
        current = null;
        ended(said);
      };
      utterance.onend = () => finish(true);
      // Being cut off by cancel() is reported as an error too, but those words were not refused.
      utterance.onerror = (e) => finish(e.error === "canceled" || e.error === "interrupted");
      current = utterance;
      try {
        synth.speak(utterance);
      } catch {
        current = null;
        return false;
      }
      return true;
    },
    cancel() {
      try {
        synth.cancel();
      } catch {
        // Nothing was being said, then.
      }
    },
  };
}
