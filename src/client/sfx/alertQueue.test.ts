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

/**
 * Plays out a list of steps in order, as the game does: ["raise", kind, at]
 * reports an event, ["take", at] is the speaker falling silent and asking
 * for the next alert. Gives what was said and the queue left over.
 */
type Step = readonly ["raise", AlertKind, number] | readonly ["take", number];
function play(...steps: Step[]): { said: AlertKind[]; queue: AlertQueue } {
  let queue = EMPTY_ALERTS;
  const said: AlertKind[] = [];
  for (const step of steps) {
    if (step[0] === "raise") {
      queue = raiseAlert(queue, { kind: step[1] }, step[2]);
      continue;
    }
    const next = takeAlert(queue, step[1]);
    queue = next.queue;
    if (next.alert !== null) said.push(next.alert);
  }
  return { said, queue };
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
  it("has our own words for each of the spec's moments", () => {
    // The moments are spec #16's (user story 38); the wording is deliberately our own (ADR 0003).
    expect(ALERT_KINDS.map((kind) => alertText({ kind }))).toEqual([
      "Building finished",
      "Unit trained",
      "Not enough Credits",
      "Your buildings are taking fire",
      "A unit has fallen",
      "A building was destroyed",
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

  it("does not queue the same alert twice while it waits", () => {
    // A fight reports "under attack" every Tick; it is still one thing to say.
    expect(takeAll(raised(["buildingsUnderAttack", 0], ["buildingsUnderAttack", 0.05], ["buildingsUnderAttack", 0.1]), 0.1)).toEqual([
      "buildingsUnderAttack",
    ]);
  });
});

describe("alert cooldowns", () => {
  it("says Your buildings are taking fire at most once every 20 seconds", () => {
    // Spec #16: the under-attack alert at most once every 20 seconds.
    const said = (again: number) =>
      play(["raise", "buildingsUnderAttack", 0], ["take", 0], ["raise", "buildingsUnderAttack", again], ["take", again]).said;
    expect(said(1)).toEqual(["buildingsUnderAttack"]);
    expect(said(19.9)).toEqual(["buildingsUnderAttack"]);
    expect(said(20)).toEqual(["buildingsUnderAttack", "buildingsUnderAttack"]);
  });

  it.each(ALERT_KINDS.filter((kind) => kind !== "victory" && kind !== "defeat"))(
    "does not repeat %s half a second after it was said, but does a minute after",
    (kind) => {
      expect(play(["raise", kind, 10], ["take", 10], ["raise", kind, 10.5], ["take", 10.5]).said).toEqual([kind]);
      expect(play(["raise", kind, 10], ["take", 10], ["raise", kind, 70], ["take", 70]).said).toEqual([kind, kind]);
    },
  );

  it("keeps one alert's cooldown from silencing another", () => {
    expect(takeAll(raised(["unitLost", 0], ["buildingLost", 0.1]), 0.1)).toEqual(["unitLost", "buildingLost"]);
  });

  it("does not let an alert refused inside its cooldown push the cooldown on", () => {
    const { said } = play(
      ["raise", "buildingsUnderAttack", 0],
      ["take", 0],
      ["raise", "buildingsUnderAttack", 15],
      ["take", 15],
      ["raise", "buildingsUnderAttack", 21],
      ["take", 21],
    );
    expect(said).toEqual(["buildingsUnderAttack", "buildingsUnderAttack"]);
  });

  it("starts counting when the alert is said, not when it was raised", () => {
    // Raised at 0 but said only at 3, behind something else: the next may come 20 s after it was heard.
    const said = (again: number) =>
      play(["raise", "buildingsUnderAttack", 0], ["take", 3], ["raise", "buildingsUnderAttack", again], ["take", again]).said;
    expect(said(21)).toEqual(["buildingsUnderAttack"]);
    expect(said(23)).toEqual(["buildingsUnderAttack", "buildingsUnderAttack"]);
  });

  it("is not started by an alert that was dropped unsaid", () => {
    // "A unit has fallen" went stale waiting and nobody heard it, so the next loss is said: its cooldown never began.
    const { said } = play(["raise", "unitLost", 0], ["take", 6], ["raise", "unitLost", 7], ["take", 7]);
    expect(said).toEqual(["unitLost"]);
  });

  it("lets a stale alert be raised afresh while the old one still sits in the queue", () => {
    const { said } = play(["raise", "unitLost", 0], ["raise", "unitLost", 6], ["take", 6]);
    expect(said).toEqual(["unitLost"]);
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

  it("drops a battle alert that has waited too long instead of saying it late", () => {
    const queue = raised(["unitLost", 0], ["buildingLost", 4]);
    // By 6 s "A unit has fallen" is old news; "A building was destroyed" is not.
    expect(takeAll(queue, 6)).toEqual(["buildingLost"]);
  });

  it("drops Not enough Credits when it has waited too long: the button press it answers is forgotten", () => {
    expect(takeAll(raised(["creditsShort", 0]), 6)).toEqual([]);
  });

  it.each(["buildingReady", "unitReady"] as const)("says %s however long it waited: it happened once and is still true", (kind) => {
    expect(takeAll(raised([kind, 0]), 30)).toEqual([kind]);
  });

  it("says battle alerts before ready alerts that were raised earlier", () => {
    // The ready ones keep; an attack does not.
    const queue = raised(["buildingReady", 0], ["unitReady", 0], ["creditsShort", 0], ["buildingsUnderAttack", 0.5], ["unitLost", 0.6]);
    expect(takeAll(queue, 1)).toEqual(["buildingsUnderAttack", "unitLost", "buildingReady", "unitReady", "creditsShort"]);
  });

  it("loses no alert to a full queue: each kind waits at most once, so there is room for all", () => {
    const queue = raised(["buildingReady", 0], ["unitReady", 0], ["creditsShort", 0], ["unitLost", 0], ["buildingLost", 0]);
    expect(takeAll(queue, 0).sort()).toEqual(["buildingLost", "buildingReady", "creditsShort", "unitLost", "unitReady"]);
  });

  it("puts Victory and defeat ahead of everything, however long they wait", () => {
    const won = raised(["unitLost", 0], ["buildingReady", 0], ["victory", 0.1]);
    expect(takeAlert(won, 0.1).alert).toBe("victory");
    expect(takeAll(raised(["defeat", 0]), 30)).toEqual(["defeat"]);
  });

  it("says nothing more about a Match that is over", () => {
    expect(takeAll(raised(["unitLost", 0], ["buildingLost", 0], ["defeat", 0.1]), 0.1)).toEqual(["defeat"]);
  });

  it("takes nothing raised after the Match is over, said or not yet said", () => {
    // The last Building's fall is reported in the same Tick as the defeat it causes, and just after it.
    expect(takeAll(raised(["defeat", 5], ["buildingLost", 5], ["buildingsUnderAttack", 5]), 5)).toEqual(["defeat"]);
    expect(
      play(
        ["raise", "defeat", 5],
        ["take", 5],
        ["raise", "buildingLost", 5.05],
        ["raise", "unitLost", 6],
        ["raise", "buildingReady", 7],
        ["take", 8],
        ["take", 30],
      ).said,
    ).toEqual(["defeat"]);
  });

  it("says the end of a Match once, whatever is raised after it", () => {
    expect(play(["raise", "victory", 0], ["take", 0], ["raise", "victory", 1], ["raise", "defeat", 2], ["take", 3]).said).toEqual([
      "victory",
    ]);
  });

  it("says Victory again for the next Match, which starts from an empty queue", () => {
    expect(takeAll(raised(["victory", 0]), 0)).toEqual(["victory"]);
    expect(takeAll(raised(["victory", 1]), 1)).toEqual(["victory"]);
  });
});
