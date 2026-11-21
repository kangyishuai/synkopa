// Small statistics helpers shared by run.mjs and compare.mjs.
export const r2 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
export const sorted = a => [...a].filter(Number.isFinite).sort((x, y) => x - y);
/** Nearest-rank quantile. */
export function q(a, p) { const s = sorted(a); if (!s.length) return null; return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; }
export const median = a => { const s = sorted(a); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const mean = a => { const s = sorted(a); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
export const sum = a => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
/** median / p95 / max (and n) of a sample, rounded. */
export const dist = a => ({ n: sorted(a).length, median: r2(median(a)), p95: r2(q(a, 0.95)), max: r2(sorted(a).at(-1) ?? null) });

/** Frame statistics from rAF deltas: a dropped frame is a vsync the page missed (delta / interval − 1, rounded). */
export function frameStats(frames, interval = 1000 / 60) {
  const f = frames.filter(x => x > 0 && x < 5000);
  const dropped = f.reduce((a, d) => a + Math.max(0, Math.round(d / interval) - 1), 0);
  return { ...dist(f), frames: f.length, dropped, droppedPct: f.length ? r2(100 * dropped / (f.length + dropped)) : null, over33: f.filter(x => x > 33.4).length };
}
