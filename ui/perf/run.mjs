// Synkopa UI performance harness: drives the real UI in Chromium against the in-browser
// MockBackend with deterministic synthetic projects (gen.mjs) and records, per scenario, the
// per-interaction cost of real input (handler → store → effects → canvas draw), frame times,
// long tasks, scripting time, JS heap / DOM counters (leak checks) and the production bundle size.
//
//   node perf/run.mjs [options]          (from ui/; `pnpm --dir ui perf` once the script line is added)
//     --mode prod|dev      prod (default, the baseline of record): `vite build` + `vite preview`;
//                          dev: the Vite dev server (dev-mode numbers are for reference only)
//     --runs N             whole-suite repetitions, each in a fresh browser (default 3): the spread
//                          between runs is the noise floor that compare.mjs uses
//     --out FILE           default perf/results/<label>.json (+ .md next to it)
//     --label NAME         default "run"
//     --throttle N         CDP CPU throttling rate (default 1 = none)
//     --no-profile         skip the CPU-profile pass (hot spots, on an unminified build)
//     --no-build           reuse perf/.cache builds
//     --quick              fewer iterations (smoke test of the harness, not for comparisons)
//     --only a,b           only these scenarios (boot, replace, clipDrag, noteDrag, noteEdit, fader, fxParam,
//                          playlistNav, windows, playback)
//     --gpu off            software GL (SwiftShader) instead of the real GPU
//     --headed             show the browser
//     --dump-profiles DIR  also write each scenario's raw CPU profile (profile pass) to DIR
// Exit code 1 when a scenario failed (its error is in the summary; the results are still written).
//
// It needs `window.__perf` (src/perfHook.ts, bundled only with VITE_PERF=1) and the mock's
// `window.__waveFixture` hook. All app access goes through lib/app.mjs, the one place to adapt
// if those hooks change shape (e.g. in the Solid 2 migration).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, describe, GENERATOR_VERSION } from './gen.mjs';
import { buildUi, bundleSizes, devUi, previewUi } from './lib/serve.mjs';
import { launch, playwrightVersion, VIEWPORT } from './lib/browser.mjs';
import { median, r2 } from './lib/stats.mjs';
import { App } from './lib/app.mjs';
import { scenarioErrors, writeSummary } from './lib/report.mjs';
import { loadMaps } from './lib/sourcemap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = resolve(here, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; return v == null || v.startsWith('--') ? true : v; };
const opt = {
  mode: arg('mode', 'prod'), runs: +arg('runs', 3), label: arg('label', 'run'), throttle: +arg('throttle', 1),
  profile: !arg('no-profile', false), gpu: arg('gpu', 'on') !== 'off', build: !arg('no-build', false), quick: !!arg('quick', false), headed: !!arg('headed', false),
  only: arg('only', '') ? String(arg('only', '')).split(',') : null,
  dumpProfiles: arg('dump-profiles', null),
};
const out = resolve(uiDir, arg('out', `perf/results/${opt.label}.json`));
const cache = join(here, '.cache');
const log = (...a) => console.error('[perf]', ...a);
const N = (full, quick) => (opt.quick ? quick : full);

// ---------- fixtures
const fixtures = { large: generate('large'), small: generate('small') };
const fixtureInfo = Object.fromEntries(Object.entries(fixtures).map(([k, p]) => [k, describe(p)]));

