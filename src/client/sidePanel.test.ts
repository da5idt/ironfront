import { describe, expect, it } from "vitest";
import { type BuildingView, type ProductionView, type TrainingView, UNIT_STATS } from "../sim";
import { buttonKeyLabel, keyButtonIndex, type SidePanelView, sidePanelPress } from "./sidePanel";

const AREA = { x: 0, y: 230, width: 220, height: 500 };

function building(id: number, kind: BuildingView["kind"], training: TrainingView | null): BuildingView {
  return { id, kind, owner: 0, x: 3, y: 4, width: 2, height: 2, hp: 600, maxHp: 600, remembered: false, training };
}

const idle: TrainingView = { queue: [], progress: 0, rallyPoint: null };
const BUILDINGS = [building(1, "hq", null), building(2, "barracks", idle), building(3, "vehicleFactory", idle)];

function panelView(credits: number, production: ProductionView | null = null): SidePanelView {
  return { credits, production, buildings: BUILDINGS };
}

describe("number keys", () => {
  it("map 1 to 4, on the top row or the number pad, to the buttons from the top", () => {
    expect(keyButtonIndex("Digit1")).toBe(0);
    expect(keyButtonIndex("Digit4")).toBe(3);
    expect(keyButtonIndex("Numpad2")).toBe(1);
  });

  it("leave every other key alone", () => {
    expect(keyButtonIndex("Digit0")).toBeNull();
    expect(keyButtonIndex("Digit5")).toBeNull();
    expect(keyButtonIndex("KeyA")).toBeNull();
    expect(keyButtonIndex("Escape")).toBeNull();
  });

  it("are shown on the first four buttons only", () => {
    expect([0, 1, 2, 3].map(buttonKeyLabel)).toEqual(["1", "2", "3", "4"]);
    expect(buttonKeyLabel(4)).toBeNull();
  });
});

describe("pressing a side panel button by key", () => {
  it("in the HQ build menu starts Refinery, Barracks, Vehicle Factory and Turret for keys 1 to 4", () => {
    const kinds = [0, 1, 2, 3].map((i) => {
      const action = sidePanelPress(panelView(10_000), null, AREA, { key: i }, "left");
      return action?.type === "command" && action.command.type === "startBuilding" ? action.command.kind : null;
    });
    expect(kinds).toEqual(["refinery", "barracks", "vehicleFactory", "turret"]);
  });

  it("puts a ready Building on the cursor, like a left-click on its button", () => {
    const ready = panelView(0, { kind: "turret", progress: 1, ready: true });
    expect(sidePanelPress(ready, null, AREA, { key: 3 }, "left")).toEqual({ type: "place", kind: "turret" });
  });

  it("with a Barracks selected, trains a Rifleman on 1 and does nothing on 2 to 4", () => {
    const view = panelView(10_000);
    expect(sidePanelPress(view, 2, AREA, { key: 0 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 2, kind: "rifleman" },
    });
    for (const key of [1, 2, 3]) expect(sidePanelPress(view, 2, AREA, { key }, "left")).toBeNull();
  });

  it("with a Vehicle Factory selected, trains a Raider on 1 and a Harvester on 2, and nothing on 3", () => {
    const view = panelView(10_000);
    expect(sidePanelPress(view, 3, AREA, { key: 0 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 3, kind: "raider" },
    });
    expect(sidePanelPress(view, 3, AREA, { key: 1 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 3, kind: "harvester" },
    });
    expect(sidePanelPress(view, 3, AREA, { key: 2 }, "left")).toBeNull();
  });

  it("does nothing on a greyed-out button", () => {
    expect(sidePanelPress(panelView(UNIT_STATS.rifleman.cost - 1), 2, AREA, { key: 0 }, "left")).toBeNull();
    expect(sidePanelPress(panelView(0), null, AREA, { key: 1 }, "left")).toBeNull();
  });
});

describe("clicking a side panel button", () => {
  it("does the same as its key", () => {
    const view = panelView(10_000);
    // The second build button sits one button height plus a gap below the first.
    const first = sidePanelPress(view, null, AREA, { key: 0 }, "left");
    expect(sidePanelPress(view, null, AREA, { point: { x: 20, y: AREA.y + 25 } }, "left")).toEqual(first);
    const trained = sidePanelPress(view, 3, AREA, { key: 1 }, "left");
    expect(sidePanelPress(view, 3, AREA, { point: { x: 20, y: AREA.y + 75 } }, "left")).toEqual(trained);
  });

  it("does nothing between buttons", () => {
    expect(sidePanelPress(panelView(10_000), null, AREA, { point: { x: 20, y: AREA.y + 5 } }, "left")).toBeNull();
  });
});
