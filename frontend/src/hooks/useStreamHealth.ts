import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMonitorConfig } from './useAudioConfig';

export interface StreamHealthMetrics {
  rms: number;
  peak: number;
  clipping: boolean;
  crackle: boolean;
  click: boolean;
  spectralRatio: number;
  spectralHigh: boolean;
}

export interface HistoryPoint {
  t: number;
  rms: number;
  peak: number;
  click?: boolean;
}

export type AlertType = 'CLIP' | 'CRACKLE' | 'CLICK' | 'HIGH_FREQ';

export interface StreamAlert {
  t: number;
  type: AlertType;
}

const POLL_INTERVAL_MS = 50;
const HISTORY_SIZE_STREAM = 12000; // 10 min at 50 ms
const HISTORY_SIZE_MAX = 288000;   // 4 h hard ceiling — memory safety

// LPC click detector — Essentia ClickDetector algorithm defaults.
// These are exported so signal tests can import them for threshold assertions.
export const LPC_ORDER = 12;
export const CLICK_THRESHOLD_DB = 30;
export const CLICK_SILENCE_THRESHOLD = Math.pow(10, -50 / 20); // ~0.00316
export const CLICK_AMPLITUDE_RATIO = Math.pow(10, CLICK_THRESHOLD_DB / 20); // ~31.6×

export function autocorr(buf: Float32Array, p: number): Float32Array {
  const r = new Float32Array(p + 1);
  const n = buf.length;
  for (let k = 0; k <= p; k++) {
    let sum = 0;
    for (let i = k; i < n; i++) sum += buf[i] * buf[i - k];
    r[k] = sum;
  }
  return r;
}

// Levinson-Durbin recursion — returns AR coefficients a[1..p].
export function levinson(r: Float32Array, p: number): Float32Array {
  const a = new Float32Array(p + 1);
  if (r[0] < 1e-10) return a;
  let e = r[0];
  for (let m = 1; m <= p; m++) {
    let num = r[m];
    for (let j = 1; j < m; j++) num += a[j] * r[m - j];
    const km = -num / e;
    const prev = a.slice(1, m);
    for (let j = 1; j < m; j++) a[j] = prev[j - 1] + km * prev[m - 1 - j];
    a[m] = km;
    e *= 1 - km * km;
    if (e <= 0) break;
  }
  return a;
}

// Residual stats for LPC(12) of buf.
// Uses median of residual² as noise floor so isolated clicks don't bias the threshold.
export function lpcResidualStats(
  buf: Float32Array,
): { maxResidual: number; medianResidualRms: number } {
  const r = autocorr(buf, LPC_ORDER);
  if (r[0] < 1e-10) return { maxResidual: 0, medianResidualRms: 0 };

  const a = levinson(r, LPC_ORDER);
  const n = buf.length;
  const residuals = new Float32Array(n - LPC_ORDER);
  for (let i = LPC_ORDER; i < n; i++) {
    let res = buf[i];
    for (let k = 1; k <= LPC_ORDER; k++) res += a[k] * buf[i - k];
    residuals[i - LPC_ORDER] = res;
  }

  let maxAbs = 0;
  const resSq = new Float32Array(residuals.length);
  for (let i = 0; i < residuals.length; i++) {
    const abs = Math.abs(residuals[i]);
    resSq[i] = residuals[i] * residuals[i];
    if (abs > maxAbs) maxAbs = abs;
  }

  const sorted = resSq.slice().sort();
  const mid = Math.floor(sorted.length / 2);
  const medianPower =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return { maxResidual: maxAbs, medianResidualRms: Math.sqrt(medianPower) };
}

export interface PlaybackState {
  currentTime: number;
  duration: number;
}

