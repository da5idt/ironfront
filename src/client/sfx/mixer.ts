// The sound mixer's settings and maths: three channels, each with a volume
// and a mute, plus mute-all. Pure, so it is unit tested; the Web Audio side
// (engine.ts) only turns channelGain into gain node values.

export const CHANNELS = ["effects", "music", "alerts"] as const;
export type Channel = (typeof CHANNELS)[number];

export const VOLUME_STEP = 10;
export const VOLUME_MAX = 100;

export interface ChannelSettings {
  /** 0 to 100 in steps of 10. */
  readonly volume: number;
  readonly muted: boolean;
}

export interface MixerSettings {
  readonly channels: Readonly<Record<Channel, ChannelSettings>>;
  /** Silences everything without touching the channels, so unmuting brings each back as it was. */
  readonly muteAll: boolean;
}

/** Music sits under the effects, and alerts on top, so a first Match is balanced before anyone touches a volume. */
export const DEFAULT_SETTINGS: MixerSettings = {
  channels: {
    effects: { volume: 70, muted: false },
    music: { volume: 50, muted: false },
    alerts: { volume: 80, muted: false },
  },
  muteAll: false,
};

export type MixerAction =
  | { readonly type: "volume"; readonly channel: Channel; readonly step: -1 | 1 }
  | { readonly type: "mute"; readonly channel: Channel }
  | { readonly type: "muteAll" };

export function applyMixerAction(settings: MixerSettings, action: MixerAction): MixerSettings {
  if (action.type === "muteAll") return { ...settings, muteAll: !settings.muteAll };
  const channel = settings.channels[action.channel];
  const next: ChannelSettings =
    action.type === "mute"
      ? { ...channel, muted: !channel.muted }
      : { ...channel, volume: snapVolume(channel.volume + action.step * VOLUME_STEP) };
  return { ...settings, channels: { ...settings.channels, [action.channel]: next } };
}

/** What a channel's gain node is set to, 0..1. */
export function channelGain(settings: MixerSettings, channel: Channel): number {
  const { volume, muted } = settings.channels[channel];
  if (settings.muteAll || muted) return 0;
  // Loudness is heard roughly as the square of the setting, so squaring makes the ten steps sound evenly spaced.
  return (volume / VOLUME_MAX) ** 2;
}

function snapVolume(volume: number): number {
  return Math.min(VOLUME_MAX, Math.max(0, Math.round(volume / VOLUME_STEP) * VOLUME_STEP));
}

/** The one local storage key the sound settings live under. A client preference, not a save-game format. */
export const SETTINGS_KEY = "ironfront.sound";

/** The part of the browser's localStorage the mixer uses, so tests can pass a stand-in. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The browser's storage, or null where it is blocked: the read of
 * `localStorage` itself then throws, so it is passed in as a function. Sound
 * settings are not worth failing over; without storage they last one visit.
 */
export function storageOrNull(open: () => SettingsStorage): SettingsStorage | null {
  try {
    return open();
  } catch {
    return null;
  }
}

/**
 * The saved settings, or the defaults. Storage can be missing (or blocked,
 * which storageOrNull turns into missing) or hold anything at all, and sound settings are never worth
 * failing over: whatever cannot be read falls back to its default.
 */
export function loadSettings(storage: SettingsStorage | null): MixerSettings {
  let saved: unknown;
  try {
    saved = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "null");
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isRecord(saved)) return DEFAULT_SETTINGS;
  const savedChannels = isRecord(saved.channels) ? saved.channels : {};
  const channel = (name: Channel): ChannelSettings => {
    const fallback = DEFAULT_SETTINGS.channels[name];
    const c = savedChannels[name];
    if (!isRecord(c)) return fallback;
    return {
      volume: typeof c.volume === "number" && Number.isFinite(c.volume) ? snapVolume(c.volume) : fallback.volume,
      muted: typeof c.muted === "boolean" ? c.muted : fallback.muted,
    };
  };
  return {
    channels: { effects: channel("effects"), music: channel("music"), alerts: channel("alerts") },
    muteAll: typeof saved.muteAll === "boolean" ? saved.muteAll : DEFAULT_SETTINGS.muteAll,
  };
}

export function saveSettings(storage: SettingsStorage | null, settings: MixerSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Blocked or full storage only means the settings last for this visit.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
