import { EditSpec } from './EditSpec'
import { SourceSegment } from './EditSegment'
import { PreviewEngine } from './PreviewEngine'

import { fetchRange } from './audioSource'

jest.mock('./audioSource', () => ({
  fetchRange: jest.fn(async () => new ArrayBuffer(8)),
}))

const mockedFetchRange = fetchRange as jest.MockedFunction<typeof fetchRange>

class FakeAudioParam {
  value = 1
  setValueAtTime(): void {}
  setValueCurveAtTime(): void {}
}

class FakeGainNode {
  gain = new FakeAudioParam()
  connect(): void {}
  disconnect(): void {}
}

type StartCall = { when: number; offset?: number; duration?: number }

class FakeBufferSource {
  buffer: unknown = null
  startCalls: StartCall[] = []
  connect(): void {}
  disconnect(): void {}
  start(when = 0, offset?: number, duration?: number): void {
    this.startCalls.push({ when, offset, duration })
  }
  stop(): void {}
}

/** Latest fake context created by the engine, so tests can advance its clock + read scheduling. */
let lastContext: FakeAudioContext | null = null

class FakeAudioContext {
  currentTime = 0
  destination = {}
  sources: FakeBufferSource[] = []
  constructor() {
    lastContext = this
  }
  createGain(): FakeGainNode {
    return new FakeGainNode()
  }
  createBufferSource(): FakeBufferSource {
    const src = new FakeBufferSource()
    this.sources.push(src)
    return src
  }
  createBuffer(): { duration: number } {
    return { duration: 0 }
  }
  decodeAudioData(): Promise<{ duration: number }> {
    return Promise.resolve({ duration: 5 })
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
}

beforeAll(() => {
  ;(
    window as unknown as { AudioContext: typeof FakeAudioContext }
  ).AudioContext = FakeAudioContext
  window.requestAnimationFrame = (() =>
    0) as unknown as typeof requestAnimationFrame
  window.cancelAnimationFrame = (() =>
    undefined) as unknown as typeof cancelAnimationFrame
})

beforeEach(() => {
  // CRA sets resetMocks: true, so the implementation is re-established per test.
  mockedFetchRange.mockReset()
  mockedFetchRange.mockResolvedValue(new ArrayBuffer(8))
  lastContext = null
})

describe('PreviewEngine.playSelection', () => {
  it('decodes only the selected range and reports playing state', async () => {
    const spec = new EditSpec(7, [])
    const engine = new PreviewEngine(spec)
    const states: string[] = []
    engine.onStateChange((state) => states.push(state))

    const segment = new SourceSegment({ sourceStart: 12, sourceEnd: 18 })
    await engine.playSelection(segment, false)

    expect(mockedFetchRange).toHaveBeenCalledTimes(1)
    expect(mockedFetchRange).toHaveBeenCalledWith(7, 12, 18)
    expect(engine.isPlaying()).toBe(true)
    expect(states).toContain('playing')

    await engine.stop()
    expect(engine.isPlaying()).toBe(false)
  })

  it('stop clears the loop so a looped selection does not restart', async () => {
    const engine = new PreviewEngine(new EditSpec(3, []))
    const segment = new SourceSegment({ sourceStart: 0, sourceEnd: 2 })
    await engine.playSelection(segment, true)
    await engine.stop()

    mockedFetchRange.mockClear()
    // No further decode happens after stop; the loop was cancelled.
    expect(mockedFetchRange).not.toHaveBeenCalled()
    expect(engine.isPlaying()).toBe(false)
  })

  it('does not emit a stopped state when a loop restarts (no UI flicker)', async () => {
    const engine = new PreviewEngine(new EditSpec(9, []))
    const states: string[] = []
    engine.onStateChange((state) => states.push(state))

    const segment = new SourceSegment({ sourceStart: 0, sourceEnd: 1 })
    // Simulate the internal loop restart (tick passes isLoopRestart=true).
    await engine.playSelection(segment, true, true)

    expect(states).not.toContain('stopped')
    expect(engine.isPlaying()).toBe(true)

    // An explicit stop still surfaces the stopped state.
    await engine.stop()
    expect(states).toContain('stopped')
  })
})

describe('PreviewEngine.onProgress', () => {
  it('maps the export playhead onto the right segment and source position', async () => {
    // Two source slices joined back-to-back (no crossfade): [100..105) then [200..204).
    const spec = new EditSpec(5, [])
    spec.addSegment(new SourceSegment({ sourceStart: 100, sourceEnd: 105 }))
    spec.addSegment(new SourceSegment({ sourceStart: 200, sourceEnd: 204 }))
    const engine = new PreviewEngine(spec)

    const ticks: Array<{
      segmentIndex: number
      sourceTime: number | null
      exportTime: number
      exportDuration: number
    }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.play()

    // play() first clears any prior progress, then emits the start frame; take the latest.
    const start = ticks[ticks.length - 1]
    expect(start.segmentIndex).toBe(0)
    expect(start.sourceTime).toBeCloseTo(100)
    expect(start.exportTime).toBeCloseTo(0)
    // Total export length is the sum of both slices (5 + 4) with no crossfade.
    expect(start.exportDuration).toBeCloseTo(9)

    await engine.stop()
  })

  it('reports a single-region selection mapped to its source range', async () => {
    const engine = new PreviewEngine(new EditSpec(5, []))
    const ticks: Array<{ segmentIndex: number; sourceTime: number | null }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.playSelection(
      new SourceSegment({ sourceStart: 42, sourceEnd: 48 }),
      false
    )

    const start = ticks[ticks.length - 1]
    expect(start.segmentIndex).toBe(0)
    expect(start.sourceTime).toBeCloseTo(42)

    await engine.stop()
  })

  it('clears the progress (segmentIndex -1) on stop so the editor drops the highlight', async () => {
    const engine = new PreviewEngine(new EditSpec(5, []))
    const ticks: Array<{ segmentIndex: number; sourceTime: number | null }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.playSelection(
      new SourceSegment({ sourceStart: 1, sourceEnd: 3 }),
      false
    )
    await engine.stop()

    const last = ticks[ticks.length - 1]
    expect(last.segmentIndex).toBe(-1)
    expect(last.sourceTime).toBeNull()
  })
})

describe('PreviewEngine pause/resume', () => {
  // Two back-to-back source slices: [100..105) then [200..204) → export windows 0–5 and 5–9.
  const twoSegmentSpec = () => {
    const spec = new EditSpec(5, [])
    spec.addSegment(new SourceSegment({ sourceStart: 100, sourceEnd: 105 }))
    spec.addSegment(new SourceSegment({ sourceStart: 200, sourceEnd: 204 }))
    return spec
  }

  it('pause captures the current export position and reports paused (no reset to 0)', async () => {
    const engine = new PreviewEngine(twoSegmentSpec())
    const ticks: Array<{ exportTime: number; segmentIndex: number }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.play()
    // Advance the live context clock so the captured offset lands inside the second segment.
    // startContextTime is currentTime(0) + 0.05, so exportTime = currentTime - 0.05.
    lastContext!.currentTime = 6.05
    await engine.pause()

    expect(engine.isPlaying()).toBe(false)
    expect(engine.isPaused()).toBe(true)
    // The last progress frame holds the paused position — it is NOT reset to 0.
    const last = ticks[ticks.length - 1]
    expect(last.exportTime).toBeCloseTo(6)
    expect(last.segmentIndex).toBe(1)
  })

  it('resume continues from the paused offset instead of restarting at 0', async () => {
    const engine = new PreviewEngine(twoSegmentSpec())
    const ticks: Array<{ exportTime: number; segmentIndex: number }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.play()
    lastContext!.currentTime = 6.05
    await engine.pause()

    await engine.resume()
    // The first frame after resume reports near the captured offset (~6s), not 0 — i.e. it picked
    // up where it left off. (The exact value trails by the small scheduling lead.)
    const afterResume = ticks[ticks.length - 1]
    expect(afterResume.exportTime).toBeGreaterThan(5.5)
    expect(afterResume.exportTime).toBeLessThanOrEqual(6)
    expect(afterResume.segmentIndex).toBe(1)
    expect(engine.isPlaying()).toBe(true)
  })

  it('resume schedules only the segments at/after the offset, mid-buffer for the straddled one', async () => {
    const engine = new PreviewEngine(twoSegmentSpec())
    await engine.play()
    lastContext!.currentTime = 6.05
    await engine.pause()

    await engine.resume()
    const ctx = lastContext!
    // Only the second segment is scheduled on resume; its buffer starts 1s in (6 − 5 = 1).
    const started = ctx.sources.filter((s) => s.startCalls.length > 0)
    expect(started.length).toBe(1)
    expect(started[0].startCalls[0].offset).toBeCloseTo(1)
  })

  it('decoded buffers are reused across resume (no extra fetch on resume)', async () => {
    const engine = new PreviewEngine(twoSegmentSpec())
    await engine.play()
    expect(mockedFetchRange).toHaveBeenCalledTimes(2)

    lastContext!.currentTime = 6.05
    await engine.pause()
    await engine.resume()

    // Both slices were cached on the first play; resume decodes nothing new.
    expect(mockedFetchRange).toHaveBeenCalledTimes(2)
  })

  it('play(fromOffset) starts mid-timeline and back-dates the clock so progress continues', async () => {
    const engine = new PreviewEngine(twoSegmentSpec())
    const ticks: Array<{ exportTime: number; segmentIndex: number }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.play(7)
    const start = ticks[ticks.length - 1]
    // Playback begins partway through the timeline (near 7s, trailing by the scheduling lead) and
    // inside the second segment — not at the very start.
    expect(start.exportTime).toBeGreaterThan(6.5)
    expect(start.exportTime).toBeLessThanOrEqual(7)
    expect(start.segmentIndex).toBe(1)

    await engine.stop()
  })

  it('stop after a pause clears the resume offset so a later play starts at 0', async () => {
    const engine = new PreviewEngine(twoSegmentSpec())
    const ticks: Array<{ exportTime: number; segmentIndex: number }> = []
    engine.onProgress((p) => ticks.push(p))

    await engine.play()
    lastContext!.currentTime = 6.05
    await engine.pause()
    await engine.stop()

    // A fresh play after stop ignores the old paused offset and starts from the beginning.
    await engine.play()
    const start = ticks[ticks.length - 1]
    expect(start.exportTime).toBeCloseTo(0)
    expect(start.segmentIndex).toBe(0)

    await engine.stop()
  })
})

describe('PreviewEngine cache + lifecycle', () => {
  it('setSpec drops buffers no longer referenced so the cache cannot grow without bound', async () => {
    const segA = new SourceSegment({ sourceStart: 10, sourceEnd: 15 })
    const segB = new SourceSegment({ sourceStart: 50, sourceEnd: 55 })
    const engine = new PreviewEngine(new EditSpec(5, [segA]))

    await engine.play()
    expect(mockedFetchRange).toHaveBeenCalledTimes(1)
    await engine.stop()

    engine.setSpec(new EditSpec(5, [segB]))
    await engine.play()
    expect(mockedFetchRange).toHaveBeenCalledTimes(2)
    await engine.stop()

    // segA was pruned by setSpec(B), so playing it again re-fetches (3rd call); without pruning the
    // buffer would still be cached and this would stay at 2.
    engine.setSpec(new EditSpec(5, [segA]))
    await engine.play()
    expect(mockedFetchRange).toHaveBeenCalledTimes(3)
    await engine.stop()
  })

  it('loops a window: reaching the window end restarts playback at the window start', async () => {
    // Two slices joined back-to-back → export windows 0–5 and 5–9; loop a 4–6 window over the join.
    const spec = new EditSpec(5, [
      new SourceSegment({ sourceStart: 100, sourceEnd: 105 }),
      new SourceSegment({ sourceStart: 200, sourceEnd: 204 }),
    ])
    const engine = new PreviewEngine(spec)
    const ticks: number[] = []
    engine.onProgress((p) => ticks.push(p.exportTime))

    // Capture the rAF callback so a tick can be driven deterministically.
    const origRaf = window.requestAnimationFrame
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    }) as unknown as typeof requestAnimationFrame
    try {
      await engine.play(4, { loopWindow: { start: 4, end: 6 } })
      const firstContext = lastContext

      // Advance the clock past the window end, then run the captured frame: it should wrap.
      lastContext!.currentTime = 6.1
      frames[frames.length - 1]?.(0)
      // Let the silent restart play() settle (decode + reschedule).
      await new Promise((resolve) => setTimeout(resolve, 0))

      // A fresh context backs the restarted pass, and playback resumed at the window start (4s,
      // trailing by the small scheduling lead — same back-dating as resume()), not at 0 or the end.
      expect(lastContext).not.toBe(firstContext)
      const resumed = ticks[ticks.length - 1]
      expect(resumed).toBeGreaterThan(3.5)
      expect(resumed).toBeLessThanOrEqual(4)
      expect(engine.isPlaying()).toBe(true)
    } finally {
      window.requestAnimationFrame = origRaf
      await engine.stop()
    }
  })

