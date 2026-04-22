import React, { useEffect, useRef } from 'react';

// Power-of-2 fftSize values from low-res to high-res
const FFT_SIZES = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768] as const;
const FFT_DEFAULT = 2048;

function labelFor(size: number): string {
  return size >= 1024 ? `${size / 1024}k` : String(size);
}

function sizeToYPct(size: number): number {
  const idx = FFT_SIZES.indexOf(size as (typeof FFT_SIZES)[number]);
  const i = idx < 0 ? FFT_SIZES.indexOf(FFT_DEFAULT) : idx;
  // top = high res (last index), bottom = low res (index 0)
  return 1 - i / (FFT_SIZES.length - 1);
}

function yPctToSize(pct: number): number {
  const i = Math.round((1 - Math.max(0, Math.min(1, pct))) * (FFT_SIZES.length - 1));
  return FFT_SIZES[i];
}

interface Props {
  fftSize: number;
  onChangeFftSize: (size: number) => void;
}

export const VerticalResolutionSlider: React.FC<Props> = ({ fftSize, onChangeFftSize }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const fftRef = useRef(fftSize);
  useEffect(() => { fftRef.current = fftSize; });

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    const move = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const pct = (ev.clientY - rect.top) / rect.height;
      onChangeFftSize(yPctToSize(pct));
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

  const yPct = sizeToYPct(fftSize) * 100;

  return (
    <div
      ref={trackRef}
      className="relative h-full w-3 shrink-0 select-none"
      style={{ touchAction: 'none' }}
      title={`FFT resolution: ${labelFor(fftSize)} bins\nDrag up = more detail, down = less`}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-h4ks-green-900/40 -translate-x-1/2 pointer-events-none" />
      {/* ticks for each size */}
      {FFT_SIZES.map(s => (
        <div
          key={s}
          className="absolute left-0 right-0 h-px bg-h4ks-green-900/30 pointer-events-none"
          style={{ top: `${sizeToYPct(s) * 100}%` }}
        />
      ))}
      <div
        onPointerDown={startDrag}
        className="absolute left-1/2 w-3 h-2.5 bg-blue-500 -translate-x-1/2 -translate-y-1/2 hover:bg-blue-400 transition-colors"
        style={{ top: `${yPct}%`, cursor: 'grab' }}
      />
    </div>
  );
};
