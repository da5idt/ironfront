import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  type BuildingKind,
  canPlaceBuilding,
  type CellPos,
  type Command,
  createMatch,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
} from "../sim";
import { buildButtons, buttonAt, footprintAt, panelClick } from "./buildPanel";
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
import { computeLayout, contains, type Layout } from "./layout";
import { type Clock, interpolationAlpha, stepClock } from "./loop";
import { cameraOnMinimapPoint } from "./minimap";
import { type Overlay, Renderer } from "./renderer";
import { keyAction, type ScreenOverlay, screenOverlay } from "./screenOverlay";
import {
  boxSelect,
  clickSelect,
  enemyBuildingAt,
  enemyUnitAt,
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
/** A fresh seed for every Match, so a restart is not a replay. */
const newSeed = (): number => (Date.now() ^ (performance.now() * 1000)) >>> 0;
let match: Match = createMatch(RIVERFORD, newSeed());

let screen: Size = { width: window.innerWidth, height: window.innerHeight };
let layout: Layout = computeLayout(screen);
/** The camera's screen size: the Map view, not the whole window, so nothing sits under the side panel. */
let viewSize: Size = layout.mapView;
let view = getPlayerView(match, HUMAN);
const mapSize = { width: view.map.width, height: view.map.height };

function cameraOnHq(): Camera {
  const hq = view.buildings.find((b) => b.owner === HUMAN && b.kind === "hq");
  return clampCamera(
    {
      x: ((hq?.x ?? 0) + 1.5) * CELL_PX - viewSize.width / 2,
      y: ((hq?.y ?? 0) + 1.5) * CELL_PX - viewSize.height / 2,
    },
    viewSize,
    mapSize,
  );
}
let camera: Camera = cameraOnHq();
/** While paused the Simulation gets no Ticks; drawing and the camera carry on. */
let paused = false;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  screen = { width: window.innerWidth, height: window.innerHeight };
  canvas.width = Math.round(screen.width * dpr);
  canvas.height = Math.round(screen.height * dpr);
  canvas.style.width = `${screen.width}px`;
  canvas.style.height = `${screen.height}px`;
  layout = computeLayout(screen);
  viewSize = layout.mapView;
  camera = clampCamera(camera, viewSize, mapSize);
}
window.addEventListener("resize", resize);
resize();

const keys = new Set<string>();
let mouse: { x: number; y: number } | null = null;
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  const action = keyAction(e.code, placing !== null);
  if (action === "cancelPlacement") placing = null;
  else if (action === "togglePause") paused = !paused;
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }));
document.addEventListener("mouseleave", () => (mouse = null));

/** How long the move marker stays on the ground after a right-click. */
const MOVE_MARKER_MS = 600;

let selection: Selection = new Set();
let drag: { start: { x: number; y: number }; now: { x: number; y: number } } | null = null;
let moveMarker: { cell: CellPos; at: number } | null = null;
/** True while the left button, pressed on the minimap, is held: the camera follows the mouse there. */
let minimapDrag = false;

function moveCameraToMinimap(at: { x: number; y: number }): void {
  camera = cameraOnMinimapPoint(layout.minimap, mapSize, viewSize, at.x, at.y);
}

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

/** The finished Building being placed, while the person picks a spot; null otherwise. */
let placing: BuildingKind | null = null;

function clickBuildPanel(at: { x: number; y: number }, button: "left" | "right"): void {
  const kind = buttonAt(buildButtons(layout.buttons), at.x, at.y);
  const action = kind ? panelClick(view, kind, button) : null;
  if (!action) return;
  placing = null;
  if (action.type === "place") {
    placing = action.kind;
  } else {
    issue(action.command);
    // Show the new state at once rather than on the next Tick.
    view = getPlayerView(match, HUMAN);
  }
}

/** The footprint preview under the mouse, or null when not placing or off the Map view. */
function placementPreview(): Overlay["placement"] {
  if (!placing || !mouse || !contains(layout.mapView, mouse.x, mouse.y)) return null;
  const at = footprintAt(placing, screenToCell(camera, mouse.x, mouse.y));
  return { kind: placing, at, valid: canPlaceBuilding(view, placing, at) };
}

