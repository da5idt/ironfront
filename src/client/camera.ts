import type { CellPos } from "../sim";
import { heldScroll } from "./keys";

// Camera maths, kept pure so it can be unit tested without a browser.

/**
 * The zoom steps: how many screen pixels (CSS pixels) one Cell takes. Whole
 * multiples of the 12-pixel art (ADR 0003), so the pixel world is always shown
 * at a whole-number scale and stays crisp.
 */
export const ZOOM_STEPS_PX = [12, 24, 36] as const;
export type ZoomStepPx = (typeof ZOOM_STEPS_PX)[number];
/** The zoom a new Match starts at. */
export const DEFAULT_CELL_PX: ZoomStepPx = ZOOM_STEPS_PX[1];
/** Camera speed when scrolling, in screen pixels per second. */
export const SCROLL_PX_PER_SECOND = 900;

/**
 * What the Map view shows: the world pixel at its top-left corner, and the
 * zoom. A world pixel is a screen pixel at the camera's own zoom, so x and y
 * are measured in Cells times `cellPx`.
 */
export interface Camera {
  readonly x: number;
  readonly y: number;
  /** Screen pixels per Cell. */
  readonly cellPx: ZoomStepPx;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Keeps the camera on the Map. A Map smaller than the screen is centred. */
export function clampCamera(cam: Camera, screen: Size, mapCells: Size): Camera {
  const clampAxis = (v: number, screenPx: number, cells: number) => {
    const worldPx = cells * cam.cellPx;
    if (worldPx <= screenPx) return (worldPx - screenPx) / 2;
    return Math.min(Math.max(v, 0), worldPx - screenPx);
  };
  return {
    x: clampAxis(cam.x, screen.width, mapCells.width),
    y: clampAxis(cam.y, screen.height, mapCells.height),
    cellPx: cam.cellPx,
  };
}

/** The camera, at a zoom, with a Map position (in Cell units) in the middle of the screen, or as near as the Map's edge allows. */
export function centreCamera(
  at: { readonly x: number; readonly y: number },
  cellPx: ZoomStepPx,
  screen: Size,
  mapCells: Size,
): Camera {
  return clampCamera({ x: at.x * cellPx - screen.width / 2, y: at.y * cellPx - screen.height / 2, cellPx }, screen, mapCells);
}

/**
 * One zoom step in (`direction` above 0) or out, keeping the Map position
 * under `anchor` (a point of the screen, such as the mouse) where it is. Where
 * that would show past the Map's edge the camera stays on the Map instead, and
 * a Map smaller than the screen at the new zoom is centred. At the last step
 * either way the camera is returned unchanged.
 */
export function zoomCamera(
  cam: Camera,
  direction: number,
  anchor: { readonly x: number; readonly y: number },
  screen: Size,
  mapCells: Size,
): Camera {
  const from = ZOOM_STEPS_PX.indexOf(cam.cellPx);
  const cellPx = ZOOM_STEPS_PX[Math.min(ZOOM_STEPS_PX.length - 1, Math.max(0, from + Math.sign(direction)))]!;
  if (cellPx === cam.cellPx) return cam;
  const under = screenToMap(cam, anchor.x, anchor.y);
  return clampCamera({ x: under.x * cellPx - anchor.x, y: under.y * cellPx - anchor.y, cellPx }, screen, mapCells);
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
  return clampCamera({ ...cam, x: cam.x + dir.dx * step, y: cam.y + dir.dy * step }, screen, mapCells);
}

/** The Map position (in Cell units) under a screen pixel. */
export function screenToMap(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx + cam.x) / cam.cellPx, y: (sy + cam.y) / cam.cellPx };
}

/** The Cell under a screen pixel. May be off the Map; callers check bounds. */
export function screenToCell(cam: Camera, sx: number, sy: number): CellPos {
  const p = screenToMap(cam, sx, sy);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** The screen pixel of a Map position (in Cell units). */
export function mapToScreen(cam: Camera, mx: number, my: number): { x: number; y: number } {
  return { x: mx * cam.cellPx - cam.x, y: my * cam.cellPx - cam.y };
}

/** Wheel events closer together than this are one turn of the wheel or one swipe of a touchpad. */
export const WHEEL_GESTURE_GAP_MS = 150;

/** The last wheel event seen: when, and which way it zoomed (1 in, -1 out). */
export interface WheelEvent {
  readonly atMs: number;
  readonly direction: 1 | -1;
}

/**
 * The zoom step a wheel event asks for: 1 in (wheel up), -1 out, or 0. A
 * touchpad sends a long stream of small scrolls for one swipe, which would
 * race through every step, so only the first event of a stream steps: one
 * with a pause before it, or one that reverses the stream. The caller
 * remembers every event as `last`, stepped or not.
 */
export function wheelZoomStep(
  deltaY: number,
  last: WheelEvent | null,
  nowMs: number,
): { readonly step: -1 | 0 | 1; readonly last: WheelEvent | null } {
  if (deltaY === 0) return { step: 0, last };
  const direction = deltaY < 0 ? 1 : -1;
  const sameStream = last !== null && last.direction === direction && nowMs - last.atMs < WHEEL_GESTURE_GAP_MS;
  return { step: sameStream ? 0 : direction, last: { atMs: nowMs, direction } };
}
