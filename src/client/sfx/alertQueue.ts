import type { MatchStatus, PlayerId } from "../../sim";

// Which alerts get said, and when: the words for each event, a cooldown per
// alert so none nags, and a queue so one never talks over another. Pure, with
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
 * Seconds before the same alert may be raised again. A fight raises the
 * battle ones many times a second; the rest only guard against a double
 * report or a hammered button. Victory and defeat end the Match, so they
 * have none.
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

/** An alert that has waited this long is old news and is dropped unsaid. */
export const ALERT_STALE_AFTER_S = 4;
/** At a couple of seconds an alert, more than this many waiting would go stale before their turn anyway. */
export const ALERT_QUEUE_CAP = 3;

export interface AlertQueue {
  /** Raised and not yet said, oldest first. */
  readonly waiting: readonly { readonly kind: AlertKind; readonly raisedAt: number }[];
  /** When each alert was last let into the queue, for its cooldown. */
  readonly lastRaised: Readonly<Partial<Record<AlertKind, number>>>;
}

export const EMPTY_ALERTS: AlertQueue = { waiting: [], lastRaised: {} };

const endsMatch = (kind: AlertKind): boolean => kind === "victory" || kind === "defeat";

/** Notes an event at `now` (seconds on any clock that only runs forward). Still inside its cooldown, it is ignored. */
export function raiseAlert(queue: AlertQueue, event: AlertEvent, now: number): AlertQueue {
  const { kind } = event;
  const raised = { kind, raisedAt: now };
  // The Match is over: whatever was waiting to be said about it no longer matters.
  if (endsMatch(kind)) return { ...queue, waiting: [raised] };
  const last = queue.lastRaised[kind];
  if (last !== undefined && now - last < ALERT_COOLDOWN_S[kind]) return queue;
  return {
    waiting: [...queue.waiting, raised].slice(-ALERT_QUEUE_CAP),
    lastRaised: { ...queue.lastRaised, [kind]: now },
  };
}

/** The next alert to say, for a speaker that has just fallen silent; null when there is none. */
export function takeAlert(queue: AlertQueue, now: number): { readonly queue: AlertQueue; readonly alert: AlertKind | null } {
  // Victory and defeat are said however late: nothing newer will ever replace them.
  const fresh = queue.waiting.filter((a) => endsMatch(a.kind) || now - a.raisedAt <= ALERT_STALE_AFTER_S);
  const [next, ...rest] = fresh;
  return { queue: { ...queue, waiting: rest }, alert: next?.kind ?? null };
}
