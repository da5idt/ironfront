import { type Channel, channelGain, CHANNELS, DEFAULT_SETTINGS, type MixerSettings } from "./mixer";
import { type Layer, type Recipe, RECIPES } from "./recipes";
import type { SoundOutput } from "./sfx";

// The Web Audio side of sound: thin on purpose and checked by ear, since it
// cannot be unit tested. Everything worth testing (settings, volume maths,
// fall-off, caps, the recipes themselves) lives in the pure modules beside it.
//
// The graph: each channel (effects, music, alerts) has one gain node that
// follows the mixer settings; all three run through one limiter to the
// speakers. Effects, the alert chime and the music each connect to their
// channel's gain node and never to the speakers directly, so volume, mute and
// mute-all work for all of them without any of them knowing.

/** What is there once sound has started: connect sources to a channel's node, schedule on the context's clock. */
export interface StartedAudio {
  readonly context: AudioContext;
  /** One input per mixer channel. Its gain is the mixer's; do not set it, connect to it. */
  readonly channels: Readonly<Record<Channel, GainNode>>;
}

export interface SoundEngine extends SoundOutput {
  /**
   * Call from every click and key press. Browsers only let sound start from
   * one, so the first call creates the audio context; later calls wake it if
   * the browser put it to sleep.
   */
  unlock(): void;
  /** True once unlock has been called: the person has clicked or pressed a key, so sound of any kind may start. */
  unlocked(): boolean;
  /** Freezes all sound, music and the audio clock while the game is paused, and carries on from there after. */
  setPaused(paused: boolean): void;
  /**
   * Runs `use` once sound has started (at the first click or key press), or
   * at once if it already has. Where the alert chime and the music get their
   * context and their channel to connect to.
   */
  whenStarted(use: (audio: StartedAudio) => void): void;
}

export function createSoundEngine(): SoundEngine {
  let audio: StartedAudio | null = null;
  let settings: MixerSettings = DEFAULT_SETTINGS;
  let paused = false;
  /** Kept apart from `audio`: a browser without Web Audio never has that, and may still speak the alerts. */
  let unlocked = false;
  const waiting: ((audio: StartedAudio) => void)[] = [];

  function setGains(): void {
    if (!audio) return;
    for (const channel of CHANNELS) audio.channels[channel].gain.value = channelGain(settings, channel);
  }

  function start(): StartedAudio | null {
    // A browser without Web Audio just stays silent; the game never needs sound to work.
    if (typeof AudioContext === "undefined") return null;
    try {
      const context = new AudioContext();
      // Many sounds at once add up past full scale; the limiter squeezes the peaks rather than letting them crackle.
      const limiter = new DynamicsCompressorNode(context, { threshold: -12, knee: 6, ratio: 12, attack: 0.003, release: 0.2 });
      limiter.connect(context.destination);
      const channelNode = (): GainNode => {
        const node = new GainNode(context);
        node.connect(limiter);
        return node;
      };
      return { context, channels: { effects: channelNode(), music: channelNode(), alerts: channelNode() } };
    } catch {
      return null;
    }
  }

  /** Suspend and resume report failure through promises; a refusal only means silence, so it is dropped. */
  function follow(context: AudioContext): void {
    if (paused && context.state === "running") void context.suspend().catch(() => {});
    else if (!paused && context.state === "suspended") void context.resume().catch(() => {});
  }

  return {
    unlock() {
      unlocked = true;
      if (audio) {
        follow(audio.context);
        return;
      }
      audio = start();
      if (!audio) return;
      setGains();
      follow(audio.context);
      for (const use of waiting.splice(0)) use(audio);
    },
    unlocked: () => unlocked,
    setPaused(next) {
      paused = next;
      if (audio) follow(audio.context);
    },
    whenStarted(use) {
      if (audio) use(audio);
      else waiting.push(use);
    },
    now() {
      return audio && !paused ? audio.context.currentTime : null;
    },
    start(name, gain, pan) {
      if (!audio) return;
      const recipe = RECIPES[name];
      // Battle sounds (the ones allowed to overlap) each play at a slightly different pitch, so a volley is not one sound copied.
      const pitch = recipe.cap > 1 ? 0.94 + Math.random() * 0.12 : 1;
      renderRecipe(audio.context, recipe, audio.channels.effects, audio.context.currentTime, { gain, pan, pitch });
    },
    applySettings(next) {
      settings = next;
      setGains();
    },
  };
}

