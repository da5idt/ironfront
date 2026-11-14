import type { PlayerId, Terrain, Visibility } from "../sim";
import { ART } from "./art/artPalette";

// Interface colours. Art colours (terrain, Ore, teams, concrete and so on)
// live in the one art table, ART in ./art/artPalette (ADR 0003); the names
// below that point into it are kept for the code that still uses them.

/** One flat colour per terrain, where a single pixel stands for a Cell (the minimap). */
export const TERRAIN_COLOURS: Record<Terrain, string> = {
  open: ART.terrain.open[1],
  rough: ART.terrain.rough[2],
  rock: ART.terrain.rock[2],
  water: ART.terrain.water[2],
};

/** Opacity (0..255) of the black laid over each Cell: Unexplored hides all, Fogged dims. */
export const FOG_ALPHA: Record<Visibility, number> = {
  unexplored: 255,
  fogged: 140,
  visible: 0,
};

export const ORE_COLOUR = ART.ore.mid;

export const TEAM_COLOURS: Record<PlayerId, { fill: string; dark: string; light: string }> = {
  0: { fill: ART.team[0].mid, dark: ART.team[0].dark, light: ART.team[0].light },
  1: { fill: ART.team[1].mid, dark: ART.team[1].dark, light: ART.team[1].light },
};

export const SELECTION_MARKER = "#f4f4a0";
export const HEALTH_BACK = "rgba(0, 0, 0, 0.7)";
export const HEALTH_GOOD = "#5fd35f";
export const HEALTH_LOW = "#e04a3a";
export const MOVE_MARKER = "#8ef08e";
export const RALLY_LINE = "rgba(244, 244, 160, 0.7)";
export const RALLY_FLAG = "#f0c040";
export const SHOT_TRACER = "#fff2a8";
export const DRAG_BOX_LINE = "#d8f0d8";
export const DRAG_BOX_FILL = "rgba(200, 240, 200, 0.12)";

export const HUD_TEXT = "#f2f2f2";
export const HUD_BG = "rgba(10, 12, 16, 0.75)";

export const BUTTON_BG = "#222833";
export const BUTTON_EDGE = "#3a414c";
export const BUTTON_PROGRESS = "rgba(80, 140, 220, 0.45)";
export const BUTTON_READY = "rgba(95, 211, 95, 0.4)";
export const BUTTON_DISABLED_TEXT = "#6b717b";
/** The key number badge on a button. */
export const BUTTON_KEY_BG = "#3a414c";
export const PLACE_VALID = "rgba(95, 211, 95, 0.45)";
export const PLACE_INVALID = "rgba(224, 74, 58, 0.5)";

export const PANEL_BG = "#15181e";
export const PANEL_EDGE = "#2c323c";
export const MINIMAP_BACK = "#000";
export const MINIMAP_FRAME = "#f2f2f2";

/** The Victory, defeat and Paused screens. */
export const SCREEN_DIM = "rgba(0, 0, 0, 0.6)";
export const SCREEN_TONES = { good: "#7fe07f", bad: "#f06a55", neutral: "#f2f2f2" } as const;
