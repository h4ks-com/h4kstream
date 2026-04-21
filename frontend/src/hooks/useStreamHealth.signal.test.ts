import {
  autocorr,
  levinson,
  lpcResidualStats,
  CLICK_AMPLITUDE_RATIO,
  CLICK_SILENCE_THRESHOLD,
} from './useStreamHealth';

const N = 2048;
const FS = 44100;

function sineWave(freq: number, amplitude: number, n = N): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / FS);
  return buf;
}

function silence(n = N): Float32Array {
  return new Float32Array(n);
}

function addImpulse(buf: Float32Array, index: number, amplitude: number): Float32Array {
  const out = buf.slice();
  out[index] += amplitude;
  return out;
}

// ---------------------------------------------------------------------------
// autocorr
// ---------------------------------------------------------------------------

describe('autocorr', () => {
  it('R[0] equals sum of squares (signal energy)', () => {
    const buf = sineWave(440, 0.5);
    const r = autocorr(buf, 4);
    let expected = 0;
    for (let i = 0; i < buf.length; i++) expected += buf[i] * buf[i];
    expect(r[0]).toBeCloseTo(expected, 3);
  });

  it('returns zero energy for silence', () => {
    const r = autocorr(silence(), 4);
    expect(r[0]).toBe(0);
  });

  it('R[k] <= R[0] for all lags (Cauchy-Schwarz)', () => {
    const buf = sineWave(1000, 0.7);
    const r = autocorr(buf, 12);
    for (let k = 1; k <= 12; k++) {
      expect(Math.abs(r[k])).toBeLessThanOrEqual(r[0] + 1e-6);
    }
  });
});

// ---------------------------------------------------------------------------
// levinson
// ---------------------------------------------------------------------------

describe('levinson', () => {
  it('produces coefficients that near-perfectly predict a pure sine', () => {
    // A pure sine is predictable by a low-order AR model; residuals should be tiny.
    const buf = sineWave(440, 0.5);
    const r = autocorr(buf, 12);
    const a = levinson(r, 12);

    // Compute prediction residuals manually
    let sumSqRes = 0;
    let sumSqSig = 0;
    for (let i = 12; i < buf.length; i++) {
      let pred = 0;
      for (let k = 1; k <= 12; k++) pred -= a[k] * buf[i - k];
      sumSqRes += (buf[i] - pred) ** 2;
      sumSqSig += buf[i] ** 2;
    }
    // Residual energy should be < 1% of signal energy for a predictable sine
    expect(sumSqRes / sumSqSig).toBeLessThan(0.01);
  });

  it('returns all-zero coefficients for silence', () => {
    const r = autocorr(silence(), 4);
    const a = levinson(r, 4);
    for (let k = 1; k <= 4; k++) expect(a[k]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// lpcResidualStats
// ---------------------------------------------------------------------------

describe('lpcResidualStats', () => {
  it('returns zero stats for silence', () => {
    const { maxResidual, medianResidualRms } = lpcResidualStats(silence());
    expect(maxResidual).toBe(0);
    expect(medianResidualRms).toBe(0);
  });

  it('pure sine has low residual ratio (well below detection threshold)', () => {
    const buf = sineWave(440, 0.5);
    const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
    const ratio = maxResidual / medianResidualRms;
    // Should be nowhere near the 31.6× threshold
    expect(ratio).toBeLessThan(CLICK_AMPLITUDE_RATIO / 2);
  });

  it('sine + isolated impulse has ratio above detection threshold', () => {
    // 440 Hz sine at -6 dBFS; inject a click at sample 500
    const buf = addImpulse(sineWave(440, 0.5), 500, 0.9);
    const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
    const ratio = maxResidual / medianResidualRms;
    expect(ratio).toBeGreaterThan(CLICK_AMPLITUDE_RATIO);
  });

  it('louder sine without impulse still has low ratio', () => {
    // Sustained loud audio must not trigger — ratio should stay low even at high amplitude
    const buf = sineWave(440, 0.95);
    const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
    const ratio = maxResidual / medianResidualRms;
    expect(ratio).toBeLessThan(CLICK_AMPLITUDE_RATIO / 2);
  });

  it('multi-frequency signal without impulse stays below threshold', () => {
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      buf[i] =
        0.3 * Math.sin((2 * Math.PI * 200 * i) / FS) +
        0.3 * Math.sin((2 * Math.PI * 800 * i) / FS) +
        0.2 * Math.sin((2 * Math.PI * 3000 * i) / FS);
    }
    const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
    const ratio = maxResidual / medianResidualRms;
    expect(ratio).toBeLessThan(CLICK_AMPLITUDE_RATIO);
  });

  it('click at beginning of buffer is still detected', () => {
    // Click near the start (well past LPC_ORDER offset)
    const buf = addImpulse(sineWave(440, 0.5), 20, 0.9);
    const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
    expect(maxResidual / medianResidualRms).toBeGreaterThan(CLICK_AMPLITUDE_RATIO);
  });

  it('two clicks in one frame still detected (median stays unbiased)', () => {
    // Two isolated spikes — median should still reflect background floor
    let buf = sineWave(440, 0.5);
    buf = addImpulse(buf, 300, 0.9);
    buf = addImpulse(buf, 900, 0.9);
    const { maxResidual, medianResidualRms } = lpcResidualStats(buf);
    expect(maxResidual / medianResidualRms).toBeGreaterThan(CLICK_AMPLITUDE_RATIO);
  });
});

// ---------------------------------------------------------------------------
// Silence threshold guard
// ---------------------------------------------------------------------------

describe('CLICK_SILENCE_THRESHOLD', () => {
  it('is approximately -50 dBFS in linear amplitude', () => {
    expect(CLICK_SILENCE_THRESHOLD).toBeCloseTo(Math.pow(10, -50 / 20), 5);
  });

  it('a -50 dBFS sine RMS is right at the threshold boundary', () => {
    const amp = Math.pow(10, -50 / 20);
    const buf = sineWave(440, amp * Math.SQRT2); // peak at amp → RMS ≈ amp/√2 * √2 = amp
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    // RMS should be near the silence threshold
    expect(rms).toBeCloseTo(CLICK_SILENCE_THRESHOLD, 3);
  });
});
