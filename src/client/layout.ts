import type { Size } from "./camera";

// Screen layout shared by the renderer and input: the Map view on the left and
// a side panel on the right, with the minimap at the top of the panel and the
// build/train buttons below it.

export const PANEL_WIDTH = 220;
export const MINIMAP_MARGIN = 10;

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
  /** Space for buttons, below the minimap. */
  readonly buttons: Rect;
}

export function computeLayout(screen: Size): Layout {
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(0, screen.width - 200));
  const panel = { x: screen.width - panelWidth, y: 0, width: panelWidth, height: screen.height };
  const side = Math.max(0, panelWidth - MINIMAP_MARGIN * 2);
  const minimap = { x: panel.x + MINIMAP_MARGIN, y: MINIMAP_MARGIN, width: side, height: side };
  const buttonsTop = minimap.y + minimap.height + MINIMAP_MARGIN;
  return {
    mapView: { x: 0, y: 0, width: screen.width - panelWidth, height: screen.height },
    panel,
    minimap,
    buttons: { x: panel.x, y: buttonsTop, width: panelWidth, height: Math.max(0, screen.height - buttonsTop) },
  };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
}
