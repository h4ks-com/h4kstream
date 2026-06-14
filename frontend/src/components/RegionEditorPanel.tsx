import React, { useEffect, useRef } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { round3 } from '../edit'

/** Per-region parameters the waveform region does not itself carry (ranges live on the region). */
export interface RegionParams {
  gain: number
  fadeIn: number
  fadeOut: number
  crossfadePrev: number
}

interface RegionEditorPanelProps {
  order: number
  start: number
  end: number
  duration: number
  /** Duration of the region before this one in export order (caps crossfade-prev). */
  prevDuration: number
  /** Source recording duration, used to clamp End. */
  sourceDuration: number
  params: RegionParams
  /** Crossfade-prev is meaningless for the first region in export order. */
  isFirst: boolean
  minGap: number
  formatClock: (seconds: number) => string
  onChangeRange: (patch: { start?: number; end?: number }) => void
  onChangeParam: (patch: Partial<RegionParams>) => void
  onDelete: () => void
  /** Visually flag the start or end edge while it is being scrubbed via the wheel. */
  onActiveEdge: (edge: 'start' | 'end' | null) => void
  /** Toggle looping the join from the previous region into this one (audition the transition). */
  onToggleLoopJoin: () => void
  /** True while the join loop is auditioning this region's incoming transition. */
  transitionActive: boolean
  /** Seconds of the previous region's tail looped before the join (clamped to prevDuration). */
  preRoll: number
  /** Seconds of this region's head looped after the join (clamped to this region's duration). */
  postRoll: number
  onChangePreRoll: (value: number) => void
  onChangePostRoll: (value: number) => void
}

/**
 * Docked editor for the selected region, rendered below the waveform (never overlapping it).
 * Scroll-wheel over any numeric field nudges its value (Shift = fine step); editing a range
 * field live-updates the region so its edge visibly moves on the waveform.
 */
