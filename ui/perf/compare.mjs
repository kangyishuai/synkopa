// Diff two results files of run.mjs and flag what moved beyond run-to-run noise.
//
//   node perf/compare.mjs <base.json> <new.json> [--all] [--min-rel 0.10] [--k 1.5] [--md out.md]
//
// Every metric is "lower is better". A change counts when it beats BOTH
//   * the noise: |new − base| > max(min-rel, k × the larger of the two files' run-to-run spreads) × |base|
//     (spread = (max − min) / median between the whole-suite runs of that file), and
//   * an absolute floor per unit (ms 0.5, count 2, MiB 0.5 — 0.02 for per-cycle leak metrics, bytes 512),
// so a 0.1 ms wobble on a 0.3 ms metric or one extra long task is not reported as a regression.
// Exit code 1 when anything regressed (usable as a gate), 2 on bad input.
import { readFileSync, writeFileSync } from 'node:fs';
import { HEADLINE } from './lib/report.mjs';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; return v == null || v.startsWith('--') ? true : v; };
const VALUED = new Set(['--min-rel', '--k', '--md']);
const files = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));
if (files.length !== 2) { console.error('usage: node perf/compare.mjs <base.json> <new.json> [--all] [--min-rel 0.10] [--k 1.5] [--md out.md]'); process.exit(2); }
const [A, B] = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
const minRel = +flag('min-rel', 0.10), K = +flag('k', 1.5), all = !!flag('all', false);

// not costs: event counts, payload sizes, correctness checks
const SKIP = /(\.count$|stateKiB$|changedByFirstDrag|notesMoved|\.n$|documents$)/;
const floor = (key, unit) => unit === 'ms' ? 0.5 : unit === 'count' ? 2 : unit === 'MiB' ? (/perCycle/.test(key) ? 0.02 : 0.5) : unit === 'bytes' ? 512 : unit === 'KiB' ? 1 : 0;

// ---- comparability warnings
const warn = [];
const mm = (path, label) => { const g = o => path.split('.').reduce((x, k) => x?.[k], o.meta); if (JSON.stringify(g(A)) !== JSON.stringify(g(B))) warn.push(`${label} differs: ${JSON.stringify(g(A))} → ${JSON.stringify(g(B))}`); };
mm('mode', 'build mode'); mm('quick', 'quick mode'); mm('browser.chromium', 'Chromium'); mm('browser.webglRenderer', 'GPU renderer'); mm('browser.cpuThrottle', 'CPU throttle');
mm('browser.viewport', 'viewport'); mm('machine.cpu', 'CPU'); mm('fixtures.large.fingerprint', 'large fixture'); mm('fixtures.small.fingerprint', 'small fixture');
if (A.meta.quick || B.meta.quick) warn.push('a quick run is not meant for comparisons');
if ((A.meta.runs ?? 1) < 3 || (B.meta.runs ?? 1) < 3) warn.push('fewer than 3 runs: the noise estimate is weak');

const rows = [];
const keys = new Set([...Object.keys(A.metrics), ...Object.keys(B.metrics)]);
for (const key of keys) {
  if (SKIP.test(key)) continue;
  const a = A.metrics[key], b = B.metrics[key];
  if (!a || !b) { rows.push({ key, status: !a ? 'new' : 'gone', a: a?.median, b: b?.median, unit: (a ?? b).unit }); continue; }
  if (a.median == null || b.median == null) continue;
  const diff = b.median - a.median, unit = a.unit;
  const noise = Math.max(minRel, K * Math.max(a.spread ?? 0, b.spread ?? 0));
  const tol = Math.max(noise * Math.abs(a.median), floor(key, unit));
  const status = diff > tol ? 'REGRESSION' : -diff > tol ? 'improved' : 'same';
  rows.push({ key, status, a: a.median, b: b.median, unit, diff, rel: a.median ? diff / Math.abs(a.median) : null, tol });
}
const order = { REGRESSION: 0, improved: 1, gone: 2, new: 3, same: 4 };
const headline = new Set(HEADLINE.map(([s, k]) => `${s}.${k}`));
rows.sort((x, y) => order[x.status] - order[y.status] || x.key.localeCompare(y.key));

const fmt = (x, u) => (x == null ? '–' : u === 'bytes' ? (x / 1024).toFixed(1) + ' KiB' : `${Math.round(x * 100) / 100}${u === 'ms' ? ' ms' : u === 'MiB' ? ' MiB' : ''}`);
const pct = r => (r == null ? '' : (r > 0 ? '+' : '') + Math.round(r * 100) + ' %');
const shown = rows.filter(r => all || r.status !== 'same' || headline.has(r.key));
const L = [];
L.push(`base: ${A.meta.label} (${A.meta.git.sha?.slice(0, 10)}, solid-js ${A.meta.versions['solid-js']}, ${A.meta.runs} runs)`);
L.push(`new:  ${B.meta.label} (${B.meta.git.sha?.slice(0, 10)}, solid-js ${B.meta.versions['solid-js']}, ${B.meta.runs} runs)`);
L.push(`noise floor: base ${A.noise?.medianSpread != null ? Math.round(A.noise.medianSpread * 100) + ' %' : '?'} / new ${B.noise?.medianSpread != null ? Math.round(B.noise.medianSpread * 100) + ' %' : '?'} median run-to-run spread; threshold max(${minRel * 100} %, ${K}× spread) and an absolute floor`);
for (const w of warn) L.push('WARNING: ' + w);
L.push('');
L.push('| metric | base | new | change | tolerance | |', '|---|---:|---:|---:|---:|---|');
for (const r of shown) L.push(`| ${headline.has(r.key) ? '**' + r.key + '**' : r.key} | ${fmt(r.a, r.unit)} | ${fmt(r.b, r.unit)} | ${pct(r.rel)} | ${r.tol != null ? '±' + fmt(r.tol, r.unit) : ''} | ${r.status === 'same' ? '' : r.status} |`);
const n = s => rows.filter(r => r.status === s).length;
L.push('', `${n('REGRESSION')} regressions, ${n('improved')} improvements, ${n('same')} within noise, ${n('new')} new, ${n('gone')} gone (of ${rows.length} metrics)${all ? '' : '; --all lists every metric'}.`);
const text = L.join('\n');
console.log(text);
if (flag('md', null)) writeFileSync(flag('md'), text + '\n');
process.exit(n('REGRESSION') ? 1 : 0);
