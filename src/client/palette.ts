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

export const SELECTION_MARKER = "#f4f4a0";
export const HEALTH_BACK = "rgba(0, 0, 0, 0.7)";
export const HEALTH_GOOD = "#5fd35f";
export const HEALTH_LOW = "#e04a3a";
export const MOVE_MARKER = "#8ef08e";
export const SHOT_TRACER = "#fff2a8";
export const DRAG_BOX_LINE = "#d8f0d8";
export const DRAG_BOX_FILL = "rgba(200, 240, 200, 0.12)";

export const HUD_TEXT = "#f2f2f2";
export const HUD_BG = "rgba(10, 12, 16, 0.75)";