// ---------- meta
const sh = c => { try { return execSync(c, { cwd: uiDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const pkgVersion = name => { try { return JSON.parse(readFileSync(join(uiDir, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; } };
const meta = {
  label: opt.label, date: new Date().toISOString(), mode: opt.mode, runs: opt.runs, quick: opt.quick,
  // dirtyFiles: uncommitted changes to shipped UI code (tests excluded): the numbers then belong to the working tree, not to the sha
  git: { sha: sh('git rev-parse HEAD'), branch: sh('git rev-parse --abbrev-ref HEAD'),
    dirtyFiles: (sh('git status --porcelain -- src index.html vite.config.ts ":(exclude)src/**/*.test.*" ":(exclude)src/test"') || '').split(/\r?\n/).filter(Boolean).map(l => l.trim()) },
  versions: { 'solid-js': pkgVersion('solid-js'), 'vite-plugin-solid': pkgVersion('vite-plugin-solid'), vite: pkgVersion('vite'), node: process.version, playwright: playwrightVersion },
  machine: { os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model?.trim(), cores: os.cpus().length, memGiB: Math.round(os.totalmem() / 2 ** 30) },
  browser: { gpu: opt.gpu, cpuThrottle: opt.throttle, viewport: VIEWPORT, deviceScaleFactor: 1, headless: !opt.headed },
  fixtures: { generator: GENERATOR_VERSION, ...fixtureInfo },
};

// ---------- builds
const distPerf = join(cache, 'dist-perf'), distProf = join(cache, 'dist-prof'), distShip = join(cache, 'dist-ship');
if (opt.build && opt.mode === 'prod') {
  log('building: shipped bundle (no hook) for sizes');
  await buildUi(uiDir, distShip, { perfHook: false, minify: true });
  log('building: minified + VITE_PERF hook (timing runs)');
  await buildUi(uiDir, distPerf, { perfHook: true, minify: true });
}
if (opt.build && opt.profile && opt.mode === 'prod') {
  log('building: unminified + VITE_PERF hook (CPU-profile pass)');
  await buildUi(uiDir, distProf, { perfHook: true, minify: false, sourcemap: true });
}
const results = { meta, bundle: opt.mode === 'prod' ? bundleSizes(distShip) : null, runs: [], profile: null };

// ---------- the suite
async function suite(url, { profile = false, maps = null } = {}) {
  const { browser, executablePath } = await launch({ headed: opt.headed, gpu: opt.gpu });
  meta.browser.chromium = browser.version(); meta.browser.executable = executablePath.split(/[\\/]/).slice(-3).join('/');
  const app = new App(browser, { throttle: opt.throttle, profile, maps, log, dumpProfiles: profile && opt.dumpProfiles ? resolve(opt.dumpProfiles) : null });
  const want = name => !opt.only || opt.only.includes(name);
  const res = {};
  try {
    if (want('boot')) {
      res.boot_large = await app.bootSeries(url, fixtures.large, N(2, 1), N(10, 3));
      res.boot_small = await app.bootSeries(url, fixtures.small, N(1, 1), N(5, 2));
    }
    await app.open(url, fixtures.large);
    meta.browser.webglRenderer = app.webglRenderer;
    res.session_start = await app.counters('after boot');
    if (want('replace')) Object.assign(res, await app.replaceScenarios(fixtures.small, N(5, 2), N(30, 8), N(3, 1), N(10, 3)));
    // drags: (warm-up moves, measured drags, moves per drag)
    if (want('clipDrag')) res.clip_drag = await app.clipDrag(15, N(5, 2), N(30, 15));
    if (want('noteDrag')) res.note_drag = await app.noteDrag(8, N(4, 2), N(15, 8));
    if (want('noteEdit')) Object.assign(res, await app.noteEdits(1, N(6, 2), N(20, 6)));
    if (want('fader')) res.fader_drag = await app.faderDrag(15, N(5, 2), N(30, 15));
    if (want('fxParam')) res.fx_param = await app.fxParamDrag(15, N(5, 2), N(30, 15));
    if (want('playlistNav')) Object.assign(res, await app.playlistNav(N(10, 4), N(60, 16)));
    if (want('windows')) Object.assign(res, await app.windowCycles(N(3, 1), N(20, 5)));
    if (want('playback')) res.playback = await app.playback(N(6000, 2500));
    res.session_end = await app.counters('end');
    res.console_errors = app.errors.slice(0, 20);
  } finally {
    await browser.close();
  }
  return res;
}

async function serve(dir) {
  if (opt.mode === 'dev') return devUi(uiDir);
  return previewUi(uiDir, dir);
}

const srv = await serve(distPerf);
log('serving', srv.url, `(${opt.mode})`);
try {
  for (let r = 0; r < opt.runs; r++) {
    log(`run ${r + 1}/${opt.runs}`);
    const t = Date.now();
    results.runs.push(await suite(srv.url));
    log(`run ${r + 1} done in ${Math.round((Date.now() - t) / 1000)} s`);
  }
} finally { await srv.close(); }

if (opt.profile) {
  const ps = opt.mode === 'dev' ? await devUi(uiDir) : await previewUi(uiDir, distProf);
  log('CPU-profile pass (unminified build)', ps.url);
  try { results.profile = await suite(ps.url, { profile: true, maps: loadMaps(distProf) }); } finally { await ps.close(); }
  // timing from the profiled pass is perturbed by the sampler: keep only the hot spots
  for (const v of Object.values(results.profile)) if (v && typeof v === 'object' && v.metrics) delete v.metrics;
}

// ---------- aggregate: per metric the value of every run, their median and the run-to-run spread
const flat = {};
results.runs.forEach((run, ri) => {
  for (const [sc, v] of Object.entries(run)) {
    if (!v || typeof v !== 'object' || !v.metrics) continue;
    for (const [k, x] of Object.entries(v.metrics)) {
      if (typeof x !== 'number' || !Number.isFinite(x)) continue;
      const key = `${sc}.${k}`;
      (flat[key] ??= { unit: v.units?.[k] ?? 'ms', runs: Array(opt.runs).fill(null) }).runs[ri] = x;
    }
  }
});
for (const m of Object.values(flat)) {
  const xs = m.runs.filter(x => x != null);
  m.median = r2(median(xs));
  m.min = r2(Math.min(...xs)); m.max = r2(Math.max(...xs));
  // relative spread between runs: (max − min) / median
  m.spread = m.median ? r2((m.max - m.min) / Math.abs(m.median)) : 0;
}
results.metrics = flat;
if (results.bundle) {
  results.metrics['bundle.total.raw'] = { unit: 'bytes', median: results.bundle.total.raw, spread: 0, runs: [results.bundle.total.raw] };
  results.metrics['bundle.total.gzip'] = { unit: 'bytes', median: results.bundle.total.gzip, spread: 0, runs: [results.bundle.total.gzip] };
  results.metrics['bundle.js.gzip'] = { unit: 'bytes', median: results.bundle.js.gzip, spread: 0, runs: [results.bundle.js.gzip] };
}
const spreads = Object.entries(flat).filter(([, m]) => m.unit === 'ms' && m.median >= 1).map(([, m]) => m.spread);
results.noise = { runs: opt.runs, medianSpread: r2(median(spreads)), p90Spread: r2(spreads.sort((a, b) => a - b)[Math.floor(spreads.length * 0.9)] ?? null), note: 'relative (max-min)/median between whole-suite runs, over ms metrics >= 1 ms' };

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(results, null, 1));
writeFileSync(out.replace(/\.json$/, '.md'), writeSummary(results));
log('wrote', out);
// the files are kept for the diagnosis, but a run with a failed scenario is not a result
const failed = scenarioErrors(results);
if (failed.length) { log(`FAILED: ${failed.length} scenario error(s)`); for (const e of failed) log('  ' + e); process.exit(1); }
process.exit(0);
