import React from 'react';
import type { PlaybackState } from '../../hooks/useStreamHealth';

function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  isLive: boolean;
  isPlaying: boolean;
  muted: boolean;
  volume: number;
  playback: PlaybackState;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  onSeek: (s: number) => void;
}

export const PlaybackControls: React.FC<Props> = ({
  isLive, isPlaying, muted, volume, playback,
  onTogglePlayback, onToggleMute, onVolumeChange, onSeek,
}) => (
  <div className="border-t border-h4ks-green-900/50 pt-3 space-y-2">
    <div className="flex items-center gap-2">
      {!isLive && (
        <button onClick={onTogglePlayback}
          className="font-mono text-xs border border-h4ks-green-700 text-h4ks-green-400 px-3 py-1 hover:bg-h4ks-green-900/30 transition-colors shrink-0">
          {isPlaying ? '[⏸]' : '[▶]'}
        </button>
      )}
      <button onClick={onToggleMute}
        className={`font-mono text-xs border px-3 py-1 transition-colors shrink-0 ${
          !muted
            ? 'border-h4ks-green-600 text-h4ks-green-400 bg-h4ks-green-900/20'
            : 'border-h4ks-green-900 text-gray-500 hover:border-h4ks-green-700 hover:text-gray-300'
        }`}>
        {muted ? '[MUTED]' : '[AUDIO ON]'}
      </button>
      <input type="range" min="0" max="1" step="0.05" value={volume}
        onChange={e => onVolumeChange(parseFloat(e.target.value))}
        className="flex-1 accent-h4ks-green-500 h-1"
      />
      <span className="font-mono text-xs text-gray-600 tabular-nums w-8 text-right shrink-0">
        {Math.round(volume * 100)}%
      </span>
    </div>

    {!isLive && (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-gray-500 tabular-nums w-10 shrink-0">
          {fmtDuration(playback.currentTime)}
        </span>
        <input type="range"
          min={0} max={playback.duration || 0} step={0.5}
          value={playback.currentTime}
          onChange={e => onSeek(parseFloat(e.target.value))}
          className="flex-1 accent-h4ks-green-500 h-2 cursor-pointer"
        />
        <span className="font-mono text-xs text-gray-500 tabular-nums w-10 text-right shrink-0">
          {fmtDuration(playback.duration)}
        </span>
      </div>
    )}
  </div>
);
