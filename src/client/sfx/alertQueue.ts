import type { MatchStatus, PlayerId } from "../../sim";

// Which alerts get said, and when: the words for each event, a cooldown per
// alert so none nags, and a queue so one never talks over another and the
// urgent ones are not kept waiting. Pure, with
// the time passed in, so all of it is unit tested; alerts.ts does the saying.

export const ALERT_KINDS = [
  "buildingReady",
  "unitReady",
  "creditsShort",
  "baseUnderAttack",
  "unitLost",
  "buildingLost",
  "victory",
  "defeat",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Something the person should hear about. Extra fields on a wider event are ignored. */
export type AlertEvent = { readonly [K in AlertKind]: { readonly kind: K } }[AlertKind];

const ALERT_TEXT: Record<AlertKind, string> = {
  buildingReady: "Building ready",
  unitReady: "Unit ready",
  creditsShort: "Not enough Credits",
  baseUnderAttack: "Base under attack",
  unitLost: "Unit lost",
  buildingLost: "Building lost",
  victory: "Victory",
  defeat: "Defeat",
};

/** The words spoken, and shown when there is no voice. */
export function alertText(event: AlertEvent): string {
  return ALERT_TEXT[event.kind];
}

/** The alert for a Match that ended between two looks at its status, as `me` hears it; null when it did not end just then. */
export function matchEndAlert(before: MatchStatus, after: MatchStatus, me: PlayerId): AlertEvent | null {
  if (before.state !== "running" || after.state !== "victory") return null;
  return { kind: after.winner === me ? "victory" : "defeat" };
}

/**
 * Seconds after an alert was said before it may be said again. A fight
 * raises the battle ones many times a second; the rest only guard against a
 * double report or a hammered button. Victory and defeat end the Match, so
 * they have none.
 */
export const ALERT_COOLDOWN_S: Record<AlertKind, number> = {
  buildingReady: 2,
  unitReady: 3,
  creditsShort: 5,
  baseUnderAttack: 20,
  unitLost: 8,
  buildingLost: 5,
  victory: 0,
  defeat: 0,
};

/** An alert about the moment that has waited this long is old news and is dropped unsaid. */
export const ALERT_STALE_AFTER_S = 4;

const endsMatch = (kind: AlertKind): boolean => kind === "victory" || kind === "defeat";

/**
 * Alerts about a fight going on: said before the others, as an attack does
 * not wait, and dropped when stale, as the fight has moved on (and if it has
 * not, the alert is raised again).
 */
const isBattle = (kind: AlertKind): boolean => kind === "baseUnderAttack" || kind === "unitLost" || kind === "buildingLost";

/**
 * Whether an alert is still worth saying however late. A Building or Unit
 * that is ready stays ready, and the Match stays over; nothing will raise
 * them a second time. The battle alerts and "Not enough Credits" are about
 * the moment.
 */
const keeps = (kind: AlertKind): boolean => endsMatch(kind) || kind === "buildingReady" || kind === "unitReady";

interface Waiting {
  readonly kind: AlertKind;
  readonly raisedAt: number;
}

const isStale = (a: Waiting, now: number): boolean => !keeps(a.kind) && now - a.raisedAt > ALERT_STALE_AFTER_S;

export interface AlertQueue {
  /** Raised and not yet said, oldest first; never two of a kind, so it cannot outgrow the list of kinds. */
  readonly waiting: readonly Waiting[];
  /** When each alert was last handed out to be said, for its cooldown. One dropped unsaid leaves no mark here. */
  readonly lastSaid: Readonly<Partial<Record<AlertKind, number>>>;
}

export const EMPTY_ALERTS: AlertQueue = { waiting: [], lastSaid: {} };

/**
 * Notes an event at `now` (seconds on any clock that only runs forward). It
 * is ignored while the same alert is inside its cooldown or already waiting.
 */
export function raiseAlert(queue: AlertQueue, event: AlertEvent, now: number): AlertQueue {
  const { kind } = event;
  const raised = { kind, raisedAt: now };
  // The Match is over: whatever was waiting to be said about it no longer matters.
  if (endsMatch(kind)) return { ...queue, waiting: [raised] };
  const last = queue.lastSaid[kind];
  if (last !== undefined && now - last < ALERT_COOLDOWN_S[kind]) return queue;
  // Stale ones go first, or one waiting too long to be said would also keep its fresh successor out.
  const waiting = queue.waiting.filter((a) => !isStale(a, now));
  return { ...queue, waiting: waiting.some((a) => a.kind === kind) ? waiting : [...waiting, raised] };
}

/**
 * The next alert to say, for a speaker that has just fallen silent; null when
 * there is none. Victory or defeat first, then the battle alerts, then the
 * rest, oldest first within each. Taking an alert starts its cooldown.
 */
export function takeAlert(queue: AlertQueue, now: number): { readonly queue: AlertQueue; readonly alert: AlertKind | null } {
  const fresh = queue.waiting.filter((a) => !isStale(a, now));
  const next = fresh.find((a) => endsMatch(a.kind)) ?? fresh.find((a) => isBattle(a.kind)) ?? fresh[0];
  if (!next) return { queue: { ...queue, waiting: fresh }, alert: null };
  return {
    queue: { waiting: fresh.filter((a) => a !== next), lastSaid: { ...queue.lastSaid, [next.kind]: now } },
    alert: next.kind,
  };
}
