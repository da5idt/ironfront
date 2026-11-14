import {
  BUILDING_STATS,
  type BuildingKind,
  type BuildingView,
  type CellPos,
  ECONOMY,
  type EntityId,
  type PlayerView,
  type ShotView,
  type UnitView,
} from "../sim";
import { PixelWorld } from "./art/pixelWorld";
import { drawBuildPanel } from "./buildPanelPainter";
import { type Camera, CELL_PX, mapToScreen, type Size } from "./camera";
import type { Layout, Rect } from "./layout";
import { MinimapPainter } from "./minimapPainter";
import type { ScreenOverlay } from "./screenOverlay";
import { drawScreenOverlay } from "./screenOverlayPainter";
import {
  DRAG_BOX_FILL,
  DRAG_BOX_LINE,
  HEALTH_BACK,
  HEALTH_GOOD,
  HEALTH_LOW,
  HUD_BG,
  HUD_TEXT,
  MOVE_MARKER,
  PANEL_BG,
  PANEL_EDGE,
  PLACE_INVALID,
  PLACE_VALID,
  ORE_COLOUR,
  SELECTION_MARKER,
  SHOT_TRACER,
  TEAM_COLOURS,
} from "./palette";
import { drawSelectedBuilding } from "./selectedBuildingPainter";
import type { Selection } from "./selection";
import { trainerOf } from "./trainPanel";
import { drawTrainPanel } from "./trainPanelPainter";

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
  /** Corners of the box being dragged, in Map-view pixels, if any. */
  readonly dragBox: { readonly a: { x: number; y: number }; readonly b: { x: number; y: number } } | null;
  /** The Cell of the last move Command, and how far its fade-out has got (0..1). */
  readonly moveMarker: { readonly cell: CellPos; readonly age: number } | null;
  /** The footprint preview while placing a finished Building. */
  readonly placement: { readonly kind: BuildingKind; readonly at: CellPos; readonly valid: boolean } | null;
  /** The Victory, defeat or Paused screen over everything, if one shows. */
  readonly screen: ScreenOverlay | null;
  /** The selected own Building, if any; a Barracks or Vehicle Factory turns the side panel into its train buttons. */
  readonly selectedBuilding: EntityId | null;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world = new PixelWorld();
  private readonly minimap = new MinimapPainter();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  /** Draws one frame. `alpha` (0..1) is how far we are between the last Tick and the next. */
  draw(view: PlayerView, cam: Camera, screen: Size, layout: Layout, alpha: number, overlay: Overlay): void {
    const { ctx } = this;
    const dpr = this.canvas.width / screen.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, screen.width, screen.height);

    // The Map view sits right of the panel; moving the origin to its corner lets
    // everything on the Map be drawn in Map-view pixels, as the camera maths gives them.
    const { mapView } = layout;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapView.x, mapView.y, mapView.width, mapView.height);
    ctx.clip();
    ctx.translate(mapView.x, mapView.y);
    // The origin is already at the Map view's corner, so the pixel world draws into a rect at 0,0.
    const viewRect = { x: 0, y: 0, width: mapView.width, height: mapView.height };
    // Ground and fog are pixel art at half resolution (ADR 0003); Buildings and Units are still drawn at full resolution between them.
    this.world.drawGround(ctx, view, cam, viewRect, alpha);
    for (const b of view.buildings) this.drawBuilding(b, cam);
    // After the ground and Buildings, so remembered Buildings sit dimmed under it;
    // before Units, which are only ever listed where the Player can see.
    this.world.drawFog(ctx, view, cam, viewRect);
    const selectedBuilding = view.buildings.find((b) => b.id === overlay.selectedBuilding);
    if (selectedBuilding) drawSelectedBuilding(ctx, selectedBuilding, cam);
    if (overlay.moveMarker) this.drawMoveMarker(overlay.moveMarker.cell, overlay.moveMarker.age, cam);
    for (const u of view.units) this.drawUnit(u, cam, alpha, overlay.selection.has(u.id));
    for (const s of view.shots) this.drawShot(s, cam, alpha);
    if (overlay.placement) this.drawPlacement(overlay.placement, cam);
    if (overlay.dragBox) this.drawDragBox(overlay.dragBox.a, overlay.dragBox.b);
    this.drawHud(view, mapView);
    ctx.restore();

    this.drawPanel(layout.panel);
    this.minimap.draw(ctx, view, layout.minimap, cam, mapView, alpha);
    const trainer = trainerOf(view.buildings, overlay.selectedBuilding);
    if (trainer) drawTrainPanel(ctx, view.credits, trainer, layout.buttons);
    else drawBuildPanel(ctx, view, layout.buttons);
    if (overlay.screen) drawScreenOverlay(ctx, overlay.screen, screen);
  }

  /** The footprint, tinted green where the Building may go and red where it may not. */
  private drawPlacement(p: NonNullable<Overlay["placement"]>, cam: Camera): void {
    const { ctx } = this;
    const { width, height } = BUILDING_STATS[p.kind];
    const s = mapToScreen(cam, p.at.x, p.at.y);
    ctx.fillStyle = p.valid ? PLACE_VALID : PLACE_INVALID;
    ctx.fillRect(s.x, s.y, width * CELL_PX, height * CELL_PX);
    ctx.strokeStyle = HUD_TEXT;
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, width * CELL_PX - 1, height * CELL_PX - 1);
  }

  private drawPanel(panel: Rect): void {
    const { ctx } = this;
    ctx.fillStyle = PANEL_BG;
    ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    // The edge line faces the Map view, on the panel's right.
    ctx.fillStyle = PANEL_EDGE;
    ctx.fillRect(panel.x + panel.width - 1, panel.y, 1, panel.height);
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
