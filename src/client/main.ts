import { RIVERFORD } from "../game/maps/riverford";
import { advanceTick, createMatch, getPlayerView, type PlayerId } from "../sim";
import { type Camera, CELL_PX, clampCamera, scrollCamera, scrollDirection, type Size } from "./camera";
import { type Clock, interpolationAlpha, stepClock } from "./loop";
import { Renderer } from "./renderer";

// Wires the browser to the Simulation: a fixed-Tick clock, the camera, and drawing.

const HUMAN: PlayerId = 0;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const renderer = new Renderer(canvas);
const match = createMatch(RIVERFORD, Date.now() >>> 0);

let screen: Size = { width: window.innerWidth, height: window.innerHeight };
let view = getPlayerView(match, HUMAN);
const mapSize = { width: view.map.width, height: view.map.height };

const hq = view.buildings.find((b) => b.owner === HUMAN && b.kind === "hq");
let camera: Camera = clampCamera(
  {
    x: ((hq?.x ?? 0) + 1.5) * CELL_PX - screen.width / 2,
    y: ((hq?.y ?? 0) + 1.5) * CELL_PX - screen.height / 2,
  },
  screen,
  mapSize,
);

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  screen = { width: window.innerWidth, height: window.innerHeight };
  canvas.width = Math.round(screen.width * dpr);
  canvas.height = Math.round(screen.height * dpr);
  canvas.style.width = `${screen.width}px`;
  canvas.style.height = `${screen.height}px`;
  camera = clampCamera(camera, screen, mapSize);
}
window.addEventListener("resize", resize);
resize();

const keys = new Set<string>();
let mouse: { x: number; y: number } | null = null;
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }));
document.addEventListener("mouseleave", () => (mouse = null));

/** Longest frame the camera honours, so a backgrounded tab doesn't fling it across the Map. */
const MAX_CAMERA_FRAME_MS = 100;

let clock: Clock = { accumulatedMs: 0 };
// Set on the first frame: rAF timestamps can be earlier than a performance.now() taken at load.
let last: number | null = null;

function frame(now: number): void {
  const frameMs = last === null ? 0 : Math.max(0, now - last);
  last = now;

  const stepped = stepClock(clock, frameMs);
  clock = stepped.clock;
  for (let i = 0; i < stepped.ticks; i++) advanceTick(match);
  if (stepped.ticks > 0) view = getPlayerView(match, HUMAN);

  const cameraSeconds = Math.min(frameMs, MAX_CAMERA_FRAME_MS) / 1000;
  camera = scrollCamera(camera, scrollDirection(keys, mouse, screen), cameraSeconds, screen, mapSize);
  renderer.draw(view, camera, screen, interpolationAlpha(clock));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
