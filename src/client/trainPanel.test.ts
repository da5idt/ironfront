import { describe, expect, it } from "vitest";
import { type BuildingView, TRAINING, type TrainingView, UNIT_STATS } from "../sim";
import { buildButtons } from "./buildPanel";
import { trainButtonAt, trainButtons, trainButtonState, trainClick, trainerOf } from "./trainPanel";

const AREA = { x: 1000, y: 230, width: 220, height: 500 };

function trainer(kind: BuildingView["kind"], training: TrainingView | null, owner: 0 | 1 = 0): BuildingView {
  return { id: 7, kind, owner, x: 3, y: 4, width: 2, height: 2, hp: 600, maxHp: 600, remembered: false, training };
}

const idle: TrainingView = { queue: [], progress: 0, rallyPoint: null };

describe("which Building the side panel trains from", () => {
  it("is the selected own Building when it trains Units", () => {
    const barracks = trainer("barracks", idle);
    expect(trainerOf([barracks], 7)).toBe(barracks);
  });

  it("is none with nothing selected, the HQ selected, or a Building that is gone", () => {
    expect(trainerOf([trainer("barracks", idle)], null)).toBeNull();
    expect(trainerOf([trainer("hq", null)], 7)).toBeNull();
    expect(trainerOf([], 7)).toBeNull();
  });
});

describe("train buttons", () => {
  it("lists what the Building trains, one button each, inside the area", () => {
    expect(trainButtons(AREA, "barracks").map((b) => b.kind)).toEqual(["rifleman"]);
    const buttons = trainButtons(AREA, "vehicleFactory");
    expect(buttons.map((b) => b.kind)).toEqual(["raider", "harvester"]);
    expect(buttons[1]!.rect.y).toBeGreaterThanOrEqual(buttons[0]!.rect.y + buttons[0]!.rect.height);
    // Room for the Unit's picture: the same button as in the build menu.
    expect(buttons.map((b) => b.rect)).toEqual(buildButtons(AREA).slice(0, 2).map((b) => b.rect));
    for (const b of buttons) {
      expect(b.rect.x).toBeGreaterThanOrEqual(AREA.x);
      expect(b.rect.x + b.rect.width).toBeLessThanOrEqual(AREA.x + AREA.width);
    }
  });

  it("finds the button under a point, and nothing elsewhere", () => {
    const buttons = trainButtons(AREA, "vehicleFactory");
    const r = buttons[1]!.rect;
    expect(trainButtonAt(buttons, r.x + 3, r.y + 3)).toBe("harvester");
    expect(trainButtonAt(buttons, r.x + 3, r.y - 1)).toBeNull();
    expect(trainButtonAt(buttons, 5, 5)).toBeNull();
  });
});

describe("train button state", () => {
  const cost = UNIT_STATS.raider.cost;
  const busy: TrainingView = { queue: ["raider", "harvester", "raider"], progress: 0.4, rallyPoint: null };

  it("counts how many of that Unit are queued, with progress only on the one in training", () => {
    expect(trainButtonState(cost, busy, "raider")).toEqual({ status: "available", queued: 2, progress: 0.4 });
    expect(trainButtonState(UNIT_STATS.harvester.cost, busy, "harvester")).toEqual({
      status: "available",
      queued: 1,
      progress: null,
    });
  });

  it("is greyed out when unaffordable or when the queue is full", () => {
    expect(trainButtonState(cost - 1, idle, "raider").status).toBe("unaffordable");
    const full: TrainingView = { queue: Array(TRAINING.queueSize).fill("harvester"), progress: 0, rallyPoint: null };
    expect(trainButtonState(10_000, full, "raider").status).toBe("full");
  });
});

describe("clicking a train button", () => {
  it("trains with a left-click when available, and does nothing when greyed out", () => {
    expect(trainClick(7, idle, 10_000, "raider", "left")).toEqual({ type: "train", buildingId: 7, kind: "raider" });
    expect(trainClick(7, idle, 0, "raider", "left")).toBeNull();
  });

  it("cancels with a right-click when the newest queued Unit is that kind", () => {
    const queued: TrainingView = { queue: ["raider", "harvester"], progress: 0.2, rallyPoint: null };
    expect(trainClick(7, queued, 0, "harvester", "right")).toEqual({ type: "cancelTraining", buildingId: 7 });
    // cancelTraining always takes the newest, so a right-click on the other button would cancel the wrong Unit.
    expect(trainClick(7, queued, 0, "raider", "right")).toBeNull();
    expect(trainClick(7, idle, 0, "raider", "right")).toBeNull();
  });
});
