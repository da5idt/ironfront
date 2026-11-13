import { type Camera, CELL_PX, clampCamera, type Size } from "./camera";
import type { Rect } from "./layout";

// Minimap <-> Map maths, kept pure so it can be unit tested without a browser.

/**
 * Where the Map is drawn inside the minimap box: as large as fits with its
 * shape kept, centred, so a Map that isn't square gets empty bands.
 */
export function minimapArea(box: Rect, mapCells: Size): Rect {
  const scale = Math.min(box.width / mapCells.width, box.height / mapCells.height);
  const width = mapCells.width * scale;
  const height = mapCells.height * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/** The Map position (in Cell units) under a minimap pixel, clamped onto the Map. */
export function minimapToMap(box: Rect, mapCells: Size, sx: number, sy: number): { x: number; y: number } {
  const area = minimapArea(box, mapCells);
  const scale = area.width / mapCells.width;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    x: clamp((sx - area.x) / scale, mapCells.width),
    y: clamp((sy - area.y) / scale, mapCells.height),
  };
}

/** The camera's view as a rectangle on the minimap, cut to the Map's area. */
export function cameraFrame(box: Rect, mapCells: Size, cam: Camera, view: Size): Rect {
  const area = minimapArea(box, mapCells);
  const perPx = area.width / mapCells.width / CELL_PX;
  const x0 = Math.max(area.x, area.x + cam.x * perPx);
  const y0 = Math.max(area.y, area.y + cam.y * perPx);
  const x1 = Math.min(area.x + area.width, area.x + (cam.x + view.width) * perPx);
  const y1 = Math.min(area.y + area.height, area.y + (cam.y + view.height) * perPx);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** The camera that centres a minimap pixel's Map position in the view, kept on the Map. */
export function cameraOnMinimapPoint(box: Rect, mapCells: Size, view: Size, sx: number, sy: number): Camera {
  const p = minimapToMap(box, mapCells, sx, sy);
  return clampCamera(
    { x: p.x * CELL_PX - view.width / 2, y: p.y * CELL_PX - view.height / 2 },
    view,
    mapCells,
  );
}
