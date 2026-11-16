import { describe, expect, it } from "vitest";
import { HQ_BUILDS } from "../sim";
import { backAction, heldScroll, keyAction, type KeyPress, menuKeyLabel, worksUnderScreen } from "./keys";

/** A key press as the browser reports it: the fields of a DOM KeyboardEvent that keys.ts reads (code and the modifier flags). */
function press(code: string, held: Partial<KeyPress> = {}): KeyPress {
  return { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...held };
}

describe("menu keys", () => {
  it("Z, X, C, V and B press the side panel's buttons from the top", () => {
    expect(["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB"].map((code) => keyAction(press(code)))).toEqual([
      { type: "menuButton", index: 0 },
      { type: "menuButton", index: 1 },
      { type: "menuButton", index: 2 },
      { type: "menuButton", index: 3 },
      { type: "menuButton", index: 4 },
    ]);
  });

  it("are shown as their letters on the first five buttons only", () => {
    expect([0, 1, 2, 3, 4].map(menuKeyLabel)).toEqual(["Z", "X", "C", "V", "B"]);
    expect(menuKeyLabel(5)).toBeNull();
  });

  it("reach every button of the longest menu, the HQ's", () => {
    expect(HQ_BUILDS.map((_, index) => menuKeyLabel(index))).not.toContain(null);
    expect(keyAction(press("KeyB"))).toEqual({ type: "menuButton", index: HQ_BUILDS.indexOf("hospital") });
  });

  it("number keys 1 to 4 no longer press buttons", () => {
    for (const code of ["Digit1", "Digit2", "Digit3", "Digit4", "Numpad1", "Numpad4"]) {
      expect(keyAction(press(code))?.type).not.toBe("menuButton");
    }
  });
});

describe("Control Group keys", () => {
  it("a number from 1 to 9 on the top row selects that group", () => {
    expect(keyAction(press("Digit1"))).toEqual({ type: "controlGroup", group: 1, save: false });
    expect(keyAction(press("Digit9"))).toEqual({ type: "controlGroup", group: 9, save: false });
  });

  it("the number pad has no group keys, as Shift cannot be told from no Shift there", () => {
    expect(keyAction(press("Numpad5"))).toBeNull();
    expect(keyAction(press("Numpad5", { shiftKey: true }))).toBeNull();
  });

  it("Shift with the number saves the group", () => {
    expect(keyAction(press("Digit3", { shiftKey: true }))).toEqual({ type: "controlGroup", group: 3, save: true });
  });

  it("0 is not a group", () => {
    expect(keyAction(press("Digit0"))).toBeNull();
    expect(keyAction(press("Numpad0"))).toBeNull();
  });

  it("Ctrl, Cmd and Alt with a number are left to the browser, with or without Shift", () => {
    for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(keyAction(press("Digit1", held))).toBeNull();
      expect(keyAction(press("Digit1", { ...held, shiftKey: true }))).toBeNull();
    }
  });
});

describe("Command keys", () => {
  it("A arms an Attack-move and S stops the selected Units", () => {
    expect(keyAction(press("KeyA"))).toEqual({ type: "attackMove" });
    expect(keyAction(press("KeyS"))).toEqual({ type: "stop" });
  });

  it("do nothing under a Victory, defeat or Paused screen", () => {
    expect(worksUnderScreen({ type: "attackMove" })).toBe(false);
    expect(worksUnderScreen({ type: "stop" })).toBe(false);
  });

  it("U Unloads the selected Troop Carriers, and does nothing under a screen", () => {
    expect(keyAction(press("KeyU"))).toEqual({ type: "unload" });
    expect(worksUnderScreen({ type: "unload" })).toBe(false);
  });

  it("U is left to the browser with Ctrl, Cmd or Alt, where Ctrl+U shows the page's source", () => {
    for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(keyAction(press("KeyU", held))).toBeNull();
    }
  });

});

