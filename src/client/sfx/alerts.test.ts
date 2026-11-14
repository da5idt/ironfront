import { describe, expect, it } from "vitest";
import { type AlertVoice, BANNER_SECONDS, createAlerts } from "./alerts";

/**
 * Stands in for the browser voice (alertVoice.ts, createAlertVoice) and
 * copies how it behaves:
 * - say() answers false when there is no local voice to say it with;
 * - it holds one current utterance, and a report about any other is dropped
 *   (its `finish` checks `current !== utterance`);
 * - the end of the words is reported once, through the callback given;
 * - cancel() reports nothing itself. The browser tells of the cut-off words
 *   later, as an "interrupted" or "canceled" error on the utterance, which
 *   alertVoice.ts passes on as said. Here that report waits until the test
 *   calls deliver(), so a test can let other things happen first.
 */
function fakeVoice(hasVoice = true) {
  interface Utterance {
    readonly ended: (said: boolean) => void;
  }
  const said: { text: string; volume: number }[] = [];
  let current: Utterance | null = null;
  /** Reports the browser has yet to make. */
  const late: (() => void)[] = [];
  let cancels = 0;
  const report = (utterance: Utterance, ok: boolean): void => {
    if (current !== utterance) return;
    current = null;
    utterance.ended(ok);
  };
  const voice: AlertVoice = {
    say(text, volume, ended) {
      if (!hasVoice) return false;
      said.push({ text, volume });
      current = { ended };
      return true;
    },
    cancel() {
      cancels++;
      const cut = current;
      if (cut) late.push(() => report(cut, true));
    },
  };
  return {
    voice,
    said,
    /** The browser reports the end of what is being said: true for said, false for refused. */
    finish(ok: boolean): void {
      if (current) report(current, ok);
    },
    /** The browser gets round to reporting the words cut off by cancel(). */
    deliver(): void {
      for (const make of late.splice(0)) make();
    },
    cancels: () => cancels,
    speaking: () => current !== null,
  };
}

function setup(hasVoice = true) {
  const fake = fakeVoice(hasVoice);
  const mixer = { volume: 0.64 };
  let chimes = 0;
  /** Whether the person has clicked or pressed a key yet; most tests start after that. */
  const person = { hasActed: true };
  const alerts = createAlerts({
    voice: fake.voice,
    chime: () => void chimes++,
    volume: () => mixer.volume,
    soundUnlocked: () => person.hasActed,
  });
  return { ...fake, alerts, mixer, person, chimes: () => chimes };
}

