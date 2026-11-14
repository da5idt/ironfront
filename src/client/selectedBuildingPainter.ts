import type { BuildingView, CellPos } from "../sim";
import { type Camera, CELL_PX, mapToScreen } from "./camera";
import { RALLY_FLAG, RALLY_LINE, SELECTION_MARKER } from "./palette";

// The selected Barracks or Vehicle Factory's rally point: a dashed line from
// the Building out to a flag. (Its selection brackets are pixel art, drawn
// with the other markers in the renderer.)

export function drawRallyPoint(ctx: CanvasRenderingContext2D, b: BuildingView, cam: Camera): void {
  const rally = b.training?.rallyPoint;
  if (!rally) return;
  const p = mapToScreen(cam, b.x + b.width / 2, b.y + b.height / 2);
  drawRally(ctx, p, rally, cam);
}

function drawRally(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, rally: CellPos, cam: Camera): void {
  const foot = mapToScreen(cam, rally.x + 0.5, rally.y + 0.8);
  ctx.strokeStyle = RALLY_LINE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // A pole with a small pennant, drawn in code.
  const top = foot.y - CELL_PX * 0.7;
  ctx.strokeStyle = SELECTION_MARKER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(foot.x, top);
  ctx.stroke();
  ctx.fillStyle = RALLY_FLAG;
  ctx.beginPath();
  ctx.moveTo(foot.x, top);
  ctx.lineTo(foot.x + CELL_PX * 0.4, top + CELL_PX * 0.15);
  ctx.lineTo(foot.x, top + CELL_PX * 0.3);
  ctx.closePath();
  ctx.fill();
}
