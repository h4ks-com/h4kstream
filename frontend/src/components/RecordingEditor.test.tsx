import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { RecordingEditor } from './RecordingEditor'
import { EditSpec, SourceSegment } from '../edit'
import { lastRegionsPlugin } from '../__mocks__/wavesurfer-regions'
import { lastWaveSurfer } from '../__mocks__/wavesurfer'

// Plain functions (not jest.fn) so CRA's resetMocks: true doesn't strip the implementations.
jest.mock('../edit/audioSource', () => ({
  fetchPeaks: async () => ({
    version: 1,
    duration: 60,
    peaks: [0, 0.5, 1, 0.5, 0],
  }),
  fetchRange: async () => new ArrayBuffer(8),
}))

type ProgressTick = {
  segmentIndex: number
  sourceTime: number | null
  exportTime: number
  exportDuration: number
}

interface FakePreviewEngine {
  spec: unknown
  playing: boolean
  paused: boolean
  lastPlayOffset: number
  progressCb: ((p: ProgressTick) => void) | null
  setSpec(spec: unknown): void
  onStateChange(): void
  onProgress(cb: (p: ProgressTick) => void): void
  isPlaying(): boolean
  isPaused(): boolean
  play(fromOffset?: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  playSelection(): Promise<void>
  stop(): Promise<void>
  emitProgress(p: ProgressTick): void
}

// Holder for the latest stub instance, `mock`-prefixed so jest's hoisted factory may reference it.
const mockPreview: { last: FakePreviewEngine | null } = { last: null }

// Stubbed Web Audio preview engine. It records the progress callback and exposes the last
// instance + spec so the editor's preview-follow and export-order behavior can be driven/asserted
// here; the real timeline scheduling lives in PreviewEngine's own unit test.
jest.mock('../edit/PreviewEngine', () => ({
  PreviewEngine: class {
    spec: unknown
    playing = false
    paused = false
    lastPlayOffset = 0
    progressCb: ((p: ProgressTick) => void) | null = null
    constructor(spec: unknown) {
      this.spec = spec
      mockPreview.last = this as unknown as FakePreviewEngine
    }
    setSpec(spec: unknown): void {
      this.spec = spec
    }
    onStateChange(): void {}
    onProgress(cb: (p: ProgressTick) => void): void {
      this.progressCb = cb
    }
    isPlaying(): boolean {
      return this.playing
    }
    isPaused(): boolean {
      return this.paused
    }
    play(fromOffset = 0): Promise<void> {
      this.lastPlayOffset = fromOffset
      this.playing = true
      this.paused = false
      return Promise.resolve()
    }
    pause(): Promise<void> {
      this.playing = false
      this.paused = true
      return Promise.resolve()
    }
    resume(): Promise<void> {
      this.playing = true
      this.paused = false
      return Promise.resolve()
    }
    playSelection(): Promise<void> {
      this.playing = true
      this.paused = false
      return Promise.resolve()
    }
    stop(): Promise<void> {
      this.playing = false
      this.paused = false
      return Promise.resolve()
    }
    emitProgress(p: ProgressTick): void {
      this.progressCb?.(p)
    }
  },
}))

const lastPreviewEngine = (): FakePreviewEngine => mockPreview.last!

/** Render and let the async waveform init + region seeding settle inside act(). */
const renderSettled = async (spec: EditSpec) => {
  await act(async () => {
    render(<RecordingEditor initialSpec={spec} />)
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

const addRegions = async (ranges: Array<{ start: number; end: number }>) => {
  await act(async () => {
    ranges.forEach((r) => lastRegionsPlugin!.addRegion(r))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const chips = (): HTMLElement[] =>
  Array.from(
    screen
      .getByTestId('region-chips')
      .querySelectorAll('[data-testid^="region-chip-"]')
  )

const lane = (): HTMLElement =>
  lastWaveSurfer!.getWrapper().querySelector('[data-testid="cycle-lane"]')!
const cycleBar = (): HTMLElement =>
  lastWaveSurfer!.getWrapper().querySelector('[data-testid="cycle-bar"]')!

// The cycle uses plain pointer listeners (no setPointerCapture / wavesurfer drag). jsdom has no
// PointerEvent, but a MouseEvent dispatched under the pointer* name carries clientX/button, which
// is all the handlers read. pointerdown fires on the target; move/up fire on window.
const pointer = (
  el: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number
) => {
  el.dispatchEvent(
    new MouseEvent(type, {
      clientX,
      button: 0,
      bubbles: true,
      cancelable: true,
    })
  )
}

// Drag across the cycle lane. With duration 60 and the mock's 1000px content width,
// time = clientX / 1000 * 60, so clientX 100→6s, 300→18s, etc.
const dragLane = (fromX: number, toX: number, target: EventTarget = lane()) => {
  act(() => {
    pointer(target, 'pointerdown', fromX)
    pointer(window, 'pointermove', toX)
    pointer(window, 'pointerup', toX)
  })
}

// A minimal DataTransfer stand-in: jsdom doesn't construct one for synthetic drag events.
const dataTransfer = () => {
  const store: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => {
      store[k] = v
    },
    getData: (k: string) => store[k] ?? '',
    effectAllowed: 'all',
    dropEffect: 'none',
  } as unknown as DataTransfer
}

// Drag chip at index `from` onto chip at index `to` via native HTML5 drag events.
const dragChip = (from: number, to: number) => {
  const dt = dataTransfer()
  const fromEl = screen.getByTestId(`region-chip-${from}`)
  const toEl = screen.getByTestId(`region-chip-${to}`)
  act(() => {
    fireEvent.dragStart(fromEl, { dataTransfer: dt })
    fireEvent.dragOver(toEl, { dataTransfer: dt })
    fireEvent.drop(toEl, { dataTransfer: dt })
    fireEvent.dragEnd(fromEl, { dataTransfer: dt })
  })
}

describe('RecordingEditor', () => {
  it('starts with no regions and disables export until one is marked', async () => {
    await renderSettled(new EditSpec(42, []))

    expect(
      screen.getByRole('button', { name: /Copy audio link/i })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Download$/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Copy editor link/i })
    ).toBeDisabled()
    // Preview export is disabled with no regions to join.
    expect(
      screen.getByRole('button', { name: /Preview export/i })
    ).toBeDisabled()
    // The on-waveform transport play button is present once the wave is ready.
    expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument()
  })

  it('creates a region from the + Add region button and opens its docked editor', async () => {
    await renderSettled(new EditSpec(42, []))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add region/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // A region now exists, the export is enabled, and the docked per-region editor opened.
    expect(lastRegionsPlugin!.getRegions().length).toBe(1)
    expect(screen.getByTestId('region-editor-panel')).toBeInTheDocument()
    expect(screen.getByLabelText('Region volume')).toBeInTheDocument()
    expect(screen.getByLabelText('Start (s)')).toBeInTheDocument()
    expect(screen.getByLabelText('End (s)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Copy audio link/i })
    ).toBeEnabled()
  })

  it('enables export and shows an ordered chip once a region is created', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 3, end: 8 }])

    // One chip, badge order 1, with its source range.
    const [chip] = chips()
    expect(chip).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/Region 1, 0:03\.00 to 0:08\.00/)
    )
    expect(within(chip).getByText('0:03.00–0:08.00')).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: /Copy audio link/i })
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: /Preview export/i })
    ).toBeEnabled()
  })

  it('keeps chips/segments in CREATION order, not sorted by source time', async () => {
    await renderSettled(new EditSpec(42, []))
    // Add a later region first, then an earlier one: export order follows creation, not time.
    await addRegions([
      { start: 20, end: 25 },
      { start: 5, end: 9 },
    ])

    const labels = chips().map((c) => c.getAttribute('aria-label'))
    expect(labels[0]).toMatch(/Region 1, 0:20\.00 to 0:25\.00/)
    expect(labels[1]).toMatch(/Region 2, 0:05\.00 to 0:09\.00/)
    expect(screen.getByText(/2 regions/i)).toBeInTheDocument()
  })

  it('restores regions from a non-empty initial spec in spec order', async () => {
    await renderSettled(
      new EditSpec(42, [
        new SourceSegment({ sourceStart: 10, sourceEnd: 15 }),
        new SourceSegment({ sourceStart: 1, sourceEnd: 4 }),
      ])
    )

    // Order is taken from the spec, NOT re-sorted by start time.
    const labels = chips().map((c) => c.getAttribute('aria-label'))
    expect(labels[0]).toMatch(/Region 1, 0:10\.00 to 0:15\.00/)
    expect(labels[1]).toMatch(/Region 2, 0:01\.00 to 0:04\.00/)
    expect(
      screen.getByRole('button', { name: /Copy audio link/i })
    ).toBeEnabled()
  })

  it('backs wavesurfer with a streaming media element at the public Range endpoint', async () => {
    await renderSettled(new EditSpec(42, []))

    // The media element is what streams + seeks the source, while peaks render the waveform.
    expect(lastWaveSurfer!.media).not.toBeNull()
    expect(lastWaveSurfer!.media!.src).toContain('/api/recordings/stream/42')
  })

  it('Play toggles SOURCE playback from the playhead (not the export edit)', async () => {
    await renderSettled(new EditSpec(42, []))
    const ws = lastWaveSurfer!
    act(() => {
      ws.setTime(12)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // It plays the source itself, from where the playhead already is — never rewound to 0.
    expect(ws.isPlaying()).toBe(true)
    expect(ws.getCurrentTime()).toBe(12)
    // The button now reflects the source's playing state.
    expect(screen.getByRole('button', { name: /^Pause$/i })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Pause$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(ws.isPlaying()).toBe(false)
  })

  it('Stop pauses the source and rewinds the playhead to 0', async () => {
    await renderSettled(new EditSpec(42, []))
    const ws = lastWaveSurfer!
    await act(async () => {
      ws.setTime(20)
      await ws.play(20)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(ws.isPlaying()).toBe(false)
    expect(ws.getCurrentTime()).toBe(0)
  })

  it('spacebar pauses/resumes the ACTIVE engine without switching engines', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 3, end: 8 }])

    // Start the export preview, so export is the active engine.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preview export/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastPreviewEngine().isPlaying()).toBe(true)
    const ws = lastWaveSurfer!
    expect(ws.isPlaying()).toBe(false)

    // Space pauses the export preview (NOT the source), leaving the source untouched.
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastPreviewEngine().isPlaying()).toBe(false)
    expect(ws.isPlaying()).toBe(false)

    // Space again resumes the export preview engine, still never the source.
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastPreviewEngine().isPlaying()).toBe(true)
    expect(ws.isPlaying()).toBe(false)
  })

  it('export toggle pauses + resumes in place (does not restart the preview at 0)', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 3, end: 8 }])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preview export/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const engine = lastPreviewEngine()

    // Toggling export off via the play button pauses (not stops) — the engine reports paused.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Pause$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(engine.isPlaying()).toBe(false)
    expect(engine.isPaused()).toBe(true)

    // Toggling back on resumes (the editor calls resume(), never play() — so no restart at 0).
    engine.lastPlayOffset = -1
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(engine.isPlaying()).toBe(true)
    expect(engine.isPaused()).toBe(false)
    // resume() was used (which continues from the captured offset); play(0) was never called.
    expect(engine.lastPlayOffset).toBe(-1)
  })

  it('starting source playback stops a running export preview (never both audible)', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 3, end: 8 }])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preview export/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastPreviewEngine().isPlaying()).toBe(true)

    // The export is mid-play; explicitly Stop first, then the on-waveform Play starts the source.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastPreviewEngine().isPlaying()).toBe(false)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastWaveSurfer!.isPlaying()).toBe(true)
    expect(lastPreviewEngine().isPlaying()).toBe(false)
  })

  it('export-preview progress sweeps the waveform playhead through the source', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([
      { start: 3, end: 8 },
      { start: 30, end: 34 },
    ])
    const ws = lastWaveSurfer!

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preview export/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // First segment sounding: source time maps inside region 1; playhead follows it.
    act(() => {
      lastPreviewEngine().emitProgress({
        segmentIndex: 0,
        sourceTime: 5,
        exportTime: 2,
        exportDuration: 9,
      })
    })
    expect(ws.getCurrentTime()).toBe(5)
    expect(screen.getByTestId('transport-readout').textContent).toMatch(
      /0:02\.00 \/ 0:09\.00 · export/
    )

    // Jump to the second segment: the playhead jumps to region 2's source position.
    act(() => {
      lastPreviewEngine().emitProgress({
        segmentIndex: 1,
        sourceTime: 31,
        exportTime: 6,
        exportDuration: 9,
      })
    })
    expect(ws.getCurrentTime()).toBe(31)
  })

  it('creates a cycle range by dragging the top ruler lane and shows the yellow bar', async () => {
    await renderSettled(new EditSpec(42, []))

    // Drag from 100px (→6s) to 300px (→18s) along the lane.
    dragLane(100, 300)

    // A freshly dragged cycle is active, spanning 0:06–0:18, with the bar visible + lit yellow.
    const bar = cycleBar()
    expect(bar.style.display).toBe('block')
    expect(bar.textContent).toBe('0:06.00–0:18.00')
    expect(bar.title).toMatch(/Cycle 0:06\.00–0:18\.00 · looping/)
    // Active = solid bright yellow fill (#f5c518; jsdom serializes hex to rgb).
    expect(bar.style.background).toBe('rgb(245, 197, 24)')
  })

  it('ignores a too-short drag and leaves the cycle unset', async () => {
    await renderSettled(new EditSpec(42, []))

    // 100px→101px ≈ 0.06s, under the 0.2s minimum: collapses to no cycle.
    dragLane(100, 101)

    // Cycle stays unset: no cycle status text and the bar is hidden.
    expect(
      screen.queryByText(/Cycle .* (playback loops here|disabled)/)
    ).not.toBeInTheDocument()
    expect(cycleBar().style.display).toBe('none')
  })

  it('toggles the cycle active/inactive when the yellow bar is clicked', async () => {
    await renderSettled(new EditSpec(42, []))
    dragLane(100, 300)
    const bar = cycleBar()
    expect(bar.title).toMatch(/· looping/)

    // A press-release with no travel on the existing bar toggles it off (dimmed outline only).
    dragLane(150, 150, bar)
    expect(bar.title).toMatch(/· off/)
    expect(bar.style.background).toBe('transparent')

    // Clicking again toggles it back on.
    dragLane(150, 150, bar)
    expect(cycleBar().title).toMatch(/· looping/)
    expect(cycleBar().style.background).toBe('rgb(245, 197, 24)')
  })

  it('loops playback within an active cycle: past cycleEnd snaps back to cycleStart', async () => {
    await renderSettled(new EditSpec(42, []))
    const ws = lastWaveSurfer!

    // Set an active cycle 0:06–0:18 by dragging the lane.
    dragLane(100, 300)

    // Start source playback, then advance the playhead past cycleEnd (18s).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    act(() => {
      ws.tick(18.1)
    })

    // The playhead wrapped back to cycleStart and playback continues.
    expect(ws.getCurrentTime()).toBe(6)
    expect(ws.isPlaying()).toBe(true)
  })

  it('snaps the playhead into the cycle on Play when it starts outside, and plays linearly when inactive', async () => {
    await renderSettled(new EditSpec(42, []))
    const ws = lastWaveSurfer!
    dragLane(100, 300) // active cycle 6–18s
    act(() => {
      ws.setTime(40) // playhead outside the cycle
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // Play snapped the playhead to cycleStart.
    expect(ws.getCurrentTime()).toBe(6)

    // Disable the cycle, then playback no longer wraps at the old cycleEnd.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    dragLane(150, 150, cycleBar()) // toggle off
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    act(() => {
      ws.tick(18.1)
    })
    // No wrap: position advances straight past the (now inactive) cycle end.
    expect(ws.getCurrentTime()).toBeCloseTo(18.1)
  })

  it('resizes the cycle by dragging the bar edge', async () => {
    await renderSettled(new EditSpec(42, []))
    dragLane(100, 300) // cycle 6–18s
    const bar = cycleBar()
    // Give the bar a measurable rect so edge hit-testing engages (jsdom has no layout).
    bar.getBoundingClientRect = () =>
      ({ left: 100, right: 300, width: 200 }) as DOMRect

    // Grab the right edge (near 300px) and drag it out to 500px (→30s).
    dragLane(298, 500, bar)
    expect(cycleBar().textContent).toBe('0:06.00–0:30.00')
    expect(cycleBar().title).toMatch(/Cycle 0:06\.00–0:30\.00 · looping/)
  })

  it('keeps the cycle out of the exported clip URL (purely local UI state)', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 3, end: 8 }])

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)

    // Capture the exported audio URL with no cycle set.
    fireEvent.click(screen.getByRole('button', { name: /^Download$/i }))
    const urlNoCycle = openSpy.mock.calls[0][0]

    // Add an active cycle, then capture the exported URL again.
    dragLane(100, 300)
    openSpy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /^Download$/i }))
    const urlWithCycle = openSpy.mock.calls[0][0]

    // The cycle does not touch the EditSpec, so the encoded blob / URL is byte-for-byte identical.
    expect(urlWithCycle).toBe(urlNoCycle)

    openSpy.mockRestore()
  })

  it('reordering chips changes the export blob (segment order follows the chips)', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([
      { start: 3, end: 8 },
      { start: 30, end: 34 },
    ])

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    fireEvent.click(screen.getByRole('button', { name: /^Download$/i }))
    const before = openSpy.mock.calls[0][0]

    // Drag the 2nd chip onto the 1st slot: export order becomes [30-34, 3-8].
    dragChip(1, 0)

    const labels = chips().map((c) => c.getAttribute('aria-label'))
    expect(labels[0]).toMatch(/Region 1, 0:30\.00 to 0:34\.00/)
    expect(labels[1]).toMatch(/Region 2, 0:03\.00 to 0:08\.00/)

    openSpy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /^Download$/i }))
    const after = openSpy.mock.calls[0][0]

    // The exported clip encodes the new segment order, so its URL/blob changed.
    expect(after).not.toBe(before)

    openSpy.mockRestore()
  })

  it('scroll-wheel on the Start/End fields nudges the value and moves the region edge', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 10, end: 20 }])
    const region = lastRegionsPlugin!.getRegions()[0]

    // Wheel up increases Start by the 0.1s step → 10.1; the live region edge moves too.
    act(() => {
      fireEvent.wheel(screen.getByTestId('wheel-field-Start (s)'), {
        deltaY: -100,
      })
    })
    expect(region.start).toBeCloseTo(10.1)

    // Wheel down decreases End by 0.1s → 19.9.
    act(() => {
      fireEvent.wheel(screen.getByTestId('wheel-field-End (s)'), {
        deltaY: 100,
      })
    })
    expect(region.end).toBeCloseTo(19.9)
  })

  it('docked editor is hidden with no regions and shown for the selected region', async () => {
    await renderSettled(new EditSpec(42, []))

    // No regions → no docked editor at all.
    expect(screen.queryByTestId('region-editor-panel')).not.toBeInTheDocument()

    // Creating a region auto-selects it and opens the docked editor below the chips.
    await addRegions([{ start: 3, end: 8 }])
    expect(screen.getByTestId('region-editor-panel')).toBeInTheDocument()
    expect(screen.getByLabelText('Start (s)')).toBeInTheDocument()

    // Selecting another region via its chip switches the docked editor to it. The header label is
    // styled across a few spans, so assert the panel's combined text holds the region + its range.
    await addRegions([{ start: 30, end: 34 }])
    await act(async () => {
      fireEvent.click(chips()[0])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const header = screen
      .getByTestId('region-editor-panel')
      .textContent?.replace(/\s+/g, ' ')
    expect(header).toContain('Region 1 · 0:03.00–0:08.00')
  })

  it('Loop join auditions the join into the selected region, exclusive with source', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([
      { start: 3, end: 8 },
      { start: 30, end: 34 },
    ])
    const ws = lastWaveSurfer!

    // Select the second region: its docked editor exposes the join control (the first has no join).
    await act(async () => {
      fireEvent.click(chips()[1])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Start the source first, to prove arming the join stops it (never both audible).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(ws.isPlaying()).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Loop join/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const engine = lastPreviewEngine()
    // The export engine loops; the source is stopped.
    expect(engine.isPlaying()).toBe(true)
    expect(ws.isPlaying()).toBe(false)
    // Window start = junction (5s) − preRoll (2s) = 3s on the export timeline.
    expect(engine.lastPlayOffset).toBeCloseTo(3)
    // The readout marks a join audition; the full-preview button is NOT lit (still "Preview export").
    expect(screen.getByTestId('transport-readout').textContent).toMatch(
      /· join/
    )
    expect(
      screen.getByRole('button', { name: /Preview export/i })
    ).toBeInTheDocument()

    // Toggling the same join off stops the export engine.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Looping/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lastPreviewEngine().isPlaying()).toBe(false)
  })

  it('Preview export drives the joined-edit engine, separate from source transport', async () => {
    await renderSettled(new EditSpec(42, []))
    await addRegions([{ start: 3, end: 8 }])

    // The export-preview control is enabled once a region exists and is its own button.
    expect(
      screen.getByRole('button', { name: /Preview export/i })
    ).toBeEnabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preview export/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // The export engine plays; the source stays paused.
    expect(lastPreviewEngine().isPlaying()).toBe(true)
    expect(lastWaveSurfer!.isPlaying()).toBe(false)
  })
})
