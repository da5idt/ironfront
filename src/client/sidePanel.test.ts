import { describe, expect, it } from "vitest";
import { BUILDING_STATS, type BuildingView, type ProductionView, TRAINING, type TrainingView, TRAINS, UNIT_STATS } from "../sim";
import { creditsShortPress, type SidePanelView, sidePanelPress } from "./sidePanel";
import { buildButtons } from "./buildPanel";
import { keyAction } from "./keys";
import { trainButtons } from "./trainPanel";

const AREA = { x: 0, y: 230, width: 220, height: 500 };

/**
 * A Building as a Player's view lists its own (BuildingView in src/sim/view.ts): `training` is the queue of
 * a Barracks or Vehicle Factory and null for every other Building; an own Building is never `remembered`.
 * Place, size and health are not read by the side panel.
 */
function building(id: number, kind: BuildingView["kind"], training: TrainingView | null): BuildingView {
  return { id, kind, owner: 0, x: 3, y: 4, width: 2, height: 2, hp: 600, maxHp: 600, remembered: false, training };
}

/** A trainer with nothing queued, as trainingView (src/sim/training.ts) gives it. */
const idle: TrainingView = { queue: [], progress: 0, rallyPoint: null };
const BUILDINGS = [
  building(1, "hq", null),
  building(2, "barracks", idle),
  building(3, "vehicleFactory", idle),
  building(4, "hospital", idle),
];

function panelView(credits: number, production: ProductionView | null = null): SidePanelView {
  return { credits, production, buildings: BUILDINGS };
}

