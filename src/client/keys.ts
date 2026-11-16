import { FIRST_GROUP, LAST_GROUP } from "./controlGroups";

// The one table of what each key does, so changing a key is one edit here.
// Kept pure: the browser's key events are turned into KeyActions and main.ts
// acts on them. Keys are named by KeyboardEvent.code, so they stay in the same
// place on every keyboard layout.

export type KeyAction =
  /** Held, not pressed: scrolls the Map for as long as the key is down. */
  | { readonly type: "scroll"; readonly dx: number; readonly dy: number }
  /** Presses the side panel's button at this place from the top (0 is the top one). */
  | { readonly type: "menuButton"; readonly index: number }
  /** A Control Group's key: with Shift it saves the selection as the group, without it selects the group. */
  | { readonly type: "controlGroup"; readonly group: number; readonly save: boolean }
  /** Arms an Attack-move: the next left-click on the Map or minimap says where. */
  | { readonly type: "attackMove" }
  /** Stops the selected Units. */
  | { readonly type: "stop" }
  /** One zoom step: 1 in, -1 out. */
  | { readonly type: "zoom"; readonly steps: 1 | -1 }
  | { readonly type: "togglePause" }
  /** Escape: backs out of whatever is in progress; see backAction. */
  | { readonly type: "back" }
  | { readonly type: "muteAll" };

/**
 * The Control Group keys: the top row's numbers. Not the number pad's: with
 * NumLock on, Windows hides Shift from a number pad key, so saving a group
 * there would select it instead and lose the selection being saved.
 */
function groupKeys(): Record<string, KeyAction> {
  const keys: Record<string, KeyAction> = {};
  for (let group = FIRST_GROUP; group <= LAST_GROUP; group++) {
    keys[`Digit${group}`] = { type: "controlGroup", group, save: false };
  }
  return keys;
}

const KEYS: Readonly<Record<string, KeyAction>> = {
  ...groupKeys(),
  ArrowLeft: { type: "scroll", dx: -1, dy: 0 },
  ArrowRight: { type: "scroll", dx: 1, dy: 0 },
  ArrowUp: { type: "scroll", dx: 0, dy: -1 },
  ArrowDown: { type: "scroll", dx: 0, dy: 1 },
  KeyZ: { type: "menuButton", index: 0 },
  KeyX: { type: "menuButton", index: 1 },
  KeyC: { type: "menuButton", index: 2 },
  KeyV: { type: "menuButton", index: 3 },
  KeyB: { type: "menuButton", index: 4 },
  // "+" is Shift with this key on most layouts; the plain key zooms as well, so no Shift is needed.
  Equal: { type: "zoom", steps: 1 },
  NumpadAdd: { type: "zoom", steps: 1 },
  Minus: { type: "zoom", steps: -1 },
  NumpadSubtract: { type: "zoom", steps: -1 },
  KeyA: { type: "attackMove" },
  KeyS: { type: "stop" },
  KeyP: { type: "togglePause" },
  Escape: { type: "back" },
  KeyM: { type: "muteAll" },
};

/** The parts of a KeyboardEvent the table reads. */
export interface KeyPress {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * What a key press does, or null for a key with no job. With Ctrl, Cmd or Alt
 * held the key belongs to the browser (a page cannot stop most of those
 * shortcuts), so the game does nothing as well. That is also why saving a
 * Control Group is Shift and not Ctrl with the number.
 */
export function keyAction(press: KeyPress): KeyAction | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  const action = KEYS[press.code] ?? null;
  return action?.type === "controlGroup" ? { ...action, save: press.shiftKey } : action;
}

/** Each menu button's letter by its place from the top, read off the table once. */
const MENU_KEY_LABELS: readonly string[] = Object.entries(KEYS).reduce<string[]>((labels, [code, action]) => {
  if (action.type === "menuButton") labels[action.index] = code.replace(/^Key/, "");
  return labels;
}, []);

/** The letter a side panel button shows for its key, or null for a button no key reaches. */
export function menuKeyLabel(index: number): string | null {
  return MENU_KEY_LABELS[index] ?? null;
}

/**
 * True for the keys that still work under a Victory, defeat or Paused screen:
 * pausing itself, sound, and looking round the Map. Everything that selects
 * or gives a Command does nothing there, like a click.
 */
export function worksUnderScreen(action: KeyAction): boolean {
  return action.type === "togglePause" || action.type === "back" || action.type === "muteAll" || action.type === "scroll";
}

/** Which way the held keys scroll the Map, each axis -1, 0 or 1. */
export function heldScroll(held: ReadonlySet<string>): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const code of held) {
    const action = KEYS[code];
    if (action?.type === "scroll") {
      dx += action.dx;
      dy += action.dy;
    }
  }
  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}

/** Escape first backs out of placing a Building or an armed Attack-move, so it only pauses when there is nothing to back out of. */
export function backAction(
  placing: boolean,
  attackMoveArmed: boolean,
): "cancelPlacement" | "cancelAttackMove" | "togglePause" {
  if (placing) return "cancelPlacement";
  return attackMoveArmed ? "cancelAttackMove" : "togglePause";
}
