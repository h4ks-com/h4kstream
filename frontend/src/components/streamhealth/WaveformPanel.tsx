import React, { useEffect, useRef, useState } from 'react';
import type { HistoryPoint } from '../../hooks/useStreamHealth';
import { drawWaveformStrip } from './waveform';

const GRAPH_HEIGHT = 140;
const GRAPH_HEIGHT_EXPANDED = 420;

interface Props {
  monitoring: boolean;
  isLive: boolean;
  historyRef: React.MutableRefObject<HistoryPoint[]>;
  viewOffset: number;
  onViewOffsetChange: (n: number) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export const WaveformPanel: React.FC<Props> = ({
  monitoring, isLive, historyRef, viewOffset, onViewOffsetChange, expanded, onToggleExpand,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);

  const viewOffsetRef = useRef(viewOffset);
  useEffect(() => { viewOffsetRef.current = viewOffset; });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setCanvasWidth(entries[0].contentRect.width));
    obs.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!monitoring) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const hist = historyRef.current;
        const startIdx = hist.length - canvas.width - viewOffsetRef.current;
        drawWaveformStrip(canvas, hist, startIdx);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [monitoring, historyRef]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

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
  }, [onViewOffsetChange, historyRef]);

  const graphHeight = expanded ? GRAPH_HEIGHT_EXPANDED : GRAPH_HEIGHT;
  const frozen = viewOffset > 0;

  return (
    <div className={
      expanded
        ? 'fixed inset-4 z-50 bg-h4ks-dark-900 border border-h4ks-green-600 p-4 flex flex-col gap-2 overflow-hidden shadow-2xl'
        : 'border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-2'
    }>
      <div className="flex items-center justify-between shrink-0">
        <span className="font-mono text-xs text-gray-500">
          LEVEL HISTORY{!isLive ? ' (playback)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-h4ks-green-600">— RMS</span>
          <span className="font-mono text-xs text-yellow-700">— PEAK</span>
          <span className="font-mono text-xs text-red-700">| CLICK</span>
          {monitoring && !frozen && (
            <span className="font-mono text-[9px] text-h4ks-green-600 animate-pulse">● LIVE</span>
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
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} width={canvasWidth} height={graphHeight}
          className="w-full block"
          style={{ height: graphHeight, imageRendering: 'pixelated', cursor: 'col-resize' }} />
      </div>
    </div>
  );
};