describe("speaking alerts", () => {
  it("says a raised alert at the alerts channel's volume", () => {
    const { alerts, said } = setup();
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.update(1, false);
    expect(said).toEqual([{ text: "Building ready", volume: 0.64 }]);
  });

  it("shows no banner for an alert that is spoken", () => {
    const { alerts, chimes } = setup();
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.update(1, false);
    expect(alerts.banner(1)).toBeNull();
    expect(chimes()).toBe(0);
  });

  it("waits for one alert to end before saying the next", () => {
    const { alerts, said, finish } = setup();
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.raise({ kind: "unitReady" }, 1);
    alerts.update(1, false);
    alerts.update(1.5, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready"]);
    finish(true);
    alerts.update(2, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready", "Unit ready"]);
  });

  it("says nothing while the channel is muted, and shows the text instead", () => {
    const { alerts, said, mixer } = setup();
    mixer.volume = 0;
    alerts.raise({ kind: "unitLost" }, 1);
    alerts.update(1, false);
    expect(said).toEqual([]);
    expect(alerts.banner(1)).toBe("Unit lost");
  });

  it("cuts the alert off when the channel is muted halfway through", () => {
    const { alerts, mixer, cancels, speaking, deliver } = setup();
    alerts.raise({ kind: "baseUnderAttack" }, 1);
    alerts.update(1, false);
    mixer.volume = 0;
    alerts.update(1.2, false);
    expect(cancels()).toBe(1);
    deliver();
    expect(speaking()).toBe(false);
  });

  it("takes the late report of a cut-off alert for what it is, and not for a refusal or the end of anything else", () => {
    const { alerts, mixer, deliver, chimes } = setup();
    alerts.raise({ kind: "baseUnderAttack" }, 1);
    alerts.update(1, false);
    mixer.volume = 0;
    alerts.update(1.2, false);
    alerts.update(1.3, false);
    deliver();
    alerts.update(1.4, false);
    // Cut off on purpose: no chime and no text for it.
    expect(chimes()).toBe(0);
    expect(alerts.banner(1.4)).toBeNull();
  });

  it("moves on when the browser never reports the end of an alert", () => {
    const { alerts, said } = setup();
    alerts.raise({ kind: "buildingReady" }, 0);
    alerts.update(0, false);
    alerts.raise({ kind: "unitReady" }, 9);
    alerts.update(9, false);
    alerts.update(9.1, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready", "Unit ready"]);
  });

  it("falls back to the chime and the text when the browser refuses to speak", () => {
    const { alerts, finish, chimes } = setup();
    alerts.raise({ kind: "victory" }, 1);
    alerts.update(1, false);
    finish(false);
    alerts.update(1.1, false);
    expect(chimes()).toBe(1);
    expect(alerts.banner(1.1)).toBe("Victory");
  });
});

describe("alerts before the first click or key press", () => {
  // Spec #16, story 45: sound starts only after the person's first click or key press.
  it("says nothing aloud and shows the text instead", () => {
    const { alerts, said, person } = setup();
    person.hasActed = false;
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.update(1, false);
    expect(said).toEqual([]);
    expect(alerts.banner(1)).toBe("Building ready");
  });

  it("speaks the alerts raised once the person has clicked or pressed a key", () => {
    const { alerts, said, person } = setup();
    person.hasActed = false;
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.update(1, false);
    person.hasActed = true;
    alerts.raise({ kind: "unitReady" }, 4);
    alerts.update(4, false);
    expect(said.map((s) => s.text)).toEqual(["Unit ready"]);
  });
});

describe("an alert cut off while another is waiting", () => {
  it("does not let the late report about the old alert end the new one", () => {
    const { alerts, said, deliver, finish } = setup();
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.raise({ kind: "unitReady" }, 1);
    alerts.raise({ kind: "creditsShort" }, 1);
    alerts.update(1, false);
    // Paused and at once carried on: "Building ready" is cut off and "Unit ready" starts...
    alerts.update(1.1, true);
    alerts.update(1.2, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready", "Unit ready"]);
    // ...and only now does the browser report the first one's end.
    deliver();
    alerts.update(1.3, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready", "Unit ready"]);
    finish(true);
    alerts.update(1.4, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready", "Unit ready", "Not enough Credits"]);
  });
});

describe("starting a new Match", () => {
  it("stops the alert being said and forgets the ones waiting", () => {
    const { alerts, said, cancels, deliver } = setup();
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.raise({ kind: "unitReady" }, 1);
    alerts.update(1, false);
    alerts.reset();
    expect(cancels()).toBe(1);
    deliver();
    alerts.update(1.5, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready"]);
  });

  it("takes the old Match's text off the screen", () => {
    const { alerts } = setup(false);
    alerts.raise({ kind: "defeat" }, 10);
    alerts.update(10, false);
    expect(alerts.banner(10.5)).toBe("Defeat");
    alerts.reset();
    expect(alerts.banner(10.5)).toBeNull();
  });

  it("clears the cooldowns, so the new Match's first alerts are said", () => {
    const { alerts, said, finish } = setup();
    alerts.raise({ kind: "baseUnderAttack" }, 1);
    alerts.update(1, false);
    finish(true);
    alerts.reset();
    alerts.raise({ kind: "baseUnderAttack" }, 3);
    alerts.update(3, false);
    expect(said.map((s) => s.text)).toEqual(["Base under attack", "Base under attack"]);
  });

  it("does not hold the first alert back for an unspoken one from the old Match", () => {
    const { alerts } = setup(false);
    alerts.raise({ kind: "defeat" }, 10);
    alerts.update(10, false);
    alerts.reset();
    alerts.raise({ kind: "buildingReady" }, 10.2);
    alerts.update(10.2, false);
    expect(alerts.banner(10.2)).toBe("Building ready");
  });
});

describe("alerts without a local voice", () => {
  it("plays the chime and shows the text for a few seconds", () => {
    const { alerts, chimes } = setup(false);
    alerts.raise({ kind: "creditsShort" }, 10);
    expect(alerts.banner(10)).toBeNull();
    alerts.update(10, false);
    expect(chimes()).toBe(1);
    expect(alerts.banner(10)).toBe("Not enough Credits");
    expect(alerts.banner(10 + BANNER_SECONDS - 0.01)).toBe("Not enough Credits");
    expect(alerts.banner(10 + BANNER_SECONDS)).toBeNull();
  });

  it("gives each alert a moment on screen before the next replaces it", () => {
    const { alerts, chimes } = setup(false);
    alerts.raise({ kind: "buildingReady" }, 0);
    alerts.raise({ kind: "unitReady" }, 0);
    alerts.update(0, false);
    alerts.update(0.5, false);
    expect(alerts.banner(0.5)).toBe("Building ready");
    expect(chimes()).toBe(1);
    alerts.update(1.5, false);
    expect(alerts.banner(1.5)).toBe("Unit ready");
    expect(chimes()).toBe(2);
  });
});

describe("alerts while the game is paused", () => {
  it("stops the alert being said and starts no other until play carries on", () => {
    const { alerts, said, cancels } = setup();
    alerts.raise({ kind: "buildingReady" }, 1);
    alerts.raise({ kind: "unitReady" }, 1);
    alerts.update(1, false);
    alerts.update(1.2, true);
    expect(cancels()).toBe(1);
    alerts.update(1.2, true);
    expect(said.map((s) => s.text)).toEqual(["Building ready"]);
    alerts.update(1.3, false);
    expect(said.map((s) => s.text)).toEqual(["Building ready", "Unit ready"]);
  });
});
