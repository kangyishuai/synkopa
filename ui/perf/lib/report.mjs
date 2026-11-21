// Markdown summary of a results file.
const fmtBytes = b => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MiB' : (b / 1024).toFixed(1) + ' KiB');
const pct = x => (x == null ? '' : Math.round(x * 100) + ' %');

/** The rows of the headline table: [scenario label, metric key (without scenario), what it is]. */
export const HEADLINE = [
  ['boot_large', 'toInteractive.median', 'boot to interactive (large), median'],
  ['boot_large', 'toInteractive.p95', 'boot to interactive (large), p95'],
  ['boot_small', 'toInteractive.median', 'boot to interactive (small), median'],
  ['replace_same', 'replaceSync.median', 'replaceState, same project: sync'],
  ['replace_same', 'replaceToFrame.median', 'replaceState, same project: to frame'],
  ['replace_oneClip', 'replaceToFrame.median', 'replaceState, one clip moved: to frame'],
  ['replace_load', 'replaceSync.median', 'replaceState, other project (load): sync'],
  ['replace_load', 'replaceToFrame.median', 'replaceState, other project (load): to frame'],
  ['clip_drag', 'pointermove.task.median', 'clip drag: pointermove dispatch'],
  ['clip_drag', 'pointermove.frame.median', 'clip drag: pointermove → frame'],
  ['clip_drag', 'pointermove.frame.p95', 'clip drag: pointermove → frame p95'],
  ['clip_drag', 'drop.settled.median', 'clip drag: drop → engine reply applied + frame'],
  ['clip_drag', 'scriptMsPerInteraction', 'clip drag: script per move (drops included)'],
  ['note_drag', 'pointermove.task.median', 'note drag (2000 sel.): dispatch'],
  ['note_drag', 'pointermove.frame.median', 'note drag (2000 sel.): move → frame'],
  ['note_drag', 'pointermove.frame.p95', 'note drag (2000 sel.): move → frame p95'],
  ['note_drag', 'drop.settled.median', 'note drag: drop → engine reply applied + frame'],
  ['note_drag', 'scriptMsPerInteraction', 'note drag: script per move (drops included)'],
  ['note_delete', 'deleteKey.frame.median', 'Delete 2000 selected notes: key → frame'],
  ['note_delete', 'deleteKey.settled.median', 'Delete 2000 notes: key → engine reply applied + frame'],
  ['note_delete', 'undoKey.settled.median', 'undo of that Delete: key → engine reply applied + frame'],
  ['note_nudge', 'nudgeKey.frame.median', 'Shift+arrow nudge of 2000 notes: key → frame'],
  ['note_nudge', 'nudgeKey.settled.median', 'nudge: key → engine reply applied + frame'],
  ['note_nudge', 'scriptMsPerInteraction', 'nudge: script per key'],
  ['fader_drag', 'pointermove.frame.median', 'mixer fader: move → frame'],
  ['fader_drag', 'pointermove.frame.p95', 'mixer fader: move → frame p95'],
  ['fader_drag', 'scriptMsPerInteraction', 'mixer fader: script per move (drops included)'],
  ['fx_param', 'pointermove.frame.median', 'FX knob (window open): move → frame'],
  ['fx_param', 'pointermove.frame.p95', 'FX knob: move → frame p95'],
  ['fx_param', 'scriptMsPerInteraction', 'FX knob: script per move (drops included)'],
  ['nav_scrollV', 'scroll.frame.median', 'playlist vertical scroll: scroll event → frame'],
  ['nav_scrollH', 'scroll.frame.median', 'playlist horizontal scroll: scroll event → frame'],
  ['nav_scrollV', 'frame.p95', 'playlist vertical scroll: frame time p95'],
  ['nav_zoom', 'wheel.frame.median', 'playlist Ctrl+wheel zoom: wheel → frame'],
  ['nav_zoom', 'wheel.frame.p95', 'playlist zoom: wheel → frame p95'],
  ['nav_zoom', 'frames.dropped', 'playlist zoom: dropped frames'],
  ['win_mixer', 'open.median', 'Mixer show (F9) → frame'],
  ['win_mixer', 'close.median', 'Mixer hide (F9) → frame'],
  ['win_pianoRoll', 'open.median', 'Piano roll open (F7, 2000 notes) → frame'],
  ['win_pianoRoll', 'close.median', 'Piano roll close → frame'],
  ['win_fxWindow', 'open.median', 'EQ window open → frame'],
  ['win_fxWindow', 'close.median', 'EQ window close → frame'],
  ['playback', 'frame.median', 'playback: frame time median'],
  ['playback', 'frame.p95', 'playback: frame time p95'],
  ['playback', 'frames.dropped', 'playback: dropped frames (6 s)'],
  ['playback', 'longTasks', 'playback: long tasks (6 s)'],
  ['playback', 'scriptMsPerSecond', 'playback: script ms per second'],
];

