import type { BuildingView, CellPos } from "../sim";
import { type Camera, CELL_PX, mapToScreen } from "./camera";
import { RALLY_FLAG, RALLY_LINE, SELECTION_MARKER } from "./palette";

// The selected own Building: corner brackets round its footprint and, for a
// Barracks or Vehicle Factory with a rally point, a dashed line out to a flag.

export function drawSelectedBuilding(ctx: CanvasRenderingContext2D, b: BuildingView, cam: Camera): void {
  const p = mapToScreen(cam, b.x, b.y);
  const w = b.width * CELL_PX;
  const h = b.height * CELL_PX;
  const arm = CELL_PX * 0.35;
  ctx.strokeStyle = SELECTION_MARKER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [
    [p.x, p.y, 1, 1],
    [p.x + w, p.y, -1, 1],
    [p.x, p.y + h, 1, -1],
    [p.x + w, p.y + h, -1, -1],
  ] as const) {
    ctx.moveTo(cx + sx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * arm);
  }
  ctx.stroke();
  const rally = b.training?.rallyPoint;
  if (rally) drawRally(ctx, { x: p.x + w / 2, y: p.y + h / 2 }, rally, cam);
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
