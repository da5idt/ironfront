import { describe, expect, it } from "vitest";
import { computeLayout, contains, type Rect } from "../layout";
import { CHANNELS } from "./mixer";
import { muteAllButton, soundStripAction, soundStripRows } from "./soundStrip";

const area = computeLayout({ width: 1280, height: 800 }).soundStrip;
const middle = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (outer: Rect, r: Rect) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.width <= outer.x + outer.width && r.y + r.height <= outer.y + outer.height;

describe("sound strip layout", () => {
  it("has a row for Effects, Music and Alerts, top to bottom", () => {
    const rows = soundStripRows(area);
    expect(rows.map((r) => r.channel)).toEqual([...CHANNELS]);
    expect(rows.map((r) => r.label)).toEqual(["Effects", "Music", "Alerts"]);
    expect(rows[1]!.down.y).toBeGreaterThan(rows[0]!.down.y);
    expect(rows[2]!.down.y).toBeGreaterThan(rows[1]!.down.y);
  });

  it("keeps every control inside the strip, in the order down, level, up, mute", () => {
    for (const row of soundStripRows(area)) {
      for (const rect of [row.down, row.level, row.up, row.mute]) expect(inside(area, rect)).toBe(true);
      expect(row.down.x + row.down.width).toBeLessThanOrEqual(row.level.x);
      expect(row.level.x + row.level.width).toBeLessThanOrEqual(row.up.x);
      expect(row.up.x + row.up.width).toBeLessThanOrEqual(row.mute.x);
    }
    expect(inside(area, muteAllButton(area))).toBe(true);
  });
});

describe("sound strip clicks", () => {
  const at = (r: Rect) => {
    const p = middle(r);
    return soundStripAction(area, p.x, p.y);
  };

  it("turns each row's controls into that channel's volume down, volume up and mute", () => {
    for (const row of soundStripRows(area)) {
      expect(at(row.down)).toEqual({ type: "volume", channel: row.channel, step: -1 });
      expect(at(row.up)).toEqual({ type: "volume", channel: row.channel, step: 1 });
      expect(at(row.mute)).toEqual({ type: "mute", channel: row.channel });
    }
  });

  it("mutes everything from the mute-all button", () => {
    expect(at(muteAllButton(area))).toEqual({ type: "muteAll" });
  });

  it("does nothing between the controls", () => {
    const [first] = soundStripRows(area);
    expect(at(first!.level)).toBeNull();
    expect(soundStripAction(area, area.x + 2, area.y + 2)).toBeNull();
  });
});

describe("the sound strip in the layout", () => {
  it("sits at the bottom of the panel, below the buttons, and is not part of the Map view", () => {
    const l = computeLayout({ width: 1280, height: 800 });
    expect(l.soundStrip.x).toBe(l.panel.x);
    expect(l.soundStrip.width).toBe(l.panel.width);
    expect(l.soundStrip.y + l.soundStrip.height).toBe(800);
    expect(l.buttons.y + l.buttons.height).toBe(l.soundStrip.y);
    const p = middle(l.soundStrip);
    expect(contains(l.buttons, p.x, p.y)).toBe(false);
    expect(contains(l.mapView, p.x, p.y)).toBe(false);
  });

  it("never rises above the minimap on a short screen", () => {
    const l = computeLayout({ width: 1280, height: 260 });
    expect(l.soundStrip.y).toBeGreaterThanOrEqual(l.minimap.y + l.minimap.height);
    expect(l.buttons.height).toBe(0);
  });
});
