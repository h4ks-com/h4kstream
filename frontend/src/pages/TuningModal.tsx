import React, { useState } from 'react';
import type { AudioMonitorConfig } from '../hooks/useAudioConfig';
import { DEFAULT_CONFIG } from '../hooks/useAudioConfig';

// ---------------------------------------------------------------------------
// Widget primitives
// ---------------------------------------------------------------------------

function Toggle({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px]">
      <span className="text-gray-300 uppercase tracking-wider">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`px-2 py-px border transition-colors ${
          value
            ? 'border-h4ks-green-500 text-h4ks-green-300 bg-h4ks-green-900/30'
            : 'border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'
        }`}
      >
        {value ? '[● ON]' : '[○ OFF]'}
      </button>
    </div>
  );
}

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-h4ks-green-300 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="tuning-slider w-full"
        style={{
          background: `linear-gradient(to right, #22c55e ${pct}%, #0d1f0d ${pct}%)`,
        }}
      />
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-h4ks-green-800/60 bg-black/20 p-3 space-y-2.5">
      <div className="font-mono text-[10px] text-h4ks-green-400 tracking-widest border-b border-h4ks-green-900/60 pb-1.5">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

const fmtLinear3 = (v: number) => v.toFixed(3);
const fmtLinear4 = (v: number) => v.toFixed(4);
const fmtDb = (v: number) => `${v.toFixed(0)} dB`;
const fmtDbfs = (v: number) => `${v.toFixed(0)} dBFS`;
const fmtSecs = (v: number) => `${(v / 1000).toFixed(1)} s`;
const fmtInt = (v: number) => String(Math.round(v));
const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v} Hz`;
const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;

// ---------------------------------------------------------------------------
// Profile manager
// ---------------------------------------------------------------------------

function ProfileManager({
  activeProfile,
  profileNames,
  switchProfile,
  saveAsProfile,
  deleteProfile,
}: {
  activeProfile: string;
  profileNames: string[];
  switchProfile: (n: string) => void;
  saveAsProfile: (n: string) => void;
  deleteProfile: (n: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <Section icon="◈" title="PROFILES">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-gray-400 shrink-0 tracking-wider">ACTIVE</span>
        <select
          value={activeProfile}
          onChange={e => switchProfile(e.target.value)}
          className="flex-1 bg-h4ks-dark-800 border border-h4ks-green-800 text-h4ks-green-300 font-mono text-[10px] px-2 py-1 outline-none cursor-pointer hover:border-h4ks-green-600"
        >
          {profileNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {activeProfile !== 'default' && (
          <button
            onClick={() => deleteProfile(activeProfile)}
            className="font-mono text-[10px] text-red-400 border border-red-800 px-2 py-0.5 hover:border-red-500 hover:text-red-300 transition-colors shrink-0"
          >
            [DEL]
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="new name..."
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { saveAsProfile(name.trim()); setName(''); } }}
          className="flex-1 bg-h4ks-dark-800 border border-h4ks-green-800/70 text-h4ks-green-300 font-mono text-[10px] px-2 py-1 outline-none placeholder-gray-500 focus:border-h4ks-green-500"
          maxLength={32}
        />
        <button
          onClick={() => { if (name.trim()) { saveAsProfile(name.trim()); setName(''); } }}
          disabled={!name.trim()}
          className="font-mono text-[10px] text-h4ks-green-300 border border-h4ks-green-700 px-2 py-0.5 hover:border-h4ks-green-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          [SAVE AS]
        </button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface TuningModalProps {
  config: AudioMonitorConfig;
  activeProfile: string;
  profileNames: string[];
  onUpdate: (patch: Partial<AudioMonitorConfig>) => void;
  onSaveAs: (name: string) => void;
  onSwitch: (name: string) => void;
  onDelete: (name: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export function TuningModal({
  config, activeProfile, profileNames,
  onUpdate, onSaveAs, onSwitch, onDelete, onReset, onClose,
}: TuningModalProps) {
  return (
    <>
      <style>{`
        .tuning-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 0;
          cursor: ew-resize;
          outline: none;
          border: none;
        }
        .tuning-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 16px;
          background: #4ade80;
          border-radius: 0;
          cursor: grab;
          border: none;
        }
        .tuning-slider:active::-webkit-slider-thumb { cursor: grabbing; }
        .tuning-slider::-moz-range-thumb {
          width: 10px;
          height: 16px;
          background: #4ade80;
          border-radius: 0;
          cursor: grab;
          border: none;
        }
        .tuning-slider:active::-moz-range-thumb { cursor: grabbing; }
        .tuning-slider::-moz-range-track {
          height: 4px;
          background: transparent;
        }
        /* Terminal-style thin scrollbar */
        .tuning-scroll {
          scrollbar-width: thin;
          scrollbar-color: #15803d #0a0f0a;
        }
        .tuning-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .tuning-scroll::-webkit-scrollbar-track {
          background: #0a0f0a;
          border-left: 1px solid #14532d;
        }
        .tuning-scroll::-webkit-scrollbar-thumb {
          background: #15803d;
          border: 1px solid #0a0f0a;
        }
        .tuning-scroll::-webkit-scrollbar-thumb:hover {
          background: #22c55e;
        }
      `}</style>

      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-h4ks-dark-900 border border-h4ks-green-600 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0 bg-h4ks-dark-900 border-b border-h4ks-green-700 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-h4ks-green-300 tracking-widest">[DETECTOR TUNING]</span>
              <span className="font-mono text-[10px] text-gray-400">profile: <span className="text-h4ks-green-400">{activeProfile}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onReset}
                className="font-mono text-[10px] text-yellow-400 border border-yellow-800 px-2 py-1 hover:border-yellow-500 hover:text-yellow-300 transition-colors"
              >
                [RESET]
              </button>
              <button
                onClick={onClose}
                className="font-mono text-xs text-gray-300 hover:text-white transition-colors px-2"
              >
                [×]
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="tuning-scroll flex-1 overflow-y-auto p-4 space-y-3">

            <ProfileManager
              activeProfile={activeProfile}
              profileNames={profileNames}
              switchProfile={onSwitch}
              saveAsProfile={onSaveAs}
              deleteProfile={onDelete}
            />

            {/* Detector grid — 2 columns on md+ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              <Section icon="▓" title="CLIP DETECTOR">
                <Toggle label="Enabled" value={config.clipEnabled} onChange={v => onUpdate({ clipEnabled: v })} />
                <Slider label="Threshold" value={config.clipThreshold} min={0.7} max={1.0} step={0.001}
                  format={fmtLinear3} onChange={v => onUpdate({ clipThreshold: v })} />
                <Slider label="Hold frames" value={config.clipHoldFrames} min={1} max={20} step={1}
                  format={v => `${fmtInt(v)} fr`} onChange={v => onUpdate({ clipHoldFrames: Math.round(v) })} />
                <Slider label="Cooldown" value={config.clipCooldownMs} min={100} max={10000} step={100}
                  format={fmtSecs} onChange={v => onUpdate({ clipCooldownMs: v })} />
                <p className="font-mono text-[9px] text-gray-400 leading-snug">
                  Hold: signal must clip N consecutive 50 ms frames before alerting. Suppresses transients.
                </p>
              </Section>

              <Section icon="≋" title="CRACKLE DETECTOR">
                <Toggle label="Enabled" value={config.crackleEnabled} onChange={v => onUpdate({ crackleEnabled: v })} />
                <Slider label="History window" value={config.crackleHistoryWindow} min={5} max={60} step={1}
                  format={v => `${fmtInt(v)} fr`} onChange={v => onUpdate({ crackleHistoryWindow: Math.round(v) })} />
                <Slider label="Peak threshold" value={config.cracklePeakThreshold} min={0.01} max={0.5} step={0.005}
                  format={fmtLinear3} onChange={v => onUpdate({ cracklePeakThreshold: v })} />
                <Slider label="Drop threshold" value={config.crackleDropThreshold} min={0.0001} max={0.02} step={0.0001}
                  format={fmtLinear4} onChange={v => onUpdate({ crackleDropThreshold: v })} />
                <Slider label="Cooldown" value={config.crackleCooldownMs} min={100} max={10000} step={100}
                  format={fmtSecs} onChange={v => onUpdate({ crackleCooldownMs: v })} />
                <p className="font-mono text-[9px] text-gray-400 leading-snug">
                  Fires when recent peak &gt; Peak threshold AND current RMS &lt; Drop threshold. Detects sudden silence after audio.
                </p>
              </Section>

              <Section icon="◉" title="CLICK DETECTOR  (LPC)">
                <Toggle label="Enabled" value={config.clickEnabled} onChange={v => onUpdate({ clickEnabled: v })} />
                <Slider label="Threshold" value={config.clickThresholdDb} min={10} max={60} step={1}
                  format={fmtDb} onChange={v => onUpdate({ clickThresholdDb: v })} />
                <Slider label="Silence floor" value={config.clickSilenceDbfs} min={-80} max={-20} step={1}
                  format={fmtDbfs} onChange={v => onUpdate({ clickSilenceDbfs: v })} />
                <Slider label="Cooldown" value={config.clickCooldownMs} min={100} max={10000} step={100}
                  format={fmtSecs} onChange={v => onUpdate({ clickCooldownMs: v })} />
                <p className="font-mono text-[9px] text-gray-400 leading-snug">
                  LPC residual: fires when peak residual exceeds median noise floor by Threshold dB. Raise threshold or floor to reduce false positives.
                </p>
              </Section>

              <Section icon="▲" title="SPECTRAL ALERT  (HIGH FREQ)">
                <Toggle label="Enabled" value={config.spectralEnabled} onChange={v => onUpdate({ spectralEnabled: v })} />
                <Slider label="HF cutoff" value={config.spectralCutoffHz} min={500} max={20000} step={100}
                  format={fmtHz} onChange={v => onUpdate({ spectralCutoffHz: v })} />
                <Slider label="HF ratio" value={config.spectralRatioThreshold} min={0.1} max={1.0} step={0.01}
                  format={fmtPct} onChange={v => onUpdate({ spectralRatioThreshold: v })} />
                <Slider label="Cooldown" value={config.spectralCooldownMs} min={500} max={30000} step={500}
                  format={fmtSecs} onChange={v => onUpdate({ spectralCooldownMs: v })} />
                <p className="font-mono text-[9px] text-gray-400 leading-snug">
                  Fires when energy above HF cutoff exceeds HF ratio of total energy. Detects unexpectedly bright or harsh signal.
                </p>
              </Section>
            </div>

            <Section icon="·" title="GENERAL">
              <Slider label="Max alerts" value={config.maxAlerts} min={10} max={500} step={10}
                format={fmtInt} onChange={v => onUpdate({ maxAlerts: Math.round(v) })} />
            </Section>

            {/* Default reference — collapsed */}
            <details className="border border-h4ks-green-800/40 bg-black/20">
              <summary className="cursor-pointer font-mono text-[10px] text-gray-300 tracking-widest px-3 py-2 hover:text-h4ks-green-300">
                ▸ DEFAULTS REFERENCE
              </summary>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-3 py-2 border-t border-h4ks-green-900/40">
                {(Object.entries(DEFAULT_CONFIG) as [keyof AudioMonitorConfig, unknown][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between font-mono text-[9px]">
                    <span className="text-gray-400">{k}</span>
                    <span className="text-gray-300">{String(v)}</span>
                  </div>
                ))}
              </div>
            </details>

          </div>
        </div>
      </div>
    </>
  );
}
