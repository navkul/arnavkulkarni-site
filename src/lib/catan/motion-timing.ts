/** Shared presentation timing. Keep server event timestamps, CSS and the island scene in step. */
export const DICE_LEAD_MS = 300;
export const DICE_DURATION_MS = 850;
export const DICE_VISIBLE_MS = 2400;
export const OPENING_COUNTDOWN_MS = 1000;
export const OPENING_REVEAL_MS = 2400;
export const BUILD_DURATION_MS = 320;
export const ROBBER_DURATION_MS = 420;
export const CARD_FLIGHT_MS = 1050;
export const CARD_STAGGER_MS = 65;
export const DEVELOPMENT_REVEAL_MS = 1250;
export const AWARD_DURATION_MS = 1200;
export const MOVE_NOTICE_MS = 2000;
export const VISUAL_EVENT_WINDOW_MS = 2400;

/** One camera visit per paid hex; resource cards depart after the camera arrives. */
export const PRODUCTION_HEX_MS = 1500;
export const PRODUCTION_CAMERA_MS = 300;
export const PRODUCTION_RETURN_MS = 450;

/** Latest end of a public production presentation, including the camera return. */
export function productionSequenceEnd(events: readonly { type: string; at: number }[]): number {
  return events.reduce(
    (end, event) =>
      event.type === 'production'
        ? Math.max(end, event.at + PRODUCTION_HEX_MS + PRODUCTION_RETURN_MS)
        : end,
    0,
  );
}
