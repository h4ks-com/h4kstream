import React from 'react';
import type { StreamHealthMetrics } from '../../hooks/useStreamHealth';
import { toDb } from './waveform';

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

interface Props {
  metrics: StreamHealthMetrics;
  spectralEnabled: boolean;
}

export const MetricsPanel: React.FC<Props> = ({ metrics, spectralEnabled }) => (
  <div className="space-y-2">
    <LevelBar value={metrics.rms} label="RMS" />
    <LevelBar value={metrics.peak} label="PEAK" danger={metrics.clipping} />
    {spectralEnabled && (
      <LevelBar value={metrics.spectralRatio} label="HF" />
    )}
    <div className="flex flex-wrap gap-2 pt-1">
      <div title="CLIP: signal exceeds 0 dBFS — reduce input gain"
        className={`font-mono text-xs px-2 py-0.5 border cursor-help ${metrics.clipping ? 'border-red-500 text-red-400 bg-red-900/30 animate-pulse' : 'border-h4ks-green-900 text-gray-600'}`}>
        CLIP {metrics.clipping ? '!!!' : 'OK'}
      </div>
      <div title="CRACKLE: sudden silence after signal — possible buffer stall or dropout"
        className={`font-mono text-xs px-2 py-0.5 border cursor-help ${metrics.crackle ? 'border-yellow-500 text-yellow-400 bg-yellow-900/30' : 'border-h4ks-green-900 text-gray-600'}`}>
        CRACKLE {metrics.crackle ? 'DETECTED' : 'OK'}
      </div>
      <div title="CLICK: isolated transient spike detected via LPC residual analysis (Essentia algorithm)"
        className={`font-mono text-xs px-2 py-0.5 border cursor-help ${metrics.click ? 'border-red-400 text-red-300 bg-red-900/20' : 'border-h4ks-green-900 text-gray-600'}`}>
        CLICK {metrics.click ? '!!!' : 'OK'}
      </div>
      {spectralEnabled && (
        <div title="HIGH FREQ: energy above spectral cutoff exceeds ratio threshold"
          className={`font-mono text-xs px-2 py-0.5 border cursor-help ${metrics.spectralHigh ? 'border-purple-400 text-purple-300 bg-purple-900/20 animate-pulse' : 'border-h4ks-green-900 text-gray-600'}`}>
          BRIGHT {metrics.spectralHigh ? '!!!' : 'OK'}
        </div>
      )}
    </div>
  </div>
);
