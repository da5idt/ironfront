import { type BuildingKind, type BuildingView, type CellPos, ECONOMY, type PlayerView, type ShotView, type UnitView } from "../sim";
import { type Camera, CELL_PX, mapToScreen, type Size } from "./camera";
import {
  DRAG_BOX_FILL,
  DRAG_BOX_LINE,
  HEALTH_BACK,
  HEALTH_GOOD,
  HEALTH_LOW,
  HUD_BG,
  HUD_TEXT,
  MOVE_MARKER,
  ORE_COLOUR,
  ORE_SHADOW,
  SELECTION_MARKER,
  SHOT_TRACER,
  TEAM_COLOURS,
  TERRAIN_COLOURS,
} from "./palette";
import type { Selection } from "./selection";

// Draws a PlayerView. It only reads; it never changes the Match (ADR 0002).

const BUILDING_LABELS: Record<BuildingKind, string> = {
  hq: "HQ",
  refinery: "REF",
  barracks: "BAR",
  vehicleFactory: "VF",
  turret: "T",
};

/** Client-only things to draw on top of the Match. */
export interface Overlay {
  readonly selection: Selection;
  /** Screen corners of the box being dragged, if any. */
  readonly dragBox: { readonly a: { x: number; y: number }; readonly b: { x: number; y: number } } | null;
  /** The Cell of the last move Command, and how far its fade-out has got (0..1). */
  readonly moveMarker: { readonly cell: CellPos; readonly age: number } | null;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Terrain never changes, so it is drawn once and copied each frame. */
  private terrainLayer: HTMLCanvasElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  /** Draws one frame. `alpha` (0..1) is how far we are between the last Tick and the next. */
  draw(view: PlayerView, cam: Camera, screen: Size, alpha: number, overlay: Overlay): void {
    const { ctx } = this;
    const dpr = this.canvas.width / screen.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, screen.width, screen.height);

