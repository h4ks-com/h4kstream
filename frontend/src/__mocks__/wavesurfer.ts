// Mock for wavesurfer.js — its dist ships untransformed ESM and relies on Web Audio APIs
// that jsdom doesn't implement, so tests stub it out rather than load the real module.
//
// The mock is event-capable so component tests can drive the editor through the same
// lifecycle the real library would (ready/decode/timeupdate/play/pause).

type Handler = (...args: unknown[]) => void

/** Tests can grab the most recently created instance to drive playback + inspect wiring. */
// eslint-disable-next-line prefer-const
export let lastWaveSurfer: WaveSurferMock | null = null

class WaveSurferMock {
  private handlers = new Map<string, Set<Handler>>()
  private currentTime = 0
  private playing = false
  duration = 0
  /** Last px/sec passed to zoom(), so tests can assert autofit/fit behavior. */
  lastZoom = 0
  // The streaming media element the real library plays/seeks through; recorded so tests can
  // assert it was wired up (e.g. its src points at the public Range-streaming endpoint).
  media: HTMLMediaElement | null = null

  static create(options?: {
    duration?: number
    media?: HTMLMediaElement
  }): WaveSurferMock {
    const ws = new WaveSurferMock()
    ws.duration = options?.duration ?? 0
    ws.media = options?.media ?? null
    lastWaveSurfer = ws
    // Emit readiness on the next tick so listeners registered after create() still fire.
    setTimeout(() => {
      ws.emit('decode', ws.duration)
      ws.emit('ready', ws.duration)
    }, 0)
    return ws
  }

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  once(event: string, handler: Handler): () => void {
    const off = this.on(event, (...args) => {
      off()
      handler(...args)
    })
    return off
  }

  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((h) => h(...args))
  }

  zoom(pxPerSec: number): void {
    this.lastZoom = pxPerSec
  }
  setOptions(): void {}
  setTime(time: number): void {
    this.currentTime = time
    this.emit('timeupdate', time)
  }
  getCurrentTime(): number {
    return this.currentTime
  }
  /** Drive the playhead to `time`, firing the timeupdate + audioprocess pair like the real lib. */
  tick(time: number): void {
    this.currentTime = time
    this.emit('timeupdate', time)
    if (this.playing) {
      this.emit('audioprocess', time)
    }
  }
  stop(): void {
    this.playing = false
    this.currentTime = 0
    this.emit('pause')
  }
  play(start?: number): Promise<void> {
    if (typeof start === 'number') {
      this.currentTime = start
    }
    this.playing = true
    this.emit('play')
    return Promise.resolve()
  }
  pause(): void {
    this.playing = false
    this.emit('pause')
  }
  playPause(): Promise<void> {
    if (this.playing) {
      this.pause()
    } else {
      void this.play()
    }
    return Promise.resolve()
  }
  isPlaying(): boolean {
    return this.playing
  }
  private wrapper = document.createElement('div')
  getWrapper(): HTMLElement {
    return this.wrapper
  }
  getWidth(): number {
    return 1000
  }
  getScroll(): number {
    return 0
  }
  getDuration(): number {
    return this.duration
  }
  getDecodedData(): null {
    return null
  }
  destroy(): void {}
}

export default WaveSurferMock
