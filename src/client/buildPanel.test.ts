import { describe, expect, it } from "vitest";
import { BUILDING_STATS, HQ_BUILDS, type ProductionView } from "../sim";
import { buildButtons, buttonAt, buttonLook, buttonState, footprintAt, type PanelView, panelClick } from "./buildPanel";

const AREA = { x: 1000, y: 230, width: 220, height: 500 };

function viewWith(credits: number, production: ProductionView | null): PanelView {
  return { credits, production };
}

describe("build panel layout and hit testing", () => {
  it("lays out one button per thing the HQ builds, top to bottom inside the area", () => {
    const buttons = buildButtons(AREA);
    expect(buttons.map((b) => b.kind)).toEqual(HQ_BUILDS);
    for (const b of buttons) {
      expect(b.rect.x).toBeGreaterThanOrEqual(AREA.x);
      expect(b.rect.x + b.rect.width).toBeLessThanOrEqual(AREA.x + AREA.width);
      expect(b.rect.y).toBeGreaterThanOrEqual(AREA.y);
    }
    for (let i = 1; i < buttons.length; i++) {
      expect(buttons[i]!.rect.y).toBeGreaterThanOrEqual(buttons[i - 1]!.rect.y + buttons[i - 1]!.rect.height);
    }
  });

  it("finds the button under a point, and nothing between or outside buttons", () => {
    const buttons = buildButtons(AREA);
    const second = buttons[1]!.rect;
    expect(buttonAt(buttons, second.x + 5, second.y + 5)).toBe(buttons[1]!.kind);
    expect(buttonAt(buttons, second.x + 5, second.y - 1)).toBeNull();
    expect(buttonAt(buttons, 10, 10)).toBeNull();
  });
});

describe("build button states", () => {
  const cost = BUILDING_STATS.barracks.cost;

  it("is available when the HQ is free and the Player can afford it", () => {
    expect(buttonState(viewWith(cost, null), "barracks")).toBe("available");
  });

  it("is greyed out when the Player cannot afford it", () => {
    expect(buttonState(viewWith(cost - 1, null), "barracks")).toBe("unaffordable");
  });

  it("is greyed out while the HQ is busy with something else, even if affordable", () => {
    const building = { kind: "turret", progress: 0.3, ready: false } as const;
    expect(buttonState(viewWith(10_000, building), "barracks")).toBe("busy");
  });

  it("shows the Building in progress, then ready to place", () => {
    expect(buttonState(viewWith(0, { kind: "barracks", progress: 0.4, ready: false }), "barracks")).toBe("building");
    expect(buttonState(viewWith(0, { kind: "barracks", progress: 1, ready: true }), "barracks")).toBe("ready");
  });
});

describe("what a build button looks like", () => {
  const ready = viewWith(0, { kind: "barracks", progress: 1, ready: true });

  it("shows 'placing' on the finished Building's button while the person is placing it", () => {
    expect(buttonLook(ready, "barracks", "barracks")).toBe("placing");
  });

  it("shows the button's state when nothing is being placed", () => {
    expect(buttonLook(ready, "barracks", null)).toBe("ready");
    expect(buttonLook(viewWith(10_000, null), "turret", null)).toBe("available");
  });

  it("leaves the other buttons as they are while placing", () => {
    expect(buttonLook(ready, "turret", "barracks")).toBe("busy");
  });
});

describe("clicking a build button", () => {
  const free = viewWith(10_000, null);
  const inProgress = viewWith(0, { kind: "barracks", progress: 0.4, ready: false });
  const ready = viewWith(0, { kind: "barracks", progress: 1, ready: true });

  it("starts an available Building with a left-click", () => {
    expect(panelClick(free, "barracks", "left")).toEqual({
      type: "command",
      command: { type: "startBuilding", kind: "barracks" },
    });
    expect(panelClick(free, "barracks", "right")).toBeNull();
  });

  it("cancels the one in progress with either button", () => {
    const cancel = { type: "command", command: { type: "cancelBuilding" } };
    expect(panelClick(inProgress, "barracks", "left")).toEqual(cancel);
    expect(panelClick(inProgress, "barracks", "right")).toEqual(cancel);
  });

  it("enters placement mode for a finished one, or cancels it with a right-click", () => {
    expect(panelClick(ready, "barracks", "left")).toEqual({ type: "place", kind: "barracks" });
    expect(panelClick(ready, "barracks", "right")).toEqual({ type: "command", command: { type: "cancelBuilding" } });
  });

  it("does nothing on a greyed-out button", () => {
    expect(panelClick(inProgress, "turret", "left")).toBeNull();
    expect(panelClick(viewWith(0, null), "turret", "left")).toBeNull();
  });
});

describe("placement preview position", () => {
  it("centres the footprint on the Cell under the mouse", () => {
    expect(footprintAt("turret", { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
    expect(footprintAt("barracks", { x: 10, y: 10 })).toEqual({ x: 9, y: 9 });
    expect(footprintAt("vehicleFactory", { x: 10, y: 10 })).toEqual({ x: 9, y: 9 });
    expect(footprintAt("refinery", { x: 10, y: 10 })).toEqual({ x: 9, y: 9 });
  });
});
