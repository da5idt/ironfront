import type { MapPos } from "./hearing";
import type { SoundName } from "./recipes";

// Which sound a presentation event makes, and where on the Map. The events
// come from the presentation module, which reads only the Player view, so a
// shot or death the Player cannot see never gets here (Fog of War).

/**
 * The presentation events that make a sound effect. Positions are in Cell
 * units, like Units' positions (a Building's is its centre). Alerts (credits
 * short, under attack) and Victory or defeat are not here: they belong to the
 * alerts and music channels.
 */
export type SoundEvent =
  | {
      readonly kind: "shotFired";
      readonly weapon: "rifle" | "raiderGun" | "turretCannon";
      readonly from: MapPos;
      readonly to: MapPos;
    }
  | { readonly kind: "impact"; readonly at: MapPos }
  /** `vehicle` is true for a Raider or Harvester, false for a Rifleman. */
  | { readonly kind: "unitDied"; readonly vehicle: boolean; readonly at: MapPos }
  | { readonly kind: "buildingDestroyed"; readonly at: MapPos }
  | { readonly kind: "buildingPlaced"; readonly at: MapPos }
  | { readonly kind: "buildingReady" }
  | { readonly kind: "unitTrained" };

export interface SoundCue {
  readonly name: SoundName;
  /** Where on the Map it sounds from. Left out for interface sounds, heard in full wherever the view is. */
  readonly at?: MapPos;
}

export function soundForEvent(event: SoundEvent): SoundCue {
  switch (event.kind) {
    case "shotFired":
      return { name: event.weapon, at: event.from };
    case "impact":
      return { name: "impact", at: event.at };
    case "unitDied":
      return { name: event.vehicle ? "smallExplosion" : "unitDeath", at: event.at };
    case "buildingDestroyed":
      return { name: "largeExplosion", at: event.at };
    case "buildingPlaced":
      return { name: "buildingPlaced", at: event.at };
    // The player needs to hear these while looking elsewhere, so they have no position.
    case "buildingReady":
      return { name: "buildingReady" };
    case "unitTrained":
      return { name: "unitTrained" };
  }
}
