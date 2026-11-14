// Every sound effect as data (ADR 0003: sound is generated in code, there are
// no audio files). A recipe is a few layers, each a burst of filtered noise or
// a simple tone whose pitch slides from one frequency to another while it
// fades out. engine.ts turns a recipe into Web Audio nodes; keeping recipes as
// plain data lets their shape be unit tested without a browser.

interface LayerBase {
  /** Seconds after the sound starts. */
  readonly start: number;
  /** Seconds this layer lasts; it fades to silence over that time. */
  readonly duration: number;
  /** Peak loudness, 0..1. */
  readonly gain: number;
  /** Frequency in Hz at the layer's start and end: the tone's pitch, or the noise filter's cutoff. */
  readonly from: number;
  readonly to: number;
  /** Seconds to rise to the peak. Left out, the layer starts with a snap. */
  readonly attack?: number;
}

export interface NoiseLayer extends LayerBase {
  readonly kind: "noise";
  readonly filter: "lowpass" | "bandpass" | "highpass";
  /** The filter's sharpness. Left out, a gentle 1. */
  readonly q?: number;
}

export interface ToneLayer extends LayerBase {
  readonly kind: "tone";
  readonly wave: "sine" | "square" | "sawtooth" | "triangle";
}

export type Layer = NoiseLayer | ToneLayer;

export interface Recipe {
  readonly layers: readonly Layer[];
  /** How many of this sound may play at once, so a big fight does not stack dozens of the same one. */
  readonly cap: number;
}

