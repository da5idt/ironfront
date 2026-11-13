import { describe, expect, it } from "vitest";
import { contains } from "./layout";
import { keyAction, restartButton, screenOverlay } from "./screenOverlay";

const SCREEN = { width: 1000, height: 600 };

describe("the screen overlay", () => {
  it("shows nothing while the Match runs unpaused", () => {
    expect(screenOverlay({ state: "running" }, false, 0, SCREEN)).toBeNull();
  });

  it("shows Paused, with no button, while paused", () => {
    expect(screenOverlay({ state: "running" }, true, 0, SCREEN)).toEqual({ title: "Paused", tone: "neutral", button: null });
  });

  it("shows Victory to the winner and Defeat to the loser, each with a Restart button", () => {
    const won = screenOverlay({ state: "victory", winner: 0 }, false, 0, SCREEN);
    expect(won).toMatchObject({ title: "Victory", tone: "good", button: { label: "Restart" } });
    const lost = screenOverlay({ state: "victory", winner: 1 }, false, 0, SCREEN);
    expect(lost).toMatchObject({ title: "Defeat", tone: "bad", button: { label: "Restart" } });
  });

  it("shows the end of the Match rather than Paused when both apply", () => {
    expect(screenOverlay({ state: "victory", winner: 0 }, true, 0, SCREEN)?.title).toBe("Victory");
  });
});

describe("the Restart button", () => {
  it("sits centred below the middle of the screen, and is hit inside only", () => {
    const r = restartButton(SCREEN);
    expect(r.x + r.width / 2).toBe(500);
    expect(r.y).toBeGreaterThan(300);
    expect(contains(r, 500, r.y + 1)).toBe(true);
    expect(contains(r, 500, r.y - 1)).toBe(false);
  });
});

describe("keys", () => {
  it("P always toggles pause", () => {
    expect(keyAction("KeyP", false)).toBe("togglePause");
    expect(keyAction("KeyP", true)).toBe("togglePause");
  });

  it("Escape leaves placement mode when placing, and toggles pause otherwise", () => {
    expect(keyAction("Escape", true)).toBe("cancelPlacement");
    expect(keyAction("Escape", false)).toBe("togglePause");
  });

  it("other keys do nothing here", () => {
    expect(keyAction("KeyW", false)).toBeNull();
  });
});
