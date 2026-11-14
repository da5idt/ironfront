import {
  type BuildingKind,
  type CellPos,
  ECONOMY,
  type EntityId,
  type PlayerView,
  type ShotView,
  type UnitView,
} from "../sim";
import { BuildingPainter } from "./art/buildingPainter";
import { type BuildUps, noteBuildings } from "./art/buildUp";
import { drawBrackets, drawHealthBar, HEALTH_BAR_PX } from "./art/markerPainter";
import { PixelWorld } from "./art/pixelWorld";
import { ART_CELL_PX } from "./art/terrainArt";
import { drawBuildPanel } from "./buildPanelPainter";
import { type Camera, CELL_PX, mapToScreen, type Size } from "./camera";
import type { Layout, Rect } from "./layout";
import { MinimapPainter } from "./minimapPainter";
import type { ScreenOverlay } from "./screenOverlay";
import { drawScreenOverlay } from "./screenOverlayPainter";
import {
  DRAG_BOX_FILL,
  DRAG_BOX_LINE,
  HUD_BG,
  HUD_TEXT,
  MOVE_MARKER,
  PANEL_BG,
  PANEL_EDGE,
  ORE_COLOUR,
  SHOT_TRACER,
  TEAM_COLOURS,
} from "./palette";
import { drawRallyPoint } from "./selectedBuildingPainter";
import type { Selection } from "./selection";
import type { MixerSettings } from "./sfx/mixer";
import { drawAlertBanner } from "./sfx/alertBannerPainter";
import { drawSoundStrip } from "./sfx/soundStripPainter";
import { trainerOf } from "./trainPanel";
import { drawTrainPanel } from "./trainPanelPainter";

// Draws a PlayerView. It only reads; it never changes the Match (ADR 0002).

/** Side of the bracket square round a selected Unit, and the width of a Unit's health bar, in art pixels. */
const UNIT_BRACKET_PX = 16;
const UNIT_HEALTH_PX = 12;

/** Client-only things to draw on top of the Match. */
export interface Overlay {
  readonly selection: Selection;
  /** Corners of the box being dragged, in Map-view pixels, if any. */
  readonly dragBox: { readonly a: { x: number; y: number }; readonly b: { x: number; y: number } } | null;
  /** The Cell of the last move Command, and how far its fade-out has got (0..1). */
  readonly moveMarker: { readonly cell: CellPos; readonly age: number } | null;
  /** The footprint preview while placing a finished Building. */
  readonly placement: { readonly kind: BuildingKind; readonly at: CellPos; readonly valid: boolean } | null;
  /** The finished Building the person is placing, wherever the mouse is; its button shows it. */
  readonly placing: BuildingKind | null;
  /** The Victory, defeat or Paused screen over everything, if one shows. */
  readonly screen: ScreenOverlay | null;
  /** The sound settings, shown in the strip at the bottom of the panel. */
  readonly sound: MixerSettings;
  /** An alert's text to show at the top of the Map view, when it was not spoken. Left out, none. */
  readonly alert?: string | null;
  /** The selected own Building, if any; a Barracks or Vehicle Factory turns the side panel into its train buttons. */
  readonly selectedBuilding: EntityId | null;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world = new PixelWorld();
  private readonly minimap = new MinimapPainter();
  private readonly buildings = new BuildingPainter();
  /** Which own Buildings are newly placed and still rising; client-only (ADR 0002). */
  private buildUps: BuildUps | null = null;
  private buildUpsFor: PlayerView | null = null;

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
    if (view !== this.buildUpsFor) {
      this.buildUps = noteBuildings(this.buildUps, view);
      this.buildUpsFor = view;
    }
    const ups = this.buildUps!;
    // Game time, so idle animation and smoke stop while paused.
    const time = view.tick + alpha;
    // The pixel world (ADR 0003): ground, then Buildings on it, at half resolution.
    this.world.drawGround(ctx, view, cam, viewRect, alpha, (art) => this.buildings.draw(art, view.buildings, time, ups));
    // After the ground and Buildings, so remembered Buildings sit dimmed under it;
    // before Units, which are only ever listed where the Player can see.
    this.world.drawFog(ctx, view, cam, viewRect);
    const selectedBuilding = view.buildings.find((b) => b.id === overlay.selectedBuilding);
    if (selectedBuilding) drawRallyPoint(ctx, selectedBuilding, cam);
    if (overlay.moveMarker) this.drawMoveMarker(overlay.moveMarker.cell, overlay.moveMarker.age, cam);
    for (const u of view.units) this.drawUnit(u, cam, alpha);
    for (const s of view.shots) this.drawShot(s, cam, alpha);
    // The pixel world's layer over the fog. Unit sprites and effects (tickets #21, #22) belong at the start of it.
    this.world.drawAboveFog(ctx, cam, viewRect, (art) => {
      this.drawMarkers(art, view, alpha, overlay);
      if (overlay.placement) this.buildings.drawPlacing(art, overlay.placement, view.playerId);
    });
    if (overlay.dragBox) this.drawDragBox(overlay.dragBox.a, overlay.dragBox.b);
    this.drawHud(view, mapView);
    ctx.restore();

