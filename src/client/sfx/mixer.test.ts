import { describe, expect, it } from "vitest";
import {
  applyMixerAction,
  channelGain,
  DEFAULT_SETTINGS,
  loadSettings,
  type MixerSettings,
  saveSettings,
  SETTINGS_KEY,
  type SettingsStorage,
} from "./mixer";
import { memoryStorage } from "./testing/memoryStorage";

/** A browser with storage blocked throws from every call (SecurityError). */
const blockedStorage: SettingsStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

function volumeOf(s: MixerSettings, channel: "effects" | "music" | "alerts"): number {
  return s.channels[channel].volume;
}

describe("mixer volume and mute", () => {
  it("steps one channel's volume by 10 and leaves the others alone", () => {
    const start = volumeOf(DEFAULT_SETTINGS, "music");
    const up = applyMixerAction(DEFAULT_SETTINGS, { type: "volume", channel: "music", step: 1 });
    expect(volumeOf(up, "music")).toBe(start + 10);
    expect(volumeOf(up, "effects")).toBe(volumeOf(DEFAULT_SETTINGS, "effects"));
    const down = applyMixerAction(up, { type: "volume", channel: "music", step: -1 });
    expect(volumeOf(down, "music")).toBe(start);
  });

  it("keeps volume between 0 and 100", () => {
    let s = DEFAULT_SETTINGS;
    for (let i = 0; i < 15; i++) s = applyMixerAction(s, { type: "volume", channel: "effects", step: 1 });
    expect(volumeOf(s, "effects")).toBe(100);
    for (let i = 0; i < 15; i++) s = applyMixerAction(s, { type: "volume", channel: "effects", step: -1 });
    expect(volumeOf(s, "effects")).toBe(0);
  });

  it("gives full gain at 100, silence at 0 and a quieter gain in between", () => {
    const at = (volume: number): MixerSettings => ({
      ...DEFAULT_SETTINGS,
      channels: { ...DEFAULT_SETTINGS.channels, effects: { volume, muted: false } },
    });
    expect(channelGain(at(100), "effects")).toBe(1);
    expect(channelGain(at(0), "effects")).toBe(0);
    // Squared, so the steps sound even: half the slider is a quarter of the gain.
    expect(channelGain(at(50), "effects")).toBeCloseTo(0.25);
  });

  it("silences a muted channel and brings its volume back on unmute", () => {
    const before = channelGain(DEFAULT_SETTINGS, "alerts");
    const muted = applyMixerAction(DEFAULT_SETTINGS, { type: "mute", channel: "alerts" });
    expect(channelGain(muted, "alerts")).toBe(0);
    expect(channelGain(muted, "effects")).toBeGreaterThan(0);
    const back = applyMixerAction(muted, { type: "mute", channel: "alerts" });
    expect(channelGain(back, "alerts")).toBe(before);
  });

  it("mute-all silences every channel and unmuting returns each to what it was", () => {
    const musicOff = applyMixerAction(DEFAULT_SETTINGS, { type: "mute", channel: "music" });
    const all = applyMixerAction(musicOff, { type: "muteAll" });
    for (const channel of ["effects", "music", "alerts"] as const) expect(channelGain(all, channel)).toBe(0);
    const back = applyMixerAction(all, { type: "muteAll" });
    expect(channelGain(back, "effects")).toBe(channelGain(DEFAULT_SETTINGS, "effects"));
    expect(channelGain(back, "music")).toBe(0);
  });
});

describe("mixer settings storage", () => {
  it("round-trips settings through storage under one key", () => {
    const storage = memoryStorage();
    let s = applyMixerAction(DEFAULT_SETTINGS, { type: "volume", channel: "music", step: -1 });
    s = applyMixerAction(s, { type: "mute", channel: "alerts" });
    s = applyMixerAction(s, { type: "muteAll" });
    saveSettings(storage, s);
    expect([...storage.items.keys()]).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage)).toEqual(s);
  });

  it("starts from the defaults when nothing was saved, storage is missing or it is blocked", () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(blockedStorage)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(blockedStorage, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("falls back to the defaults for anything it cannot read", () => {
    for (const saved of ["not json", "null", "42", "[]", '{"channels":"loud"}']) {
      expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: saved }))).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("keeps the good parts of a damaged save and snaps volumes onto the steps", () => {
    const saved = JSON.stringify({
      channels: { effects: { volume: 37, muted: true }, music: { volume: 900, muted: "yes" }, alerts: { volume: "x" } },
      muteAll: true,
    });
    const s = loadSettings(memoryStorage({ [SETTINGS_KEY]: saved }));
    expect(s.channels.effects).toEqual({ volume: 40, muted: true });
    expect(s.channels.music).toEqual({ volume: 100, muted: DEFAULT_SETTINGS.channels.music.muted });
    expect(s.channels.alerts).toEqual(DEFAULT_SETTINGS.channels.alerts);
    expect(s.muteAll).toBe(true);
  });
});
