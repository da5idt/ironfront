import type { PlayerId } from "../../sim";
import type { PresentationEvent } from "../presentation";
import type { AlertEvent } from "./alertQueue";
import type { SoundEvent } from "./eventSounds";

// What the person hears for each presentation event: a sound effect, a spoken
// alert, both or neither. Pure, so the mapping is unit tested; main.ts only
// passes the results on. The events come from the Player view alone, so
// nothing under Fog of War is heard.

/** The event as the sound effects take it, or null for one that makes no effect. */
export function soundEventFor(event: PresentationEvent): SoundEvent | null {
  // The alerts channel says it; an effect on top would only be noise.
  if (event.kind === "underAttack") return null;
  return event;
}

/**
 * The alert an event raises for the person playing as `me`, or null. Only
 * their own things are worth saying aloud: the other Player's losses show on
 * the Map. Credits short, Victory and defeat are raised where they happen
 * (main.ts), not from events. Raise as often as events come; the alerts'
 * cooldowns do the thinning.
 */
export function alertForEvent(event: PresentationEvent, me: PlayerId): AlertEvent | null {
  switch (event.kind) {
    case "buildingReady":
      return { kind: "buildingReady" };
    case "unitTrained":
      return { kind: "unitReady" };
    case "underAttack":
      return { kind: "baseUnderAttack" };
    case "unitDied":
      return event.owner === me ? { kind: "unitLost" } : null;
    case "buildingDestroyed":
      return event.owner === me ? { kind: "buildingLost" } : null;
    case "shotFired":
    case "impact":
    case "buildingPlaced":
      return null;
  }
}