describe("pressing a side panel button by key", () => {
  it("in the HQ build menu starts Refinery, Barracks, Vehicle Factory and Turret for the four menu keys", () => {
    const kinds = [0, 1, 2, 3].map((i) => {
      const action = sidePanelPress(panelView(10_000), null, AREA, { index: i }, "left");
      return action?.type === "command" && action.command.type === "startBuilding" ? action.command.kind : null;
    });
    expect(kinds).toEqual(["refinery", "barracks", "vehicleFactory", "turret"]);
  });

  it("puts a ready Building on the cursor, like a left-click on its button", () => {
    const ready = panelView(0, { kind: "turret", progress: 1, ready: true });
    expect(sidePanelPress(ready, null, AREA, { index: 3 }, "left")).toEqual({ type: "place", kind: "turret" });
  });

  it("with a Barracks selected, trains a Rifleman on the first key and does nothing on the other three", () => {
    const view = panelView(10_000);
    expect(sidePanelPress(view, 2, AREA, { index: 0 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 2, kind: "rifleman" },
    });
    for (const index of [1, 2, 3]) expect(sidePanelPress(view, 2, AREA, { index }, "left")).toBeNull();
  });

  it("with a Vehicle Factory selected, the third key (C) trains a Mechanic; a click on its button does too, a right-click cancels it, and too few Credits greys it", () => {
    const c = { code: "KeyC", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(keyAction(c)).toEqual({ type: "menuButton", index: 2 });
    const train = { type: "command", command: { type: "train", buildingId: 3, kind: "mechanic" } };
    expect(sidePanelPress(panelView(10_000), 3, AREA, { index: 2 }, "left")).toEqual(train);
    const rect = trainButtons(AREA, "vehicleFactory")[2]!.rect;
    const point = { x: rect.x + 1, y: rect.y + 1 };
    expect(sidePanelPress(panelView(UNIT_STATS.mechanic.cost), 3, AREA, { point }, "left")).toEqual(train);
    expect(sidePanelPress(panelView(UNIT_STATS.mechanic.cost - 1), 3, AREA, { point }, "left")).toBeNull();
    expect(creditsShortPress(panelView(UNIT_STATS.mechanic.cost - 1), 3, AREA, { point }, "left")).toBe(true);
    const queued: TrainingView = { queue: ["raider", "mechanic"], progress: 0.5, rallyPoint: null };
    const view = { ...panelView(0), buildings: [building(3, "vehicleFactory", queued)] };
    expect(sidePanelPress(view, 3, AREA, { point }, "right")).toEqual({
      type: "command",
      command: { type: "cancelTraining", buildingId: 3 },
    });
  });

  it("with a Vehicle Factory selected, trains a Raider on the first key, a Harvester on the second and a Troop Carrier on its last button", () => {
    const view = panelView(10_000);
    expect(sidePanelPress(view, 3, AREA, { index: 0 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 3, kind: "raider" },
    });
    expect(sidePanelPress(view, 3, AREA, { index: 1 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 3, kind: "harvester" },
    });
    const last = TRAINS.vehicleFactory!.length - 1;
    expect(sidePanelPress(view, 3, AREA, { index: last }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 3, kind: "troopCarrier" },
    });
    // No button past the last: the next key does nothing.
    expect(sidePanelPress(view, 3, AREA, { index: last + 1 }, "left")).toBeNull();
  });

  it("with a Hospital selected, trains a Medic on the first key (Z) and does nothing on the others", () => {
    const view = panelView(10_000);
    const z = { code: "KeyZ", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(keyAction(z)).toEqual({ type: "menuButton", index: 0 });
    expect(sidePanelPress(view, 4, AREA, { index: 0 }, "left")).toEqual({
      type: "command",
      command: { type: "train", buildingId: 4, kind: "medic" },
    });
    for (const index of [1, 2, 3, 4]) expect(sidePanelPress(view, 4, AREA, { index }, "left")).toBeNull();
  });

  it("with a Hospital selected, a right-click on the Medic button cancels the newest Medic in the queue", () => {
    const queued: TrainingView = { queue: ["medic", "medic"], progress: 0.5, rallyPoint: null };
    const view = { ...panelView(0), buildings: [building(4, "hospital", queued)] };
    const rect = trainButtons(AREA, "hospital")[0]!.rect;
    expect(sidePanelPress(view, 4, AREA, { point: { x: rect.x + 1, y: rect.y + 1 } }, "right")).toEqual({
      type: "command",
      command: { type: "cancelTraining", buildingId: 4 },
    });
    // No Credits for a third: a left press is the "Credits short" kind, as at the Barracks.
    expect(creditsShortPress(view, 4, AREA, { index: 0 }, "left")).toBe(true);
  });

  it("does nothing on a greyed-out button", () => {
    expect(sidePanelPress(panelView(UNIT_STATS.rifleman.cost - 1), 2, AREA, { index: 0 }, "left")).toBeNull();
    expect(sidePanelPress(panelView(0), null, AREA, { index: 1 }, "left")).toBeNull();
  });
});

describe("clicking a side panel button", () => {
  it("does the same as its key", () => {
    const view = panelView(10_000);
    const middle = (r: { x: number; y: number; width: number; height: number }) => ({
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    });
    const first = sidePanelPress(view, null, AREA, { index: 0 }, "left");
    const firstBuild = buildButtons(AREA)[0]!.rect;
    expect(sidePanelPress(view, null, AREA, { point: middle(firstBuild) }, "left")).toEqual(first);
    const trained = sidePanelPress(view, 3, AREA, { index: 1 }, "left");
    const secondTrain = trainButtons(AREA, "vehicleFactory")[1]!.rect;
    expect(sidePanelPress(view, 3, AREA, { point: middle(secondTrain) }, "left")).toEqual(trained);
  });

  it("a key or a left-click on the Building in progress does nothing, while a right-click on it cancels", () => {
    const view = { ...panelView(10_000), production: { kind: "barracks" as const, progress: 0.5, ready: false } };
    expect(sidePanelPress(view, null, AREA, { index: 1 }, "left")).toBeNull();
    const rect = buildButtons(AREA)[1]!.rect;
    expect(sidePanelPress(view, null, AREA, { point: { x: rect.x + 1, y: rect.y + 1 } }, "left")).toBeNull();
    expect(sidePanelPress(view, null, AREA, { point: { x: rect.x + 1, y: rect.y + 1 } }, "right")).toEqual({
      type: "command",
      command: { type: "cancelBuilding" },
    });
  });

  it("does nothing between buttons", () => {
    expect(sidePanelPress(panelView(10_000), null, AREA, { point: { x: 20, y: AREA.y + 5 } }, "left")).toBeNull();
  });
});

describe("a press refused for want of Credits", () => {
  const barracksKey = { index: 1 };
  const short = BUILDING_STATS.barracks.cost - 1;

  it("is a left press, by key or click, on a Building the Player cannot pay for", () => {
    expect(creditsShortPress(panelView(short), null, AREA, barracksKey, "left")).toBe(true);
    const rect = buildButtons(AREA)[1]!.rect;
    expect(creditsShortPress(panelView(short), null, AREA, { point: { x: rect.x + 1, y: rect.y + 1 } }, "left")).toBe(true);
  });

  it("is a left press on a Unit the Player cannot pay for", () => {
    expect(creditsShortPress(panelView(UNIT_STATS.rifleman.cost - 1), 2, AREA, { index: 0 }, "left")).toBe(true);
  });

  it("is not a press that goes through", () => {
    expect(creditsShortPress(panelView(BUILDING_STATS.barracks.cost), null, AREA, barracksKey, "left")).toBe(false);
    expect(creditsShortPress(panelView(UNIT_STATS.rifleman.cost), 2, AREA, { index: 0 }, "left")).toBe(false);
  });

  it("is not a press refused for another reason", () => {
    // The HQ is busy with something else: more Credits would not help.
    const busy = panelView(0, { kind: "turret", progress: 0.2, ready: false });
    expect(creditsShortPress(busy, null, AREA, barracksKey, "left")).toBe(false);
    // The queue is full.
    const full: TrainingView = { queue: Array(TRAINING.queueSize).fill("rifleman"), progress: 0, rallyPoint: null };
    const view = { ...panelView(0), buildings: [building(2, "barracks", full)] };
    expect(creditsShortPress(view, 2, AREA, { index: 0 }, "left")).toBe(false);
  });

  it("is not a right-click, which only ever cancels", () => {
    expect(creditsShortPress(panelView(short), null, AREA, barracksKey, "right")).toBe(false);
  });

  it("is not a press where there is no button", () => {
    expect(creditsShortPress(panelView(0), null, AREA, { point: { x: 20, y: AREA.y + 5 } }, "left")).toBe(false);
    expect(creditsShortPress(panelView(0), 2, AREA, { index: 3 }, "left")).toBe(false);
  });
});
