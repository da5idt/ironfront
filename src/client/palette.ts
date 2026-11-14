import type { Visibility } from "../sim";
import { ART } from "./art/artPalette";

// Interface colours. Art colours (terrain, Ore, teams, concrete and so on)
// live in the one art table, ART in ./art/artPalette (ADR 0003).

/** Opacity (0..255) of the black laid over each Cell: Unexplored hides all, Fogged dims. */
export const FOG_ALPHA: Record<Visibility, number> = {
  unexplored: 255,
  fogged: 140,
  visible: 0,
};

export const SELECTION_MARKER = ART.marker.selection;
export const MOVE_MARKER = "#8ef08e";
export const RALLY_LINE = "rgba(244, 244, 160, 0.7)";
export const RALLY_FLAG = "#f0c040";
export const DRAG_BOX_LINE = "#d8f0d8";
export const DRAG_BOX_FILL = "rgba(200, 240, 200, 0.12)";

export const HUD_TEXT = "#f2f2f2";
export const HUD_BG = "rgba(10, 12, 16, 0.75)";

export const BUTTON_BG = "#222833";
export const BUTTON_EDGE = "#3a414c";
export const BUTTON_PROGRESS = "rgba(80, 140, 220, 0.45)";
export const BUTTON_READY = "rgba(95, 211, 95, 0.4)";
export const BUTTON_DISABLED_TEXT = "#6b717b";
/** The key number badge on a button: the frame's own colour, so the badge reads as part of the button. */
export const BUTTON_KEY_BG = BUTTON_EDGE;
/** The dark well a button's picture sits in. */
export const BUTTON_WELL = "#0d1014";
export const BUTTON_COST = "#f0c040";
export const BUTTON_READY_EDGE = "#5fd35f";
/** The frame round the button of the Building being placed. */
export const BUTTON_PLACING_EDGE = "#f4f4a0";
/** The sound strip: lit and unlit steps of a volume level, and a muted channel's mark. */
export const VOLUME_ON = "#6fb0e0";
export const VOLUME_OFF = "#2c323c";
export const SOUND_MUTED = "#f06a55";
/** The banner that shows an alert's text when it is not spoken. */
export const ALERT_BG = "#15181e";
export const ALERT_EDGE = "#f0c040";
export const ALERT_TEXT = "#f2f2f2";

export const PANEL_BG = "#15181e";
export const PANEL_EDGE = "#2c323c";
export const MINIMAP_BACK = "#000";
export const MINIMAP_FRAME = "#f2f2f2";

/** The Victory, defeat and Paused screens. */
export const SCREEN_DIM = "rgba(0, 0, 0, 0.6)";
export const SCREEN_TONES = { good: "#7fe07f", bad: "#f06a55", neutral: "#f2f2f2" } as const;
