import { describe, expect, it } from "vitest";
import { backAction, heldScroll, keyAction, type KeyPress, menuKeyLabel } from "./keys";

function press(code: string, held: Partial<KeyPress> = {}): KeyPress {
  return { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...held };
}

describe("menu keys", () => {
  it("Z, X, C and V press the side panel's buttons from the top", () => {
    expect(["KeyZ", "KeyX", "KeyC", "KeyV"].map((code) => keyAction(press(code)))).toEqual([
      { type: "menuButton", index: 0 },
      { type: "menuButton", index: 1 },
      { type: "menuButton", index: 2 },
      { type: "menuButton", index: 3 },
    ]);
  });

  it("are shown as their letters on the first four buttons only", () => {
    expect([0, 1, 2, 3].map(menuKeyLabel)).toEqual(["Z", "X", "C", "V"]);
    expect(menuKeyLabel(4)).toBeNull();
  });

  it("number keys 1 to 4 no longer press buttons", () => {
    for (const code of ["Digit1", "Digit2", "Digit3", "Digit4", "Numpad1", "Numpad4"]) {
      expect(keyAction(press(code))?.type).not.toBe("menuButton");
    }
  });
});

describe("Control Group keys", () => {
  it("a number from 1 to 9 selects that group, on the top row or the number pad", () => {
    expect(keyAction(press("Digit1"))).toEqual({ type: "controlGroup", group: 1, save: false });
    expect(keyAction(press("Digit9"))).toEqual({ type: "controlGroup", group: 9, save: false });
    expect(keyAction(press("Numpad5"))).toEqual({ type: "controlGroup", group: 5, save: false });
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

describe("pause, mute and Escape", () => {
  it("P pauses, M mutes and Escape goes back", () => {
    expect(keyAction(press("KeyP"))).toEqual({ type: "togglePause" });
    expect(keyAction(press("KeyM"))).toEqual({ type: "muteAll" });
    expect(keyAction(press("Escape"))).toEqual({ type: "back" });
  });

  it("Escape leaves placement mode when placing, and toggles pause otherwise", () => {
    expect(backAction(true)).toBe("cancelPlacement");
    expect(backAction(false)).toBe("togglePause");
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

describe("keys with no job", () => {
  it("W, A, S, D and unknown keys do nothing", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "Digit0", "Tab"]) {
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