// Right-click is the move, attack and harvest button, so the browser menu must not open over the Map.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  const at = { x: e.clientX, y: e.clientY };
  // A Victory, defeat or Paused screen takes every click: nothing is ordered from under it.
  const cover = currentScreenOverlay();
  if (cover) {
    if (e.button === 0 && cover.button && contains(cover.button.rect, at.x, at.y)) restart();
    return;
  }
  if (e.button === 0 && contains(layout.minimap, at.x, at.y)) {
    minimapDrag = true;
    moveCameraToMinimap(at);
    return;
  }
  if (contains(layout.buttons, at.x, at.y)) {
    clickBuildPanel(at, e.button === 0 ? "left" : "right");
    return;
  }
  // The side panel is not the Map: no selection box or order starts there.
  if (!contains(layout.mapView, at.x, at.y)) return;
  if (placing) {
    // Left-click places; right-click leaves placement mode without ordering anyone about.
    if (e.button === 0) {
      const spot = footprintAt(placing, screenToCell(camera, at.x, at.y));
      if (issueCommand(match, HUMAN, { type: "placeBuilding", at: spot }).ok) {
        placing = null;
        view = getPlayerView(match, HUMAN);
      }
    } else if (e.button === 2) {
      placing = null;
    }
    return;
  }
  if (e.button === 0) {
    drag = { start: at, now: at };
  } else if (e.button === 2 && selection.size > 0) {
    const cell = screenToCell(camera, at.x, at.y);
    if (cell.x < 0 || cell.y < 0 || cell.x >= mapSize.width || cell.y >= mapSize.height) return;
    const point = screenToMap(camera, at.x, at.y);
    // A Unit standing in front of a Building is the more urgent target.
    const enemy = enemyUnitAt(view.units, point, HUMAN) ?? enemyBuildingAt(view.buildings, point, HUMAN);
    if (enemy) {
      issue({ type: "attack", unitIds: [...selection], targetId: enemy.id });
      return;
    }
    orderTo(cell);
    moveMarker = { cell, at: performance.now() };
  }
});
window.addEventListener("mousemove", (e) => {
  if (minimapDrag) moveCameraToMinimap({ x: e.clientX, y: e.clientY });
  if (drag) drag.now = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) minimapDrag = false;
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

function currentScreenOverlay(): ScreenOverlay | null {
  return screenOverlay(getMatchStatus(match), paused, HUMAN, screen);
}

/** Throws away the Match and everything the client kept about it, and starts a fresh one. */
function restart(): void {
  match = createMatch(RIVERFORD, newSeed());
  view = getPlayerView(match, HUMAN);
  camera = cameraOnHq();
  selection = new Set();
  drag = null;
  moveMarker = null;
  placing = null;
  paused = false;
  clock = { accumulatedMs: 0 };
}

// A hook for screenshots and manual poking in dev builds only; production has no way in.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __ironfront: {
      // A getter, as a restart replaces the Match.
      get match() {
        return match;
      },
      issue,
      issueAs: (player: PlayerId, command: Command) => issueCommand(match, player, command),
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

  // Paused: no time builds up, so resuming doesn't burst through missed Ticks.
  const stepped = stepClock(clock, paused ? 0 : frameMs);
  clock = stepped.clock;
  for (let i = 0; i < stepped.ticks; i++) advanceTick(match);
  if (stepped.ticks > 0) {
    view = getPlayerView(match, HUMAN);
    selection = pruneSelection(selection, view.units);
  }
  // Nothing left to place (cancelled, or the Match ended): leave placement mode.
  if (placing && !view.production?.ready) placing = null;

  const cameraSeconds = Math.min(frameMs, MAX_CAMERA_FRAME_MS) / 1000;
  // Only a mouse over the Map view edge-scrolls; resting on the side panel must not.
  const edgeMouse = mouse && contains(layout.mapView, mouse.x, mouse.y) ? mouse : null;
  camera = scrollCamera(camera, scrollDirection(keys, edgeMouse, viewSize), cameraSeconds, viewSize, mapSize);
  const markerAge = moveMarker ? (now - moveMarker.at) / MOVE_MARKER_MS : 1;
  if (markerAge >= 1) moveMarker = null;
  renderer.draw(view, camera, screen, layout, interpolationAlpha(clock), {
    selection,
    dragBox: drag && isDrag(drag.start, drag.now) ? { a: drag.start, b: drag.now } : null,
    moveMarker: moveMarker ? { cell: moveMarker.cell, age: Math.max(0, markerAge) } : null,
    placement: placementPreview(),
    screen: currentScreenOverlay(),
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
