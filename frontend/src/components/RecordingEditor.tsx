import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, {
  type Region,
} from 'wavesurfer.js/dist/plugins/regions.js'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import AddIcon from '@mui/icons-material/Add'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import FitScreenIcon from '@mui/icons-material/FitScreen'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import LinkIcon from '@mui/icons-material/Link'
import { EditSpec, EditUrls, SourceSegment } from '../edit'
import { fetchPeaks, fetchRange } from '../edit/audioSource'
import { PreviewEngine } from '../edit/PreviewEngine'
import { useTransport } from './useTransport'
import { RegionChips } from './RegionChips'
import { RegionEditorPanel, type RegionParams } from './RegionEditorPanel'

interface RecordingEditorProps {
  initialSpec: EditSpec
  /** Known recording duration in seconds; used as a fallback before peaks load. */
  recordingDuration?: number
}

const ZOOM_MIN = 1
const ZOOM_MAX = 800

/** Above this px/sec the coarse overview peaks look blocky, so we fetch real audio detail. */
const DETAIL_ZOOM_THRESHOLD = 60
const DETAIL_BINS_PER_SEC = 400

/** Default span of a region created from the playhead, in seconds, before clamping. */
const DEFAULT_REGION_SECONDS = 10
/** Minimum allowed gap between a region's start and end when edited numerically. */
const MIN_REGION_GAP = 0.05
/** Default pre/post-roll (seconds) of the join-loop transition audition. */
const DEFAULT_TRANSITION_ROLL = 2

/** Logic-Pro-style cycle (the yellow top bar) tuning. */
const CYCLE_LANE_HEIGHT = 16
/** Minimum cycle length in seconds, so a tiny drag/click can't make a zero-width cycle. */
const CYCLE_MIN_LENGTH = 0.2
/** Pointer travel (px) under which a press-release on an existing bar counts as a click/toggle. */
const CYCLE_CLICK_SLOP = 4
/** Grab width (px) at each edge of the bar that resizes rather than moves it. */
const CYCLE_EDGE_GRAB = 8
const CYCLE_COLOR = '#f5c518'
const CYCLE_COLOR_DIM = 'rgba(245, 197, 24, 0.35)'
const CYCLE_TINT = 'rgba(245, 197, 24, 0.12)'
const CYCLE_LANE_BG = 'rgba(245, 197, 24, 0.07)'

/** Thin dark scrollbar for wavesurfer's shadow-DOM scroll container (zoomed-in view). */
const SCROLLBAR_STYLE = `
  ::-webkit-scrollbar { height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #009926; border-radius: 4px; }
  .scroll { scrollbar-width: thin; scrollbar-color: #009926 transparent; }
`

const REGION_COLORS = [
  'rgba(26, 255, 127, 0.28)',
  'rgba(255, 122, 8, 0.28)',
  'rgba(0, 200, 255, 0.28)',
  'rgba(200, 0, 200, 0.28)',
  'rgba(255, 215, 0, 0.28)',
]
const ACTIVE_REGION_COLOR = 'rgba(26, 255, 127, 0.45)'
/** Bright fill for the region the export preview is currently sounding. */
const PLAYING_REGION_COLOR = 'rgba(26, 255, 127, 0.6)'

/** Accent color for the playhead cursor and region resize handles (distinct from regions). */
const ACCENT_COLOR = '#fd7a08'

/** Brighten the regions plugin's resize handles so begin/end edges are easy to grab. */
const REGION_HANDLE_STYLE = `
  [part*="region-handle"] {
    width: 6px !important;
    background: rgba(253, 122, 8, 0.55);
    border-color: ${ACCENT_COLOR} !important;
    transition: background 0.15s ease;
  }
  [part*="region-handle"]:hover {
    background: ${ACCENT_COLOR};
  }
`

const defaultParams = (): RegionParams => ({
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  crossfadePrev: 0,
})

