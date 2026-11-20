# UI perf: baseline-solid1-noteEdit

2026-11-20 12:56 UTC · git `4452f37bd2` on `HEAD` · solid-js 1.9.18 · vite 8.3.8 · prod build
12th Gen Intel(R) Core(TM) i5-12400F (12 threads, 32 GiB) · Windows_NT 10.0.26300 x64 · Chromium 156.0.8078.4 headless shell · CPU throttle 1× · 1600×900 @1x
Large fixture: 40 tracks, 41 inserts / 169 effects, 1400 clips, 25 patterns (max 2000 notes), 970 KiB, fingerprint `1b751b48156386df`

3 whole-suite runs, each in a fresh browser; the value is the median of the runs, "spread" is (max − min) / median between runs (the noise floor).

Noise floor over all ms metrics ≥ 1 ms: median spread 13 %, p90 33 %. compare.mjs only flags changes above max(10 %, 1.5 × spread) and an absolute floor.

| scenario | ms | spread | runs |
|---|---:|---:|---|
| Delete 2000 selected notes: key → frame | 52.2 | 2 % | 52.2 / 51 / 52.3 |
| Delete 2000 notes: key → engine reply applied + frame | 52.85 | 2 % | 52.85 / 51.75 / 53.05 |
| undo of that Delete: key → engine reply applied + frame | 80.15 | 11 % | 79.7 / 88.45 / 80.15 |
| Shift+arrow nudge of 2000 notes: key → frame | 67.65 | 11 % | 61.85 / 69.4 / 67.65 |
| nudge: key → engine reply applied + frame | 91.75 | 18 % | 75.15 / 91.75 / 92 |
| nudge: script per key | 47.78 | 23 % | 40.04 / 50.97 / 47.78 |

## Leak checks (per open/close cycle, after forced GC)

| window | heap KiB/cycle | DOM nodes/cycle | listeners/cycle | detached nodes/cycle |
|---|---:|---:|---:|---:|

Session heap after GC: 24.55 MiB after boot → 48.73 MiB after all scenarios.

## Production bundle (shipped build, no perf hook)

Total JS+CSS+HTML: 1.73 MiB raw, 531.6 KiB gzip, 432.3 KiB brotli (JS 1.60 MiB / 505.5 KiB gzip); other assets 144.8 KiB.

| chunk | raw | gzip |
|---|---:|---:|
| assets/index.js | 1.45 MiB | 461.1 KiB |
| assets/index.css | 132.2 KiB | 25.2 KiB |
| assets/mock.js | 130.1 KiB | 40.3 KiB |
| assets/window.js | 12.9 KiB | 3.1 KiB |
| assets/webview.js | 3.2 KiB | 1.1 KiB |
| index.html | 1.6 KiB | 0.9 KiB |

## Hot spots (CPU profile pass, unminified build with source maps, self time over the whole scenario)

"mock backend" is the in-browser MockBackend (src/api/mock*, lib/applyOps, lib/projectEq): the engine's work in the real app, not UI cost.

**note_delete**: 1002.26 ms busy; mock backend 336.07, app 248.18, browser APIs 185.9, solid-js 184.27, gc 47.85

- `dto src/api/mock.ts:213` 209.87 ms
- `applyState solid-js/store/dist/store.js:336` 97.13 ms
- `applyAll src/lib/applyOps.ts:254` 82.62 ms
- `toDataURL` 58.03 ms
- `(garbage collector)` 47.85 ms
- `projectEq src/lib/projectEq.ts:10` 35.46 ms

**note_nudge**: 1860.93 ms busy; mock backend 678.4, app 494.11, solid-js 368.35, browser APIs 225.15, gc 94.91

- `applyAll src/lib/applyOps.ts:254` 277.02 ms
- `dto src/api/mock.ts:213` 260.25 ms
- `projectEq src/lib/projectEq.ts:10` 120.4 ms
- `applyState solid-js/store/dist/store.js:336` 119.42 ms
- `(garbage collector)` 94.91 ms
- `applyPatternOp src/lib/pattern.ts:119` 58.62 ms


## Reading these numbers

- "→ frame": from the start of the event's dispatch to the end of the first frame produced after it (handlers, store, effects, rAF canvas draw, style/layout/paint on the main thread; GPU raster is not included).
- Drops and window toggles wait for the MockBackend reply; its cost (structured clones, op application of a ~1 MB project) is in those numbers and is the same before and after a UI-only change.
- Headless shell with the real GPU through ANGLE; frame pacing is the headless compositor's, so "dropped frames" is indicative, and the zoom scenario drops frames with an idle main thread (compositor/GPU-bound in this setup).
- Session heap includes the mock's undo stack (full project copies per edit).

Reproduce: `node perf/run.mjs --label <name>` from `ui/`; compare: `node perf/compare.mjs <base.json> <new.json>`.
