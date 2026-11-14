import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  type BuildingKind,
  type CellPos,
  type Command,
  createMatch,
  type EntityId,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type Match,
  type PlayerId,
} from "../sim";
import { createOpponent, type Opponent, THINK_EVERY_TICKS } from "../opponent/opponent";
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
import { computeLayout, contains, edgeScroll, type Layout, toMapView } from "./layout";
import { type Clock, interpolationAlpha, stepClock } from "./loop";
import { cameraOnMinimapPoint } from "./minimap";
import { type PlacingOutcome, placingMapClick, placingPreview } from "./placing";
import { present, type Presentation } from "./presentation";
import { type Overlay, Renderer } from "./renderer";
import { keyAction, type ScreenOverlay, screenOverlay } from "./screenOverlay";
import {
  boxSelect,
  clickSelect,
  enemyBuildingAt,
  enemyUnitAt,
  isDrag,
  ownBuildingAt,
  pruneSelection,
  type Selection,
  unitAt,
  unitsInBox,
} from "./selection";
import { createAlertChime } from "./sfx/alertChime";
import { matchEndAlert } from "./sfx/alertQueue";
import { createAlerts } from "./sfx/alerts";
import { createAlertVoice } from "./sfx/alertVoice";
import { createSoundEngine } from "./sfx/engine";
import { alertForEvent, soundEventFor } from "./sfx/eventCues";
import { createMusic } from "./sfx/musicPlayer";
import { moodFor } from "./sfx/musicTimeline";
import { listenerFor } from "./sfx/hearing";
import { channelGain } from "./sfx/mixer";
import { createSfx } from "./sfx/sfx";
import { soundStripAction } from "./sfx/soundStrip";
import { type ButtonTarget, creditsShortPress, keyButtonIndex, sidePanelPress } from "./sidePanel";

// Wires the browser to the Simulation: a fixed-Tick clock, the camera, input
// (selection stays here; Commands go to the Simulation) and drawing.

const HUMAN: PlayerId = 0;
const COMPUTER: PlayerId = 1;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const renderer = new Renderer(canvas);
/** A fresh seed for every Match, so a restart is not a replay. */
const newSeed = (): number => (Date.now() ^ (performance.now() * 1000)) >>> 0;
let match: Match = createMatch(RIVERFORD, newSeed());
let opponent: Opponent = createOpponent(COMPUTER, newSeed());
/** Ticks run in this Match, counted here so the Opponent's cadence costs no PlayerView on the Ticks between. */
let ticksRun = 0;

/**
 * One Tick of the Match. The Computer Opponent thinks first on its cadence,
 * from its own view, and its Commands go in like the person's.
 */
function step(): void {
  if (ticksRun % THINK_EVERY_TICKS === 0 && getMatchStatus(match).state === "running") {
    for (const command of opponent.think(getPlayerView(match, COMPUTER))) issueCommand(match, COMPUTER, command);
  }
  const before = getMatchStatus(match);
  advanceTick(match);
  ticksRun++;
  const ended = matchEndAlert(before, getMatchStatus(match), HUMAN);
  if (ended) alerts.raise(ended, playSeconds);
}

let screen: Size = { width: window.innerWidth, height: window.innerHeight };
let layout: Layout = computeLayout(screen);
/** The camera's screen size: the Map view, not the whole window, so nothing sits under the side panel. */
let viewSize: Size = layout.mapView;
let view = getPlayerView(match, HUMAN);
/** Facings, Turret aim, effects, wrecks and the like: client-only, moved on once for every Tick's view (ADR 0002). */
let presentation: Presentation = present(null, view).state;
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

/** Blocked storage throws on the very mention of it, and sound settings are not worth failing over. */
function settingsStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const soundEngine = createSoundEngine();
const sfx = createSfx(soundEngine, settingsStorage());
/** Spoken alerts: `alerts.raise(event, playSeconds)` from anywhere; said one at a time, on the alerts channel. */
const alerts = createAlerts({
  voice: createAlertVoice(),
  chime: createAlertChime(soundEngine),
  volume: () => channelGain(sfx.settings(), "alerts"),
});
/** Seconds of play: stops while paused, so alert cooldowns and waits do not run under the Paused screen. */
let playSeconds = 0;
const music = createMusic(soundEngine, newSeed());
// Browsers only let sound start from a click or key press. Captured on the window, so this runs
// before the game's own handlers and the very first click already makes its sound.
window.addEventListener("pointerdown", () => soundEngine.unlock(), { capture: true });
window.addEventListener("keydown", () => soundEngine.unlock(), { capture: true });

const keys = new Set<string>();
let mouse: { x: number; y: number } | null = null;
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  const action = keyAction(e.code, placing !== null);
  if (action === "cancelPlacement") placing = null;
  else if (action === "togglePause") paused = !paused;
  // Works under the Paused screen too: silencing the game is never blocked.
  if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey && !e.altKey) sfx.apply({ type: "muteAll" });
  // Ctrl/Cmd/Alt+number belongs to the browser (held-key repeats were already dropped above).
  const index = e.ctrlKey || e.metaKey || e.altKey ? null : keyButtonIndex(e.code);
  // Like a click, a key presses nothing under a Victory, defeat or Paused screen.
  if (index !== null && !currentScreenOverlay()) pressSidePanel({ index }, "left");
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }));
document.addEventListener("mouseleave", () => (mouse = null));

