// The mapping from presentation events to sounds now lives in eventCues.ts, next to the mapping to alerts.
// Nothing imports this file; it is still here only because deleting a file is a one-way door (CLAUDE.md),
// so it goes with the next one-way PR.
export { type SoundCue, soundsForEvent } from "./eventCues";
