import { describe, expect, it } from "vitest";
import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  createMatch,
  ECONOMY,
  getMatchStatus,
  getPlayerView,
  issueCommand,
  type Command,
  type PlayerId,
} from "./index";
import { openMap, testMap } from "./testing/maps";

describe("starting a Match", () => {
  it("gives each Player an HQ, a Refinery, a Harvester, two Riflemen and the starting Credits", () => {
    const match = createMatch(RIVERFORD, 1);
    for (const player of [0, 1] as const) {
      const view = getPlayerView(match, player);
      expect(view.credits).toBe(ECONOMY.startingCredits);
      const own = <T extends { owner: PlayerId; kind: string }>(xs: readonly T[]) =>
        xs.filter((x) => x.owner === player).map((x) => x.kind).sort();
      expect(own(view.buildings)).toEqual(["hq", "refinery"]);
      expect(own(view.units)).toEqual(["harvester", "rifleman", "rifleman"]);
    }
  });

  it("starts running at Tick 0 and counts Ticks", () => {
    const match = createMatch(openMap(20, 20), 1);
    expect(getMatchStatus(match)).toEqual({ state: "running" });
    for (let i = 0; i < 5; i++) advanceTick(match);
    expect(getPlayerView(match, 0).tick).toBe(5);
  });

  it("shows the Map's terrain and Ore", () => {
    const match = createMatch(RIVERFORD, 1);
    const { map } = getPlayerView(match, 0);
    expect(map.width).toBe(64);
    expect(map.height).toBe(64);
    expect(new Set(map.terrain)).toEqual(new Set(["open", "rough", "rock", "water"]));
    expect(map.ore.filter((o) => o > 0).length).toBeGreaterThan(0);
    expect(map.ore.find((o) => o > 0)).toBe(ECONOMY.orePerCell);
  });

  it("rejects starting positions that are off the Map, blocked, or overlapping", () => {
    const rows = ["............", "........##..", ...Array.from({ length: 6 }, () => ".".repeat(12))];
    const ok = testMap(rows).starts;
    const start = (p0: Partial<(typeof ok)[0]>) => [{ ...ok[0], ...p0 }, ok[1]] as const;
    expect(() => createMatch(testMap(rows), 1)).not.toThrow();
    expect(() => createMatch(testMap(rows, start({ hq: { x: 10, y: 0 } })), 1)).toThrow(/hq at 10,0/);
    expect(() => createMatch(testMap(rows, start({ hq: { x: 7, y: 0 } })), 1)).toThrow(/hq at 7,0/);
    expect(() => createMatch(testMap(rows, start({ refinery: { x: 1, y: 1 } })), 1)).toThrow(/refinery/);
    expect(() => createMatch(testMap(rows, start({ harvester: { x: 1, y: 1 } })), 1)).toThrow(/harvester at 1,1/);
    expect(() => createMatch(testMap(rows, start({ riflemen: [{ x: 12, y: 0 }] })), 1)).toThrow(/rifleman at 12,0/);
  });

  it("rejects a Map with uneven rows or unknown Cells", () => {
    expect(() => createMatch(testMap(["........", "......."]), 1)).toThrow(/row 1/);
    expect(() => createMatch(testMap(["........", "...x...."]), 1)).toThrow(/unknown Cell/);
  });
});

describe("Riverford", () => {
  it("is point-symmetric so neither Player has an edge", () => {
    const rows = RIVERFORD.rows;
    const h = rows.length;
    const w = rows[0]!.length;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(rows[y]![x], `Cell ${x},${y}`).toBe(rows[h - 1 - y]![w - 1 - x]);
      }
    }
  });
});

describe("Commands", () => {
  it("rejects Commands for another Player's Units without changing anything", () => {
    const match = createMatch(openMap(20, 20), 1);
    const enemy = getPlayerView(match, 0).units.find((u) => u.owner === 1)!;
    const before = JSON.stringify(getPlayerView(match, 0));
    const result = issueCommand(match, 0, { type: "stop", unitIds: [enemy.id] });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(getPlayerView(match, 0))).toBe(before);
  });

  it("accepts a stop Command for own Units", () => {
    const match = createMatch(openMap(20, 20), 1);
    const mine = getPlayerView(match, 0).units.filter((u) => u.owner === 0);
    expect(issueCommand(match, 0, { type: "stop", unitIds: mine.map((u) => u.id) })).toEqual({ ok: true });
  });
});

describe("determinism", () => {
  // Each rule ticket extends the Commands below so the run exercises it.
  it("produces identical views from the same Map, seed and Commands", () => {
    // Targets across rough ground, past rock and over the river's fords, so groups path and spread.
    const targets = [
      { x: 32, y: 32 },
      { x: 20, y: 6 },
      { x: 45, y: 20 },
      { x: 10, y: 40 },
    ];
    const run = () => {
      const match = createMatch(RIVERFORD, 42);
      const start = getPlayerView(match, 0).units.map((u) => [u.x, u.y]);
      const views: string[] = [];
      for (let t = 0; t < 600; t++) {
        if (t % 50 === 0) {
          for (const player of [0, 1] as const) {
            const view = getPlayerView(match, player);
            const ids = view.units.filter((u) => u.owner === player).map((u) => u.id);
            const target = targets[(t / 50 + player) % targets.length]!;
            const commands: Command[] = [
              { type: "stop", unitIds: ids.slice(0, 1) },
              { type: "move", unitIds: ids, target },
            ];
            for (const c of commands) issueCommand(match, player, c);
          }
        }
        advanceTick(match);
        if (t % 100 === 99) views.push(JSON.stringify([getPlayerView(match, 0), getPlayerView(match, 1)]));
      }
      const end = getPlayerView(match, 0).units.map((u) => [u.x, u.y]);
      return { views, start, end };
    };
    const first = run();
    expect(first.views).toEqual(run().views);
    expect(new Set(first.views).size).toBe(first.views.length);
    // Every Unit really moved, so the run exercises movement and not just the Tick count.
    first.end.forEach((p, i) => expect(p, `Unit ${i}`).not.toEqual(first.start[i]));
  });
});