/** How long the move marker stays on the ground after a right-click. */
const MOVE_MARKER_MS = 600;

let selection: Selection = new Set();
/** The selected own Building. Selecting Units clears it, and selecting it clears the Units. */
let selectedBuilding: EntityId | null = null;
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
  sfx.play("orderAck");
}

/** The finished Building being placed, while the person picks a spot; null otherwise. */
let placing: BuildingKind | null = null;

/** A click on, or the number key of, a side panel button: the build menu's or the selected trainer's. */
function pressSidePanel(target: ButtonTarget, button: "left" | "right"): void {
  const action = sidePanelPress(view, selectedBuilding, layout.buttons, target, button);
  if (!action) {
    if (creditsShortPress(view, selectedBuilding, layout.buttons, target, button)) {
      alerts.raise({ kind: "creditsShort" }, playSeconds);
    }
    return;
  }
  sfx.play("menuClick");
  if (action.type === "place") {
    placing = action.kind;
    return;
  }
  issue(action.command);
  // Show the new state at once rather than on the next Tick.
  view = getPlayerView(match, HUMAN);
}

/** Acts on a click on the Map while placing. */
function onPlacingOutcome(outcome: PlacingOutcome): void {
  switch (outcome.type) {
    case "place":
      // The Simulation can still refuse a spot where an unseen Building stands; then placing carries on.
      if (issueCommand(match, HUMAN, outcome.command).ok) {
        placing = null;
        view = getPlayerView(match, HUMAN);
        // Its sound comes with the presentation's "building placed" event on the next Tick, like every other Building's.
      } else {
        // The client thought the spot free; the person hears the same refusal as for a spot it knew was taken.
        sfx.play("cantBuild");
      }
      return;
    case "cantBuildThere":
      // Placing carries on.
      sfx.play("cantBuild");
      return;
    case "cancel":
      placing = null;
      return;
  }
}

/** The footprint preview under the mouse, or null when not placing or off the Map view. */
function placementPreview(): Overlay["placement"] {
  if (!placing || !mouse || !contains(layout.mapView, mouse.x, mouse.y)) return null;
  const m = toMapView(layout, mouse);
  return placingPreview(view, placing, screenToCell(camera, m.x, m.y));
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
  // Before the buttons and the Map: a click on the sound strip is never anything else.
  if (contains(layout.soundStrip, at.x, at.y)) {
    const change = e.button === 0 ? soundStripAction(layout.soundStrip, at.x, at.y) : null;
    if (change) {
      sfx.apply(change);
      // After the change, so the click is heard at the new volume.
      sfx.play("menuClick");
    }
    return;
  }
  if (contains(layout.buttons, at.x, at.y)) {
    pressSidePanel({ point: at }, e.button === 0 ? "left" : "right");
    return;
  }
  // The side panel is not the Map: no selection box or order starts there.
  if (!contains(layout.mapView, at.x, at.y)) return;
  // From here on the point is on the Map, so it is measured from the Map view's corner, as the camera is.
  const inView = toMapView(layout, at);
  if (placing) {
    // While placing, a Map click never selects or orders anyone about.
    if (e.button === 0 || e.button === 2) {
      const cell = screenToCell(camera, inView.x, inView.y);
      onPlacingOutcome(placingMapClick(view, placing, cell, e.button === 0 ? "left" : "right"));
    }
    return;
  }
  if (e.button === 0) {
    drag = { start: at, now: at };
  } else if (e.button === 2 && selection.size === 0 && selectedBuilding !== null) {
    const cell = screenToCell(camera, inView.x, inView.y);
    if (issueCommand(match, HUMAN, { type: "setRallyPoint", buildingId: selectedBuilding, target: cell }).ok) {
      view = getPlayerView(match, HUMAN);
      moveMarker = { cell, at: performance.now() };
      sfx.play("orderAck");
    }
  } else if (e.button === 2 && selection.size > 0) {
    const cell = screenToCell(camera, inView.x, inView.y);
    if (cell.x < 0 || cell.y < 0 || cell.x >= mapSize.width || cell.y >= mapSize.height) return;
    const point = screenToMap(camera, inView.x, inView.y);
    // A Unit standing in front of a Building is the more urgent target.
    const enemy = enemyUnitAt(view.units, point, HUMAN) ?? enemyBuildingAt(view.buildings, point, HUMAN);
    if (enemy) {
      issue({ type: "attack", unitIds: [...selection], targetId: enemy.id });
      sfx.play("orderAck");
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
    const start = toMapView(layout, drag.start);
    const stop = toMapView(layout, end);
    const a = screenToMap(camera, start.x, start.y);
    const b = screenToMap(camera, stop.x, stop.y);
    selection = boxSelect(selection, unitsInBox(view.units, a, b, HUMAN), e.shiftKey);
    selectedBuilding = null;
  } else {
    const stop = toMapView(layout, end);
    const point = screenToMap(camera, stop.x, stop.y);
    const hit = unitAt(view.units, point, HUMAN);
    // A Unit wins over the Building behind it; a plain click on an own Building selects just that.
    const building = !hit && !e.shiftKey ? ownBuildingAt(view.buildings, point, HUMAN) : null;
    selection = building ? new Set() : clickSelect(selection, hit?.id ?? null, e.shiftKey);
    selectedBuilding = building?.id ?? null;
  }
  drag = null;
});

