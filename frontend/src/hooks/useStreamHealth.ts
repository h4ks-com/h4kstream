import { useCallback, useEffect, useRef, useState } from 'react';

export interface StreamHealthMetrics {
  rms: number;
  peak: number;
  clipping: boolean;
  crackle: boolean;
  click: boolean;
}

export interface HistoryPoint {
  t: number;
  rms: number;
  peak: number;
  click?: boolean;
}

export interface StreamAlert {
  t: number;
  type: 'CLIP' | 'CRACKLE' | 'CLICK';
}

const POLL_INTERVAL_MS = 50;
const CRACKLE_HISTORY_WINDOW = 20;
const CRACKLE_PEAK_THRESHOLD = 0.05;
const CRACKLE_DROP_THRESHOLD = 0.001;
const CLIP_THRESHOLD = 0.99;

// LPC click detector — parameters from Essentia ClickDetector algorithm defaults:
//   order=12, detectionThreshold=30 dB, silenceThreshold=-50 dBFS
// Detection: instantaneous residual > median_residual_rms * 10^(30/20)
// Median (not mean) is used for noise floor so clicks don't bias their own threshold.
export const LPC_ORDER = 12;
export const CLICK_THRESHOLD_DB = 30;
export const CLICK_SILENCE_THRESHOLD = Math.pow(10, -50 / 20); // -50 dBFS → ~0.00316
export const CLICK_AMPLITUDE_RATIO = Math.pow(10, CLICK_THRESHOLD_DB / 20); // ~31.6×

const HISTORY_SIZE = 600; // 30 seconds at 50ms
const MAX_ALERTS = 100;

// Compute autocorrelation R[0..p] of buf.
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
// Prediction: x̂[n] = -a[1]·x[n-1] - … - a[p]·x[n-p]
// Residual:   e[n]  =  x[n] + a[1]·x[n-1] + … + a[p]·x[n-p]
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

// Returns { maxResidual, medianResidualRms } for LPC(order) analysis of buf.
// medianResidualRms uses the median of residual² so clicks don't bias the floor.
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

  // Sort a copy for median (avoid mutating resSq for callers)
  const sorted = resSq.slice().sort();
  const mid = Math.floor(sorted.length / 2);
  const medianPower =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return { maxResidual: maxAbs, medianResidualRms: Math.sqrt(medianPower) };
}

export function useStreamHealth() {
  const [monitoring, setMonitoring] = useState(false);
  const [metrics, setMetrics] = useState<StreamHealthMetrics>({
    rms: 0,
    peak: 0,
    clipping: false,
    crackle: false,
    click: false,
  });
  const [alerts, setAlerts] = useState<StreamAlert[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const freqBufRef = useRef<Uint8Array | null>(null);
  // Exposed refs — canvas reads directly to avoid React re-renders
  const freqDataRef = useRef<Uint8Array | null>(null);
  const sampleRateRef = useRef<number>(44100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peakHistoryRef = useRef<number[]>([]);
  const historyRef = useRef<HistoryPoint[]>([]);
  const wasClippingRef = useRef(false);
  const wasCrackleRef = useRef(false);
  const wasClickRef = useRef(false);

  const startMonitoring = useCallback(async () => {
    if (monitoring) return;

    const audio = new Audio('/radio');
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

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

    const src = ctx.createMediaElementSource(audio);
    src.connect(analyser);
    // deliberately not connecting analyser to ctx.destination — stays muted

    audio.play().catch(() => {});

    intervalRef.current = setInterval(() => {
      const analyserNode = analyserRef.current;
      const buf = bufferRef.current;
      if (!analyserNode || !buf) return;

      analyserNode.getFloatTimeDomainData(buf);
      if (freqBufRef.current) analyserNode.getByteFrequencyData(freqBufRef.current);

      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        sumSq += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      const rms = Math.sqrt(sumSq / buf.length);
      const clipping = peak >= CLIP_THRESHOLD;

      const history = peakHistoryRef.current;
      history.push(peak);
      if (history.length > CRACKLE_HISTORY_WINDOW) history.shift();
      const recentMax = history.reduce((m, v) => Math.max(m, v), 0);
      const crackle = recentMax > CRACKLE_PEAK_THRESHOLD && rms < CRACKLE_DROP_THRESHOLD;

      // LPC click detection (Essentia ClickDetector approach):
      // Skip silent frames; otherwise flag when max residual exceeds the
      // median-based noise floor by CLICK_THRESHOLD_DB (30 dB).
      let click = false;
      if (rms > CLICK_SILENCE_THRESHOLD) {
        const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
        click = medianResidualRms > 0 && maxResidual > medianResidualRms * CLICK_AMPLITUDE_RATIO;
      }

      const pt: HistoryPoint = { t: Date.now(), rms, peak, click };
      historyRef.current.push(pt);
      if (historyRef.current.length > HISTORY_SIZE) historyRef.current.shift();

      if (clipping && !wasClippingRef.current) {
        setAlerts(prev => [{ t: Date.now(), type: 'CLIP' as const }, ...prev].slice(0, MAX_ALERTS));
      }
      if (crackle && !wasCrackleRef.current) {
        setAlerts(prev => [{ t: Date.now(), type: 'CRACKLE' as const }, ...prev].slice(0, MAX_ALERTS));
      }
      if (click && !wasClickRef.current) {
        setAlerts(prev => [{ t: Date.now(), type: 'CLICK' as const }, ...prev].slice(0, MAX_ALERTS));
      }
      wasClippingRef.current = clipping;
      wasCrackleRef.current = crackle;
      wasClickRef.current = click;

      setMetrics({ rms, peak, clipping, crackle, click });
    }, POLL_INTERVAL_MS);

    setMonitoring(true);
  }, [monitoring]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    analyserRef.current = null;
    bufferRef.current = null;
    freqBufRef.current = null;
    freqDataRef.current = null;
    peakHistoryRef.current = [];
    wasClippingRef.current = false;
    wasCrackleRef.current = false;
    wasClickRef.current = false;
    setMonitoring(false);
    setMetrics({ rms: 0, peak: 0, clipping: false, crackle: false, click: false });
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
    };
  }, []);

  return { monitoring, metrics, alerts, historyRef, freqDataRef, sampleRateRef, startMonitoring, stopMonitoring };
}
