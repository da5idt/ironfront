import type { MatchStatus, PlayerId } from "../sim";
import type { Size } from "./camera";
import type { Rect } from "./layout";

// What covers the whole screen: the Victory or defeat screen once the Match is
// over, or "Paused". Pure, so which one shows and where its button sits are
// unit tested; the painter draws from it and main.ts acts on it.

export const RESTART_BUTTON = { width: 180, height: 48 } as const;

export interface ScreenOverlay {
  readonly title: string;
  readonly tone: "good" | "bad" | "neutral";
  readonly button: { readonly label: string; readonly rect: Rect } | null;
}

export function screenOverlay(status: MatchStatus, paused: boolean, me: PlayerId, screen: Size): ScreenOverlay | null {
  if (status.state === "victory") {
    const won = status.winner === me;
    return {
      title: won ? "Victory" : "Defeat",
      tone: won ? "good" : "bad",
      button: { label: "Restart", rect: restartButton(screen) },
    };
  }
  return paused ? { title: "Paused", tone: "neutral", button: null } : null;
}

/** Centred, a little below the title in the middle of the screen. */
export function restartButton(screen: Size): Rect {
  return {
    x: Math.round(screen.width / 2 - RESTART_BUTTON.width / 2),
    y: Math.round(screen.height / 2 + 30),
    width: RESTART_BUTTON.width,
    height: RESTART_BUTTON.height,
  };
}

