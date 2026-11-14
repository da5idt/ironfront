import { type Camera, CELL_PX, type Size } from "../camera";

// How loud a sound on the Map is from where the player is looking: loudest at
// the centre of the Map view, quieter with distance, and skipped altogether
// far off screen. Pure, so it is unit tested.

/** A Map position in Cell units, as Units' positions are. */
export interface MapPos {
  readonly x: number;
  readonly y: number;
}

export interface Listener {
  /** The centre of the Map view, in Cells. */
  readonly x: number;
  readonly y: number;
  /** From the centre to the view's corner, in Cells: the farthest a sound on screen can be. */
  readonly reach: number;
}

/** How loud a sound at the view's corner is. */
export const CORNER_GAIN = 0.5;
/** Sounds farther than this many reaches from the centre are not played at all. */
export const SKIP_BEYOND_REACHES = 1.75;
/** How far to one side the farthest sound sits; short of 1 so nothing is ever in one ear only. */
const PAN_MAX = 0.8;

export function listenerFor(camera: Camera, viewSize: Size): Listener {
  const halfWidth = viewSize.width / 2 / CELL_PX;
  const halfHeight = viewSize.height / 2 / CELL_PX;
  return {
    x: camera.x / CELL_PX + halfWidth,
    y: camera.y / CELL_PX + halfHeight,
    reach: Math.hypot(halfWidth, halfHeight),
  };
}

export interface Heard {
  /** 0..1, multiplied into the sound's own loudness. */
  readonly gain: number;
  /** -1 (left) to 1 (right). */
  readonly pan: number;
}

/** How a sound at `at` reaches the listener, or null when it is too far away to play. */
export function hear(listener: Listener, at: MapPos): Heard | null {
  const dx = at.x - listener.x;
  const distance = Math.hypot(dx, at.y - listener.y);
  if (distance === 0) return { gain: 1, pan: 0 };
  if (listener.reach <= 0) return null;
  const reaches = distance / listener.reach;
  if (reaches > SKIP_BEYOND_REACHES) return null;
  // Two straight lines: down to CORNER_GAIN at the edge of what is on screen, then on down to silence at the skip limit.
  const gain =
    reaches <= 1
      ? 1 - (1 - CORNER_GAIN) * reaches
      : (CORNER_GAIN * (SKIP_BEYOND_REACHES - reaches)) / (SKIP_BEYOND_REACHES - 1);
  const pan = Math.max(-PAN_MAX, Math.min(PAN_MAX, (dx / listener.reach) * PAN_MAX));
  return { gain, pan };
}
