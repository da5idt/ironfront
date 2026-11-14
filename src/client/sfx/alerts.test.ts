import { describe, expect, it } from "vitest";
import { type AlertVoice, BANNER_SECONDS, createAlerts } from "./alerts";

/**
 * Stands in for the browser voice (alertVoice.ts): it says one thing at a
 * time and reports the end through the callback it was given, exactly once.
 * As there, cancel() ends what is being said, and say() answers false when
 * there is no local voice to say it with.
 */
function fakeVoice(hasVoice = true) {
  const said: { text: string; volume: number }[] = [];
  let ended: ((said: boolean) => void) | null = null;
  let cancels = 0;
  const finish = (ok: boolean): void => {
    const done = ended;
    ended = null;
    done?.(ok);
  };
  const voice: AlertVoice = {
    say(text, volume, onEnded) {
      if (!hasVoice) return false;
      said.push({ text, volume });
      ended = onEnded;
      return true;
    },
    cancel() {
      cancels++;
      finish(true);
    },
  };
  return { voice, said, finish, cancels: () => cancels, speaking: () => ended !== null };
}

function setup(hasVoice = true) {
  const fake = fakeVoice(hasVoice);
  const mixer = { volume: 0.64 };
  let chimes = 0;
  const alerts = createAlerts({ voice: fake.voice, chime: () => void chimes++, volume: () => mixer.volume });
  return { ...fake, alerts, mixer, chimes: () => chimes };
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
    const { alerts, mixer, cancels, speaking } = setup();
    alerts.raise({ kind: "baseUnderAttack" }, 1);
    alerts.update(1, false);
    mixer.volume = 0;
    alerts.update(1.2, false);
    expect(cancels()).toBe(1);
    expect(speaking()).toBe(false);
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
