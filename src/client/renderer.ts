import type { BuildingKind, BuildingView, PlayerView, UnitView } from "../sim";
import { type Camera, CELL_PX, mapToScreen, type Size } from "./camera";
import { HUD_BG, HUD_TEXT, ORE_COLOUR, ORE_SHADOW, TEAM_COLOURS, TERRAIN_COLOURS } from "./palette";

// Draws a PlayerView. It only reads; it never changes the Match (ADR 0002).

const BUILDING_LABELS: Record<BuildingKind, string> = {
  hq: "HQ",
  refinery: "REF",
  barracks: "BAR",
  vehicleFactory: "VF",
  turret: "T",
};

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
  draw(view: PlayerView, cam: Camera, screen: Size, alpha: number): void {
    const { ctx } = this;
    const dpr = this.canvas.width / screen.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, screen.width, screen.height);

    this.drawTerrain(view, cam);
    this.drawOre(view, cam, screen);
    for (const b of view.buildings) this.drawBuilding(b, cam);
    for (const u of view.units) this.drawUnit(u, cam, alpha);
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
        // Four nuggets per Cell; fewer and smaller as the Cell empties.
        const fullness = Math.min(1, amount / 500);
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
      ctx.fillStyle = ORE_COLOUR;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
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
