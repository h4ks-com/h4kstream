import { EditSegment, SilenceSegment, SourceSegment } from './EditSegment'
import { EditSpec } from './EditSpec'
import { fetchRange } from './audioSource'

/**
 * In-browser preview of an EditSpec using the Web Audio API.
 *
 * Each segment gets one AudioBufferSourceNode (silence uses an empty buffer) feeding a
 * dedicated GainNode for its level + fades. Segments are laid out back-to-back on the audio
 * context timeline, except that a source segment's crossfadePrev pulls its start back by that
 * many seconds so its head overlaps the previous segment's tail. The overlap is shaped with
 * equal-power cos/sin curves so the perceived loudness stays constant through the transition.
 *
 * Decoded source buffers are cached by range so scrubbing the same material repeatedly only
 * fetches once.
 */

const CROSSFADE_CURVE_STEPS = 64
const SILENCE_SAMPLE_RATE = 44100

type ScheduledNode = {
  source: AudioBufferSourceNode
  gain: GainNode
}

/**
 * Timeline placement of one scheduled segment, used to map the export playhead back onto the
 * source. `startOffset`/`endOffset` are seconds from the start of playback; `sourceStart` is the
 * segment's position in the original recording (null for silence, which has no source position).
 */
type SegmentSpan = {
  index: number
  startOffset: number
  endOffset: number
  sourceStart: number | null
}

type PreviewState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped'

export type PreviewListener = (state: PreviewState, currentTime: number) => void

/**
 * Per-frame export-playback position, reported so the editor can sweep the waveform playhead
 * through the source and highlight the region currently sounding.
 * - `segmentIndex`: index of the segment sounding now (−1 before the first / for pure silence).
 * - `sourceTime`: position in the source recording currently audible (sourceStart + elapsed in
 *    the segment); null while a silence segment plays.
 * - `exportTime` / `exportDuration`: position along, and length of, the joined export timeline.
 */
export type PreviewProgress = {
  segmentIndex: number
  sourceTime: number | null
  exportTime: number
  exportDuration: number
}

export type PreviewProgressListener = (progress: PreviewProgress) => void

const equalPowerFadeIn = (
  gain: GainNode,
  startTime: number,
  duration: number,
  peak: number
) => {
  if (duration <= 0) {
    gain.gain.setValueAtTime(peak, startTime)
    return
  }
  const curve = new Float32Array(CROSSFADE_CURVE_STEPS)
  for (let i = 0; i < CROSSFADE_CURVE_STEPS; i += 1) {
    const t = i / (CROSSFADE_CURVE_STEPS - 1)
    curve[i] = Math.sin((t * Math.PI) / 2) * peak
  }
  gain.gain.setValueCurveAtTime(curve, startTime, duration)
}

const equalPowerFadeOut = (
  gain: GainNode,
  startTime: number,
  duration: number,
  peak: number
) => {
  if (duration <= 0) {
    gain.gain.setValueAtTime(0, startTime)
    return
  }
  const curve = new Float32Array(CROSSFADE_CURVE_STEPS)
  for (let i = 0; i < CROSSFADE_CURVE_STEPS; i += 1) {
    const t = i / (CROSSFADE_CURVE_STEPS - 1)
    curve[i] = Math.cos((t * Math.PI) / 2) * peak
  }
  gain.gain.setValueCurveAtTime(curve, startTime, duration)
}

export class PreviewEngine {
  private spec: EditSpec
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private nodes: ScheduledNode[] = []
  private bufferCache = new Map<string, AudioBuffer>()
  private state: PreviewState = 'idle'
  private listener?: PreviewListener
  private progressListener?: PreviewProgressListener
  private startContextTime = 0
  private rafId = 0
  private totalDuration = 0
  // Export-timeline offset (seconds) captured by pause(), so resume() can pick playback back up
  // from where it stopped instead of restarting at 0. Reset to 0 on a full stop.
  private pausedOffset = 0
  private loopSelection: SourceSegment | null = null
  // Active export-timeline loop window (seconds), or null for linear playback. When set, tick
  // wraps back to its start on reaching its end — used to audition the join between two regions.
  // Preserved across pause() so resume() keeps looping; cleared by a full stop().
  private loopWindow: { start: number; end: number } | null = null
  // Timeline placement of each scheduled segment, used to map the export playhead onto the source.
  private spans: SegmentSpan[] = []

  constructor(spec: EditSpec) {
    this.spec = spec
  }

  setSpec(spec: EditSpec): void {
    this.spec = spec
    this.pruneBufferCache()
  }

