import type { PlayerId, Terrain } from "../sim";

// Placeholder look, drawn in code (ADR 0001). Original colours, no borrowed art.

export const TERRAIN_COLOURS: Record<Terrain, string> = {
  open: "#4f6b3a",
  rough: "#7a6b47",
  rock: "#56565c",
  water: "#2b5f8a",
};

export const ORE_COLOUR = "#e0b030";
export const ORE_SHADOW = "#7a5a10";

export const TEAM_COLOURS: Record<PlayerId, { fill: string; dark: string; light: string }> = {
  0: { fill: "#3b82d6", dark: "#1d4a80", light: "#a7cdf5" },
  1: { fill: "#d6543b", dark: "#7f2a1b", light: "#f5b5a7" },
};

export const HUD_TEXT = "#f2f2f2";
export const HUD_BG = "rgba(10, 12, 16, 0.75)";