  it('a full stop clears the loop window so later playback runs linearly to the end', async () => {
    const spec = new EditSpec(5, [
      new SourceSegment({ sourceStart: 100, sourceEnd: 105 }),
      new SourceSegment({ sourceStart: 200, sourceEnd: 204 }),
    ])
    const engine = new PreviewEngine(spec)

    const origRaf = window.requestAnimationFrame
    const frames: FrameRequestCallback[] = []
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    }) as unknown as typeof requestAnimationFrame
    try {
      await engine.play(0, { loopWindow: { start: 0, end: 3 } })
      await engine.stop()

      // Linear play after stop: advancing past the TOTAL duration must stop, not wrap to the
      // (now cleared) window — proving the window did not persist.
      await engine.play()
      lastContext!.currentTime = 9.1
      frames[frames.length - 1]?.(0)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(engine.isPlaying()).toBe(false)
    } finally {
      window.requestAnimationFrame = origRaf
      await engine.stop()
    }
  })

  it('play() abandons a run quietly when its context is torn down mid-decode', async () => {
    const engine = new PreviewEngine(
      new EditSpec(5, [new SourceSegment({ sourceStart: 0, sourceEnd: 5 })])
    )
    // A newer stop() replaces the context before this decode resolves, then the decode fails.
    mockedFetchRange.mockImplementationOnce(async () => {
      await engine.stop()
      throw new Error('AudioContext closed')
    })
    await expect(engine.play()).resolves.toBeUndefined()
  })
})
