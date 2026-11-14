import type { PlayerId, Terrain } from "../../sim";

// The one table of art colours (ADR 0003): recolouring the game is an edit
// here. Ramps run dark to light. Original colours, chosen for this game.

/** Three steps of one hue: shadow, body and highlight. */
export interface Ramp {
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
}

export const ART = {
  /** Four close shades per terrain, mixed by noise so the ground reads as texture, not flat fill. */
  terrain: {
    open: ["#4a6436", "#4f6b3a", "#56763f", "#5d7d44"],
    rough: ["#665838", "#6f6040", "#7a6b47", "#85764f"],
    rock: ["#5a5a62", "#64646c", "#6e6e78", "#787882"],
    water: ["#24507c", "#28588a", "#2b5f8a", "#2f6896"],
  },
  grassTuft: { dark: "#3e5530", light: "#7d9a52" },
  pebble: { dark: "#4f4329", light: "#a39265" },
  rockFace: { crack: "#2e2e33", shade: "#44444b", light: "#9a9aa4" },
  /** The sand band where water meets land, plus the foam line just off it. */
  shore: { sand: ["#a8945c", "#b8a46a", "#c9b680"], wet: "#7d8a6a", foam: "#9cc8ea" },
  /** Sparkles that come and go on open water. */
  glint: { dim: "#6fa6d4", bright: "#cfe8f8" },
  ore: { stain: "#3f3a24", shadow: "#5a3f0c", dark: "#a8781e", mid: "#e0b030", light: "#fff2a8" },
  /** Fog of War is this colour at the alphas in FOG_ALPHA; a hint of blue keeps it from looking like a hole. */
  fog: "#05070b",
  /** Concrete and metal for Buildings, darkest first. */
  concrete: ["#14161a", "#2b2f35", "#3e434a", "#5b6168", "#7b828a", "#9aa1a9", "#c4cad1"],
  team: {
    0: { dark: "#1d4a80", mid: "#3b82d6", light: "#a7cdf5" },
    1: { dark: "#7f2a1b", mid: "#d6543b", light: "#f5b5a7" },
  },
  glass: { dark: "#0f1a24", mid: "#3f7aa0", light: "#a8e2ff" },
  windowLight: { dark: "#2a2d33", mid: "#f2d27a", light: "#fff2b8" },
  fire: ["#b8381a", "#f07a24", "#ffc040", "#fffbe0"],
  smoke: ["#262320", "#3a342c", "#5a544c", "#8a847a"],
  scorch: "#14100a",
  /** Minimap and frame trims around the Map view. */
  frame: { dark: "#0c0e12", mid: "#3a414c", light: "#6b7480" },
} as const satisfies {
  readonly terrain: Record<Terrain, readonly string[]>;
  readonly team: Record<PlayerId, Ramp>;
  readonly [part: string]: unknown;
};