function currentScreenOverlay(): ScreenOverlay | null {
  return screenOverlay(getMatchStatus(match), paused, HUMAN, screen);
}

/** Throws away the Match and everything the client kept about it, and starts a fresh one. */
function restart(): void {
  match = createMatch(RIVERFORD, newSeed());
  // The old Opponent's notes name Units of the old Match.
  opponent = createOpponent(COMPUTER, newSeed());
  ticksRun = 0;
  view = getPlayerView(match, HUMAN);
  presentation = present(null, view).state;
  camera = cameraOnHq();
  selection = new Set();
  // Ids start again from 1 in the new Match, so a kept id could name a different Building.
  selectedBuilding = null;
  drag = null;
  moveMarker = null;
  placing = null;
  paused = false;
  clock = { accumulatedMs: 0 };
}

/** Set only from the dev hook below: whose view is drawn, when not the person's. */
let peekPlayer: PlayerId | null = null;

/** Takes the view of the Tick just run, moves the presentation on by it and plays what happened in it. */
function showTick(): void {
  view = getPlayerView(match, HUMAN);
  const next = present(presentation, peekPlayer === null ? view : getPlayerView(match, peekPlayer));
  presentation = next.state;
  // Only what the view shows is in the events, so nothing under Fog of War is heard.
  for (const event of next.events) {
    const sound = soundEventFor(event);
    if (sound) sfx.playEvent(sound);
    // Alerts are for the person's own things: not for the other Player's while a dev peek shows its view.
    const alert = presentation.playerId === HUMAN ? alertForEvent(event, HUMAN) : null;
    if (alert) alerts.raise(alert, playSeconds);
  }
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
        for (let i = 0; i < ticks; i++) {
          step();
          showTick();
        }
      },
      view: () => view,
      presentation: () => presentation,
      camera: () => camera,
      /** Centres the camera on a Cell. */
      lookAt: (x: number, y: number) => {
        camera = clampCamera(
          { x: (x + 0.5) * CELL_PX - viewSize.width / 2, y: (y + 0.5) * CELL_PX - viewSize.height / 2 },
          viewSize,
          mapSize,
        );
      },
      /** Draws another Player's view (the Opponent's base under its own eyes); null goes back to the person's. */
      peek: (player: PlayerId | null) => (peekPlayer = player),
      sfx,
      soundEngine,
      alerts,
      playSeconds: () => playSeconds,
      music,
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
  // Every Tick's view is shown to the presentation, not just the last: a shot is only in the view of its own Tick.
  for (let i = 0; i < stepped.ticks; i++) {
    step();
    showTick();
  }
  if (stepped.ticks > 0) {
    selection = pruneSelection(selection, view.units);
    if (!view.buildings.some((b) => b.id === selectedBuilding)) selectedBuilding = null;
  }
  // Nothing left to place (cancelled, or the Match ended): leave placement mode.
  if (placing && !view.production?.ready) placing = null;

  const cameraSeconds = Math.min(frameMs, MAX_CAMERA_FRAME_MS) / 1000;
  camera = scrollCamera(camera, scrollDirection(keys, edgeScroll(layout, mouse)), cameraSeconds, viewSize, mapSize);
  // A paused game is quiet; the audio clock stops with it, so sounds and music carry on from where they were.
  soundEngine.setPaused(paused);
  music.setMood(moodFor(getMatchStatus(match), HUMAN));
  sfx.setListener(listenerFor(camera, viewSize));
  if (!paused) playSeconds += frameMs / 1000;
  alerts.update(playSeconds, paused);
  const markerAge = moveMarker ? (now - moveMarker.at) / MOVE_MARKER_MS : 1;
  if (markerAge >= 1) moveMarker = null;
  const drawn = peekPlayer === null ? view : getPlayerView(match, peekPlayer);
  renderer.draw(drawn, camera, screen, layout, interpolationAlpha(clock), {
    selection,
    dragBox:
      drag && isDrag(drag.start, drag.now) ? { a: toMapView(layout, drag.start), b: toMapView(layout, drag.now) } : null,
    moveMarker: moveMarker ? { cell: moveMarker.cell, age: Math.max(0, markerAge) } : null,
    placement: placementPreview(),
    placing,
    selectedBuilding,
    presentation,
    sound: sfx.settings(),
    alert: alerts.banner(playSeconds),
    screen: currentScreenOverlay(),
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
