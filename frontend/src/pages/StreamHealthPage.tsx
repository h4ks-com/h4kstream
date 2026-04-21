import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { AlertLog } from '../components/streamhealth/AlertLog';
import { MetricsPanel } from '../components/streamhealth/MetricsPanel';
import { PlaybackControls } from '../components/streamhealth/PlaybackControls';
import { SourceSelector } from '../components/streamhealth/SourceSelector';
import type { SourceMode } from '../components/streamhealth/SourceSelector';
import { SpectrogramPanel } from '../components/streamhealth/SpectrogramPanel';
import { WaveformPanel } from '../components/streamhealth/WaveformPanel';
import { useWebSocketEvent } from '../contexts/WebSocketContext';
import { useAudioConfig } from '../hooks/useAudioConfig';
import { useStreamHealth } from '../hooks/useStreamHealth';
import { TuningModal } from './TuningModal';

type ExpandedPanel = 'waveform' | 'spectrogram' | null;

export const StreamHealthPage: React.FC = () => {
  const navigate = useNavigate();
  const [livestreamActive, setLivestreamActive] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);

  const {
    config, activeProfile, profileNames,
    update, saveAsProfile, switchProfile, deleteProfile, resetToDefaults,
  } = useAudioConfig();

  const {
    monitoring, metrics, alerts, historyRef, freqDataRef, sampleRateRef,
    startMonitoring, stopMonitoring, setVolume: setHookVolume,
    isLive, isPlaying, error, playback, seek, togglePlayback,
  } = useStreamHealth(config);

  const [sourceMode, setSourceMode] = useState<SourceMode>('radio');
  const [urlInput, setUrlInput] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [muted, setMuted] = useState(true);
  const [volume, setVolumeState] = useState(0.8);

  // Shared time offset for both waveform + spectrogram panels.
  // 0 = live tip; positive = frames back (50 ms each).
  const [viewOffset, setViewOffset] = useState(0);

  // Reset to live on monitoring restart
  useEffect(() => { if (!monitoring) setViewOffset(0); }, [monitoring]);

  const onJump = useCallback((t: number) => {
    const hist = historyRef.current;
    if (hist.length === 0) return;
    const tipT = hist[hist.length - 1].t;
    const offset = Math.round(Math.max(0, tipT - t) / 50);
    setViewOffset(Math.min(offset, hist.length - 1));
  }, [historyRef]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setHookVolume(next ? 0 : volume);
    setMuted(next);
  }, [muted, volume, setHookVolume]);

  const onVolumeChange = useCallback((v: number) => {
    setVolumeState(v);
    if (!muted) setHookVolume(v);
  }, [muted, setHookVolume]);

  const handleStart = useCallback(async () => {
    let src = '/radio';
    if (sourceMode === 'url') {
      src = urlInput.trim() || '/radio';
    } else if (sourceMode === 'file') {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;
      src = URL.createObjectURL(file);
    }
    setMuted(true);
    await startMonitoring(src);
  }, [startMonitoring, sourceMode, urlInput]);

  useEffect(() => {
    fetch('/api/metadata/now')
      .then(r => r.json())
      .then(data => { if (data?.source === 'livestream') setLivestreamActive(true); })
      .catch(() => {});
  }, []);

  useWebSocketEvent('livestream_started', useCallback(() => setLivestreamActive(true), []));
  useWebSocketEvent('livestream_ended',   useCallback(() => setLivestreamActive(false), []));

  useEffect(() => {
    if (!expandedPanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedPanel]);

  const toggleExpand = (panel: Exclude<ExpandedPanel, null>) =>
    setExpandedPanel(prev => (prev === panel ? null : panel));

  return (
    <div className="min-h-screen bg-h4ks-dark-800 flex flex-col">
      {expandedPanel && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setExpandedPanel(null)} />
      )}

      <div className="flex-1 max-w-4xl w-full mx-auto p-6">
        <div className="space-y-5">

          <div className="border-b-2 border-h4ks-green-700 pb-4 flex items-start justify-between">
            <h2 className="text-2xl font-bold text-h4ks-green-400 font-mono">[AUDIO MONITOR]</h2>
            <button onClick={() => setTuningOpen(true)} title="Detector tuning & profiles"
              className="font-mono text-xs text-gray-500 border border-h4ks-green-900 px-3 py-1.5 hover:border-h4ks-green-600 hover:text-h4ks-green-400 transition-colors shrink-0 ml-4">
              [⚙ TUNE]
            </button>
          </div>

          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 px-4 py-2 font-mono text-sm flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${livestreamActive ? 'bg-h4ks-green-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className={livestreamActive ? 'text-h4ks-green-400' : 'text-gray-500'}>
              {livestreamActive ? 'LIVESTREAM ACTIVE' : 'NO ACTIVE LIVESTREAM'}
            </span>
          </div>

          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-3">
            {!monitoring && (
              <SourceSelector
                mode={sourceMode}
                onModeChange={setSourceMode}
                urlInput={urlInput}
                onUrlChange={setUrlInput}
                fileName={fileName}
                onFileSelect={setFileName}
                fileInputRef={fileInputRef}
              />
            )}

            {error && (
              <div className="border border-red-700 bg-red-900/20 px-3 py-2">
                <span className="font-mono text-xs text-red-400">ERROR: {error}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-400">
                STATUS:{' '}
                <span className={monitoring ? 'text-h4ks-green-400' : 'text-gray-600'}>
                  {monitoring ? (isLive ? 'MONITORING · LIVE' : 'MONITORING · PLAYBACK') : 'IDLE'}
                </span>
              </span>
              {!monitoring ? (
                <button onClick={handleStart}
                  className="font-mono text-xs text-h4ks-green-400 border border-h4ks-green-700 px-4 py-1.5 hover:bg-h4ks-green-900/30 transition-colors">
                  [START MONITORING]
                </button>
              ) : (
                <button onClick={stopMonitoring}
                  className="font-mono text-xs text-red-400 border border-red-800 px-4 py-1.5 hover:bg-red-900/30 transition-colors">
                  [STOP]
                </button>
              )}
            </div>

            {monitoring && (
              <PlaybackControls
                isLive={isLive}
                isPlaying={isPlaying}
                muted={muted}
                volume={volume}
                playback={playback}
                onTogglePlayback={togglePlayback}
                onToggleMute={toggleMute}
                onVolumeChange={onVolumeChange}
                onSeek={seek}
              />
            )}

            {monitoring && (
              <div data-testid="metrics-panel">
                <MetricsPanel metrics={metrics} spectralEnabled={config.spectralEnabled} />
              </div>
            )}
          </div>

          <WaveformPanel
            monitoring={monitoring}
            isLive={isLive}
            historyRef={historyRef}
            viewOffset={viewOffset}
            onViewOffsetChange={setViewOffset}
            expanded={expandedPanel === 'waveform'}
            onToggleExpand={() => toggleExpand('waveform')}
          />

          <SpectrogramPanel
            monitoring={monitoring}
            freqDataRef={freqDataRef}
            sampleRateRef={sampleRateRef}
            viewOffset={viewOffset}
            onViewOffsetChange={setViewOffset}
            expanded={expandedPanel === 'spectrogram'}
            onToggleExpand={() => toggleExpand('spectrogram')}
          />

          <div className="border border-h4ks-green-800 bg-h4ks-dark-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-500 block">ALERT LOG</span>
              {viewOffset > 0 && (
                <button onClick={() => setViewOffset(0)}
                  className="font-mono text-[9px] px-2 py-0.5 border border-yellow-700 text-yellow-400 hover:bg-yellow-900/20 transition-colors">
                  [GO LIVE]
                </button>
              )}
            </div>
            <AlertLog alerts={alerts ?? []} onJump={monitoring ? onJump : undefined} />
          </div>

        </div>
      </div>

      <Footer actionButton={{ label: '[← BACK TO HOME]', onClick: () => navigate('/') }} />

      {tuningOpen && (
        <TuningModal
          config={config}
          activeProfile={activeProfile}
          profileNames={profileNames}
          onUpdate={update}
          onSaveAs={saveAsProfile}
          onSwitch={switchProfile}
          onDelete={deleteProfile}
          onReset={resetToDefaults}
          onClose={() => setTuningOpen(false)}
        />
      )}
    </div>
  );
};
