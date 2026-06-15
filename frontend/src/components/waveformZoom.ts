/** Tiny floor used when the width or duration is unknown (e.g. before layout). */
export const MIN_PX_PER_SEC = 0.01
/** Upper zoom bound — beyond this the per-sample detail stops being meaningful. */
export const MAX_PX_PER_SEC = 800

/**
 * Lowest px/sec that still fits the whole recording in `width` px. Used as the zoom floor so a
 * long recording can always be zoomed out to fit (its natural zoom is width/duration, which for
 * an hours-long file is well below 1) and so zooming out never leaves empty space past the fit.
 */
export const fitPxPerSec = (width: number, durationSeconds: number): number => {
  if (width <= 0 || durationSeconds <= 0) {
    return MIN_PX_PER_SEC
  }
  return width / durationSeconds
}

/**
 * Clamp a desired zoom into [fit, max]. The fit floor always wins, so a recording short enough
 * that fitting it needs more than `max` px/sec (fit > max) still fills the view instead of being
 * capped below fit and leaving empty space.
 */
export const clampPxPerSec = (
  value: number,
  fit: number,
  max: number = MAX_PX_PER_SEC
): number => Math.min(Math.max(max, fit), Math.max(fit, value))
