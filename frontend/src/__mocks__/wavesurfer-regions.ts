// Mock for wavesurfer.js regions plugin — see the wavesurfer mock for why this is stubbed.
//
// Supports the region lifecycle (create/update/remove + events) so component tests can
// simulate dragging regions onto the waveform and assert the editor's reaction.

type Handler = (...args: unknown[]) => void

export type Region = {
  id: string
  start: number
  end: number
  element: HTMLElement | null
  drag: boolean
  resize: boolean
  color: string
  setOptions: (opts: {
    color?: string
    content?: string
    start?: number
    end?: number
  }) => void
  play: (stopAtEnd?: boolean) => void
  remove: () => void
}

/** Tests can grab the most recently created plugin instance to drive region events. */
export let lastRegionsPlugin: RegionsPluginMock | null = null

class RegionsPluginMock {
  private handlers = new Map<string, Set<Handler>>()
  private regions: Region[] = []
  private counter = 0

  static create(): RegionsPluginMock {
    const plugin = new RegionsPluginMock()
    lastRegionsPlugin = plugin
    return plugin
  }

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((h) => h(...args))
  }

  enableDragSelection(): () => void {
    return () => undefined
  }

  addRegion(options: {
    id?: string
    start: number
    end?: number
    color?: string
    drag?: boolean
    resize?: boolean
  }): Region {
    const id = options.id ?? `region-${(this.counter += 1)}`
    const self = this
    const region: Region = {
      id,
      start: options.start,
      end: options.end ?? options.start,
      element: document.createElement('div'),
      drag: options.drag ?? true,
      resize: options.resize ?? true,
      color: options.color ?? '',
      setOptions(opts) {
        if (opts.color !== undefined) {
          this.color = opts.color
        }
        if (opts.start !== undefined) {
          this.start = opts.start
        }
        if (opts.end !== undefined) {
          this.end = opts.end
        }
      },
      play() {},
      remove() {
        self.regions = self.regions.filter((r) => r.id !== id)
        self.emit('region-removed', this)
      },
    }
    this.regions.push(region)
    this.emit('region-created', region)
    return region
  }

  getRegions(): Region[] {
    return this.regions
  }

  clearRegions(): void {
    this.regions = []
  }

  destroy(): void {}
}

export default RegionsPluginMock