  /** Drop decoded buffers no longer referenced by the current spec so the cache stays bounded. */
  private pruneBufferCache(): void {
    const live = new Set(
      this.spec.segments
        .filter((seg): seg is SourceSegment => seg instanceof SourceSegment)
        .map((seg) => this.cacheKey(seg))
    )
    for (const key of [...this.bufferCache.keys()]) {
      if (!live.has(key)) {
        this.bufferCache.delete(key)
      }
    }
  }

  onStateChange(listener: PreviewListener): void {
    this.listener = listener
  }

  onProgress(listener: PreviewProgressListener): void {
    this.progressListener = listener
  }

  private emit(time: number): void {
    this.listener?.(this.state, time)
  }

  /** Resolve which segment is sounding at `exportTime` and the source position it maps to. */
  private emitProgress(exportTime: number): void {
    if (!this.progressListener) {
      return
    }
    const clamped = Math.min(Math.max(0, exportTime), this.totalDuration)
    let segmentIndex = -1
    let sourceTime: number | null = null
    for (const span of this.spans) {
      if (clamped >= span.startOffset && clamped < span.endOffset) {
        segmentIndex = span.index
        sourceTime =
          span.sourceStart === null
            ? null
            : span.sourceStart + (clamped - span.startOffset)
        break
      }
    }
    this.progressListener({
      segmentIndex,
      sourceTime,
      exportTime: clamped,
      exportDuration: this.totalDuration,
    })
  }

  private cacheKey(seg: SourceSegment): string {
    return `${seg.sourceStart.toFixed(3)}:${seg.sourceEnd.toFixed(3)}`
  }

  private async decodeSegment(
    context: AudioContext,
    seg: SourceSegment
  ): Promise<AudioBuffer> {
    const key = this.cacheKey(seg)
    const cached = this.bufferCache.get(key)
    if (cached) {
      return cached
    }
    const bytes = await fetchRange(
      this.spec.recordingId,
      seg.sourceStart,
      seg.sourceEnd
    )
    const buffer = await context.decodeAudioData(bytes)
    this.bufferCache.set(key, buffer)
    return buffer
  }

  private makeSilenceBuffer(
    context: AudioContext,
    duration: number
  ): AudioBuffer {
    const length = Math.max(1, Math.ceil(duration * SILENCE_SAMPLE_RATE))
    return context.createBuffer(1, length, SILENCE_SAMPLE_RATE)
  }

  /**
   * Build, schedule and start playback of the whole spec along the export timeline, beginning at
   * `fromOffset` seconds (default 0 — play from the start). Segments whose export window ends
   * before `fromOffset` are skipped; the segment containing `fromOffset` starts mid-buffer at the
   * matching source offset for its remaining duration; later segments schedule normally. The
   * context start time is back-dated by `fromOffset` so the reported `exportTime` continues from
   * there. A crossfade that straddles `fromOffset` is started cleanly (no mid-transition resume).
   */
  async play(
    fromOffset = 0,
    opts: {
      loopWindow?: { start: number; end: number } | null
      silent?: boolean
    } = {}
  ): Promise<void> {
    await this.stop(opts.silent)
    this.loopWindow = opts.loopWindow ?? null

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const context = new Ctor()
    this.context = context
    this.master = context.createGain()
    this.master.connect(context.destination)

    this.state = 'loading'
    this.emit(fromOffset)

    let sourceBuffers: (AudioBuffer | null)[]
    try {
      sourceBuffers = await Promise.all(
        this.spec.segments.map((seg) =>
          seg instanceof SourceSegment
            ? this.decodeSegment(context, seg)
            : Promise.resolve<AudioBuffer | null>(null)
        )
      )
    } catch (err) {
      // A newer play/stop closed this context mid-decode — abandon this superseded run quietly.
      if (this.context !== context) {
        return
      }
      throw err
    }

    if (this.context !== context) {
      return
    }

    this.totalDuration = this.spec.totalDuration()
    const offset = Math.min(Math.max(0, fromOffset), this.totalDuration)
    // The timeline's virtual origin: where exportTime 0 sits on the context clock. We start
    // audio at `context.currentTime + lead` (a small lead so scheduling isn't already late) which
    // corresponds to export position `offset`, so the origin is back-dated by `offset`.
    const lead = 0.05
    const timelineStart = context.currentTime + lead - offset
    this.startContextTime = timelineStart

    // First pass: lay out every segment's export window from the spec (independent of the resume
    // offset), so the spans/highlight mapping stays identical no matter where we resume. The same
    // boundary offsets locate the join a transition audition loops around.
    const starts = this.spec.segmentStartOffsets()
    this.spans = this.spec.segments.map((seg, i) => ({
      index: i,
      startOffset: starts[i],
      endOffset: starts[i] + seg.duration(),
      sourceStart: seg instanceof SourceSegment ? seg.sourceStart : null,
    }))

    // Second pass: schedule the audio. Skip segments fully before `offset`; clip the one that
    // contains it; schedule the rest from their natural start.
    this.spec.segments.forEach((seg, i) => {
      const span = this.spans[i]
      // Skip segments whose export window has fully elapsed by the resume point.
      if (span.endOffset <= offset) {
        return
      }
      const segStart = timelineStart + span.startOffset
      const crossfade =
        i > 0 && seg instanceof SourceSegment
          ? Math.min(
              seg.crossfadePrev,
              this.spec.segments[i - 1].duration(),
              seg.duration()
            )
          : 0
      // The segment straddling `offset` starts mid-buffer with no crossfade-in (the previous
      // segment it would fade from has already ended); fully-future segments play normally.
      if (offset > span.startOffset) {
        const into = offset - span.startOffset
        // Its audible start is the resume point (now), not the back-dated natural start — otherwise
        // gain automation would be scheduled at a negative context time.
        this.scheduleSegment(
          context,
          seg,
          sourceBuffers[i],
          timelineStart + offset,
          0,
          into
        )
      } else {
        this.scheduleSegment(
          context,
          seg,
          sourceBuffers[i],
          segStart,
          crossfade
        )
      }
    })

    // Make spans non-overlapping: where a crossfade overlaps two segments, attribute the overlap
    // to the incoming segment so the playhead jumps to the new region as its head fades in.
    for (let i = 0; i < this.spans.length - 1; i += 1) {
      this.spans[i].endOffset = Math.min(
        this.spans[i].endOffset,
        this.spans[i + 1].startOffset
      )
    }

    this.pausedOffset = 0
    this.state = 'playing'
    this.emit(offset)
    this.emitProgress(offset)
    this.tick()
  }

