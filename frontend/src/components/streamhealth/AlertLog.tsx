import React from 'react';
import type { AlertType, StreamAlert } from '../../hooks/useStreamHealth';

const ALERT_LABEL: Record<AlertType, string> = {
  CLIP: 'CLIP DETECTED',
  CRACKLE: 'CRACKLE DETECTED',
  CLICK: 'CLICK DETECTED',
  HIGH_FREQ: 'HIGH FREQ ALERT',
};

const ALERT_COLOR: Record<AlertType, string> = {
  CLIP: 'text-red-400',
  CRACKLE: 'text-yellow-400',
  CLICK: 'text-red-300',
  HIGH_FREQ: 'text-purple-400',
};

function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

interface Props {
  alerts: StreamAlert[];
  onJump?: (t: number) => void;
}

export const AlertLog: React.FC<Props> = ({ alerts, onJump }) => {
  if (alerts.length === 0) {
    return <p className="text-gray-600 font-mono text-xs italic">No alerts recorded.</p>;
  }
  return (
    <>
      <style>{`
        .alert-scroll::-webkit-scrollbar { width: 6px; }
        .alert-scroll::-webkit-scrollbar-track { background: #0a0f0a; }
        .alert-scroll::-webkit-scrollbar-thumb { background: #166534; border: 1px solid #14532d; }
        .alert-scroll::-webkit-scrollbar-thumb:hover { background: #22c55e; }
        .alert-scroll { scrollbar-color: #166534 #0a0f0a; scrollbar-width: thin; }
      `}</style>
      <div className="alert-scroll space-y-0.5 max-h-36 overflow-y-auto">
        {alerts.map((a, i) => {
          const row = (
            <>
              <span className="text-gray-500 tabular-nums shrink-0">{formatTime(a.t)}</span>
              <span className={ALERT_COLOR[a.type]}>{ALERT_LABEL[a.type]}</span>
            </>
          );
          const base = 'flex gap-3 font-mono text-xs px-1';
          if (!onJump) {
            return <div key={i} className={base}>{row}</div>;
          }
          return (
            <button key={i} type="button" onClick={() => onJump(a.t)}
              title="Jump to this event"
              className={`${base} text-left w-full hover:bg-h4ks-green-900/30 hover:border-l-2 hover:border-h4ks-green-500 cursor-pointer transition-colors`}>
              {row}
            </button>
          );
        })}
      </div>
    </>
  );
};