    this.drawTerrain(view, cam);
    this.drawOre(view, cam, screen);
    for (const b of view.buildings) this.drawBuilding(b, cam);
    if (overlay.moveMarker) this.drawMoveMarker(overlay.moveMarker.cell, overlay.moveMarker.age, cam);
    for (const u of view.units) this.drawUnit(u, cam, alpha, overlay.selection.has(u.id));
    for (const s of view.shots) this.drawShot(s, cam, alpha);
    if (overlay.dragBox) this.drawDragBox(overlay.dragBox.a, overlay.dragBox.b);
    this.drawHud(view, screen);
  }

  private drawTerrain(view: PlayerView, cam: Camera): void {
    if (!this.terrainLayer) this.terrainLayer = buildTerrainLayer(view);
    this.ctx.drawImage(this.terrainLayer, -cam.x, -cam.y);
  }

  private drawOre(view: PlayerView, cam: Camera, screen: Size): void {
    const { ctx } = this;
    const { width, height, ore } = view.map;
    const x0 = Math.max(0, Math.floor(cam.x / CELL_PX));
    const y0 = Math.max(0, Math.floor(cam.y / CELL_PX));
    const x1 = Math.min(width - 1, Math.floor((cam.x + screen.width) / CELL_PX));
    const y1 = Math.min(height - 1, Math.floor((cam.y + screen.height) / CELL_PX));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const amount = ore[y * width + x] ?? 0;
        if (amount <= 0) continue;
        const p = mapToScreen(cam, x, y);
        // Fewer, smaller nuggets as the Cell empties, so depletion reads at a glance.
        const fullness = Math.min(1, amount / ECONOMY.orePerCell);
        const r = 2 + 3 * fullness;
        const spots = [
          [0.3, 0.3],
          [0.7, 0.35],
          [0.35, 0.72],
          [0.72, 0.7],
        ] as const;
        const count = Math.max(1, Math.ceil(fullness * spots.length));
        for (let i = 0; i < count; i++) {
          const [sx, sy] = spots[i]!;
          ctx.fillStyle = ORE_SHADOW;
          ctx.beginPath();
          ctx.arc(p.x + sx * CELL_PX + 1, p.y + sy * CELL_PX + 1, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ORE_COLOUR;
          ctx.beginPath();
          ctx.arc(p.x + sx * CELL_PX, p.y + sy * CELL_PX, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawBuilding(b: BuildingView, cam: Camera): void {
    const { ctx } = this;
    const team = TEAM_COLOURS[b.owner];
    const p = mapToScreen(cam, b.x, b.y);
    const w = b.width * CELL_PX;
    const h = b.height * CELL_PX;
    const inset = 2;
    ctx.fillStyle = team.dark;
    ctx.fillRect(p.x + inset, p.y + inset, w - inset * 2, h - inset * 2);
    ctx.fillStyle = team.fill;
    ctx.fillRect(p.x + inset + 3, p.y + inset + 3, w - inset * 2 - 6, h - inset * 2 - 6);
    if (b.kind === "turret") {
      ctx.fillStyle = team.dark;
      ctx.beginPath();
      ctx.arc(p.x + w / 2, p.y + h / 2, CELL_PX * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = team.light;
      ctx.font = `bold ${Math.min(14, h / 3)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(BUILDING_LABELS[b.kind], p.x + w / 2, p.y + h / 2);
    }
  }

  private drawUnit(u: UnitView, cam: Camera, alpha: number, selected: boolean): void {
    const { ctx } = this;
    const team = TEAM_COLOURS[u.owner];
    const mx = u.prevX + (u.x - u.prevX) * alpha;
    const my = u.prevY + (u.y - u.prevY) * alpha;
    const p = mapToScreen(cam, mx, my);
    if (selected) this.drawSelectionMarker(p);
    ctx.lineWidth = 2;
    ctx.strokeStyle = team.dark;
    ctx.fillStyle = team.fill;
    ctx.beginPath();
    switch (u.kind) {
      case "rifleman":
        ctx.arc(p.x, p.y, CELL_PX * 0.22, 0, Math.PI * 2);
        break;
      case "raider": {
        const s = CELL_PX * 0.38;
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x + s, p.y + s * 0.8);
        ctx.lineTo(p.x - s, p.y + s * 0.8);
        ctx.closePath();
        break;
      }
      case "harvester": {
        const s = CELL_PX * 0.4;
        ctx.rect(p.x - s, p.y - s * 0.75, s * 2, s * 1.5);
        break;
      }
    }
    ctx.fill();
    ctx.stroke();
    if (u.kind === "harvester") {
      // The hopper fills from the bottom with the load, so a full Harvester reads at a glance.
      const size = 8;
      const filled = Math.round(size * Math.min(1, u.cargo / ECONOMY.harvesterCapacity));
      ctx.fillStyle = team.dark;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.fillStyle = ORE_COLOUR;
      ctx.fillRect(p.x - size / 2, p.y + size / 2 - filled, size, filled);
    }
    // Damaged Units always show their health, so a fight reads without selecting anything.
    if (selected || u.hp < u.maxHp) this.drawHealthBar(p, u.hp / u.maxHp);
  }

  /** A short bright line per shot, fading out before the next Tick. */
  private drawShot(s: ShotView, cam: Camera, alpha: number): void {
    const { ctx } = this;
    const a = mapToScreen(cam, s.fromX, s.fromY);
    const b = mapToScreen(cam, s.toX, s.toY);
    ctx.globalAlpha = 1 - 0.6 * alpha;
    ctx.strokeStyle = SHOT_TRACER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = SHOT_TRACER;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Corner brackets around the Unit, so the selection reads even in a crowd. */
  private drawSelectionMarker(p: { x: number; y: number }): void {
    const { ctx } = this;
    const h = CELL_PX * 0.5;
    const arm = CELL_PX * 0.2;
    ctx.strokeStyle = SELECTION_MARKER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const cx = p.x + sx * h;
      const cy = p.y + sy * h;
      ctx.moveTo(cx - sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy - sy * arm);
    }
    ctx.stroke();
  }

  private drawHealthBar(p: { x: number; y: number }, share: number): void {
    const { ctx } = this;
    const w = CELL_PX * 0.9;
    const x = p.x - w / 2;
    const y = p.y - CELL_PX * 0.5 - 6;
    ctx.fillStyle = HEALTH_BACK;
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = share > 0.35 ? HEALTH_GOOD : HEALTH_LOW;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, share)), 3);
  }

  private drawMoveMarker(cell: CellPos, age: number, cam: Camera): void {
    const { ctx } = this;
    const p = mapToScreen(cam, cell.x + 0.5, cell.y + 0.5);
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = MOVE_MARKER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CELL_PX * (0.15 + 0.3 * age), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawDragBox(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const { ctx } = this;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    ctx.fillStyle = DRAG_BOX_FILL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = DRAG_BOX_LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  private drawHud(view: PlayerView, screen: Size): void {
    const { ctx } = this;
    const text = `Credits ${view.credits}`;
    ctx.font = "bold 15px system-ui, sans-serif";
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = HUD_BG;
    ctx.fillRect(screen.width - w - 8, 8, w, 28);
    ctx.fillStyle = HUD_TEXT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, screen.width - 18, 22);
  }
}

function buildTerrainLayer(view: PlayerView): HTMLCanvasElement {
  const { width, height, terrain } = view.map;
  const layer = document.createElement("canvas");
  layer.width = width * CELL_PX;
  layer.height = height * CELL_PX;
  const ctx = layer.getContext("2d")!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain[y * width + x]!;
      ctx.fillStyle = TERRAIN_COLOURS[t];
      ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      // A faint checker so Cells read as a grid without drawing lines.
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
        ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      }
      if (t === "rock") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(x * CELL_PX + 4, y * CELL_PX + 4, CELL_PX - 8, CELL_PX - 8);
      }
    }
  }
  return layer;
}
