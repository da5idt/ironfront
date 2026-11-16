import { beforeAll, describe, expect, it } from "vitest";
import { RIVERFORD } from "../game/maps/riverford";
import {
  advanceTick,
  createMatch,
  getMatchStatus,
  getPlayerView,
  isTroopCarrier,
  issueCommand,
  OPPONENT,
  type PlayerId,
  TICKS_PER_SECOND,
  type UnitKind,
} from "../sim";
import { BUILD_ORDER } from "./economy";
import { createOpponent, THINK_EVERY_TICKS } from "./opponent";

// What two Computer Opponents do with their support Units and their Troop
// Carrier over the first ten minutes of a whole Match, and what that costs
// their attack waves. Everything is read from each Player's own view and from
// the Commands its Opponent gave.

const MINUTES = 60 * TICKS_PER_SECOND;

interface WaveSeen {
  /** The Tick of its first Command. */
  readonly tick: number;
  /** The Units told to Board or to set off by Attack-move. */
  readonly unitIds: Set<number>;
}

interface Seen {
  /** The Tick at which the last Building of the build order stood. */
  buildOrderStood: number | null;
  /** The Tick each kind of Unit was first on the Map. */
  readonly first: Partial<Record<UnitKind, number>>;
  readonly waves: WaveSeen[];
  /** The Tick of its first Command that spends on support: a Hospital started, or a support Unit or Troop Carrier trained. */
  firstSupportSpend: number | null;
  /** Its Riflemen and Raiders on the Map at the think in which the first wave may set off. */
  armyAtFirstWave: number | null;
}

const SUPPORT_KINDS: readonly UnitKind[] = ["medic", "mechanic", "troopCarrier"];

/** Longest from a wave's first Command to its last Unit setting off: the time allowed for boarding, and a think. */
const SETTING_OFF = OPPONENT.boardTicks + 2 * THINK_EVERY_TICKS;

/** Opponent against Opponent on Riverford, the seeds the other whole-Match tests use. */
function playAndWatch(ticks: number): Record<PlayerId, Seen> {
  const match = createMatch(RIVERFORD, 3);
  const seats = [
    { player: 0 as const, opponent: createOpponent(0, 11) },
    { player: 1 as const, opponent: createOpponent(1, 12) },
  ];
  const seen: Record<PlayerId, Seen> = {
    0: { buildOrderStood: null, first: {}, waves: [], firstSupportSpend: null, armyAtFirstWave: null },
    1: { buildOrderStood: null, first: {}, waves: [], firstSupportSpend: null, armyAtFirstWave: null },
  };
  for (let t = 0; t < ticks && getMatchStatus(match).state === "running"; t++) {
    if (t % THINK_EVERY_TICKS === 0) {
      for (const { player, opponent } of seats) {
        const s = seen[player];
        const view = getPlayerView(match, player);
        const own = view.units.filter((u) => u.owner === player);
        const standing = (kind: string) => view.buildings.filter((b) => b.owner === player && b.kind === kind).length;
        if (s.buildOrderStood === null && BUILD_ORDER.every(([kind, total]) => standing(kind) >= total)) {
          s.buildOrderStood = view.tick;
        }
        for (const u of own) s.first[u.kind] ??= view.tick;
        if (view.tick === OPPONENT.firstWaveTick) {
          s.armyAtFirstWave = own.filter((u) => u.kind === "rifleman" || u.kind === "raider").length;
        }
        const inAWave = new Set(s.waves.flatMap((w) => [...w.unitIds]));
        for (const command of opponent.think(view)) {
          expect(issueCommand(match, player, command), JSON.stringify(command)).toEqual({ ok: true });
          const onSupport =
            (command.type === "startBuilding" && command.kind === "hospital") ||
            (command.type === "train" && SUPPORT_KINDS.includes(command.kind));
          if (onSupport) s.firstSupportSpend ??= view.tick;
          // Only a wave's Units are told to Board or given an Attack-move, and a Unit's first is its wave
          // setting off. The Troop Carrier is led with the wave but is not one of its fighters.
          if (command.type !== "board" && command.type !== "attackMove") continue;
          const fresh = command.unitIds.filter(
            (id) => !inAWave.has(id) && !own.some((u) => u.id === id && isTroopCarrier(u.kind)),
          );
          if (fresh.length === 0) continue;
          let wave = s.waves.at(-1);
          if (!wave || view.tick - wave.tick > SETTING_OFF) {
            wave = { tick: view.tick, unitIds: new Set() };
            s.waves.push(wave);
          }
          for (const id of fresh) wave.unitIds.add(id);
        }
      }
    }
    advanceTick(match);
  }
  return seen;
}

describe("Computer Opponent against itself on Riverford: support Units and the attack waves", () => {
  let seen: Record<PlayerId, Seen>;
  beforeAll(() => {
    seen = playAndWatch(10 * MINUTES);
  }, 60_000);

  /** Long enough to build the Hospital and to train one Unit of each kind once the first wave has set off. */
  const SUPPORT_WITHIN = 2 * MINUTES;

  it.each([0, 1] as const)(
    "Player %i has a Medic, a Mechanic and a Troop Carrier within two minutes of its first wave setting off",
    (player) => {
      const s = seen[player];
      expect(s.buildOrderStood).not.toBeNull();
      expect(s.buildOrderStood!).toBeLessThan(s.waves[0]!.tick);
      const by = s.waves[0]!.tick + SUPPORT_WITHIN;
      expect(s.first.medic ?? Infinity).toBeLessThanOrEqual(by);
      expect(s.first.mechanic ?? Infinity).toBeLessThanOrEqual(by);
      expect(s.first.troopCarrier ?? Infinity).toBeLessThanOrEqual(by);
    },
  );

  it.each([
    [0, 20],
    [1, 40],
  ] as const)(
    "Player %i spends nothing on support before its first wave has set off, which finds its army as large as it was without",
    (player, armyWithout) => {
      const s = seen[player];
      expect(s.waves[0]!.tick).toBe(OPPONENT.firstWaveTick);
      expect(s.firstSupportSpend).toBeGreaterThanOrEqual(s.waves[0]!.tick);
      // What the same Match gave before the Opponent kept a Hospital, support Units or a Troop Carrier.
      expect(s.armyAtFirstWave).toBe(armyWithout);
    },
  );

  it.each([0, 1] as const)(
    "Player %i still sends its first waves when it did before it kept support Units, and as large",
    (player) => {
      const waves = seen[player].waves.map((w) => ({ tick: w.tick, size: w.unitIds.size }));
      // Four and a half minutes in, then every minute and a half: six Units, nine, twelve.
      expect(OPPONENT.firstWaveTick).toBe(4.5 * MINUTES);
      expect(waves.slice(0, 3)).toEqual([
        { tick: 4.5 * MINUTES, size: 6 },
        { tick: 6 * MINUTES, size: 9 },
        { tick: 7.5 * MINUTES, size: 12 },
      ]);
    },
  );
});