/**
 * Scenarios that did not do what they measure (the drag missed its clip, a window did not open,
 * the body threw): their numbers are not that interaction's cost, so a run or a comparison with
 * any of these fails instead of reporting a faster result.
 */
export function scenarioErrors(res) {
  const errs = [];
  (res.runs ?? []).forEach((r, i) => { for (const [k, v] of Object.entries(r)) if (v?.error) errs.push(`run ${i + 1} ${k}: ${String(v.error).trim()}`); });
  for (const [k, v] of Object.entries(res.profile ?? {})) if (v?.error) errs.push(`profile ${k}: ${String(v.error).trim()}`);
  return errs;
}

export function writeSummary(res) {
  const M = res.metrics, m = res.meta;
  const L = [];
  L.push(`# UI perf: ${m.label}`, '');
  L.push(`${m.date.slice(0, 16).replace('T', ' ')} UTC · git \`${m.git.sha?.slice(0, 10)}\`${m.git.dirtyFiles?.length ? ` (+ uncommitted: ${m.git.dirtyFiles.join(', ')})` : ''} on \`${m.git.branch}\` · solid-js ${m.versions['solid-js']} · vite ${m.versions.vite} · ${m.mode} build${m.quick ? ' · QUICK (not comparable)' : ''}`);
  L.push(`${m.machine.cpu} (${m.machine.cores} threads, ${m.machine.memGiB} GiB) · ${m.machine.os} · Chromium ${m.browser.chromium} headless shell · CPU throttle ${m.browser.cpuThrottle}× · ${m.browser.viewport.width}×${m.browser.viewport.height} @1x`);
  const f = m.fixtures.large;
  L.push(`Large fixture: ${f.tracks} tracks, ${f.inserts} inserts / ${f.effects} effects, ${f.clips} clips, ${f.patterns} patterns (max ${f.maxPatternNotes} notes), ${f.jsonKiB} KiB, fingerprint \`${f.fingerprint}\``, '');
  L.push(`${m.runs} whole-suite runs, each in a fresh browser; the value is the median of the runs, "spread" is (max − min) / median between runs (the noise floor).`, '');
  if (res.noise?.medianSpread != null) L.push(`Noise floor over all ms metrics ≥ 1 ms: median spread ${pct(res.noise.medianSpread)}, p90 ${pct(res.noise.p90Spread)}. compare.mjs only flags changes above max(10 %, 1.5 × spread) and an absolute floor.`, '');
  L.push('| scenario | ms | spread | runs |', '|---|---:|---:|---|');
  for (const [sc, k, label] of HEADLINE) {
    const x = M[`${sc}.${k}`]; if (!x) continue;
    const u = x.unit === 'ms' ? '' : ' ' + x.unit;
    L.push(`| ${label} | ${x.median}${u} | ${pct(x.spread)} | ${x.runs.map(v => v ?? '–').join(' / ')} |`);
  }
  L.push('', '## Leak checks (per open/close cycle, after forced GC)', '', '| window | heap KiB/cycle | DOM nodes/cycle | listeners/cycle | detached nodes/cycle |', '|---|---:|---:|---:|---:|');
  for (const w of ['mixer', 'pianoRoll', 'fxWindow']) {
    const g = k => M[`win_${w}.leak.${k}.perCycle`]?.median;
    if (g('heapAfterGcMiB') == null && g('domNodes') == null) continue;
    L.push(`| ${w} | ${g('heapAfterGcMiB') != null ? Math.round(g('heapAfterGcMiB') * 1024) : '–'} | ${g('domNodes') ?? '–'} | ${g('jsEventListeners') ?? '–'} | ${g('detachedNodes') ?? '–'} |`);
  }
  const s0 = M['session_start.heapAfterGcMiB'], s1 = M['session_end.heapAfterGcMiB'];
  if (s0 && s1) L.push('', `Session heap after GC: ${s0.median} MiB after boot → ${s1.median} MiB after all scenarios.`);
  if (res.bundle) {
    const b = res.bundle;
    L.push('', '## Production bundle (shipped build, no perf hook)', '', `Total JS+CSS+HTML: ${fmtBytes(b.total.raw)} raw, ${fmtBytes(b.total.gzip)} gzip, ${fmtBytes(b.total.brotli)} brotli (JS ${fmtBytes(b.js.raw)} / ${fmtBytes(b.js.gzip)} gzip); other assets ${fmtBytes(b.otherAssetsRaw)}.`, '', '| chunk | raw | gzip |', '|---|---:|---:|');
    for (const c of b.chunks.slice(0, 10)) L.push(`| ${c.file} | ${fmtBytes(c.raw)} | ${fmtBytes(c.gzip)} |`);
  }
  if (res.profile) {
    L.push('', '## Hot spots (CPU profile pass, unminified build with source maps, self time over the whole scenario)', '',
      '"mock backend" is the in-browser MockBackend (src/api/mock*, lib/applyOps, lib/projectEq): the engine\'s work in the real app, not UI cost.', '');
    for (const [sc, v] of Object.entries(res.profile)) {
      if (!v?.hot?.functions?.length) continue;
      L.push(`**${sc}**: ${v.hot.busyMs} ms busy; ` + (v.hot.owners ?? []).map(x => `${x.name} ${x.selfMs}`).join(', '));
      L.push('', ...v.hot.functions.slice(0, 6).map(x => `- \`${x.name}\` ${x.selfMs} ms`), '');
    }
  }
  const errs = scenarioErrors(res);
  if (errs.length) L.push('', '## Scenario errors', '', ...errs.map(e => '- ' + e));
  const ce = [...new Set(res.runs.flatMap(r => r.console_errors ?? []))];
  if (ce.length) L.push('', '## Console errors', '', ...ce.slice(0, 10).map(e => '- `' + e.replace(/`/g, "'") + '`'));
  L.push('', '## Reading these numbers', '',
    '- "→ frame": from the start of the event\'s dispatch to the end of the first frame produced after it (handlers, store, effects, rAF canvas draw, style/layout/paint on the main thread; GPU raster is not included).',
    '- Drops and window toggles wait for the MockBackend reply; its cost (structured clones, op application of a ~1 MB project) is in those numbers and is the same before and after a UI-only change.',
    '- Headless shell with the real GPU through ANGLE; frame pacing is the headless compositor\'s, so "dropped frames" is indicative, and the zoom scenario drops frames with an idle main thread (compositor/GPU-bound in this setup).',
    '- Session heap includes the mock\'s undo stack (full project copies per edit).',
    '', 'Reproduce: `node perf/run.mjs --label <name>` from `ui/`; compare: `node perf/compare.mjs <base.json> <new.json>`.', '');
  return L.join('\n');
}