export function useStreamHealth(config: AudioMonitorConfig) {
  const [monitoring, setMonitoring] = useState(false);
  const [metrics, setMetrics] = useState<StreamHealthMetrics>({
    rms: 0, peak: 0, clipping: false, crackle: false, click: false,
    spectralRatio: 0, spectralHigh: false,
  });
  const [alerts, setAlerts] = useState<StreamAlert[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ currentTime: 0, duration: 0 });
  const historySizeRef = useRef(HISTORY_SIZE_STREAM);

  // Config ref — interval always reads latest config without needing restart
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef   = useRef<Float32Array | null>(null);
  const freqBufRef  = useRef<Uint8Array | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const sampleRateRef   = useRef<number>(44100);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const peakHistoryRef  = useRef<number[]>([]);
  const historyRef      = useRef<HistoryPoint[]>([]);
  const isLiveRef       = useRef(true);
  const objectUrlRef    = useRef<string | null>(null);
  const lastPlaybackSecRef = useRef(-1);

  // Rising-edge flags
  const wasClippingRef    = useRef(false);
  const wasCrackleRef     = useRef(false);
  const wasClickRef       = useRef(false);
  const wasSpectralHighRef = useRef(false);

  // Cooldown timestamps (ms)
  const lastClipAlertRef     = useRef(0);
  const lastCrackleAlertRef  = useRef(0);
  const lastClickAlertRef    = useRef(0);
  const lastSpectralAlertRef = useRef(0);

  // Clip hold counter — must be clipping for N consecutive frames to avoid transient false-positives
  const clipHoldCountRef = useRef(0);

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, v));
  }, []);

  const startMonitoring = useCallback(async (audioSrc: string = '/radio') => {
    if (monitoring) return;

    setError(null);
    setIsLive(true);
    isLiveRef.current = true;
    lastPlaybackSecRef.current = -1;

    const audio = new Audio(audioSrc);
    audio.crossOrigin = 'anonymous';
    audio.volume = 0; // start muted; caller controls volume via setVolume
    audioRef.current = audio;

    // Track blob: URLs so we can revoke on stop
    if (audioSrc.startsWith('blob:')) objectUrlRef.current = audioSrc;

    audio.addEventListener('loadedmetadata', () => {
      const live = !isFinite(audio.duration);
      isLiveRef.current = live;
      setIsLive(live);
      if (!live && isFinite(audio.duration) && audio.duration > 0) {
        historySizeRef.current = Math.min(
          HISTORY_SIZE_MAX,
          Math.ceil(audio.duration * 1000 / POLL_INTERVAL_MS * 1.05),
        );
      }
    });
    audio.addEventListener('error', () => {
      setError('Failed to load audio source. Check URL or file format.');
      setIsPlaying(false);
      setMonitoring(false);
    });
    audio.addEventListener('ended', () => setIsPlaying(false));

    const ctx = new AudioContext();
    await ctx.resume();
    ctxRef.current = ctx;
    sampleRateRef.current = ctx.sampleRate;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    bufferRef.current = new Float32Array(analyser.fftSize);
    freqBufRef.current = new Uint8Array(analyser.frequencyBinCount);
    freqDataRef.current = freqBufRef.current;

    const mediaSrc = ctx.createMediaElementSource(audio);
    mediaSrc.connect(analyser);
    mediaSrc.connect(ctx.destination);

    audio.play().catch(() => { setIsPlaying(false); });
    setIsPlaying(true);

    intervalRef.current = setInterval(() => {
      const analyserNode = analyserRef.current;
      const buf = bufferRef.current;
      if (!analyserNode || !buf) return;
      const cfg = configRef.current;

      analyserNode.getFloatTimeDomainData(buf);
      if (freqBufRef.current) analyserNode.getByteFrequencyData(freqBufRef.current);

      // RMS + peak
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        sumSq += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      const rms = Math.sqrt(sumSq / buf.length);
      const clipping = peak >= cfg.clipThreshold;

      // Hold counter: must sustain for clipHoldFrames before alerting
      if (clipping) { clipHoldCountRef.current++; } else { clipHoldCountRef.current = 0; }
      const clipReady = cfg.clipEnabled && clipHoldCountRef.current >= cfg.clipHoldFrames;

      // Crackle: peak was high recently but RMS has collapsed
      const peakHist = peakHistoryRef.current;
      peakHist.push(peak);
      if (peakHist.length > cfg.crackleHistoryWindow) peakHist.shift();
      const recentMax = peakHist.reduce((m, v) => Math.max(m, v), 0);
      const crackle = cfg.crackleEnabled &&
        recentMax > cfg.cracklePeakThreshold &&
        rms < cfg.crackleDropThreshold;

      // Click (LPC residual)
      const clickSilenceLinear = Math.pow(10, cfg.clickSilenceDbfs / 20);
      const clickAmpRatio = Math.pow(10, cfg.clickThresholdDb / 20);
      let click = false;
      if (cfg.clickEnabled && rms > clickSilenceLinear) {
        const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
        click = medianResidualRms > 0 && maxResidual > medianResidualRms * clickAmpRatio;
      }

      // Spectral: high-frequency energy ratio
      let spectralRatio = 0;
      let spectralHigh = false;
      if (freqBufRef.current) {
        const bins = freqBufRef.current;
        const nyquist = sampleRateRef.current / 2;
        const cutoffBin = Math.round((cfg.spectralCutoffHz / nyquist) * bins.length);
        let total = 0;
        let high = 0;
        for (let i = 0; i < bins.length; i++) {
          total += bins[i];
          if (i >= cutoffBin) high += bins[i];
        }
        spectralRatio = total > 0 ? high / total : 0;
        spectralHigh = cfg.spectralEnabled && spectralRatio > cfg.spectralRatioThreshold;
      }

      // History
      const now = Date.now();
      historyRef.current.push({ t: now, rms, peak, click });
      if (historyRef.current.length > historySizeRef.current) historyRef.current.shift();

      // Alerts: rising edge AND cooldown must both pass
      if (clipReady && !wasClippingRef.current && now - lastClipAlertRef.current >= cfg.clipCooldownMs) {
        setAlerts(prev => [{ t: now, type: 'CLIP' as const }, ...prev].slice(0, cfg.maxAlerts));
        lastClipAlertRef.current = now;
      }
      if (crackle && !wasCrackleRef.current && now - lastCrackleAlertRef.current >= cfg.crackleCooldownMs) {
        setAlerts(prev => [{ t: now, type: 'CRACKLE' as const }, ...prev].slice(0, cfg.maxAlerts));
        lastCrackleAlertRef.current = now;
      }
      if (click && !wasClickRef.current && now - lastClickAlertRef.current >= cfg.clickCooldownMs) {
        setAlerts(prev => [{ t: now, type: 'CLICK' as const }, ...prev].slice(0, cfg.maxAlerts));
        lastClickAlertRef.current = now;
      }
      if (spectralHigh && !wasSpectralHighRef.current && now - lastSpectralAlertRef.current >= cfg.spectralCooldownMs) {
        setAlerts(prev => [{ t: now, type: 'HIGH_FREQ' as const }, ...prev].slice(0, cfg.maxAlerts));
        lastSpectralAlertRef.current = now;
      }

      wasClippingRef.current    = clipReady;
      wasCrackleRef.current     = crackle;
      wasClickRef.current       = click;
      wasSpectralHighRef.current = spectralHigh;

      setMetrics({ rms, peak, clipping, crackle, click, spectralRatio, spectralHigh });

      // Update playback position for finite sources at ~4 Hz (balance: smooth scrubber vs re-renders)
      if (!isLiveRef.current && audioRef.current) {
        const q = Math.round(audioRef.current.currentTime * 4);
        if (q !== lastPlaybackSecRef.current) {
          lastPlaybackSecRef.current = q;
          setPlayback({ currentTime: audioRef.current.currentTime, duration: audioRef.current.duration });
        }
      }
    }, POLL_INTERVAL_MS);

    setMonitoring(true);
  }, [monitoring]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
    if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    analyserRef.current    = null;
    bufferRef.current      = null;
    freqBufRef.current     = null;
    freqDataRef.current    = null;
    peakHistoryRef.current = [];
    clipHoldCountRef.current       = 0;
    wasClippingRef.current         = false;
    wasCrackleRef.current          = false;
    wasClickRef.current            = false;
    wasSpectralHighRef.current     = false;
    isLiveRef.current              = true;
    lastPlaybackSecRef.current     = -1;
    historySizeRef.current         = HISTORY_SIZE_STREAM;
    setMonitoring(false);
    setIsLive(true);
    setIsPlaying(false);
    setError(null);
    setPlayback({ currentTime: 0, duration: 0 });
    setMetrics({ rms: 0, peak: 0, clipping: false, crackle: false, click: false, spectralRatio: 0, spectralHigh: false });
  }, []);

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    audioRef.current.currentTime = Math.max(0, isFinite(dur) ? Math.min(seconds, dur) : seconds);
    setPlayback({ currentTime: audioRef.current.currentTime, duration: dur });
  }, []);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
    };
  }, []);

  return { monitoring, metrics, alerts, historyRef, freqDataRef, sampleRateRef, startMonitoring, stopMonitoring, setVolume, isLive, isPlaying, error, playback, seek, togglePlayback };
}
