import type { HistoryPoint } from '../../hooks/useStreamHealth';

export const DB_MIN = -60;
export const DB_MAX = 3;

export function toDb(v: number): number {
  if (v <= 0) return -Infinity;
  return 20 * Math.log10(v);
}

// Filmstrip waveform: 1 pixel column = 1 history frame.
// `startIdx` = history index shown at leftmost pixel. Negative = blank left margin.
// When live with offset=0: startIdx = history.length - width (tip lives at rightmost col).
export function drawWaveformStrip(
  canvas: HTMLCanvasElement,
  history: HistoryPoint[],
  startIdx: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, width, height);

  const toY = (db: number) =>
    height - ((Math.max(DB_MIN, Math.min(DB_MAX, db)) - DB_MIN) / (DB_MAX - DB_MIN)) * height;

  ctx.fillStyle = 'rgba(220,38,38,0.12)';
  ctx.fillRect(0, 0, width, toY(0));

  const gridLevels = [-60, -36, -18, -12, -6, 0];
  // Envelope centered at 0V; ±1.0 sample value maps to ±half-panel height.
  const cy = height / 2;
  ctx.beginPath();
  ctx.moveTo(Math.max(0, -startIdx), cy);
  const xStartW = Math.max(0, -startIdx);
  const xEndW   = Math.min(width, history.length - startIdx);
  for (let col = xStartW; col < xEndW; col++) {
    const pt = history[startIdx + col];
    ctx.lineTo(col, cy + pt.waveMax * cy * -1); // waveMax positive = above center
  }
  for (let col = xEndW - 1; col >= xStartW; col--) {
    const pt = history[startIdx + col];
    ctx.lineTo(col, cy + pt.waveMin * cy * -1); // waveMin negative = below center
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.font = '9px monospace';
  gridLevels.forEach(db => {
    const y = toY(db);
    ctx.strokeStyle = db === 0 ? 'rgba(220,38,38,0.5)' : 'rgba(74,222,128,0.12)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    ctx.fillStyle = db === 0 ? 'rgba(220,38,38,0.6)' : 'rgba(74,222,128,0.3)';
    ctx.fillText(`${db}`, 3, y - 2);
  });

  const xStart = Math.max(0, -startIdx);
  const xEnd   = Math.min(width, history.length - startIdx);
  if (xEnd - xStart < 2) return;
  const lastCol = xEnd - 1;

  // peak fill
  ctx.beginPath(); ctx.moveTo(xStart, height);
  for (let col = xStart; col < xEnd; col++) {
    ctx.lineTo(col, toY(toDb(history[startIdx + col].peak)));
  }
  ctx.lineTo(lastCol, height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(234,179,8,0.06)'; ctx.fill();

  // peak line
  ctx.beginPath(); ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 1;
  for (let col = xStart; col < xEnd; col++) {
    const y = toY(toDb(history[startIdx + col].peak));
    col === xStart ? ctx.moveTo(col, y) : ctx.lineTo(col, y);
  }
  ctx.stroke();

  // rms fill
  ctx.beginPath(); ctx.moveTo(xStart, height);
  for (let col = xStart; col < xEnd; col++) {
    ctx.lineTo(col, toY(toDb(history[startIdx + col].rms)));
  }
  ctx.lineTo(lastCol, height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74,222,128,0.08)'; ctx.fill();

  // rms line
  ctx.beginPath(); ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5;
  for (let col = xStart; col < xEnd; col++) {
    const y = toY(toDb(history[startIdx + col].rms));
    col === xStart ? ctx.moveTo(col, y) : ctx.lineTo(col, y);
  }
  ctx.stroke();

  // click markers
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(220,38,38,0.7)';
  for (let col = xStart; col < xEnd; col++) {
    if (history[startIdx + col].click) {
      ctx.beginPath(); ctx.moveTo(col, 0); ctx.lineTo(col, height); ctx.stroke();
    }
  }

  // view tip line at rightmost data column
  ctx.strokeStyle = 'rgba(74,222,128,0.2)'; ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(lastCol, 0); ctx.lineTo(lastCol, height); ctx.stroke();
  ctx.setLineDash([]);
}
