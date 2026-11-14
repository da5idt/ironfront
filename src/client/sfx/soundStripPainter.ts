import { drawKeyBadgeAt, KEY_BADGE } from "../buttonPainter";
import type { Rect } from "../layout";
import {
  BUTTON_BG,
  BUTTON_DISABLED_TEXT,
  BUTTON_EDGE,
  HUD_TEXT,
  PANEL_EDGE,
  SOUND_MUTED,
  VOLUME_OFF,
  VOLUME_ON,
} from "../palette";
import { type MixerSettings, VOLUME_MAX, VOLUME_STEP } from "./mixer";
import { muteAllButton, soundStripRows, STRIP_HEADER } from "./soundStrip";

// Draws the sound strip from the same pure functions main.ts hit-tests with.

export function drawSoundStrip(ctx: CanvasRenderingContext2D, settings: MixerSettings, area: Rect): void {
  ctx.fillStyle = PANEL_EDGE;
  ctx.fillRect(area.x, area.y, area.width - 1, 1);
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = "left";
  ctx.fillText("Sound", area.x + 10, area.y + STRIP_HEADER / 2 + 1);

  for (const row of soundStripRows(area)) {
    const { volume, muted } = settings.channels[row.channel];
    // A silenced channel keeps showing its level, dimmed, so it is clear what unmuting brings back.
    const silent = muted || settings.muteAll;
    const midY = row.rect.y + row.rect.height / 2;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = silent ? BUTTON_DISABLED_TEXT : HUD_TEXT;
    ctx.fillText(row.label, row.rect.x, midY + 1);

    drawButton(ctx, row.down);
    drawButton(ctx, row.up);
    ctx.fillStyle = HUD_TEXT;
    const sign = (rect: Rect, plus: boolean): void => {
      const cx = Math.floor(rect.x + rect.width / 2);
      const cy = Math.floor(rect.y + rect.height / 2);
      ctx.fillRect(cx - 4, cy - 1, 8, 2);
      if (plus) ctx.fillRect(cx - 1, cy - 4, 2, 8);
    };
    sign(row.down, false);
    sign(row.up, true);

    const steps = VOLUME_MAX / VOLUME_STEP;
    const lit = volume / VOLUME_STEP;
    const pitch = row.level.width / steps;
    for (let i = 0; i < steps; i++) {
      // Taller toward the loud end, like a volume wedge.
      const height = 5 + Math.round((i / (steps - 1)) * (row.level.height - 9));
      ctx.fillStyle = i < lit ? (silent ? BUTTON_DISABLED_TEXT : VOLUME_ON) : VOLUME_OFF;
      ctx.fillRect(
        Math.round(row.level.x + i * pitch),
        row.level.y + row.level.height - 2 - height,
        Math.max(1, Math.floor(pitch) - 2),
        height,
      );
    }

    drawButton(ctx, row.mute);
    drawSpeaker(ctx, row.mute, muted);
  }

  const all = muteAllButton(area);
  drawButton(ctx, all);
  if (settings.muteAll) {
    ctx.strokeStyle = SOUND_MUTED;
    ctx.lineWidth = 1;
    ctx.strokeRect(all.x + 0.5, all.y + 0.5, all.width - 1, all.height - 1);
  }
  const badge = KEY_BADGE;
  const midY = all.y + all.height / 2;
  drawKeyBadgeAt(ctx, "M", all.x + 6, midY - badge / 2);
  ctx.textAlign = "left";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = settings.muteAll ? SOUND_MUTED : HUD_TEXT;
  ctx.fillText(settings.muteAll ? "All sound muted" : "Mute all sound", all.x + 6 + badge + 6, midY + 1);
}

function drawButton(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = BUTTON_BG;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = BUTTON_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

/** A small loudspeaker: with sound waves when on, crossed out in red when muted. */
function drawSpeaker(ctx: CanvasRenderingContext2D, rect: Rect, muted: boolean): void {
  const x = Math.floor(rect.x + rect.width / 2) - 8;
  const cy = Math.floor(rect.y + rect.height / 2);
  ctx.fillStyle = muted ? BUTTON_DISABLED_TEXT : HUD_TEXT;
  ctx.fillRect(x, cy - 2, 4, 4);
  ctx.beginPath();
  ctx.moveTo(x + 4, cy - 2);
  ctx.lineTo(x + 8, cy - 6);
  ctx.lineTo(x + 8, cy + 6);
  ctx.lineTo(x + 4, cy + 2);
  ctx.closePath();
  ctx.fill();
  if (muted) {
    ctx.strokeStyle = SOUND_MUTED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 11, cy - 3);
    ctx.lineTo(x + 17, cy + 3);
    ctx.moveTo(x + 17, cy - 3);
    ctx.lineTo(x + 11, cy + 3);
    ctx.stroke();
  } else {
    ctx.fillRect(x + 11, cy - 2, 2, 4);
    ctx.fillRect(x + 15, cy - 4, 2, 8);
  }
}
