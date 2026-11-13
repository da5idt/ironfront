import { RIVERFORD } from "../game/maps/riverford";
import { advanceTick, type CellPos, type Command, createMatch, getPlayerView, issueCommand, type PlayerId } from "../sim";
import {
  type Camera,
  CELL_PX,
  clampCamera,
  screenToCell,
  screenToMap,
  scrollCamera,
  scrollDirection,
  type Size,
} from "./camera";
import { type Clock, interpolationAlpha, stepClock } from "./loop";
import { Renderer } from "./renderer";
import {
  boxSelect,
  clickSelect,
  isDrag,
  pruneSelection,
  type Selection,
  unitAt,
  unitsInBox,
} from "./selection";

// Wires the browser to the Simulation: a fixed-Tick clock, the camera, input
// (selection stays here; Commands go to the Simulation) and drawing.

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

/** How long the move marker stays on the ground after a right-click. */
const MOVE_MARKER_MS = 600;

let selection: Selection = new Set();
let drag: { start: { x: number; y: number }; now: { x: number; y: number } } | null = null;
let moveMarker: { cell: CellPos; at: number } | null = null;

function issue(command: Command): void {
  issueCommand(match, HUMAN, command);
}

/** Right-click: on Ore, selected Harvesters harvest it and everything else walks there. */
function orderTo(cell: CellPos): void {
  const ids = [...selection];
  const onOre = (view.map.ore[cell.y * view.map.width + cell.x] ?? 0) > 0;
  const harvesters = onOre
    ? view.units.filter((u) => selection.has(u.id) && u.kind === "harvester").map((u) => u.id)
    : [];
  const others = ids.filter((id) => !harvesters.includes(id));
  if (harvesters.length > 0) issue({ type: "harvest", unitIds: harvesters, target: cell });
  if (others.length > 0) issue({ type: "move", unitIds: others, target: cell });
}

// Right-click is the move button, so the browser menu must not open over the Map.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  const at = { x: e.clientX, y: e.clientY };
  if (e.button === 0) {
    drag = { start: at, now: at };
  } else if (e.button === 2 && selection.size > 0) {
    const cell = screenToCell(camera, at.x, at.y);
    if (cell.x < 0 || cell.y < 0 || cell.x >= mapSize.width || cell.y >= mapSize.height) return;
    orderTo(cell);
    moveMarker = { cell, at: performance.now() };
  }
});
window.addEventListener("mousemove", (e) => {
  if (drag) drag.now = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mouseup", (e) => {
  if (e.button !== 0 || !drag) return;
  const end = { x: e.clientX, y: e.clientY };
  if (isDrag(drag.start, end)) {
    const a = screenToMap(camera, drag.start.x, drag.start.y);
    const b = screenToMap(camera, end.x, end.y);
    selection = boxSelect(selection, unitsInBox(view.units, a, b, HUMAN), e.shiftKey);
  } else {
    const hit = unitAt(view.units, screenToMap(camera, end.x, end.y), HUMAN);
    selection = clickSelect(selection, hit?.id ?? null, e.shiftKey);
  }
  drag = null;
});

// A hook for screenshots and manual poking in dev builds only; production has no way in.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __ironfront: {
      match,
      issue,
      advance: (ticks = 1) => {
        for (let i = 0; i < ticks; i++) advanceTick(match);
        view = getPlayerView(match, HUMAN);
      },
      view: () => view,
      camera: () => camera,
    },
  });
}

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
  if (stepped.ticks > 0) {
    view = getPlayerView(match, HUMAN);
    selection = pruneSelection(selection, view.units);
  }

  const cameraSeconds = Math.min(frameMs, MAX_CAMERA_FRAME_MS) / 1000;
  camera = scrollCamera(camera, scrollDirection(keys, mouse, screen), cameraSeconds, screen, mapSize);
  const markerAge = moveMarker ? (now - moveMarker.at) / MOVE_MARKER_MS : 1;
  if (markerAge >= 1) moveMarker = null;
  renderer.draw(view, camera, screen, interpolationAlpha(clock), {
    selection,
    dragBox: drag && isDrag(drag.start, drag.now) ? { a: drag.start, b: drag.now } : null,
    moveMarker: moveMarker ? { cell: moveMarker.cell, age: Math.max(0, markerAge) } : null,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
