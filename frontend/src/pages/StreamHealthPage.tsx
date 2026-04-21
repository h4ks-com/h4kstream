import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { useWebSocketEvent } from '../contexts/WebSocketContext';
import { useStreamHealth } from '../hooks/useStreamHealth';
import type { HistoryPoint, StreamAlert, StreamHealthMetrics } from '../hooks/useStreamHealth';

// ---------------------------------------------------------------------------
// Waveform graph constants
// ---------------------------------------------------------------------------
const DB_MIN = -60;
const DB_MAX = 3;
const GRAPH_HEIGHT = 140;
const HISTORY_CAPACITY = 600;

// ---------------------------------------------------------------------------
// Spectrogram constants
// ---------------------------------------------------------------------------
const SPEC_HEIGHT = 160;
const SPEC_MIN_FREQ = 20;
const SPEC_MAX_FREQ = 20000;
const LOG_MIN = Math.log10(SPEC_MIN_FREQ);
const LOG_MAX = Math.log10(SPEC_MAX_FREQ);

// Baudline-style phosphor colormap: black → dark-teal → green → yellow → near-white
const COLORMAP: Uint8ClampedArray = (() => {
  const map = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number;
    if (t < 0.25) {
      r = 0; g = Math.round(t * 4 * 140); b = Math.round(t * 4 * 60);
    } else if (t < 0.5) {
      const s = (t - 0.25) * 4;
      r = 0; g = Math.round(140 + s * 115); b = Math.round(60 * (1 - s));
    } else if (t < 0.75) {
      const s = (t - 0.5) * 4;
      r = Math.round(s * 200); g = 255; b = 0;
    } else {
      const s = (t - 0.75) * 4;
      r = Math.round(200 + s * 55); g = 255; b = Math.round(s * 200);
    }
    map[i * 4] = r; map[i * 4 + 1] = g; map[i * 4 + 2] = b; map[i * 4 + 3] = 255;
  }
  return map;
})();

// Frequency labels for the Y axis at their log-scale positions
const FREQ_LABELS: Array<{ freq: number; label: string }> = [
  { freq: 20000, label: '20k' },
  { freq: 10000, label: '10k' },
  { freq: 1000,  label: '1k'  },
  { freq: 100,   label: '100' },
  { freq: 20,    label: '20'  },
];

function freqToYPct(freq: number): number {
  return ((LOG_MAX - Math.log10(freq)) / (LOG_MAX - LOG_MIN)) * 100;
}

// Precompute pixel-row → FFT-bin index (log scale, called once per canvas height change)
function makeYToBin(height: number, numBins: number, nyquist: number): Int32Array {
  const map = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const logFreq = LOG_MAX - (y / height) * (LOG_MAX - LOG_MIN);
    const freq = Math.pow(10, logFreq);
    map[y] = Math.max(0, Math.min(numBins - 1, Math.round((freq / nyquist) * numBins)));
  }
  return map;
}

function drawSpectrogramColumn(
  canvas: HTMLCanvasElement,
  freqData: Uint8Array,
  yToBin: Int32Array,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;

  // Shift entire canvas left by 1 px (GPU blit — very fast)
  ctx.drawImage(canvas as CanvasImageSource, -1, 0);

  // Paint the new column at the right edge
  const col = ctx.createImageData(1, height);
  for (let y = 0; y < height; y++) {
    const val = freqData[yToBin[y]];
    const base = y * 4;
    col.data[base]     = COLORMAP[val * 4];
    col.data[base + 1] = COLORMAP[val * 4 + 1];
    col.data[base + 2] = COLORMAP[val * 4 + 2];
    col.data[base + 3] = 255;
  }
  ctx.putImageData(col, width - 1, 0);
}

// ---------------------------------------------------------------------------
// Waveform graph
// ---------------------------------------------------------------------------
function toDb(v: number): number {
  if (v <= 0) return -Infinity;
  return 20 * Math.log10(v);
}

