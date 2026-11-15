import type { CellPos } from "../sim";
import { heldScroll } from "./keys";

// Camera maths, kept pure so it can be unit tested without a browser.

/** Size of one Cell on screen, in CSS pixels. */
export const CELL_PX = 24;
/** Camera speed when scrolling, in pixels per second. */
export const SCROLL_PX_PER_SECOND = 900;

/** The world pixel shown at the top-left of the screen. */
export interface Camera {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Keeps the camera on the Map. A Map smaller than the screen is centred. */
export function clampCamera(cam: Camera, screen: Size, mapCells: Size): Camera {
  const clampAxis = (v: number, screenPx: number, cells: number) => {
    const worldPx = cells * CELL_PX;
    if (worldPx <= screenPx) return (worldPx - screenPx) / 2;
    return Math.min(Math.max(v, 0), worldPx - screenPx);
  };
  return {
    x: clampAxis(cam.x, screen.width, mapCells.width),
    y: clampAxis(cam.y, screen.height, mapCells.height),
  };
}

/**
 * Which way to scroll, each axis -1, 0 or 1, from held keys (KeyboardEvent.code; the key table in keys.ts says which scroll)
 * and the mouse's edge-scroll (see edgeScroll in layout.ts, which knows where the panel is).
 */
export function scrollDirection(
  keys: ReadonlySet<string>,
  edge: { readonly dx: number; readonly dy: number },
): { dx: number; dy: number } {
  const held = heldScroll(keys);
  return { dx: Math.sign(edge.dx + held.dx), dy: Math.sign(edge.dy + held.dy) };
}

export function scrollCamera(
  cam: Camera,
  dir: { dx: number; dy: number },
  seconds: number,
  screen: Size,
  mapCells: Size,
): Camera {
  const step = SCROLL_PX_PER_SECOND * seconds;
  return clampCamera({ x: cam.x + dir.dx * step, y: cam.y + dir.dy * step }, screen, mapCells);
}

/** The Map position (in Cell units) under a screen pixel. */
export function screenToMap(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx + cam.x) / CELL_PX, y: (sy + cam.y) / CELL_PX };
}

/** The Cell under a screen pixel. May be off the Map; callers check bounds. */
export function screenToCell(cam: Camera, sx: number, sy: number): CellPos {
  const p = screenToMap(cam, sx, sy);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** The screen pixel of a Map position (in Cell units). */
export function mapToScreen(cam: Camera, mx: number, my: number): { x: number; y: number } {
  return { x: mx * CELL_PX - cam.x, y: my * CELL_PX - cam.y };
}
