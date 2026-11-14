import { EDGE_PX, type Size } from "./camera";

// Screen layout shared by the renderer and input: a side panel on the left,
// with the minimap at the top, the build/train buttons below it and the sound
// strip at the bottom, and the Map view filling the rest. The Map view does not start at x 0, so screen
// points go through toMapView before any camera maths.

export const PANEL_WIDTH = 220;
export const MINIMAP_MARGIN = 10;
/**
 * The panel's outer left strip that still scrolls left, so the far left of the
 * screen keeps edge-scrolling. Narrower than the margin round the buttons, so
 * using the menu never scrolls the Map.
 */
export const PANEL_EDGE_SCROLL_PX = 4;
/** Room at the bottom of the panel for the sound settings: a heading, a row per channel and the mute-all button. */
export const SOUND_STRIP_HEIGHT = 128;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  /** Where the Map is drawn. The camera's screen size is this rect's size. */
  readonly mapView: Rect;
  readonly panel: Rect;
  /** Square minimap at the top of the panel. */
  readonly minimap: Rect;
  /** Space for buttons, below the minimap and above the sound strip. */
  readonly buttons: Rect;
  /** The sound settings, at the bottom of the panel. */
  readonly soundStrip: Rect;
}

export function computeLayout(screen: Size): Layout {
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(0, screen.width - 200));
  const panel = { x: 0, y: 0, width: panelWidth, height: screen.height };
  const side = Math.max(0, panelWidth - MINIMAP_MARGIN * 2);
  const minimap = { x: panel.x + MINIMAP_MARGIN, y: MINIMAP_MARGIN, width: side, height: side };
  const buttonsTop = minimap.y + minimap.height + MINIMAP_MARGIN;
  // On a screen too short for both, the buttons give way: the strip keeps to the bottom but never climbs over the minimap.
  const stripTop = Math.max(buttonsTop, screen.height - SOUND_STRIP_HEIGHT);
  return {
    mapView: { x: panelWidth, y: 0, width: screen.width - panelWidth, height: screen.height },
    panel,
    minimap,
    buttons: { x: panel.x, y: buttonsTop, width: panelWidth, height: stripTop - buttonsTop },
    soundStrip: { x: panel.x, y: stripTop, width: panelWidth, height: Math.max(0, screen.height - stripTop) },
  };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
}

/** A screen point in the Map view's own pixels, where the camera maths works. */
export function toMapView(layout: Layout, p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x - layout.mapView.x, y: p.y - layout.mapView.y };
}

/**
 * Which way the mouse edge-scrolls the camera, each axis -1, 0 or 1 (mouse null
 * when outside the window). Only inside the Map view near a screen edge, plus
 * the thin strip at the panel's outer edge: the panel itself never scrolls, as
 * the player rests the mouse there to use the menu.
 */
export function edgeScroll(layout: Layout, mouse: { x: number; y: number } | null): { dx: number; dy: number } {
  if (!mouse) return { dx: 0, dy: 0 };
  if (contains(layout.panel, mouse.x, mouse.y)) {
    return { dx: mouse.x < layout.panel.x + PANEL_EDGE_SCROLL_PX ? -1 : 0, dy: 0 };
  }
  const v = layout.mapView;
  if (!contains(v, mouse.x, mouse.y)) return { dx: 0, dy: 0 };
  // Only screen edges count: the Map view's left side borders the panel, so the
  // left test fires only when a narrow window leaves the panel no width.
  const screenRight = v.x + v.width;
  const screenBottom = v.y + v.height;
  let dx = 0;
  let dy = 0;
  if (mouse.x < EDGE_PX) dx -= 1;
  if (mouse.x >= screenRight - EDGE_PX) dx += 1;
  if (mouse.y < EDGE_PX) dy -= 1;
  if (mouse.y >= screenBottom - EDGE_PX) dy += 1;
  return { dx, dy };
}