function drawGraph(canvas: HTMLCanvasElement, history: HistoryPoint[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || history.length < 2) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const toY = (db: number) =>
    height - ((Math.max(DB_MIN, Math.min(DB_MAX, db)) - DB_MIN) / (DB_MAX - DB_MIN)) * height;

  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, width, height);

  const clipY = toY(0);
  ctx.fillStyle = 'rgba(220,38,38,0.12)';
  ctx.fillRect(0, 0, width, clipY);

  const gridLevels = [-60, -36, -18, -12, -6, 0];
  ctx.lineWidth = 0.5;
  ctx.font = '9px monospace';
  gridLevels.forEach(db => {
    const y = toY(db);
    ctx.strokeStyle = db === 0 ? 'rgba(220,38,38,0.5)' : 'rgba(74,222,128,0.12)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    ctx.fillStyle = db === 0 ? 'rgba(220,38,38,0.6)' : 'rgba(74,222,128,0.3)';
    ctx.fillText(`${db}`, 3, y - 2);
  });

  const xStep = width / HISTORY_CAPACITY;

  ctx.beginPath(); ctx.moveTo(0, height);
  history.forEach((pt, i) => ctx.lineTo(i * xStep, toY(toDb(pt.peak))));
  ctx.lineTo((history.length - 1) * xStep, height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(234,179,8,0.06)';
  ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 1;
  history.forEach((pt, i) => {
    const x = i * xStep, y = toY(toDb(pt.peak));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.beginPath(); ctx.moveTo(0, height);
  history.forEach((pt, i) => ctx.lineTo(i * xStep, toY(toDb(pt.rms))));
  ctx.lineTo((history.length - 1) * xStep, height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74,222,128,0.08)';
  ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5;
  history.forEach((pt, i) => {
    const x = i * xStep, y = toY(toDb(pt.rms));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Click markers
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(220,38,38,0.7)';
  history.forEach((pt, i) => {
    if (pt.click) {
      const x = i * xStep;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
  });

  const nowX = (history.length - 1) * xStep;
  ctx.strokeStyle = 'rgba(74,222,128,0.2)'; ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, height); ctx.stroke();
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// UI sub-components
// ---------------------------------------------------------------------------
function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

function LevelBar({ value, label, danger = false }: { value: number; label: string; danger?: boolean }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = danger ? 'bg-red-500' : pct > 80 ? 'bg-yellow-400' : 'bg-h4ks-green-500';
  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <span className="w-12 text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-h4ks-dark-700 border border-h4ks-green-900">
        <div className={`h-full transition-all duration-75 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-gray-300 tabular-nums">
        {isFinite(toDb(value)) ? `${toDb(value).toFixed(1)} dB` : '-∞ dB'}
      </span>
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics: StreamHealthMetrics }) {
  return (
    <div className="space-y-2">
      <LevelBar value={metrics.rms} label="RMS" />
      <LevelBar value={metrics.peak} label="PEAK" danger={metrics.clipping} />
      <div className="flex gap-3 pt-1">
        <div
          title="CLIP: signal exceeds 0 dBFS — reduce input gain"
          className={`font-mono text-xs px-2 py-0.5 border cursor-help ${
            metrics.clipping
              ? 'border-red-500 text-red-400 bg-red-900/30 animate-pulse'
              : 'border-h4ks-green-900 text-gray-600'
          }`}
        >
          CLIP {metrics.clipping ? '!!!' : 'OK'}
        </div>
        <div
          title="CRACKLE: sudden silence after signal — possible buffer stall or dropout"
          className={`font-mono text-xs px-2 py-0.5 border cursor-help ${
            metrics.crackle
              ? 'border-yellow-500 text-yellow-400 bg-yellow-900/30'
              : 'border-h4ks-green-900 text-gray-600'
          }`}
        >
          CRACKLE {metrics.crackle ? 'DETECTED' : 'OK'}
        </div>
        <div
          title="CLICK: isolated transient spike detected via LPC residual analysis (Essentia algorithm, 30 dB threshold)"
          className={`font-mono text-xs px-2 py-0.5 border cursor-help ${
            metrics.click
              ? 'border-red-400 text-red-300 bg-red-900/20'
              : 'border-h4ks-green-900 text-gray-600'
          }`}
        >
          CLICK {metrics.click ? '!!!' : 'OK'}
        </div>
      </div>
    </div>
  );
}

function AlertLog({ alerts }: { alerts: StreamAlert[] }) {
  if (alerts.length === 0) {
    return <p className="text-gray-600 font-mono text-xs italic">No alerts recorded.</p>;
  }
  return (
    <div className="space-y-0.5 max-h-36 overflow-y-auto">
      {alerts.map((a, i) => (
        <div key={i} className="flex gap-3 font-mono text-xs">
          <span className="text-gray-500 tabular-nums shrink-0">{formatTime(a.t)}</span>
          <span className={a.type === 'CLIP' ? 'text-red-400' : a.type === 'CLICK' ? 'text-red-300' : 'text-yellow-400'}>
            {a.type === 'CLIP' ? 'CLIP DETECTED' : a.type === 'CLICK' ? 'CLICK DETECTED' : 'CRACKLE DETECTED'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export const StreamHealthPage: React.FC = () => {
  const navigate = useNavigate();
  const [livestreamActive, setLivestreamActive] = useState(false);
  const { monitoring, metrics, alerts, historyRef, freqDataRef, sampleRateRef, startMonitoring, stopMonitoring } =
    useStreamHealth();

  // Waveform canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);

  // Spectrogram canvas
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const specContainerRef = useRef<HTMLDivElement>(null);
  const [specWidth, setSpecWidth] = useState(600);
  const yToBinRef = useRef<Int32Array | null>(null);
  const lastSpecTimeRef = useRef<number>(0);

  const handleStart = useCallback(async () => { await startMonitoring(); }, [startMonitoring]);

  // Initial livestream state check (WS events only fire on transitions)
  useEffect(() => {
    fetch('/api/metadata/now')
      .then(r => r.json())
      .then(data => { if (data?.source === 'livestream') setLivestreamActive(true); })
      .catch(() => {});
  }, []);

  useWebSocketEvent('livestream_started', useCallback(() => setLivestreamActive(true), []));
  useWebSocketEvent('livestream_ended',   useCallback(() => setLivestreamActive(false), []));

  // Waveform container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setCanvasWidth(entries[0].contentRect.width));
    obs.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  // Spectrogram container resize
  useEffect(() => {
    const el = specContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setSpecWidth(entries[0].contentRect.width));
    obs.observe(el);
    setSpecWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  // Clear spectrogram to black when monitoring starts or canvas is resized
  useEffect(() => {
    const canvas = spectrogramCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    yToBinRef.current = null; // force recompute
  }, [monitoring, specWidth]);

  // Unified animation loop: waveform every frame, spectrogram gated to ~20fps
  useEffect(() => {
    if (!monitoring) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const loop = (now: number) => {
      // Waveform
      if (canvasRef.current) drawGraph(canvasRef.current, historyRef.current);

      // Spectrogram — update at ~20fps (every 50ms)
      if (now - lastSpecTimeRef.current >= 50) {
        const specCanvas = spectrogramCanvasRef.current;
        const freqData = freqDataRef.current;
        if (specCanvas && freqData) {
          if (!yToBinRef.current || yToBinRef.current.length !== specCanvas.height) {
            const nyquist = sampleRateRef.current / 2;
            yToBinRef.current = makeYToBin(specCanvas.height, freqData.length, nyquist);
          }
          drawSpectrogramColumn(specCanvas, freqData, yToBinRef.current);
        }
        lastSpecTimeRef.current = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [monitoring, historyRef, freqDataRef, sampleRateRef]);

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
      <div className="flex-1 max-w-2xl w-full mx-auto p-6">
        <div className="space-y-5">

          {/* Header */}
          <div className="border-b-2 border-h4ks-green-700 pb-4">
            <h2 className="text-2xl font-bold text-h4ks-green-400 font-mono mb-1">
              [STREAM HEALTH MONITOR]
            </h2>
            <p className="text-gray-500 text-xs font-mono">
              Real-time audio quality analysis · connects to /radio as a silent listener
            </p>
          </div>

          {/* Livestream status */}
          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 px-4 py-2 font-mono text-sm flex items-center gap-2">
            <span
              data-testid="livestream-indicator"
              className={`w-2 h-2 rounded-full shrink-0 ${
                livestreamActive ? 'bg-h4ks-green-400 animate-pulse' : 'bg-gray-600'
              }`}
            />
            <span className={livestreamActive ? 'text-h4ks-green-400' : 'text-gray-500'}>
              {livestreamActive ? 'LIVESTREAM ACTIVE' : 'NO ACTIVE LIVESTREAM'}
            </span>
          </div>

          {/* Controls + current meters */}
          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-400">
                STATUS:{' '}
                <span className={monitoring ? 'text-h4ks-green-400' : 'text-gray-600'}>
                  {monitoring ? 'MONITORING' : 'IDLE'}
                </span>
              </span>
              {!monitoring ? (
                <button
                  onClick={handleStart}
                  className="font-mono text-xs text-h4ks-green-400 border border-h4ks-green-700 px-4 py-1.5 hover:bg-h4ks-green-900/30 transition-colors"
                >
                  [START MONITORING]
                </button>
              ) : (
                <button
                  onClick={stopMonitoring}
                  className="font-mono text-xs text-red-400 border border-red-800 px-4 py-1.5 hover:bg-red-900/30 transition-colors"
                >
                  [STOP]
                </button>
              )}
            </div>

            {monitoring && (
              <div data-testid="metrics-panel">
                <MetricsPanel metrics={metrics} />
              </div>
            )}

            {!monitoring && (
              <p className="text-gray-600 font-mono text-xs">
                Click [START MONITORING] to begin. Audio plays silently in the background.
              </p>
            )}
          </div>

          {/* Waveform level history */}
          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-500">LEVEL HISTORY (30s)</span>
              <div className="flex gap-3 font-mono text-xs text-gray-600">
                <span className="text-h4ks-green-600">— RMS</span>
                <span className="text-yellow-700">— PEAK</span>
                <span className="text-red-700">| CLICK</span>
              </div>
            </div>
            <div ref={containerRef} className="w-full">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={GRAPH_HEIGHT}
                className="w-full block"
                style={{ height: GRAPH_HEIGHT, imageRendering: 'pixelated' }}
              />
            </div>
          </div>

          {/* Spectrogram */}
          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-500">SPECTROGRAM (log freq · 20 Hz – 20 kHz)</span>
              <span className="font-mono text-xs text-gray-700">← older · newer →</span>
            </div>
            <div className="relative w-full flex">
              {/* Y-axis frequency labels */}
              <div className="relative shrink-0 w-7 mr-1" style={{ height: SPEC_HEIGHT }}>
                {FREQ_LABELS.map(({ freq, label }) => (
                  <span
                    key={freq}
                    className="absolute right-0 font-mono text-[8px] text-h4ks-green-700/60 leading-none"
                    style={{ top: `${freqToYPct(freq)}%`, transform: 'translateY(-50%)' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {/* Spectrogram canvas */}
              <div ref={specContainerRef} className="flex-1">
                <canvas
                  ref={spectrogramCanvasRef}
                  width={specWidth}
                  height={SPEC_HEIGHT}
                  className="w-full block"
                  style={{ height: SPEC_HEIGHT, imageRendering: 'pixelated' }}
                />
              </div>
            </div>
          </div>

          {/* Alert log */}
          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-2">
            <span className="font-mono text-xs text-gray-500 block">ALERT LOG</span>
            <AlertLog alerts={alerts ?? []} />
          </div>

        </div>
      </div>

      <Footer
        actionButton={{
          label: '[← BACK TO HOME]',
          onClick: () => navigate('/'),
        }}
      />
    </div>
  );
};
