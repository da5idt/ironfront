import { describe, expect, it } from "vitest";
import { pickLocalVoice, type VoiceInfo } from "./alertVoice";

/**
 * The fields of a SpeechSynthesisVoice that matter here
 * (https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice):
 * `localService` is true for a voice on the computer and false for one
 * provided by a remote service; `lang` is a BCP 47 tag; `default` marks the
 * app language's default voice.
 */
function voice(name: string, lang: string, localService: boolean, isDefault = false): VoiceInfo {
  return { name, lang, localService, default: isDefault };
}

describe("picking the voice for alerts", () => {
  it("never picks a voice that is not local, even when it is the only one or the best match", () => {
    expect(pickLocalVoice([voice("Cloud UK", "en-GB", false, true)], "en-GB")).toBeNull();
    const voices = [voice("Cloud UK", "en-GB", false, true), voice("Local US", "en-US", true)];
    expect(pickLocalVoice(voices, "en-GB")?.name).toBe("Local US");
  });

  it("has no voice when the list is empty, as it is until the browser has loaded them", () => {
    expect(pickLocalVoice([], "en-US")).toBeNull();
  });

  it("prefers the browser's exact language, then the same language from elsewhere", () => {
    const voices = [voice("US", "en-US", true), voice("UK", "en-GB", true), voice("DE", "de-DE", true)];
    expect(pickLocalVoice(voices, "en-GB")?.name).toBe("UK");
    expect(pickLocalVoice(voices, "en-AU")?.name).toBe("US");
    expect(pickLocalVoice(voices, "de")?.name).toBe("DE");
  });

  it("falls back to an English voice when none speaks the browser's language", () => {
    const voices = [voice("DE", "de-DE", true), voice("UK", "en-GB", true)];
    expect(pickLocalVoice(voices, "fr-FR")?.name).toBe("UK");
  });

  it("has no voice when the local ones speak neither the browser's language nor English", () => {
    expect(pickLocalVoice([voice("DE", "de-DE", true)], "fr-FR")).toBeNull();
  });

  it("takes the default voice among equally good ones", () => {
    const voices = [voice("First", "en-US", true), voice("Usual", "en-US", true, true)];
    expect(pickLocalVoice(voices, "en-US")?.name).toBe("Usual");
  });

  it("reads language tags written with an underscore or in another case", () => {
    // Chrome on Android reports "en_US".
    expect(pickLocalVoice([voice("Phone", "en_US", true)], "en-us")?.name).toBe("Phone");
  });
});