/** Where a fade ends and the layer is cut: exponential ramps cannot reach zero, and this far down (about -48 dB) the cut is not heard. */
const SILENCE = 0.004;
/** A layer with no attack of its own still rises over this long, as a jump from silence clicks. */
const SNAP_ATTACK_S = 0.002;

/**
 * Calls `done` once the last of `sources` has ended. A node that stays
 * connected is kept by the graph for as long as the context lives, finished
 * or not, so everything built for one sound is taken out again when it ends;
 * a long Match plays many thousands of them.
 */
export function whenAllEnded(sources: readonly AudioScheduledSourceNode[], done: () => void): void {
  let left = sources.length;
  if (left === 0) done();
  for (const source of sources) {
    source.onended = () => {
      if (--left === 0) done();
    };
  }
}

/**
 * Builds a recipe's nodes and schedules them at `when` on the context's
 * clock, and takes them out of the graph again when the sound has played.
 * Takes any context, so the same code plays in the game and renders into an
 * OfflineAudioContext for checking.
 */
export function renderRecipe(
  context: BaseAudioContext,
  recipe: Pick<Recipe, "layers">,
  destination: AudioNode,
  when: number,
  voice: { readonly gain: number; readonly pan: number; readonly pitch: number } = { gain: 1, pan: 0, pitch: 1 },
): void {
  const out = new GainNode(context, { gain: voice.gain });
  const panner = new StereoPannerNode(context, { pan: voice.pan });
  out.connect(panner).connect(destination);
  const built: AudioNode[] = [out, panner];
  const sources: AudioScheduledSourceNode[] = [];
  for (const layer of recipe.layers) {
    const t0 = when + layer.start;
    const end = t0 + layer.duration;
    const envelope = new GainNode(context, { gain: SILENCE });
    envelope.gain.setValueAtTime(SILENCE, t0);
    envelope.gain.linearRampToValueAtTime(layer.gain, t0 + Math.min(layer.attack ?? SNAP_ATTACK_S, layer.duration / 2));
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
    envelope.connect(out);
    const { source, nodes } = layerSource(context, layer, t0, end, voice.pitch, envelope);
    source.start(t0);
    source.stop(end);
    sources.push(source);
    built.push(envelope, ...nodes);
  }
  whenAllEnded(sources, () => {
    for (const node of built) node.disconnect();
  });
}

function layerSource(
  context: BaseAudioContext,
  layer: Layer,
  t0: number,
  end: number,
  pitch: number,
  envelope: AudioNode,
): { readonly source: AudioScheduledSourceNode; /** Everything made for the layer, the source too. */ readonly nodes: readonly AudioNode[] } {
  const slide = (param: AudioParam): void => {
    param.setValueAtTime(layer.from * pitch, t0);
    param.exponentialRampToValueAtTime(layer.to * pitch, end);
  };
  if (layer.kind === "tone") {
    const oscillator = new OscillatorNode(context, { type: layer.wave });
    slide(oscillator.frequency);
    oscillator.connect(envelope);
    return { source: oscillator, nodes: [oscillator] };
  }
  const noise = new AudioBufferSourceNode(context, { buffer: noiseBuffer(context), loop: true });
  const filter = new BiquadFilterNode(context, { type: layer.filter, Q: layer.q ?? 1 });
  slide(filter.frequency);
  noise.connect(filter).connect(envelope);
  return { source: noise, nodes: [noise, filter] };
}

const NOISE_SECONDS = 2;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** White noise, made once per context and shared by every noise layer. */
function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, Math.floor(context.sampleRate * NOISE_SECONDS), context.sampleRate);
    const samples = buffer.getChannelData(0);
    // Not the Simulation: how the hiss sounds changes nothing in the Match, so unseeded random is fine here (ADR 0002).
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noiseBuffers.set(context, buffer);
  }
  return buffer;
}
