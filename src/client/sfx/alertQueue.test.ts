import { describe, expect, it } from "vitest";
import {
  ALERT_KINDS,
  type AlertKind,
  type AlertQueue,
  alertText,
  EMPTY_ALERTS,
  matchEndAlert,
  raiseAlert,
  takeAlert,
} from "./alertQueue";

/** Raises each [kind, seconds] in turn. */
function raised(...events: [AlertKind, number][]): AlertQueue {
  return events.reduce((queue, [kind, at]) => raiseAlert(queue, { kind }, at), EMPTY_ALERTS);
}

/** Takes alerts at `now` until none is left, as a speaker with nothing to say would. */
function takeAll(queue: AlertQueue, now: number): AlertKind[] {
  const taken: AlertKind[] = [];
  for (;;) {
    const next = takeAlert(queue, now);
    queue = next.queue;
    if (next.alert === null) return taken;
    taken.push(next.alert);
  }
}

describe("alert wording", () => {
  it("has the spec's words for each event", () => {
    // Spec #16, user story 38.
    expect(ALERT_KINDS.map((kind) => alertText({ kind }))).toEqual([
      "Building ready",
      "Unit ready",
      "Not enough Credits",
      "Base under attack",
      "Unit lost",
      "Building lost",
      "Victory",
      "Defeat",
    ]);
  });
});

describe("the alert for the end of a Match", () => {
  it("is Victory for the winner and Defeat for the other Player, on the Tick the Match ends", () => {
    expect(matchEndAlert({ state: "running" }, { state: "victory", winner: 0 }, 0)).toEqual({ kind: "victory" });
    expect(matchEndAlert({ state: "running" }, { state: "victory", winner: 1 }, 0)).toEqual({ kind: "defeat" });
  });

  it("is raised once, not on every Tick after the end or while the Match runs", () => {
    expect(matchEndAlert({ state: "victory", winner: 0 }, { state: "victory", winner: 0 }, 0)).toBeNull();
    expect(matchEndAlert({ state: "running" }, { state: "running" }, 0)).toBeNull();
  });
});

describe("raising an alert", () => {
  it("queues it to be said once", () => {
    expect(takeAll(raised(["buildingReady", 5]), 5)).toEqual(["buildingReady"]);
  });
});

describe("alert cooldowns", () => {
  it("says Base under attack at most once every 20 seconds", () => {
    // Spec #16: "Base under attack at most once every 20 seconds".
    expect(takeAll(raised(["baseUnderAttack", 0], ["baseUnderAttack", 1]), 1)).toEqual(["baseUnderAttack"]);
    expect(takeAll(raised(["baseUnderAttack", 0], ["baseUnderAttack", 19.9]), 19.9)).toEqual([]);
    expect(takeAll(raised(["baseUnderAttack", 0], ["baseUnderAttack", 20]), 20)).toEqual(["baseUnderAttack"]);
  });

  it.each(ALERT_KINDS.filter((kind) => kind !== "victory" && kind !== "defeat"))(
    "does not repeat %s half a second later, but does a minute later",
    (kind) => {
      expect(takeAll(raised([kind, 10], [kind, 10.5]), 10.5)).toEqual([kind]);
      expect(takeAll(raised([kind, 10], [kind, 70]), 70)).toEqual([kind]);
    },
  );

  it("keeps one alert's cooldown from silencing another", () => {
    expect(takeAll(raised(["unitLost", 0], ["buildingLost", 0.1]), 0.1)).toEqual(["unitLost", "buildingLost"]);
  });

  it("does not let a refused alert push the cooldown on", () => {
    const queue = raised(["baseUnderAttack", 0], ["baseUnderAttack", 15], ["baseUnderAttack", 21]);
    expect(takeAll(queue, 21)).toEqual(["baseUnderAttack"]);
  });
});

describe("the alert queue", () => {
  it("hands alerts out one at a time, oldest first", () => {
    const queue = raised(["buildingReady", 0], ["unitReady", 0.5], ["creditsShort", 1]);
    const first = takeAlert(queue, 1);
    expect(first.alert).toBe("buildingReady");
    const second = takeAlert(first.queue, 2);
    expect(second.alert).toBe("unitReady");
    expect(takeAlert(second.queue, 3).alert).toBe("creditsShort");
  });

  it("drops an alert that has waited too long instead of saying it late", () => {
    const queue = raised(["unitLost", 0], ["buildingReady", 4]);
    // By 6 s "Unit lost" is old news; "Building ready" is not.
    expect(takeAll(queue, 6)).toEqual(["buildingReady"]);
  });

  it("holds only a few alerts, letting the oldest go", () => {
    const queue = raised(["buildingReady", 0], ["unitReady", 0], ["creditsShort", 0], ["unitLost", 0], ["buildingLost", 0]);
    expect(takeAll(queue, 0)).toEqual(["creditsShort", "unitLost", "buildingLost"]);
  });

  it("puts Victory and defeat ahead of everything, however long they wait", () => {
    const won = raised(["unitLost", 0], ["buildingReady", 0], ["victory", 0.1]);
    expect(takeAlert(won, 0.1).alert).toBe("victory");
    expect(takeAll(raised(["defeat", 0]), 30)).toEqual(["defeat"]);
  });

  it("says nothing more about a Match that is over", () => {
    expect(takeAll(raised(["unitLost", 0], ["buildingLost", 0], ["defeat", 0.1]), 0.1)).toEqual(["defeat"]);
  });

  it("says Victory again for the next Match, with no cooldown", () => {
    const first = takeAlert(raised(["victory", 0]), 0);
    expect(takeAll(raiseAlert(first.queue, { kind: "victory" }, 1), 1)).toEqual(["victory"]);
  });
});
