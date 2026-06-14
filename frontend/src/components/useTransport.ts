import { useCallback, useEffect, useRef, useState } from 'react'
import type WaveSurfer from 'wavesurfer.js'
import type { PreviewEngine } from '../edit/PreviewEngine'

/**
 * Which engine the single unified transport is currently driving.
 * - 'idle': nothing has been started since the last stop.
 * - 'source': wavesurfer is auditioning the streamed source recording.
 * - 'export': the PreviewEngine is auditioning the joined export edit.
 */
export type TransportMode = 'idle' | 'source' | 'export'

export interface TransportRefs {
  wavesurfer: React.MutableRefObject<WaveSurfer | null>
  preview: React.MutableRefObject<PreviewEngine | null>
  /** Active cycle bounds (loop range), or null when no cycle is set/active. */
  cycle: React.MutableRefObject<{ start: number; end: number } | null>
}

export interface Transport {
  mode: TransportMode
  playing: boolean
  /**
   * Pause/resume whatever engine is currently active WITHOUT switching engines or restarting.
   * Shared by the on-waveform play/pause button and the spacebar shortcut.
   */
  toggle: () => Promise<void>
  /** Switch to source mode and play the streamed source from the current playhead. */
  playSource: () => Promise<void>
  /** Switch to export mode and play the joined edit from its start. */
  playExport: () => Promise<void>
  /**
   * Switch to export mode and loop a window of the joined edit (used to audition the join between
   * two regions). Like playExport, this stops the source so the two are never audible at once.
   */
  playTransition: (range: { start: number; end: number }) => Promise<void>
  /** Stop the active engine and reset position (source → 0 or cycle start). */
  stop: () => Promise<void>
}

/**
 * Owns the single transport state machine that coordinates the two playback engines so they are
 * never audible at once. Source playback is wavesurfer's own streaming playback (with cycle
 * looping handled by the editor's timeupdate handler); export playback is the Web Audio
 * PreviewEngine joining all regions. Starting one engine always stops the other.
 */
export const useTransport = ({
  wavesurfer,
  preview,
  cycle,
}: TransportRefs): Transport => {
  const [mode, setMode] = useState<TransportMode>('idle')
  const [playing, setPlaying] = useState(false)
  // Mirror of `mode` for use inside callbacks that must read the latest value without re-binding.
  const modeRef = useRef<TransportMode>('idle')

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Reflect wavesurfer's own play/pause/finish events into the transport, but only while source
  // is the active engine. The editor's wavesurfer listeners stay authoritative for the cursor;
  // this just keeps the unified play/pause indicator in sync when the source engine is driving.
  useEffect(() => {
    const ws = wavesurfer.current
    if (!ws) {
      return
    }
    const onPlay = () => {
      if (modeRef.current !== 'export') {
        setMode('source')
        setPlaying(true)
      }
    }
    const onPause = () => {
      if (modeRef.current === 'source') {
        setPlaying(false)
      }
    }
    const offPlay = ws.on('play', onPlay)
    const offPause = ws.on('pause', onPause)
    return () => {
      offPlay()
      offPause()
    }
    // wavesurfer is created once per recording; re-bind only if the instance changes.
  }, [wavesurfer])

  const stopExportEngine = useCallback(async () => {
    await preview.current?.stop()
  }, [preview])

  const playSource = useCallback(async () => {
    const ws = wavesurfer.current
    if (!ws) {
      return
    }
    await stopExportEngine()
    setMode('source')
    const cyc = cycle.current
    if (cyc) {
      const t = ws.getCurrentTime()
      if (t < cyc.start || t >= cyc.end) {
        ws.setTime(cyc.start)
      }
    }
    await ws.play()
    setPlaying(true)
  }, [wavesurfer, cycle, stopExportEngine])

  const playExport = useCallback(async () => {
    const engine = preview.current
    if (!engine) {
      return
    }
    wavesurfer.current?.pause()
    setMode('export')
    await engine.play()
    setPlaying(true)
  }, [preview, wavesurfer])

  const playTransition = useCallback(
    async (range: { start: number; end: number }) => {
      const engine = preview.current
      if (!engine) {
        return
      }
      wavesurfer.current?.pause()
      setMode('export')
      await engine.play(range.start, { loopWindow: range })
      setPlaying(true)
    },
    [preview, wavesurfer]
  )

  const toggle = useCallback(async () => {
    // Export is active: pause/resume the preview engine in place, never switch to source. Web
    // Audio can't pause a live graph, so the engine tears the nodes down on pause() and rebuilds
    // them from the captured offset on resume() — playback continues where it left off, not at 0.
    if (modeRef.current === 'export') {
      const engine = preview.current
      if (!engine) {
        return
      }
      if (engine.isPlaying()) {
        await engine.pause()
        setPlaying(false)
        return
      }
      await engine.resume()
      setPlaying(true)
      return
    }
    // Otherwise toggle the source: resume if paused, pause if playing — without rewinding.
    const ws = wavesurfer.current
    if (!ws) {
      return
    }
    if (ws.isPlaying()) {
      ws.pause()
      setPlaying(false)
      return
    }
    await playSource()
  }, [preview, wavesurfer, playSource])

  const stop = useCallback(async () => {
    const ws = wavesurfer.current
    await stopExportEngine()
    if (ws) {
      ws.pause()
      const cyc = cycle.current
      ws.setTime(cyc ? cyc.start : 0)
    }
    setMode('idle')
    setPlaying(false)
  }, [wavesurfer, cycle, stopExportEngine])

  return { mode, playing, toggle, playSource, playExport, playTransition, stop }
}