describe("zoom keys", () => {
  it("+ zooms in and - zooms out, on the main keys and the number pad", () => {
    expect(keyAction(press("Equal"))).toEqual({ type: "zoom", steps: 1 });
    expect(keyAction(press("Equal", { shiftKey: true }))).toEqual({ type: "zoom", steps: 1 });
    expect(keyAction(press("NumpadAdd"))).toEqual({ type: "zoom", steps: 1 });
    expect(keyAction(press("Minus"))).toEqual({ type: "zoom", steps: -1 });
    expect(keyAction(press("NumpadSubtract"))).toEqual({ type: "zoom", steps: -1 });
  });

  it("are left to the browser's own zoom with Ctrl or Cmd, and do nothing under a screen", () => {
    expect(keyAction(press("Equal", { ctrlKey: true }))).toBeNull();
    expect(keyAction(press("Minus", { metaKey: true }))).toBeNull();
    expect(worksUnderScreen({ type: "zoom", steps: 1 })).toBe(false);
  });
});

describe("pause, mute and Escape", () => {
  it("P pauses, M mutes and Escape goes back", () => {
    expect(keyAction(press("KeyP"))).toEqual({ type: "togglePause" });
    expect(keyAction(press("KeyM"))).toEqual({ type: "muteAll" });
    expect(keyAction(press("Escape"))).toEqual({ type: "back" });
  });

  it("Escape leaves placement mode when placing, cancels an armed Attack-move, and toggles pause otherwise", () => {
    expect(backAction(true, false)).toBe("cancelPlacement");
    expect(backAction(false, true)).toBe("cancelAttackMove");
    expect(backAction(false, false)).toBe("togglePause");
  });
});

describe("keys the browser owns", () => {
  it("do nothing with Ctrl, Cmd or Alt held", () => {
    for (const code of ["KeyZ", "KeyP", "KeyM", "Escape", "ArrowLeft", "Digit2"]) {
      expect(keyAction(press(code, { ctrlKey: true }))).toBeNull();
      expect(keyAction(press(code, { metaKey: true }))).toBeNull();
      expect(keyAction(press(code, { altKey: true }))).toBeNull();
    }
  });
});

describe("under a Victory, defeat or Paused screen", () => {
  const actionOf = (code: string, held: Partial<KeyPress> = {}) => keyAction(press(code, held))!;

  it("menu keys and Control Group keys do nothing", () => {
    expect(worksUnderScreen(actionOf("KeyZ"))).toBe(false);
    expect(worksUnderScreen(actionOf("Digit1"))).toBe(false);
    expect(worksUnderScreen(actionOf("Digit1", { shiftKey: true }))).toBe(false);
  });

  it("pause, Escape, mute and scrolling still work", () => {
    for (const code of ["KeyP", "Escape", "KeyM", "ArrowUp"]) expect(worksUnderScreen(actionOf(code))).toBe(true);
  });
});

describe("keys with no job", () => {
  it("W, D and unknown keys do nothing", () => {
    for (const code of ["KeyW", "KeyD", "KeyQ", "Digit0", "Tab"]) {
      expect(keyAction(press(code))).toBeNull();
    }
  });
});

describe("scrolling with held keys", () => {
  it("arrow keys scroll", () => {
    expect(heldScroll(new Set(["ArrowRight"]))).toEqual({ dx: 1, dy: 0 });
    expect(heldScroll(new Set(["ArrowUp", "ArrowLeft"]))).toEqual({ dx: -1, dy: -1 });
    expect(heldScroll(new Set(["ArrowLeft", "ArrowRight"]))).toEqual({ dx: 0, dy: 0 });
    expect(heldScroll(new Set(["ArrowDown"]))).toEqual({ dx: 0, dy: 1 });
  });

  it("W, A, S and D do not", () => {
    expect(heldScroll(new Set(["KeyW", "KeyA", "KeyS", "KeyD"]))).toEqual({ dx: 0, dy: 0 });
  });
});
