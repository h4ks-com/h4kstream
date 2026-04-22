import React, { useEffect, useRef } from 'react';

const FREQ_HZ_MIN = 1;
const FREQ_HZ_MAX = 100000;
const FREQ_LOG_MIN = Math.log10(FREQ_HZ_MIN);
const FREQ_LOG_MAX = Math.log10(FREQ_HZ_MAX);
const MIN_GAP_HZ = 5;

function yPctToHz(pct: number): number {
  const c = Math.max(0, Math.min(1, pct));
  return Math.round(Math.pow(10, FREQ_LOG_MAX - c * (FREQ_LOG_MAX - FREQ_LOG_MIN)));
}

function hzToYPct(hz: number): number {
  return (FREQ_LOG_MAX - Math.log10(Math.max(hz, FREQ_HZ_MIN))) / (FREQ_LOG_MAX - FREQ_LOG_MIN);
}

interface Props {
  minHz: number;
  maxHz: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}

export const VerticalDualFreqSlider: React.FC<Props> = ({ minHz, maxHz, onChangeMin, onChangeMax }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const minRef = useRef(minHz);
  const maxRef = useRef(maxHz);
  useEffect(() => { minRef.current = minHz; maxRef.current = maxHz; });

  const startDrag = (handle: 'min' | 'max') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    const move = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const pct = (ev.clientY - rect.top) / rect.height;
      const hz = yPctToHz(pct);
      if (handle === 'max') {
        if (hz > minRef.current + MIN_GAP_HZ) onChangeMax(hz);
      } else {
        if (hz < maxRef.current - MIN_GAP_HZ) onChangeMin(hz);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const maxPct = hzToYPct(maxHz) * 100; // top
  const minPct = hzToYPct(minHz) * 100; // bottom

  return (
    <div
      ref={trackRef}
      className="relative h-full w-3 shrink-0 select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-h4ks-green-900/50 -translate-x-1/2 pointer-events-none" />
      <div
        className="absolute left-1/2 w-0.5 bg-h4ks-green-700/70 -translate-x-1/2 pointer-events-none"
        style={{ top: `${maxPct}%`, bottom: `${100 - minPct}%` }}
      />
      <div
        onPointerDown={startDrag('max')}
        title={`max ${maxHz >= 1000 ? `${(maxHz / 1000).toFixed(1)}k` : maxHz} Hz`}
        className="absolute left-1/2 w-3 h-2.5 bg-h4ks-green-500 -translate-x-1/2 -translate-y-1/2 hover:bg-h4ks-green-400 transition-colors"
        style={{ top: `${maxPct}%`, cursor: 'grab' }}
      />
      <div
        onPointerDown={startDrag('min')}
        title={`min ${minHz >= 1000 ? `${(minHz / 1000).toFixed(1)}k` : minHz} Hz`}
        className="absolute left-1/2 w-3 h-2.5 bg-h4ks-green-500 -translate-x-1/2 -translate-y-1/2 hover:bg-h4ks-green-400 transition-colors"
        style={{ top: `${minPct}%`, cursor: 'grab' }}
      />
    </div>
  );
};