export const RegionEditorPanel: React.FC<RegionEditorPanelProps> = ({
  order,
  start,
  end,
  duration,
  prevDuration,
  sourceDuration,
  params,
  isFirst,
  minGap,
  formatClock,
  onChangeRange,
  onChangeParam,
  onDelete,
  onActiveEdge,
  onToggleLoopJoin,
  transitionActive,
  preRoll,
  postRoll,
  onChangePreRoll,
  onChangePostRoll,
}) => {
  const maxEnd = sourceDuration > 0 ? sourceDuration : end

  return (
    <div
      data-testid="region-editor-panel"
      className="border-t border-h4ks-green-900/60 pt-3 mt-1"
    >
      {/* Header: quiet "Region" prefix + green accented number/range, delete pinned right. The
          range stays in one span so the header reads as a single coherent string. */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-sm">
          <span className="text-gray-500 text-[11px] uppercase tracking-wider">
            Region{' '}
          </span>
          <span className="text-h4ks-green-400 tabular-nums">
            {order + 1} · {formatClock(start)}–{formatClock(end)}
          </span>
        </div>
        <IconButton
          size="small"
          aria-label="Delete region"
          onClick={onDelete}
          sx={{
            color: '#9ca3af',
            '&:hover': { color: '#ff6b6b', backgroundColor: 'transparent' },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </div>

      {/* A tidy row of compact, fixed-width fields so values never shift the layout, plus a
          clearly-grouped volume control that fills the remaining width. */}
      <div className="flex flex-wrap gap-x-5 gap-y-3 items-start">
        <WheelNumberField
          label="Start (s)"
          value={start}
          min={0}
          max={Math.max(0, end - minGap)}
          step={0.1}
          onChange={(v) => onChangeRange({ start: v })}
          onFocusEdge={() => onActiveEdge('start')}
          onBlurEdge={() => onActiveEdge(null)}
        />
        <WheelNumberField
          label="End (s)"
          value={end}
          min={start + minGap}
          max={maxEnd}
          step={0.1}
          onChange={(v) => onChangeRange({ end: v })}
          onFocusEdge={() => onActiveEdge('end')}
          onBlurEdge={() => onActiveEdge(null)}
        />
        <WheelNumberField
          label="Fade in (s)"
          value={params.fadeIn}
          min={0}
          max={duration}
          step={0.1}
          onChange={(v) => onChangeParam({ fadeIn: v })}
        />
        <WheelNumberField
          label="Fade out (s)"
          value={params.fadeOut}
          min={0}
          max={duration}
          step={0.1}
          onChange={(v) => onChangeParam({ fadeOut: v })}
        />
        {!isFirst && (
          <WheelNumberField
            label="Crossfade prev (s)"
            value={params.crossfadePrev}
            min={0}
            max={Math.min(duration, prevDuration)}
            step={0.1}
            onChange={(v) => onChangeParam({ crossfadePrev: v })}
          />
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-[160px] self-end pb-1">
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-gray-500 text-[11px] uppercase tracking-wider">
              Volume
            </span>
            <span className="text-h4ks-green-400 text-xs tabular-nums">
              {params.gain.toFixed(2)}×
            </span>
          </div>
          <WheelSlider
            label="Region volume"
            value={params.gain}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => onChangeParam({ gain: v })}
          />
        </div>
      </div>

      {/* Audition the join into this region: loop its head against the previous region's tail with
          the crossfade applied. Pre/post-roll size the window so you can cycle tightly on the seam
          while tuning the crossfade and fades by ear. Meaningless for the first region. */}
      {!isFirst && (
        <div className="mt-3 pt-3 border-t border-h4ks-green-900/60 flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-gray-500 text-[11px] font-mono uppercase tracking-wider">
              Loop join · prev → this
            </span>
            <Tooltip title="Loop the join from the previous region into this one — its tail plus this head with the crossfade — cycling so you can tune the crossfade and fades by ear. Use pre/post-roll to tighten the loop around the seam.">
              <span>
                <Button
                  size="small"
                  variant={transitionActive ? 'contained' : 'outlined'}
                  startIcon={
                    transitionActive ? <StopIcon /> : <PlayArrowIcon />
                  }
                  onClick={onToggleLoopJoin}
                  sx={
                    transitionActive
                      ? {
                          color: '#04140a',
                          backgroundColor: '#f5c518',
                          '&:hover': { backgroundColor: '#d9ad12' },
                        }
                      : { color: '#f5c518', borderColor: '#7a6200' }
                  }
                >
                  {transitionActive ? 'Looping…' : 'Loop join'}
                </Button>
              </span>
            </Tooltip>
          </div>
          <WheelNumberField
            label="Pre-roll (s)"
            value={preRoll}
            min={0}
            max={prevDuration}
            step={0.1}
            onChange={onChangePreRoll}
          />
          <WheelNumberField
            label="Post-roll (s)"
            value={postRoll}
            min={0}
            max={duration}
            step={0.1}
            onChange={onChangePostRoll}
          />
        </div>
      )}
    </div>
  )
}

interface WheelNumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  onFocusEdge?: () => void
  onBlurEdge?: () => void
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(min, v), Math.max(min, max))

/**
 * Scroll-wheel nudge for a numeric field/slider: wheel up increases, down decreases, by `step`
 * (Shift = fine 0.01). The listener is native + non-passive so it can preventDefault the page
 * scroll; props are mirrored in a ref so the once-bound handler reads fresh values.
 */
function useWheelNudge(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void
): React.RefObject<HTMLDivElement> {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef({ value, min, max, step, onChange })
  stateRef.current = { value, min, max, step, onChange }
  useEffect(() => {
    const el = wrapRef.current
    if (!el) {
      return
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = stateRef.current
      const inc = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.01 : s.step)
      const next = round3(clamp(s.value + inc, s.min, s.max))
      if (next !== s.value) {
        s.onChange(next)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  return wrapRef
}

/**
 * Numeric field whose value can be nudged with the scroll wheel: wheel up increases, down
 * decreases, by `step` (Shift = fine 0.01). The wheel listener is attached natively and
 * non-passive so it can preventDefault the page scroll over the field.
 */
const WheelNumberField: React.FC<WheelNumberFieldProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onFocusEdge,
  onBlurEdge,
}) => {
  const wrapRef = useWheelNudge(value, min, max, step, onChange)

  return (
    <div
      ref={wrapRef}
      data-testid={`wheel-field-${label}`}
      className="flex flex-col gap-1"
      style={{ width: 76 }}
    >
      {/* Quiet label above the field, matching the volume group + header so columns read as a set.
          The name and its unit are split so the "(s)" reads as a dim suffix, not part of the name. */}
      <span className="text-gray-500 text-[11px] font-mono uppercase tracking-wider whitespace-nowrap">
        {label.replace(/\s*\(s\)$/, '')}
        <span className="text-gray-600 lowercase"> s</span>
      </span>
      <TextField
        type="number"
        size="small"
        variant="filled"
        hiddenLabel
        value={Number.isFinite(value) ? round3(value) : 0}
        onFocus={onFocusEdge}
        onBlur={onBlurEdge}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value)
          const next = Number.isFinite(parsed) ? parsed : 0
          onChange(round3(clamp(next, min, max)))
        }}
        inputProps={{ min, max, step: 'any', 'aria-label': label }}
        sx={{
          width: 76,
          // Flat filled field: subtle dark fill, a thin underline that brightens to the green
          // accent on hover/focus. No heavy notched outline, to match the waveform card above.
          '& .MuiFilledInput-root': {
            backgroundColor: 'rgba(0, 102, 25, 0.12)',
            borderRadius: '4px',
            '&:hover': { backgroundColor: 'rgba(0, 102, 25, 0.2)' },
            '&.Mui-focused': { backgroundColor: 'rgba(0, 102, 25, 0.22)' },
          },
          '& .MuiFilledInput-input': {
            color: '#1aff7f',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.8rem',
            padding: '6px 8px',
          },
          '& .MuiFilledInput-underline:before': {
            borderBottomColor: 'rgba(0, 153, 38, 0.5)',
          },
          '& .MuiFilledInput-underline:hover:before': {
            borderBottomColor: '#1aff7f',
          },
          '& .MuiFilledInput-underline:after': { borderBottomColor: '#1aff7f' },
          // Hide the native number spinners (flatter, and stops the field width jumping on edit).
          '& input[type=number]': { MozAppearance: 'textfield' },
          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
            { WebkitAppearance: 'none', margin: 0 },
        }}
      />
    </div>
  )
}

interface WheelSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

/** Slider with the same scroll-wheel nudge behavior as the numeric fields. */
const WheelSlider: React.FC<WheelSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
}) => {
  const wrapRef = useWheelNudge(value, min, max, step, onChange)

  return (
    <div ref={wrapRef} className="px-1">
      <Slider
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_e, v) => onChange(v as number)}
        sx={{
          color: '#1aff7f',
          padding: '8px 0',
          '& .MuiSlider-rail': {
            opacity: 1,
            backgroundColor: 'rgba(0, 153, 38, 0.3)',
          },
          '& .MuiSlider-thumb': {
            width: 12,
            height: 12,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: '0 0 0 6px rgba(26, 255, 127, 0.16)',
            },
          },
        }}
      />
    </div>
  )
}