const formatClock = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  const cs = Math.floor((safe - Math.floor(safe)) * 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/** Down-decode raw MP3 bytes into one max-amplitude value per bin for higher-detail zoom. */
const decodePeaks = async (
  bytes: ArrayBuffer,
  bins: number
): Promise<number[]> => {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  const ctx = new Ctor()
  try {
    const buffer = await ctx.decodeAudioData(bytes)
    const channel = buffer.getChannelData(0)
    const out = new Array<number>(bins).fill(0)
    const step = channel.length / bins
    for (let i = 0; i < bins; i += 1) {
      const from = Math.floor(i * step)
      const to = Math.min(channel.length, Math.floor((i + 1) * step))
      let peak = 0
      for (let j = from; j < to; j += 1) {
        const amp = Math.abs(channel[j])
        if (amp > peak) {
          peak = amp
        }
      }
      out[i] = peak
    }
    return out
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

export const RecordingEditor: React.FC<RecordingEditorProps> = ({
  initialSpec,
  recordingDuration,
}) => {
  const waveformRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const previewRef = useRef<PreviewEngine | null>(null)
  // Streaming media element backing wavesurfer playback. It seeks/streams via HTTP Range so
  // the (possibly hours-long) source is never fully downloaded; the waveform still draws from
  // the precomputed peaks instantly.
  const mediaRef = useRef<HTMLAudioElement | null>(null)
  // Logic-style cycle DOM: a thin ruler lane pinned to the top of the waveform and a yellow bar
  // inside it. Both are appended into the wavesurfer wrapper so they track zoom/scroll exactly.
  const cycleLaneRef = useRef<HTMLDivElement | null>(null)
  const cycleBarRef = useRef<HTMLDivElement | null>(null)
  // Faint yellow tint over the waveform spanning the cycle while it is active.
  const cycleTintRef = useRef<HTMLDivElement | null>(null)
  // Per-region edit params keyed by the wavesurfer region id (ranges live on the region itself).
  const paramsRef = useRef<Map<string, RegionParams>>(new Map())
  // Explicit export order of region ids. The chip order == this order == segment order; new
  // regions append to the end. This is the source of truth for ordering — regions are NOT
  // sorted by source time, so the waveform position and the export sequence can differ.
  const orderRef = useRef<string[]>([])
  // Latest spec, so transport handlers read fresh state without re-binding wavesurfer events.
  const specRef = useRef<EditSpec>(initialSpec)
  const coarsePeaksRef = useRef<number[] | null>(null)
  const detailTokenRef = useRef(0)
  // True while seeding regions from a restored edit, so region-created doesn't pop the editor.
  const seedingRef = useRef(false)
  // Live cycle target read by the wavesurfer timeupdate handler + the transport hook (kept in
  // sync without re-binding events). null when the cycle is inactive/unset → plain linear play.
  const cycleRef = useRef<{ start: number; end: number } | null>(null)
  // Latest cycle bounds, read by the lane's once-bound pointer handlers without rebinding them.
  const cycleStartRef = useRef(0)
  const cycleEndRef = useRef(0)
  // Latest known source duration, read by the lane's plain pointer handlers (px ⇄ time).
  const durationRef = useRef<number>(0)

  const [recordingId] = useState<number>(initialSpec.recordingId)
  const [sourceDuration, setSourceDuration] = useState<number>(
    recordingDuration ?? 0
  )
  const [zoom, setZoom] = useState<number>(ZOOM_MIN)
  const [waveReady, setWaveReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Source transport position (driven by wavesurfer's own playback of the streamed source).
  const [sourceTime, setSourceTime] = useState(0)
  // Logic-style cycle region — purely local UI state. It is NOT part of the EditSpec, never
  // encoded into the blob/URL, never sent to the backend, and does not affect the exported clip.
  // cycleEnd <= cycleStart means "unset". cycleActive gates playback looping + the bright styling.
  const [cycleStart, setCycleStart] = useState(0)
  const [cycleEnd, setCycleEnd] = useState(0)
  const [cycleActive, setCycleActive] = useState(false)
  // Export-preview position along the joined timeline, fed by the engine's progress ticks.
  const [exportTime, setExportTime] = useState(0)
  const [exportDuration, setExportDuration] = useState(0)
  // Index (in export order) of the region the preview is currently sounding; -1 when not playing
  // a source segment. Drives the bright "playing" highlight that sweeps through the regions.
  const [playingIndex, setPlayingIndex] = useState(-1)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  // Bumped whenever regions/order change, to recompute the spec/links/summary from live regions.
  const [regionVersion, setRegionVersion] = useState(0)
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null)
  // Start/End edge currently being scrubbed in the docked editor, for an emphasis highlight.
  const [activeEdge, setActiveEdge] = useState<'start' | 'end' | null>(null)
  // Export order of the region whose incoming join is currently being auditioned on a loop, or
  // null when no join loop is active. Distinguishes the join audition from a full export preview
  // (both drive the export engine) so the UI reflects which one is running.
  const [transitionOrder, setTransitionOrder] = useState<number | null>(null)
  const [preRoll, setPreRoll] = useState(DEFAULT_TRANSITION_ROLL)
  const [postRoll, setPostRoll] = useState(DEFAULT_TRANSITION_ROLL)

  const bumpRegions = useCallback(() => setRegionVersion((v) => v + 1), [])

  // Keep the cycle ref the transport hook reads in sync with state.
  useEffect(() => {
    cycleRef.current =
      cycleActive && cycleEnd > cycleStart
        ? { start: cycleStart, end: cycleEnd }
        : null
  }, [cycleActive, cycleStart, cycleEnd])

  const transport = useTransport({
    wavesurfer: wavesurferRef,
    preview: previewRef,
    cycle: cycleRef,
  })

  // Build the export spec from the live regions IN THE EXPLICIT ORDER (not sorted by time):
  // walk the ordered id list, map each region to a SourceSegment. crossfadePrev means "overlap
  // the previous segment in this list".
  const buildSpec = useCallback((): EditSpec => {
    const regions = regionsRef.current
    const spec = new EditSpec(recordingId, [])
    if (!regions) {
      return spec
    }
    const byId = new Map(regions.getRegions().map((r) => [r.id, r]))
    const ordered = orderRef.current
      .map((id) => byId.get(id))
      .filter((r): r is Region => Boolean(r))
    ordered.forEach((region, order) => {
      const params = paramsRef.current.get(region.id) ?? defaultParams()
      const dur = region.end - region.start
      const prevDur =
        order > 0 ? ordered[order - 1].end - ordered[order - 1].start : 0
      const crossfade =
        order === 0 ? 0 : Math.min(params.crossfadePrev, prevDur, dur)
      spec.addSegment(
        new SourceSegment({
          sourceStart: Math.max(0, region.start),
          sourceEnd: Math.max(region.start + 0.01, region.end),
          gain: params.gain,
          fadeIn: Math.min(params.fadeIn, dur),
          fadeOut: Math.min(params.fadeOut, dur),
          crossfadePrev: crossfade,
        })
      )
    })
    return spec
  }, [recordingId])

  // regionVersion is the recompute trigger: buildSpec reads the mutable regions plugin.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spec = useMemo(() => buildSpec(), [buildSpec, regionVersion])
  useEffect(() => {
    specRef.current = spec
  }, [spec])

  // Regions in EXPORT ORDER (the explicit list), for the chips, the editor and recoloring.
  const orderedRegions = useMemo(() => {
    const regions = regionsRef.current
    if (!regions) {
      return [] as Region[]
    }
    const byId = new Map(regions.getRegions().map((r) => [r.id, r]))
    return orderRef.current
      .map((id) => byId.get(id))
      .filter((r): r is Region => Boolean(r))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVersion, waveReady])

  const hasRegions = orderedRegions.length > 0

  // The selected region's params + its position in the export order, derived here (above the
  // transport handlers that read activeOrder) so the join-loop window can be computed for it.
  const activeParams = activeRegionId
    ? (paramsRef.current.get(activeRegionId) ?? defaultParams())
    : null
  const activeOrder = orderedRegions.findIndex((r) => r.id === activeRegionId)
  const activeRegion =
    activeOrder >= 0 ? orderedRegions[activeOrder] : undefined
  const activeDuration = activeRegion
    ? activeRegion.end - activeRegion.start
    : 0
  const prevDuration =
    activeOrder > 0
      ? orderedRegions[activeOrder - 1].end -
        orderedRegions[activeOrder - 1].start
      : 0

  // Re-color regions: the one the preview is sounding glows brightest, then the selected one,
  // then the per-slot palette. The content badge reflects the export order number. While an edge
  // is being scrubbed in the docked editor, flag it on the element so the handle CSS emphasizes
  // the moving edge.
  useEffect(() => {
    orderedRegions.forEach((region, order) => {
      const isPlaying = order === playingIndex
      const isActive = region.id === activeRegionId
      const color = isPlaying
        ? PLAYING_REGION_COLOR
        : isActive
          ? ACTIVE_REGION_COLOR
          : REGION_COLORS[order % REGION_COLORS.length]
      region.setOptions({ color, content: `${order + 1}` })
      if (region.element) {
        if (isActive && activeEdge) {
          region.element.setAttribute('data-editing-edge', activeEdge)
        } else {
          region.element.removeAttribute('data-editing-edge')
        }
      }
    })
  }, [orderedRegions, activeRegionId, playingIndex, activeEdge])

  const hasCycle = cycleEnd > cycleStart

  // Keep refs the plain pointer handlers / timeupdate handler read without re-binding.
  useEffect(() => {
    durationRef.current =
      sourceDuration || wavesurferRef.current?.getDuration() || 0
  }, [sourceDuration])
  useEffect(() => {
    cycleStartRef.current = cycleStart
    cycleEndRef.current = cycleEnd
  }, [cycleStart, cycleEnd])

  // Position the cycle bar + tint within the wrapper (percentage of duration, so they track
  // zoom/scroll just like the lane). The lane itself is created once on init.
  useEffect(() => {
    const ws = wavesurferRef.current
    const duration = sourceDuration || ws?.getDuration() || 0
    const bar = cycleBarRef.current
    const tint = cycleTintRef.current
    if (!bar || !tint) {
      return
    }
    if (!hasCycle || duration <= 0) {
      bar.style.display = 'none'
      tint.style.display = 'none'
      return
    }
    const leftPct = (cycleStart / duration) * 100
    const rightPct = ((duration - cycleEnd) / duration) * 100
    bar.style.display = 'block'
    bar.style.left = `${leftPct}%`
    bar.style.right = `${rightPct}%`
    bar.style.background = cycleActive ? CYCLE_COLOR : 'transparent'
    bar.style.border = `1px solid ${cycleActive ? CYCLE_COLOR : CYCLE_COLOR_DIM}`
    bar.style.color = cycleActive ? '#04140a' : CYCLE_COLOR
    bar.textContent = `${formatClock(cycleStart)}–${formatClock(cycleEnd)}`
    bar.title = cycleActive
      ? `Cycle ${formatClock(cycleStart)}–${formatClock(cycleEnd)} · looping — click to disable`
      : `Cycle ${formatClock(cycleStart)}–${formatClock(cycleEnd)} · off — click to enable`
    // The tint only shows while the cycle is active, mirroring Logic's lit cycle range.
    tint.style.display = cycleActive ? 'block' : 'none'
    tint.style.left = `${leftPct}%`
    tint.style.right = `${rightPct}%`
  }, [
    cycleStart,
    cycleEnd,
    cycleActive,
    hasCycle,
    sourceDuration,
    waveReady,
    zoom,
  ])

  // Initialize wavesurfer from precomputed peaks (no full-audio download for display).
  useEffect(() => {
    let cancelled = false
    if (!waveformRef.current) {
      return
    }

    const init = async () => {
      try {
        const data = await fetchPeaks(recordingId)
        if (cancelled || !waveformRef.current) {
          return
        }
        const duration = data.duration || recordingDuration || 0
        coarsePeaksRef.current = data.peaks
        setSourceDuration(duration)

        const regions = RegionsPlugin.create()
        regionsRef.current = regions

        // A streaming <audio> element backs playback: it fetches only the bytes it needs via
        // HTTP Range and seeks natively, so the source never downloads in full. wavesurfer
        // still renders the waveform from the precomputed peaks below, not from this element.
        const media = document.createElement('audio')
        media.preload = 'metadata'
        media.src = `${window.location.origin}/api/recordings/stream/${recordingId}`
        mediaRef.current = media

        const ws = WaveSurfer.create({
          container: waveformRef.current,
          height: 140,
          waveColor: '#009926',
          progressColor: '#1aff7f',
          cursorColor: '#fd7a08',
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          interact: true,
          // Clicking still seeks; drag-to-seek is off so it doesn't fight region drag/resize.
          dragToSeek: false,
          media,
          peaks: [data.peaks],
          duration,
          plugins: [regions],
        })
        wavesurferRef.current = ws

        // Theme wavesurfer's shadow DOM: match the scrollbar to the editor and brighten the
        // region resize handles so users can grab a region's begin/end edges on the waveform.
        try {
          const root = ws.getWrapper().getRootNode()
          if (root instanceof ShadowRoot) {
            const styleEl = document.createElement('style')
            styleEl.textContent = SCROLLBAR_STYLE + REGION_HANDLE_STYLE
            root.appendChild(styleEl)
          }
        } catch {
          // Shadow root not available yet (older builds); the styles stay default.
        }

        const markReady = () => {
          if (!cancelled) {
            setWaveReady(true)
          }
        }
        ws.on('ready', markReady)
        // Peaks-only loads emit 'decode' rather than 'ready' in some versions.
        ws.on('decode', markReady)

        regions.on('region-created', (region: Region) => {
          if (!paramsRef.current.has(region.id)) {
            paramsRef.current.set(region.id, defaultParams())
          }
          // New regions append to the end of the export order (no auto-sort by time).
          if (!orderRef.current.includes(region.id)) {
            orderRef.current.push(region.id)
          }
          // Seeded (restored) regions register silently; only user-drawn ones open the editor.
          if (!seedingRef.current) {
            setActiveRegionId(region.id)
          }
          bumpRegions()
        })
        regions.on('region-updated', () => bumpRegions())
        regions.on('region-removed', (region: Region) => {
          paramsRef.current.delete(region.id)
          orderRef.current = orderRef.current.filter((id) => id !== region.id)
          bumpRegions()
        })
        regions.on('region-clicked', (region: Region, e: MouseEvent) => {
          e.stopPropagation()
          setActiveRegionId(region.id)
        })

        // Source transport position + cycle. When the cycle is active, wrap the playhead back
        // to cycleStart as soon as playback reaches cycleEnd, staying in play.
        ws.on('timeupdate', (t: number) => {
          if (cancelled) {
            return
          }
          const cycle = cycleRef.current
          if (cycle && t >= cycle.end) {
            ws.setTime(cycle.start)
            setSourceTime(cycle.start)
            return
          }
          setSourceTime(t)
        })
        ws.on('finish', () => {
          if (cancelled) {
            return
          }
          // An active cycle whose end is the file end restarts from cycleStart instead of stopping.
          const cycle = cycleRef.current
          if (cycle) {
            ws.setTime(cycle.start)
            void ws.play()
          }
        })
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load waveform'
          )
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      previewRef.current?.stop()
      wavesurferRef.current?.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
      // wavesurfer leaves an externally-provided media element alone on destroy, so stop and
      // release the streaming source ourselves to abort any in-flight Range request.
      const media = mediaRef.current
      if (media) {
        media.pause()
        media.removeAttribute('src')
        media.load()
        mediaRef.current = null
      }
      cycleLaneRef.current?.remove()
      cycleLaneRef.current = null
      cycleBarRef.current = null
      cycleTintRef.current?.remove()
      cycleTintRef.current = null
    }
    // Only re-init when the underlying recording changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId])

  // Seed regions from a restored edit once the waveform is ready, preserving the spec's order.
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || !waveReady || initialSpec.segments.length === 0) {
      return
    }
    if (regions.getRegions().length > 0) {
      return
    }
    seedingRef.current = true
    try {
      initialSpec.segments.forEach((seg, order) => {
        if (!(seg instanceof SourceSegment)) {
          return
        }
        const region = regions.addRegion({
          start: seg.sourceStart,
          end: seg.sourceEnd,
          drag: true,
          resize: true,
          color: REGION_COLORS[order % REGION_COLORS.length],
          content: `${order + 1}`,
        })
        paramsRef.current.set(region.id, {
          gain: seg.gain,
          fadeIn: seg.fadeIn,
          fadeOut: seg.fadeOut,
          crossfadePrev: seg.crossfadePrev,
        })
      })
    } finally {
      seedingRef.current = false
    }
    bumpRegions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveReady])

  // Build the Logic-style cycle ruler once the waveform is ready: a thin lane pinned to the top
  // of the wrapper (so it tracks zoom/scroll), holding a draggable yellow bar plus a tint band.
  //
  // The whole gesture uses plain pointer listeners on the lane — no setPointerCapture and no
  // wavesurfer drag — so create-by-drag, edge-resize and body-move also work under synthetic
  // automation. Pointer X maps to time via the lane's full content width, mirroring how regions
  // are positioned by percentage of duration.
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !waveReady) {
      return
    }
    let wrapper: HTMLElement
    try {
      wrapper = ws.getWrapper()
    } catch {
      return
    }

    const tint = document.createElement('div')
    tint.style.position = 'absolute'
    tint.style.top = `${CYCLE_LANE_HEIGHT}px`
    tint.style.bottom = '0'
    tint.style.zIndex = '4'
    tint.style.pointerEvents = 'none'
    tint.style.background = CYCLE_TINT
    tint.style.display = 'none'
    wrapper.appendChild(tint)
    cycleTintRef.current = tint

    const lane = document.createElement('div')
    lane.setAttribute('data-testid', 'cycle-lane')
    lane.setAttribute(
      'aria-label',
      'Cycle ruler. Drag to set a cycle range; click the bar to toggle it.'
    )
    lane.title = 'Drag to set a cycle (loop) range; click the bar to toggle it'
    lane.style.position = 'absolute'
    lane.style.top = '0'
    lane.style.left = '0'
    lane.style.right = '0'
    lane.style.height = `${CYCLE_LANE_HEIGHT}px`
    lane.style.zIndex = '7'
    lane.style.background = CYCLE_LANE_BG
    lane.style.cursor = 'text'
    lane.style.touchAction = 'none'
    wrapper.appendChild(lane)
    cycleLaneRef.current = lane

    const bar = document.createElement('div')
    bar.setAttribute('data-testid', 'cycle-bar')
    bar.style.position = 'absolute'
    bar.style.top = '0'
    bar.style.height = `${CYCLE_LANE_HEIGHT}px`
    bar.style.borderRadius = '2px'
    bar.style.boxSizing = 'border-box'
    bar.style.font = '10px/16px monospace'
    bar.style.whiteSpace = 'nowrap'
    bar.style.overflow = 'hidden'
    bar.style.padding = '0 4px'
    bar.style.cursor = 'grab'
    bar.style.display = 'none'
    lane.appendChild(bar)
    cycleBarRef.current = bar

    // clientX → source time, using the lane's full content width (it spans 100% of the wrapper,
    // which widens on zoom). getBoundingClientRect().left tracks horizontal scroll. Falls back to
    // the wavesurfer width when layout is unavailable (e.g. jsdom under test).
    const pointerToTime = (clientX: number): number => {
      const duration = durationRef.current
      if (duration <= 0) {
        return 0
      }
      const rect = lane.getBoundingClientRect()
      const contentWidth =
        lane.offsetWidth || ws.getWidth?.() || rect.width || 1
      const x = clientX - rect.left
      return Math.min(Math.max((x / contentWidth) * duration, 0), duration)
    }

    type Mode = 'create' | 'move' | 'resize-start' | 'resize-end'
    let mode: Mode | null = null
    let downX = 0
    let downTime = 0
    let originStart = 0
    let originEnd = 0
    let moved = false
    // Live cycle bounds for the duration of the gesture. Tracked locally because React state /
    // the synced refs only update after commit, which lags the synchronous pointer handlers.
    let liveStart = 0
    let liveEnd = 0

    const apply = (start: number, end: number) => {
      liveStart = start
      liveEnd = end
      setCycleStart(start)
      setCycleEnd(end)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        return
      }
      e.preventDefault()
      downX = e.clientX
      downTime = pointerToTime(e.clientX)
      moved = false
      const onBar =
        bar.style.display !== 'none' && bar.contains(e.target as Node)
      if (onBar) {
        const barRect = bar.getBoundingClientRect()
        originStart = cycleStartRef.current
        originEnd = cycleEndRef.current
        liveStart = originStart
        liveEnd = originEnd
        // Only the lit bar's outer edges resize; its body moves. When the bar has no measurable
        // width (no layout), default to move so a press still grabs the whole bar.
        if (barRect.width > 0 && e.clientX - barRect.left <= CYCLE_EDGE_GRAB) {
          mode = 'resize-start'
        } else if (
          barRect.width > 0 &&
          barRect.right - e.clientX <= CYCLE_EDGE_GRAB
        ) {
          mode = 'resize-end'
        } else {
          mode = 'move'
        }
      } else {
        // Empty lane: begin a fresh cycle anchored at the press point.
        mode = 'create'
        apply(downTime, downTime)
      }
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!mode) {
        return
      }
      if (Math.abs(e.clientX - downX) > CYCLE_CLICK_SLOP) {
        moved = true
      }
      const t = pointerToTime(e.clientX)
      const duration = durationRef.current
      if (mode === 'create') {
        apply(Math.min(downTime, t), Math.max(downTime, t))
      } else if (mode === 'move') {
        const len = originEnd - originStart
        let start = originStart + (t - downTime)
        start = Math.min(Math.max(0, start), Math.max(0, duration - len))
        apply(start, start + len)
      } else if (mode === 'resize-start') {
        const start = Math.min(t, originEnd - CYCLE_MIN_LENGTH)
        apply(Math.max(0, start), originEnd)
      } else if (mode === 'resize-end') {
        const end = Math.max(t, originStart + CYCLE_MIN_LENGTH)
        apply(originStart, Math.min(duration, end))
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      const wasMode = mode
      mode = null
      if (!wasMode) {
        return
      }
      // A press-release with no real travel on the existing bar toggles it active/inactive.
      if (
        !moved &&
        wasMode !== 'create' &&
        Math.abs(e.clientX - downX) <= CYCLE_CLICK_SLOP
      ) {
        setCycleActive((on) => !on)
        return
      }
      // A drag/create shorter than the minimum collapses the cycle (treated as a clear).
      if (liveEnd - liveStart < CYCLE_MIN_LENGTH) {
        apply(0, 0)
        setCycleActive(false)
        return
      }
      // A freshly created cycle starts active so it loops immediately, like Logic's cycle.
      if (wasMode === 'create') {
        setCycleActive(true)
      }
    }

    lane.addEventListener('pointerdown', onPointerDown)
    return () => {
      lane.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      lane.remove()
      tint.remove()
      cycleLaneRef.current = null
      cycleBarRef.current = null
      cycleTintRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveReady])

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    setZoom(clamped)
    wavesurferRef.current?.zoom(clamped)
  }, [])

  const autofit = useCallback(() => {
    const container = waveformRef.current
    const duration = sourceDuration || wavesurferRef.current?.getDuration() || 0
    if (!container || duration <= 0) {
      return
    }
    applyZoom(container.clientWidth / duration)
  }, [applyZoom, sourceDuration])

  // Create a region at the playhead. The default span is clamped to the recording end and to
  // the next region's start; if there's no room ahead, the region is anchored to the end.
  const addRegionAtPlayhead = useCallback(() => {
    const ws = wavesurferRef.current
    const regions = regionsRef.current
    if (!ws || !regions) {
      return
    }
    const duration = sourceDuration || ws.getDuration() || 0
    if (duration <= 0) {
      return
    }
    const playhead = Math.min(Math.max(0, ws.getCurrentTime()), duration)
    // Spatial clamping still considers regions by source position so a new one doesn't overlap
    // its neighbours on the waveform — independent of the export order.
    const byStart = [...regions.getRegions()].sort((a, b) => a.start - b.start)

    let start = playhead
    const nextRegion = byStart.find((r) => r.start > start)
    const upperBound = Math.min(
      duration,
      nextRegion ? nextRegion.start : duration
    )
    let end = Math.min(start + DEFAULT_REGION_SECONDS, upperBound)

    // No room ahead: anchor the region to the recording end and grow it backwards instead,
    // clamped to ≥0 and not overlapping the region that precedes it.
    if (end - start < MIN_REGION_GAP) {
      end = duration
      // Start after the latest-ending region so the backwards-grown region can't overlap one that
      // extends to the end.
      const lowerBound = byStart.reduce((max, r) => Math.max(max, r.end), 0)
      start = Math.max(lowerBound, end - DEFAULT_REGION_SECONDS)
    }

    if (end - start < MIN_REGION_GAP) {
      setSnackbar('No room for a new region here')
      return
    }

    regions.addRegion({
      start,
      end,
      drag: true,
      resize: true,
      color: REGION_COLORS[byStart.length % REGION_COLORS.length],
    })
  }, [sourceDuration])

  // Autofit once the waveform is ready and we know the duration.
  useEffect(() => {
    if (waveReady) {
      autofit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveReady])

  // Mouse wheel over the waveform: horizontal scroll pans (translate left/right), vertical zooms.
  useEffect(() => {
    const container = waveformRef.current
    if (!container) {
      return
    }
    const onWheel = (e: WheelEvent) => {
      if (!waveReady) {
        return
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const wrapper = wavesurferRef.current?.getWrapper()
        const root = wrapper?.getRootNode()
        const scroller =
          root instanceof ShadowRoot
            ? (root.querySelector('.scroll') as HTMLElement | null)
            : null
        if (scroller) {
          e.preventDefault()
          // Pixel-based pan: at higher zoom the content is wider, so the same delta moves a
          // smaller slice of time — panning stays proportional to the zoom level.
          scroller.scrollLeft += e.deltaX
        }
        return
      }
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      applyZoom(zoom * factor)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [applyZoom, zoom, waveReady])

  // Detail-on-zoom: when zoomed in, fetch the visible window's real audio and feed wavesurfer
  // higher-resolution peaks. Falls back silently to the coarse overview on any decode/network
  // failure so the editor stays usable.
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !waveReady || sourceDuration <= 0) {
      return
    }
    const token = (detailTokenRef.current += 1)
    if (zoom < DETAIL_ZOOM_THRESHOLD) {
      if (coarsePeaksRef.current) {
        ws.setOptions({ peaks: [coarsePeaksRef.current] })
      }
      return
    }
    const refine = async () => {
      try {
        const bytes = await fetchRange(recordingId, 0, sourceDuration)
        if (detailTokenRef.current !== token) {
          return
        }
        const bins = Math.min(
          16000,
          Math.max(2000, Math.floor(sourceDuration * DETAIL_BINS_PER_SEC))
        )
        const peaks = await decodePeaks(bytes, bins)
        if (detailTokenRef.current !== token || !wavesurferRef.current) {
          return
        }
        wavesurferRef.current.setOptions({ peaks: [peaks] })
      } catch {
        // Coarse overview peaks remain in place; detail refinement is best-effort.
      }
    }
    void refine()
  }, [zoom, waveReady, sourceDuration, recordingId])

  // Create the preview engine lazily and wire its progress ticks to the waveform so the export
  // preview is reflected visually: the playhead sweeps through the source (jumping between
  // regions) and the sounding region glows. The engine keeps wavesurfer paused — we only move
  // its cursor with setTime, and read exportTime/duration for the readout.
  const ensurePreview = useCallback((): PreviewEngine => {
    if (!previewRef.current) {
      const engine = new PreviewEngine(specRef.current)
      engine.onProgress(
        ({ segmentIndex, sourceTime, exportTime, exportDuration }) => {
          setPlayingIndex(segmentIndex)
          setExportTime(exportTime)
          setExportDuration(exportDuration)
          if (sourceTime !== null) {
            const ws = wavesurferRef.current
            ws?.setTime(sourceTime)
            setSourceTime(sourceTime)
          }
        }
      )
      previewRef.current = engine
    }
    return previewRef.current
  }, [])

  // Keep the preview engine's spec current and ensure it exists before the transport drives it.
  useEffect(() => {
    if (hasRegions) {
      ensurePreview().setSpec(spec)
    }
  }, [spec, hasRegions, ensurePreview])

  // Source play/pause toggle shared by the on-waveform button and the spacebar shortcut.
  const handleToggle = useCallback(async () => {
    // Nothing has started yet: a press starts the source from the playhead.
    if (transport.mode === 'idle') {
      await transport.playSource()
      return
    }
    await transport.toggle()
  }, [transport])

  const handlePreviewExport = useCallback(async () => {
    // A second click on a running FULL preview exits back to source. A click while a join loop is
    // running instead switches that export-engine playback over to the full edit (handled below).
    if (transport.mode === 'export' && transitionOrder === null) {
      await transport.stop()
      setPlayingIndex(-1)
      return
    }
    if (specRef.current.segments.length === 0) {
      return
    }
    setTransitionOrder(null)
    // The editor cycle (loop) and export preview are mutually exclusive — previewing drops the cycle.
    setCycleActive(false)
    ensurePreview().setSpec(specRef.current)
    try {
      await transport.playExport()
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'Preview failed')
    }
  }, [ensurePreview, transport, transitionOrder])

  // Export-timeline loop window straddling the join into export-order `order`: `pre` seconds of the
  // previous region's tail + `post` of this region's head, clamped so it never spills into the
  // neighbouring regions. null when there is no previous region or the window collapses.
  const transitionWindow = useCallback(
    (
      order: number,
      pre: number,
      post: number
    ): { start: number; end: number } | null => {
      const s = specRef.current
      if (order <= 0 || order >= s.segments.length) {
        return null
      }
      const offsets = s.segmentStartOffsets()
      const junction = offsets[order]
      const incoming = s.segments[order]
      const start = Math.max(offsets[order - 1], junction - pre)
      const end = Math.min(junction + incoming.duration(), junction + post)
      return end - start >= MIN_REGION_GAP ? { start, end } : null
    },
    []
  )

  // Toggle looping the join into the selected region. Arming it stops the source and the cycle so
  // only one thing is ever audible; clicking again (or any other transport action) stops it.
  const handleToggleLoopJoin = useCallback(async () => {
    if (transitionOrder === activeOrder && transport.mode === 'export') {
      await transport.stop()
      setTransitionOrder(null)
      setPlayingIndex(-1)
      return
    }
    const loopRange = transitionWindow(activeOrder, preRoll, postRoll)
    if (!loopRange) {
      return
    }
    setCycleActive(false)
    ensurePreview().setSpec(specRef.current)
    try {
      await transport.playTransition(loopRange)
      setTransitionOrder(activeOrder)
    } catch (err) {
      setSnackbar(
        err instanceof Error ? err.message : 'Transition preview failed'
      )
    }
  }, [
    activeOrder,
    transitionOrder,
    transport,
    ensurePreview,
    preRoll,
    postRoll,
    transitionWindow,
  ])

  // Live-resize the loop window while the join is auditioning so pre/post-roll changes are heard
  // on the next pass; otherwise just remember the value for the next arm.
  const changePreRoll = useCallback(
    (value: number) => {
      setPreRoll(value)
      if (transitionOrder === activeOrder && transport.mode === 'export') {
        const loopRange = transitionWindow(activeOrder, value, postRoll)
        if (loopRange) {
          void transport.playTransition(loopRange)
        }
      }
    },
    [transitionOrder, activeOrder, transport, postRoll, transitionWindow]
  )
  const changePostRoll = useCallback(
    (value: number) => {
      setPostRoll(value)
      if (transitionOrder === activeOrder && transport.mode === 'export') {
        const loopRange = transitionWindow(activeOrder, preRoll, value)
        if (loopRange) {
          void transport.playTransition(loopRange)
        }
      }
    },
    [transitionOrder, activeOrder, transport, preRoll, transitionWindow]
  )

  // The join audition is the only export-mode playback that sets transitionOrder; whenever export
  // mode ends (stop, or switching to source/cycle), drop it so the panel toggle reflects reality.
  useEffect(() => {
    if (transport.mode !== 'export') {
      setTransitionOrder(null)
    }
  }, [transport.mode])

  const handleStop = useCallback(async () => {
    await transport.stop()
    setSourceTime(cycleRef.current ? cycleRef.current.start : 0)
    setPlayingIndex(-1)
  }, [transport])

  // Mutual exclusivity, other direction: activating the cycle stops an in-progress export preview.
  const prevCycleActiveRef = useRef(false)
  useEffect(() => {
    if (
      cycleActive &&
      !prevCycleActiveRef.current &&
      transport.mode === 'export'
    ) {
      void transport.stop()
      setPlayingIndex(-1)
    }
    prevCycleActiveRef.current = cycleActive
  }, [cycleActive, transport])

  // Keyboard shortcuts (ignored while typing): Space toggles the active engine, R adds a region.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        void handleToggle()
        return
      }
      if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        addRegionAtPlayhead()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleToggle, addRegionAtPlayhead])

  const setActiveParam = useCallback(
    (patch: Partial<RegionParams>) => {
      if (!activeRegionId) {
        return
      }
      const current = paramsRef.current.get(activeRegionId) ?? defaultParams()
      paramsRef.current.set(activeRegionId, { ...current, ...patch })
      bumpRegions()
    },
    [activeRegionId, bumpRegions]
  )

  // Update a region's range from the docked Start/End fields. Updating the live region keeps the
  // waveform (the edge visibly moves) and the derived export spec in sync.
  const setRegionRange = useCallback(
    (region: Region, patch: { start?: number; end?: number }) => {
      const duration =
        sourceDuration || wavesurferRef.current?.getDuration() || 0
      const max = duration > 0 ? duration : Math.max(region.start, region.end)
      let start = patch.start ?? region.start
      let end = patch.end ?? region.end
      start = Math.min(Math.max(0, start), max)
      end = Math.min(Math.max(0, end), max)
      if (patch.start !== undefined) {
        start = Math.min(start, end - MIN_REGION_GAP)
      } else {
        end = Math.max(end, start + MIN_REGION_GAP)
      }
      start = Math.max(0, start)
      end = Math.min(max, Math.max(end, start + MIN_REGION_GAP))
      region.setOptions({ start, end })
      bumpRegions()
    },
    [sourceDuration, bumpRegions]
  )

  const removeRegion = useCallback(
    (id: string) => {
      const region = regionsRef.current?.getRegions().find((r) => r.id === id)
      if (!region) {
        return
      }
      if (activeRegionId === id) {
        setActiveRegionId(null)
      }
      region.remove()
    },
    [activeRegionId]
  )

  // Select a region from a chip: highlight it, scroll the waveform to it, open its editor.
  const selectRegion = useCallback((id: string) => {
    setActiveRegionId(id)
    const region = regionsRef.current?.getRegions().find((r) => r.id === id)
    if (region) {
      wavesurferRef.current?.setTime(region.start)
      setSourceTime(region.start)
    }
  }, [])

  // Reorder the export order list (the chip order). Live-updates the spec → URLs.
  const reorderRegions = useCallback(
    (from: number, to: number) => {
      const list = [...orderRef.current]
      if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
        return
      }
      const [moved] = list.splice(from, 1)
      list.splice(to, 0, moved)
      orderRef.current = list
      bumpRegions()
    },
    [bumpRegions]
  )

  const copyToClipboard = useCallback(async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSnackbar(message)
    } catch {
      setSnackbar('Copy failed — your browser blocked clipboard access')
    }
  }, [])

  const audioLink = useMemo(() => {
    if (spec.segments.length === 0) {
      return ''
    }
    try {
      return EditUrls.audioUrl(spec)
    } catch {
      return ''
    }
  }, [spec])

  const editorLink = useMemo(() => {
    if (spec.segments.length === 0) {
      return ''
    }
    try {
      return EditUrls.editorUrl(spec)
    } catch {
      return ''
    }
  }, [spec])

  const total = spec.totalDuration()

  // The unified transport is "in export mode" when the joined edit is playing/armed, whether that
  // is the full preview or a join-loop audition. isFullPreview is the former only, so the Preview
  // export button doesn't light up while a transition is looping.
  const isExportMode = transport.mode === 'export'
  const isFullPreview = isExportMode && transitionOrder === null
  const currentTime = isExportMode ? exportTime : sourceTime
  const totalTime = isExportMode ? exportDuration || total : sourceDuration

  return (
    <div className="space-y-4">
      {/* Waveform + on-waveform transport overlay */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4">
        {loadError ? (
          <div className="text-red-400 text-sm font-mono py-8 text-center">
            {loadError}
          </div>
        ) : (
          <>
            {!waveReady && (
              <div className="text-gray-500 text-sm py-8 text-center animate-pulse font-mono">
                Loading waveform...
              </div>
            )}
            <div
              ref={waveformRef}
              className="w-full"
              aria-label="Recording waveform. Click to position the playhead, then use + Add region to mark an export region. Drag the yellow ruler along the top to set a cycle (loop) range."
            />
          </>
        )}

        {/* Transport + waveform toolbar */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {waveReady && (
            <>
              <Tooltip
                title={
                  isExportMode
                    ? 'Play / pause the export preview (Space)'
                    : 'Play / pause the source from the playhead (Space)'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    aria-label={transport.playing ? 'Pause' : 'Play'}
                    onClick={() => void handleToggle()}
                    sx={{ color: transport.playing ? '#ff6b6b' : '#1aff7f' }}
                  >
                    {transport.playing ? (
                      <PauseIcon fontSize="small" />
                    ) : (
                      <PlayArrowIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Stop and rewind">
                <span>
                  <IconButton
                    size="small"
                    aria-label="Stop"
                    onClick={() => void handleStop()}
                    sx={{ color: '#ff6b6b' }}
                  >
                    <StopIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <span
                className="font-mono text-xs"
                style={{ color: isExportMode ? '#f5c518' : '#1aff7f' }}
                data-testid="transport-readout"
              >
                {formatClock(currentTime)} / {formatClock(totalTime)}
                {transitionOrder !== null
                  ? ' · join'
                  : isExportMode
                    ? ' · export'
                    : ''}
              </span>
              <span className="text-h4ks-green-800">|</span>
            </>
          )}
          <Tooltip title="Add a region at the playhead (R)">
            <span>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<AddIcon />}
                disabled={!waveReady}
                onClick={addRegionAtPlayhead}
              >
                Add region
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            title={
              isFullPreview
                ? 'Stop the export preview'
                : 'Preview the whole exported edit (all regions joined with gains, fades and crossfades) — follows along on the waveform'
            }
          >
            <span>
              <Button
                size="small"
                variant={isFullPreview ? 'contained' : 'outlined'}
                startIcon={<GraphicEqIcon />}
                disabled={!hasRegions}
                onClick={() => void handlePreviewExport()}
                sx={
                  isFullPreview
                    ? {
                        color: '#04140a',
                        backgroundColor: '#f5c518',
                        '&:hover': { backgroundColor: '#d9ad12' },
                      }
                    : { color: '#f5c518', borderColor: '#7a6200' }
                }
              >
                {isFullPreview ? 'Previewing…' : 'Preview export'}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Fit the whole recording to the view (scroll-wheel over the waveform to zoom)">
            <span className="ml-auto">
              <IconButton
                size="small"
                aria-label="Autofit"
                onClick={autofit}
                sx={{ color: '#1aff7f' }}
              >
                <FitScreenIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Export sequence (reorderable chips) + the docked editor for the selected region. */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs font-mono uppercase tracking-wider">
            Export sequence
          </span>
          <span className="text-gray-500 text-xs font-mono">
            {orderedRegions.length} region
            {orderedRegions.length === 1 ? '' : 's'} · drag to reorder
          </span>
        </div>

        <RegionChips
          items={orderedRegions.map((r) => ({
            id: r.id,
            start: r.start,
            end: r.end,
          }))}
          activeId={activeRegionId}
          formatClock={formatClock}
          onSelect={selectRegion}
          onDelete={removeRegion}
          onReorder={reorderRegions}
        />

        {activeRegion && activeParams ? (
          <RegionEditorPanel
            order={activeOrder}
            start={activeRegion.start}
            end={activeRegion.end}
            duration={activeDuration}
            prevDuration={prevDuration}
            sourceDuration={sourceDuration}
            params={activeParams}
            isFirst={activeOrder === 0}
            minGap={MIN_REGION_GAP}
            formatClock={formatClock}
            onChangeRange={(patch) => setRegionRange(activeRegion, patch)}
            onChangeParam={setActiveParam}
            onDelete={() => removeRegion(activeRegion.id)}
            onActiveEdge={setActiveEdge}
            onToggleLoopJoin={() => void handleToggleLoopJoin()}
            transitionActive={transitionOrder === activeOrder}
            preRoll={preRoll}
            postRoll={postRoll}
            onChangePreRoll={changePreRoll}
            onChangePostRoll={changePostRoll}
          />
        ) : hasRegions ? (
          <div className="text-gray-500 text-xs font-mono italic">
            Select a region chip to edit its range, volume, fades and crossfade.
          </div>
        ) : null}
      </div>

      {/* Output bar */}
      <div className="border-2 border-h4ks-green-800 bg-h4ks-dark-900 p-4 flex flex-wrap items-center gap-3">
        <Tooltip title="Copy a shareable audio link for this edit — plays/downloads anywhere. Streams on the fly, so it can't be skipped/seeked.">
          <span>
            <Button
              variant="contained"
              color="success"
              startIcon={<ContentCopyIcon />}
              disabled={!audioLink}
              onClick={() =>
                void copyToClipboard(audioLink, 'Audio link copied')
              }
            >
              Copy audio link
            </Button>
          </span>
        </Tooltip>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          disabled={!audioLink}
          onClick={() =>
            window.open(
              EditUrls.audioUrl(spec, true),
              '_blank',
              'noopener,noreferrer'
            )
          }
          sx={{ color: '#1aff7f', borderColor: '#009926' }}
        >
          Download
        </Button>
        <Button
          variant="outlined"
          startIcon={<LinkIcon />}
          disabled={!editorLink}
          onClick={() => void copyToClipboard(editorLink, 'Editor link copied')}
          sx={{ color: '#1aff7f', borderColor: '#009926' }}
        >
          Copy editor link
        </Button>
      </div>

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        message={snackbar ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}
