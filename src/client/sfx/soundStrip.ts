import { contains, type Rect, SOUND_STRIP_COMPACT_HEIGHT, SOUND_STRIP_HEIGHT } from "../layout";
import { type Channel, CHANNELS, type MixerAction } from "./mixer";

// The sound settings strip at the bottom of the side panel: where its
// controls are and what a click on one means. Pure, so it is unit tested;
// soundStripPainter.ts draws from the same functions and main.ts acts on the
// result.

const MARGIN = 10;
/** Room above the rows for the strip's heading. */
export const STRIP_HEADER = 20;
const ROW_HEIGHT = 20;
const ROW_GAP = 4;
const STEP_BUTTON = 20;
const MUTE_BUTTON = 26;
const CONTROL_GAP = 5;
/** Where the volume-down button starts, leaving room for the longest channel name. */
const LABEL_WIDTH = 52;
const MUTE_ALL_HEIGHT = 22;

/**
 * How much of the strip an area has room for: the layout hands out a full
 * one, one just tall enough for the mute-all button, or none (layout.ts).
 */
export function stripSize(area: Rect): "full" | "muteAllOnly" | "none" {
  if (area.height >= SOUND_STRIP_HEIGHT) return "full";
  return area.height >= SOUND_STRIP_COMPACT_HEIGHT ? "muteAllOnly" : "none";
}

const LABELS: Record<Channel, string> = { effects: "Effects", music: "Music", alerts: "Alerts" };

export interface StripRow {
  readonly channel: Channel;
  readonly label: string;
  /** The whole row, for placing the label. */
  readonly rect: Rect;
  readonly down: Rect;
  /** Where the volume level is shown, between the two step buttons. */
  readonly level: Rect;
  readonly up: Rect;
  readonly mute: Rect;
}

/** A row per channel; none on a strip cut down for a short window. */
export function soundStripRows(area: Rect): StripRow[] {
  if (stripSize(area) !== "full") return [];
  const left = area.x + MARGIN;
  const right = area.x + area.width - MARGIN;
  return CHANNELS.map((channel, i) => {
    const y = area.y + STRIP_HEADER + i * (ROW_HEIGHT + ROW_GAP);
    const box = (x: number, width: number): Rect => ({ x, y, width, height: ROW_HEIGHT });
    const mute = box(right - MUTE_BUTTON, MUTE_BUTTON);
    const up = box(mute.x - CONTROL_GAP - STEP_BUTTON, STEP_BUTTON);
    const down = box(left + LABEL_WIDTH, STEP_BUTTON);
    const levelX = down.x + down.width + CONTROL_GAP;
    return {
      channel,
      label: LABELS[channel],
      rect: box(left, Math.max(0, right - left)),
      down,
      level: box(levelX, Math.max(0, up.x - CONTROL_GAP - levelX)),
      up,
      mute,
    };
  });
}

/**
 * Mute-all, under the rows, or alone in the middle of a cut-down strip; null
 * when there is no strip. It carries the M key's hint, so the key needs no
 * remembering.
 */
export function muteAllButton(area: Rect): Rect | null {
  const size = stripSize(area);
  if (size === "none") return null;
  return {
    x: area.x + MARGIN,
    y:
      size === "full"
        ? area.y + STRIP_HEADER + CHANNELS.length * (ROW_HEIGHT + ROW_GAP) + 2
        : area.y + Math.floor((area.height - MUTE_ALL_HEIGHT) / 2),
    width: Math.max(0, area.width - MARGIN * 2),
    height: MUTE_ALL_HEIGHT,
  };
}

/** What a click at a screen point on the strip changes, or null between the controls. */
export function soundStripAction(area: Rect, x: number, y: number): MixerAction | null {
  for (const row of soundStripRows(area)) {
    if (contains(row.down, x, y)) return { type: "volume", channel: row.channel, step: -1 };
    if (contains(row.up, x, y)) return { type: "volume", channel: row.channel, step: 1 };
    if (contains(row.mute, x, y)) return { type: "mute", channel: row.channel };
  }
  const all = muteAllButton(area);
  return all && contains(all, x, y) ? { type: "muteAll" } : null;
}
