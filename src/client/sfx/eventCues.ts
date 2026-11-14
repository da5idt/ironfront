import type { PlayerId, Vec } from "../../sim";
import type { PresentationEvent } from "../presentation";
import type { AlertEvent } from "./alertQueue";
import type { SoundName } from "./recipes";

// What the person hears for each presentation event: sound effects, a spoken
// alert, both or neither. The one place that maps events to sound, and pure,
// so the mapping is unit tested; main.ts only passes the results on. The
// events come from the Player view alone, so nothing under Fog of War is
// heard.

export interface SoundCue {
  readonly name: SoundName;
  /** Where on the Map it sounds from. Left out for interface sounds, heard in full wherever the view is. */
  readonly at?: Vec;
}

const NO_SOUND: readonly SoundCue[] = [];

/** The sound effects an event makes, in the order they are heard; none for an event that is only an alert. */
export function soundsForEvent(event: PresentationEvent): readonly SoundCue[] {
  switch (event.kind) {
    case "shotFired": {
      // Each gun's sound is named after it.
      const shot: SoundCue = { name: event.weapon, at: event.from };
      // A round crosses the screen in a blink, so the impact is cued with the shot; the impact's own cap keeps a volley from piling up.
      return event.landsInSight ? [shot, { name: "impact", at: event.to }] : [shot];
    }
    case "impact":
      return [{ name: "impact", at: event.at }];
    case "unitDied":
      return [{ name: event.vehicle ? "smallExplosion" : "unitDeath", at: event.at }];
    case "buildingDestroyed":
      return [{ name: "largeExplosion", at: event.at }];
    case "buildingPlaced":
      return [{ name: "buildingPlaced", at: event.at }];
    // The person playing needs to hear these while looking elsewhere, so they have no position.
    case "buildingReady":
      return [{ name: "buildingReady" }];
    case "unitTrained":
      return [{ name: "unitTrained" }];
    // The alerts channel says it; an effect on top would only be noise.
    case "underAttack":
      return NO_SOUND;
  }
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
      // The words are "Base under attack", so a Unit hit out on the Map does not raise them; its loss, if it comes to that, is told as "Unit lost".
      return event.nearOwnBuildings ? { kind: "buildingsUnderAttack" } : null;
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