export const SOUND_NAMES = [
  "rifle",
  "raiderGun",
  "turretCannon",
  "impact",
  "smallExplosion",
  "largeExplosion",
  "unitDeath",
  "buildingPlaced",
  "buildingReady",
  "unitTrained",
  "orderAck",
  "menuClick",
  "cantBuild",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

export const RECIPES: Record<SoundName, Recipe> = {
  // A dry crack with a little body under it.
  rifle: {
    cap: 3,
    layers: [
      { kind: "noise", filter: "bandpass", q: 0.8, start: 0, duration: 0.09, gain: 0.7, from: 2400, to: 900 },
      { kind: "tone", wave: "square", start: 0, duration: 0.05, gain: 0.18, from: 240, to: 90 },
    ],
  },
  // Heavier and lower than the rifle, and a two-round burst so the two are told apart by rhythm as well as pitch.
  raiderGun: {
    cap: 3,
    layers: [
      { kind: "noise", filter: "bandpass", q: 1.2, start: 0, duration: 0.07, gain: 0.65, from: 1300, to: 500 },
      { kind: "tone", wave: "sawtooth", start: 0, duration: 0.06, gain: 0.2, from: 170, to: 70 },
      { kind: "noise", filter: "bandpass", q: 1.2, start: 0.08, duration: 0.09, gain: 0.6, from: 1200, to: 420 },
      { kind: "tone", wave: "sawtooth", start: 0.08, duration: 0.07, gain: 0.18, from: 160, to: 60 },
    ],
  },
  // A boom: a low thump with a rumble that closes down after it.
  turretCannon: {
    cap: 2,
    layers: [
      { kind: "tone", wave: "sine", start: 0, duration: 0.32, gain: 0.6, from: 120, to: 38 },
      { kind: "noise", filter: "lowpass", start: 0, duration: 0.4, gain: 0.6, from: 1800, to: 140 },
      { kind: "noise", filter: "highpass", start: 0, duration: 0.03, gain: 0.25, from: 3000, to: 2000 },
    ],
  },
  // A small bright tick where a shot lands.
  impact: {
    cap: 4,
    layers: [
      { kind: "noise", filter: "highpass", start: 0, duration: 0.05, gain: 0.35, from: 2600, to: 1400 },
      { kind: "tone", wave: "triangle", start: 0, duration: 0.04, gain: 0.2, from: 760, to: 300 },
    ],
  },
  // A vehicle going up: a thud and half a second of closing rumble.
  smallExplosion: {
    cap: 3,
    layers: [
      { kind: "tone", wave: "sine", start: 0, duration: 0.3, gain: 0.55, from: 100, to: 34 },
      { kind: "noise", filter: "lowpass", start: 0, duration: 0.5, gain: 0.7, from: 2200, to: 110 },
    ],
  },
  // A Building coming down: the same idea, longer and deeper, with a second blast and falling debris.
  largeExplosion: {
    cap: 2,
    layers: [
      { kind: "tone", wave: "sine", start: 0, duration: 0.8, gain: 0.6, from: 80, to: 24 },
      { kind: "noise", filter: "lowpass", start: 0, duration: 1.1, gain: 0.7, from: 1600, to: 60 },
      { kind: "noise", filter: "lowpass", start: 0.16, duration: 0.7, gain: 0.45, from: 900, to: 80 },
      { kind: "noise", filter: "bandpass", q: 2, start: 0.3, duration: 0.9, gain: 0.2, from: 2600, to: 500, attack: 0.1 },
    ],
  },
  // A soldier falling: a soft, falling note in a puff of noise. Deliberately not a voice.
  unitDeath: {
    cap: 3,
    layers: [
      { kind: "tone", wave: "triangle", start: 0, duration: 0.24, gain: 0.4, from: 340, to: 110 },
      { kind: "noise", filter: "bandpass", start: 0, duration: 0.16, gain: 0.3, from: 1000, to: 320 },
    ],
  },
  // Something heavy set down, then a latch.
  buildingPlaced: {
    cap: 1,
    layers: [
      { kind: "tone", wave: "sine", start: 0, duration: 0.2, gain: 0.6, from: 150, to: 52 },
      { kind: "noise", filter: "lowpass", start: 0, duration: 0.14, gain: 0.4, from: 700, to: 200 },
      { kind: "tone", wave: "square", start: 0.13, duration: 0.05, gain: 0.12, from: 540, to: 520 },
    ],
  },
  // Two rising notes, a fifth apart: "done".
  buildingReady: {
    cap: 1,
    layers: [
      { kind: "tone", wave: "triangle", start: 0, duration: 0.14, gain: 0.4, from: 440, to: 440, attack: 0.01 },
      { kind: "tone", wave: "triangle", start: 0.13, duration: 0.3, gain: 0.4, from: 660, to: 660, attack: 0.01 },
    ],
  },
  // Three quick rising pips, lighter than the Building's two notes.
  unitTrained: {
    cap: 1,
    layers: [
      { kind: "tone", wave: "sine", start: 0, duration: 0.08, gain: 0.35, from: 392, to: 392, attack: 0.005 },
      { kind: "tone", wave: "sine", start: 0.08, duration: 0.08, gain: 0.35, from: 523, to: 523, attack: 0.005 },
      { kind: "tone", wave: "sine", start: 0.16, duration: 0.18, gain: 0.35, from: 784, to: 784, attack: 0.005 },
    ],
  },
  // A short upward chirp: the order was heard. Quiet, since it plays on every right-click.
  orderAck: {
    cap: 1,
    layers: [{ kind: "tone", wave: "square", start: 0, duration: 0.07, gain: 0.18, from: 820, to: 1150, attack: 0.004 }],
  },
  menuClick: {
    cap: 2,
    layers: [
      { kind: "noise", filter: "highpass", start: 0, duration: 0.015, gain: 0.2, from: 3200, to: 3200 },
      { kind: "tone", wave: "sine", start: 0, duration: 0.04, gain: 0.25, from: 1250, to: 900 },
    ],
  },
  // Two flat low buzzes: "no".
  cantBuild: {
    cap: 1,
    layers: [
      { kind: "tone", wave: "sawtooth", start: 0, duration: 0.09, gain: 0.3, from: 150, to: 132, attack: 0.005 },
      { kind: "tone", wave: "sawtooth", start: 0.12, duration: 0.12, gain: 0.3, from: 150, to: 118, attack: 0.005 },
    ],
  },
};

/** Seconds from the sound's start to the end of its last layer. */
export function recipeDuration(recipe: Recipe): number {
  return Math.max(...recipe.layers.map((layer) => layer.start + layer.duration));
}
