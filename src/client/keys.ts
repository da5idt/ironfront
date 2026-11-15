// The one table of what each key does, so changing a key is one edit here.
// Kept pure: the browser's key events are turned into KeyActions and main.ts
// acts on them. Keys are named by KeyboardEvent.code, so they stay in the same
// place on every keyboard layout.

export type KeyAction =
  /** Held, not pressed: scrolls the Map for as long as the key is down. */
  | { readonly type: "scroll"; readonly dx: number; readonly dy: number }
  /** Presses the side panel's button at this place from the top (0 is the top one). */
  | { readonly type: "menuButton"; readonly index: number }
  | { readonly type: "togglePause" }
  /** Escape: backs out of whatever is in progress; see backAction. */
  | { readonly type: "back" }
  | { readonly type: "muteAll" };

const KEYS: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: { type: "scroll", dx: -1, dy: 0 },
  ArrowRight: { type: "scroll", dx: 1, dy: 0 },
  ArrowUp: { type: "scroll", dx: 0, dy: -1 },
  ArrowDown: { type: "scroll", dx: 0, dy: 1 },
  KeyZ: { type: "menuButton", index: 0 },
  KeyX: { type: "menuButton", index: 1 },
  KeyC: { type: "menuButton", index: 2 },
  KeyV: { type: "menuButton", index: 3 },
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
}

/**
 * What a key press does, or null for a key with no job. With Ctrl, Cmd or Alt
 * held the key belongs to the browser (a page cannot stop most of those
 * shortcuts), so the game does nothing as well.
 */
export function keyAction(press: KeyPress): KeyAction | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  return KEYS[press.code] ?? null;
}

/** The letter a side panel button shows for its key, or null for a button no key reaches. */
export function menuKeyLabel(index: number): string | null {
  for (const [code, action] of Object.entries(KEYS)) {
    if (action.type === "menuButton" && action.index === index) return code.replace(/^Key/, "");
  }
  return null;
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

/** Escape first backs out of placing a Building, so it only pauses when there is nothing to back out of. */
export function backAction(placing: boolean): "cancelPlacement" | "togglePause" {
  return placing ? "cancelPlacement" : "togglePause";
}
