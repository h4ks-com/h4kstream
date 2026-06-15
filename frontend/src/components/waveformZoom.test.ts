import {
  fitPxPerSec,
  clampPxPerSec,
  MIN_PX_PER_SEC,
  MAX_PX_PER_SEC,
} from './waveformZoom'

describe('fitPxPerSec', () => {
  it('returns width/duration so the whole recording fits the view', () => {
    expect(fitPxPerSec(1200, 60)).toBe(20)
  })

  it('is well below 1 px/sec for hours-long recordings (the zoom-out case)', () => {
    // 87-minute recording (5218s) in a ~1140px view must allow ~0.22 px/sec to fit fully.
    const fit = fitPxPerSec(1140, 5218)
    expect(fit).toBeLessThan(1)
    expect(fit).toBeCloseTo(0.218, 2)
  })

  it('falls back to the tiny floor when width or duration is unknown', () => {
    expect(fitPxPerSec(0, 60)).toBe(MIN_PX_PER_SEC)
    expect(fitPxPerSec(1140, 0)).toBe(MIN_PX_PER_SEC)
  })
})

describe('clampPxPerSec', () => {
  it('never zooms out past the fit floor (the long-recording bug)', () => {
    const fit = fitPxPerSec(1140, 5218) // ≈0.218
    // Requests to zoom further out than fitting (incl. autofit's 0) clamp up to the fit zoom.
    expect(clampPxPerSec(0.05, fit)).toBeCloseTo(fit)
    expect(clampPxPerSec(0, fit)).toBeCloseTo(fit)
  })

  it('allows zooming in up to the max', () => {
    const fit = fitPxPerSec(1140, 60)
    expect(clampPxPerSec(100, fit)).toBe(100)
    expect(clampPxPerSec(99999, fit)).toBe(MAX_PX_PER_SEC)
  })

  it('keeps the fit floor reachable when fitting needs more than max (very short recording)', () => {
    // A 1s recording in a 1200px view needs 1200 px/sec to fill — above max. Fit must still win
    // so autofit fills the view rather than capping below fit and leaving empty space.
    const fit = fitPxPerSec(1200, 1)
    expect(fit).toBeGreaterThan(MAX_PX_PER_SEC)
    expect(clampPxPerSec(0, fit)).toBeCloseTo(fit)
    expect(clampPxPerSec(50, fit)).toBeCloseTo(fit)
  })
})