    this.drawPanel(layout.panel);
    this.minimap.draw(ctx, view, layout.minimap, cam, mapView, alpha);
    const trainer = trainerOf(view.buildings, overlay.selectedBuilding);
    if (trainer) drawTrainPanel(ctx, view.credits, trainer, layout.buttons);
    else drawBuildPanel(ctx, view, layout.buttons, overlay.placing, (kind) => this.buildings.icon(kind, view.playerId));
    drawSoundStrip(ctx, overlay.sound, layout.soundStrip);
    if (overlay.alert) drawAlertBanner(ctx, overlay.alert, mapView);
    if (overlay.screen) drawScreenOverlay(ctx, overlay.screen, screen);
  }

  /** Selection brackets and health bars, in art pixels, over everything on the Map. */
  private drawMarkers(art: CanvasRenderingContext2D, view: PlayerView, alpha: number, overlay: Overlay): void {
    const U = ART_CELL_PX;
    for (const b of view.buildings) {
      const selected = b.id === overlay.selectedBuilding;
      const x = b.x * U;
      const y = b.y * U;
      if (selected) drawBrackets(art, x - 1, y - 1, b.width * U + 2, b.height * U + 2, 4);
      // Damaged Buildings always show their health; a remembered one's is only as last seen, so it shows none.
      if (selected || (b.hp < b.maxHp && !b.remembered)) {
        drawHealthBar(art, x + 1, y - HEALTH_BAR_PX - 2, b.width * U - 2, b.hp / b.maxHp);
      }
    }
    for (const u of view.units) {
      const selected = overlay.selection.has(u.id);
      if (!selected && u.hp >= u.maxHp) continue;
      const cx = Math.round((u.prevX + (u.x - u.prevX) * alpha) * U);
      const cy = Math.round((u.prevY + (u.y - u.prevY) * alpha) * U);
      const half = UNIT_BRACKET_PX / 2;
      if (selected) drawBrackets(art, cx - half, cy - half, UNIT_BRACKET_PX, UNIT_BRACKET_PX, 3);
      // Damaged Units always show their health, so a fight reads without selecting anything.
      drawHealthBar(art, cx - UNIT_HEALTH_PX / 2, cy - half - HEALTH_BAR_PX + 1, UNIT_HEALTH_PX, u.hp / u.maxHp);
    }
  }

  private drawPanel(panel: Rect): void {
    const { ctx } = this;
    ctx.fillStyle = PANEL_BG;
    ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    // The edge line faces the Map view, on the panel's right.
    ctx.fillStyle = PANEL_EDGE;
    ctx.fillRect(panel.x + panel.width - 1, panel.y, 1, panel.height);
  }

  private drawUnit(u: UnitView, cam: Camera, alpha: number): void {
    const { ctx } = this;
    const team = TEAM_COLOURS[u.owner];
    const mx = u.prevX + (u.x - u.prevX) * alpha;
    const my = u.prevY + (u.y - u.prevY) * alpha;
    const p = mapToScreen(cam, mx, my);
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