  /**
   * Pause export playback, remembering the current export position so resume() can continue from
   * it. Web Audio cannot pause a running graph, so the nodes are torn down; the cached decoded
   * buffers make resume effectively instant. The last reported playhead position is left in place
   * (no reset to 0 — that is what stop() is for).
   */
  async pause(): Promise<void> {
    if (this.state !== 'playing' || !this.context) {
      return
    }
    this.pausedOffset = Math.min(
      Math.max(0, this.context.currentTime - this.startContextTime),
      this.totalDuration
    )
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.loopSelection = null
    this.nodes.forEach(({ source }) => {
      try {
        source.stop()
      } catch {
        // already stopped; ignore
      }
      source.disconnect()
    })
    this.nodes = []
    const ctx = this.context
    this.context = null
    this.master = null
    await ctx.close().catch(() => undefined)
    this.state = 'paused'
    this.emit(this.pausedOffset)
    this.emitProgress(this.pausedOffset)
  }

  /**
   * Resume export playback from the offset captured by the last pause(). pause() preserves any
   * active loop window, so resuming a transition audition keeps looping around the same join.
   */
  async resume(): Promise<void> {
    await this.play(this.pausedOffset, { loopWindow: this.loopWindow })
  }

  /**
   * Play a single source segment in isolation with its own gain and fades applied.
   * Crossfade-with-previous is ignored here — a selection is auditioned on its own.
   * When `loop` is set, the segment restarts as soon as it finishes.
   */
  async playSelection(
    segment: SourceSegment,
    loop = false,
    isLoopRestart = false
  ): Promise<void> {
    // A loop restart tears down silently so the UI doesn't flicker to a stopped state.
    await this.stop(isLoopRestart)

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const context = new Ctor()
    this.context = context
    this.master = context.createGain()
    this.master.connect(context.destination)
    this.loopSelection = loop ? segment : null

    this.state = 'loading'
    this.emit(0)

    let buffer: AudioBuffer
    try {
      buffer = await this.decodeSegment(context, segment)
    } catch (err) {
      if (this.context !== context) {
        return
      }
      throw err
    }
    if (this.context !== context) {
      return
    }

    const startTime = context.currentTime + 0.05
    this.startContextTime = startTime
    this.totalDuration = segment.duration()
    this.scheduleSegment(context, segment, buffer, startTime, 0)
    this.spans = [
      {
        index: 0,
        startOffset: 0,
        endOffset: segment.duration(),
        sourceStart: segment.sourceStart,
      },
    ]

    this.state = 'playing'
    this.emit(0)
    this.emitProgress(0)
    this.tick()
  }

