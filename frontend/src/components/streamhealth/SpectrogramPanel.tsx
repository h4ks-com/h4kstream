import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLORMAP, clearCanvas, freqToYPct, makeYToBin } from './colormap';
import { VerticalDualFreqSlider } from './VerticalDualFreqSlider';
import { VerticalResolutionSlider } from './VerticalResolutionSlider';

const SPEC_HEIGHT = 160;
const SPEC_MIN_FREQ_DEFAULT = 20;
const SPEC_MAX_FREQ_DEFAULT = 20000;
const SPEC_HISTORY_MAX = 12000; // 10 min at 20 fps — matches hook

interface Props {
  monitoring: boolean;
  freqDataRef: React.MutableRefObject<Uint8Array | null>;
  sampleRateRef: React.MutableRefObject<number>;
  viewOffset: number;
  onViewOffsetChange: (n: number) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  fftSize: number;
  onFftSizeChange: (size: number) => void;
  subscribeTick: (cb: () => void) => () => void;
}

export const SpectrogramPanel: React.FC<Props> = ({
  monitoring, freqDataRef, sampleRateRef,
  viewOffset, onViewOffsetChange,
  expanded, onToggleExpand,
  fftSize, onFftSizeChange,
  subscribeTick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(SPEC_HEIGHT);

  const yToBinRef = useRef<Int32Array | null>(null);
  const yToBinNumBinsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const historyRef = useRef<Uint8Array[]>([]);
  const viewOffsetRef = useRef(viewOffset);
  useEffect(() => { viewOffsetRef.current = viewOffset; });

  const [minFreq, _setMinFreq] = useState(SPEC_MIN_FREQ_DEFAULT);
  const [maxFreq, _setMaxFreq] = useState(SPEC_MAX_FREQ_DEFAULT);
  const minFreqRef = useRef(SPEC_MIN_FREQ_DEFAULT);
  const maxFreqRef = useRef(SPEC_MAX_FREQ_DEFAULT);
  const setMinFreq = (v: number) => { minFreqRef.current = v; _setMinFreq(v); };
  const setMaxFreq = (v: number) => { maxFreqRef.current = v; _setMaxFreq(v); };

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const history = historyRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;

    if (history.length === 0) {
      clearCanvas(canvas);
      return;
    }

    const numBins = history[history.length - 1].length;
    const nyquist = sampleRateRef.current / 2;
    if (
      !yToBinRef.current
      || yToBinRef.current.length !== h
      || yToBinNumBinsRef.current !== numBins
    ) {
      yToBinRef.current = makeYToBin(h, numBins, nyquist, minFreqRef.current, maxFreqRef.current);
      yToBinNumBinsRef.current = numBins;
    }

    // same startIdx convention as waveform strip: leftmost pixel = history index startIdx
    const startIdx = history.length - w - viewOffsetRef.current;
    const imgData = ctx.createImageData(w, h);
    for (let col = 0; col < w; col++) {
      const hi = startIdx + col;
      const frame = hi >= 0 && hi < history.length ? history[hi] : null;
      const frameValid = frame !== null && frame.length === numBins;
      for (let y = 0; y < h; y++) {
        const val = frameValid ? frame![yToBinRef.current[y]] : 0;
        const base = (y * w + col) * 4;
        imgData.data[base]     = COLORMAP[val * 4];
        imgData.data[base + 1] = COLORMAP[val * 4 + 1];
        imgData.data[base + 2] = COLORMAP[val * 4 + 2];
        imgData.data[base + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [sampleRateRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setWidth(r.width);
      setHeight(Math.max(120, Math.round(r.height)));
    });
    obs.observe(el);
    setWidth(el.clientWidth);
    setHeight(Math.max(120, el.clientHeight));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    yToBinRef.current = null;
    historyRef.current = [];
    clearCanvas(canvasRef.current);
  }, [monitoring]);

  useEffect(() => {
    yToBinRef.current = null;
    historyRef.current = [];
    clearCanvas(canvasRef.current);
  }, [fftSize]);

  // Re-render on size, freq range, or offset change
  useEffect(() => {
    yToBinRef.current = null;
    renderFrame();
  }, [width, height, expanded, minFreq, maxFreq, viewOffset, renderFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.round(e.deltaY / 5);
      const maxBack = Math.max(0, historyRef.current.length - 1);
      const next = Math.max(0, Math.min(maxBack, viewOffsetRef.current + delta));
      onViewOffsetChange(next);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onViewOffsetChange]);

  useEffect(() => {
    if (!monitoring) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const unsubscribe = subscribeTick(() => {
      const freqData = freqDataRef.current;
      if (freqData) {
        historyRef.current.push(new Uint8Array(freqData));
        if (historyRef.current.length > SPEC_HISTORY_MAX) historyRef.current.shift();
      }
    });

    const loop = () => {
      renderFrame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      unsubscribe();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [monitoring, freqDataRef, renderFrame, subscribeTick]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const visibleFreqLabels = useMemo(() => {
    const ALL = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const labelFor = (f: number) => f >= 1000 ? `${f / 1000}k` : String(f);
    const inside = ALL.filter(f => f > minFreq && f < maxFreq);
    return [
      { freq: minFreq, label: labelFor(minFreq) },
      ...inside.map(f => ({ freq: f, label: labelFor(f) })),
      { freq: maxFreq, label: labelFor(maxFreq) },
    ];
  }, [minFreq, maxFreq]);

  const frozen = viewOffset > 0;

  return (
    <div className={
      expanded
        ? 'fixed inset-4 z-50 bg-h4ks-dark-900 border border-h4ks-green-600 p-4 flex flex-col gap-2 overflow-hidden shadow-2xl'
        : 'border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-2'
    }>
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">SPECTROGRAM</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {monitoring && !frozen && (
            <>
              <span className="font-mono text-[9px] text-gray-700">← older · newer →</span>
              <span className="font-mono text-[9px] text-h4ks-green-600 animate-pulse">● LIVE</span>
            </>
          )}
          {monitoring && frozen && (
            <>
              <span className="font-mono text-[9px] text-yellow-700">PAUSED · scroll to explore</span>
              <button onClick={() => onViewOffsetChange(0)}
                className="font-mono text-[9px] px-2 py-0.5 border border-yellow-700 text-yellow-400 hover:bg-yellow-900/20 transition-colors">
                [GO LIVE]
              </button>
            </>
          )}
          <button onClick={onToggleExpand} title={expanded ? 'Close (Esc)' : 'Expand (Esc to close)'}
            className={`font-mono text-xs ${expanded ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-h4ks-green-400'} transition-colors ml-1`}>
            {expanded ? '[×]' : '[↗]'}
          </button>
        </div>
      </div>

      <div className={
        expanded
          ? 'relative w-full flex flex-1 min-h-0'
          : 'relative w-full flex'
      } style={expanded ? undefined : { height: SPEC_HEIGHT }}>
        {/* left: freq labels */}
        <div className="relative shrink-0 w-7 mr-1 h-full">
          {visibleFreqLabels.map(({ freq, label }) => (
            <span key={freq}
              className="absolute right-0 font-mono text-[8px] text-h4ks-green-700/60 leading-none"
              style={{ top: `${freqToYPct(freq, minFreq, maxFreq)}%`, transform: 'translateY(-50%)' }}>
              {label}
            </span>
          ))}
        </div>
        {/* left: freq range slider */}
        <div className="shrink-0 mr-1 h-full">
          <VerticalDualFreqSlider
            minHz={minFreq} maxHz={maxFreq}
            onChangeMin={setMinFreq} onChangeMax={setMaxFreq}
          />
        </div>
        {/* canvas */}
        <div ref={containerRef} className="flex-1 h-full">
          <canvas ref={canvasRef} width={width} height={height}
            className="w-full h-full block"
            style={{ imageRendering: 'pixelated', cursor: 'col-resize' }} />
        </div>
        {/* right: resolution slider */}
        <div className="shrink-0 ml-1 h-full flex flex-col items-center gap-0.5">
          <span className="font-mono text-[7px] text-blue-700/60 leading-none mb-0.5">hi</span>
          <div className="flex-1">
            <VerticalResolutionSlider fftSize={fftSize} onChangeFftSize={onFftSizeChange} />
          </div>
          <span className="font-mono text-[7px] text-blue-700/60 leading-none mt-0.5">lo</span>
        </div>
      </div>
    </div>
  );
};
