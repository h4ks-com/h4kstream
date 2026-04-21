// Baudline-style phosphor colormap: black → dark-teal → green → yellow → near-white
export const COLORMAP: Uint8ClampedArray = (() => {
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

export function freqToYPct(freq: number, minFreq: number, maxFreq: number): number {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  return ((logMax - Math.log10(Math.max(freq, 1))) / (logMax - logMin)) * 100;
}

export function makeYToBin(
  height: number,
  numBins: number,
  nyquist: number,
  minFreq: number,
  maxFreq: number,
): Int32Array {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const map = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const logFreq = logMax - (y / height) * (logMax - logMin);
    const freq = Math.pow(10, logFreq);
    map[y] = Math.max(0, Math.min(numBins - 1, Math.round((freq / nyquist) * numBins)));
  }
  return map;
}

export function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