  /**
   * Schedule one segment to begin at context time `segStart`. `into` (seconds, default 0) skips
   * that much of the segment's head — used to resume the segment that straddles the resume offset
   * mid-buffer: the source buffer plays from `sourceStart + into`, a head fade that has already
   * finished by `into` is dropped, and a partially elapsed one starts from where it left off.
   */
  private scheduleSegment(
    context: AudioContext,
    seg: EditSegment,
    buffer: AudioBuffer | null,
    segStart: number,
    crossfadePrev: number,
    into = 0
  ): void {
    if (!this.master) {
      return
    }
    const fullDuration = seg.duration()
    const skip = Math.min(Math.max(0, into), fullDuration)
    const duration = fullDuration - skip
    if (duration <= 0) {
      return
    }
    const gainNode = context.createGain()
    gainNode.connect(this.master)

    const source = context.createBufferSource()
    if (seg instanceof SourceSegment) {
      source.buffer = buffer ?? this.makeSilenceBuffer(context, fullDuration)
    } else if (seg instanceof SilenceSegment) {
      source.buffer = this.makeSilenceBuffer(context, fullDuration)
    }
    source.connect(gainNode)

    const peak = seg instanceof SourceSegment ? seg.gain : 1
    const fadeIn =
      seg instanceof SilenceSegment ? seg.fadeIn : (seg as SourceSegment).fadeIn
    const fadeOut =
      seg instanceof SilenceSegment
        ? seg.fadeOut
        : (seg as SourceSegment).fadeOut

    // Crossfade-in overrides an explicit fadeIn when overlapping the previous tail. When resuming
    // mid-segment (`skip > 0`), reduce the head fade by the skipped time so it only covers the
    // remaining ramp; a head fade already finished by `skip` is gone and we open at full gain.
    const headFade = Math.max(crossfadePrev, fadeIn)
    const remainingHeadFade = Math.max(0, headFade - skip)
    if (remainingHeadFade > 0) {
      gainNode.gain.setValueAtTime(0, segStart)
      equalPowerFadeIn(gainNode, segStart, remainingHeadFade, peak)
    } else {
      gainNode.gain.setValueAtTime(peak, segStart)
    }

    const tailFade = fadeOut
    if (tailFade > 0) {
      const fadeOutStart = segStart + Math.max(0, duration - tailFade)
      equalPowerFadeOut(gainNode, fadeOutStart, tailFade, peak)
    }

    // Offset the buffer read by both the head skipped here and, for source slices, the segment's
    // own source start position. Silence buffers read from 0.
    const bufferOffset =
      seg instanceof SourceSegment ? skip : Math.min(skip, fullDuration)
    source.start(segStart, bufferOffset, duration + 0.01)
    this.nodes.push({ source, gain: gainNode })
  }

  private tick = (): void => {
    if (!this.context || this.state !== 'playing') {
      return
    }
    const elapsed = this.context.currentTime - this.startContextTime
    // Window loop (transition audition): on reaching the window end, restart at its start. The
    // restart tears down silently so the transport's playing state doesn't flicker each pass.
    if (this.loopWindow && elapsed >= this.loopWindow.end) {
      const window = this.loopWindow
      void this.play(window.start, { loopWindow: window, silent: true }).catch(
        () => undefined
      )
      return
    }
    if (!this.loopWindow && elapsed >= this.totalDuration) {
      if (this.loopSelection) {
        const segment = this.loopSelection
        void this.playSelection(segment, true, true).catch(() => undefined)
        return
      }
      this.emit(this.totalDuration)
      this.emitProgress(this.totalDuration)
      void this.stop()
      return
    }
    const clamped = Math.max(0, elapsed)
    this.emit(clamped)
    this.emitProgress(clamped)
    this.rafId = requestAnimationFrame(this.tick)
  }

  async stop(silent = false): Promise<void> {
    this.loopSelection = null
    this.loopWindow = null
    this.pausedOffset = 0
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.nodes.forEach(({ source }) => {
      try {
        source.stop()
      } catch {
        // already stopped; ignore
      }
      source.disconnect()
    })
    this.nodes = []
    this.spans = []
    if (this.context) {
      const ctx = this.context
      this.context = null
      this.master = null
      await ctx.close().catch(() => undefined)
    }
    this.state = 'stopped'
    if (!silent) {
      this.emit(0)
      // Clear the export playhead/highlight on the editor side.
      this.progressListener?.({
        segmentIndex: -1,
        sourceTime: null,
        exportTime: 0,
        exportDuration: this.totalDuration,
      })
    }
  }

  isPlaying(): boolean {
    return this.state === 'playing'
  }

  isPaused(): boolean {
    return this.state === 'paused'
  }
}
