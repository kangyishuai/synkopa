# UI perf: solid2-stage1

2026-11-20 13:03 UTC · git `9194220919` on `solid2-migration` · solid-js 2.0.3 · vite 8.3.8 · prod build
12th Gen Intel(R) Core(TM) i5-12400F (12 threads, 32 GiB) · Windows_NT 10.0.26300 x64 · Chromium 156.0.8078.4 headless shell · CPU throttle 1× · 1600×900 @1x
Large fixture: 40 tracks, 41 inserts / 169 effects, 1400 clips, 25 patterns (max 2000 notes), 970 KiB, fingerprint `1b751b48156386df`

3 whole-suite runs, each in a fresh browser; the value is the median of the runs, "spread" is (max − min) / median between runs (the noise floor).

Noise floor over all ms metrics ≥ 1 ms: median spread 7 %, p90 35 %. compare.mjs only flags changes above max(10 %, 1.5 × spread) and an absolute floor.

| scenario | ms | spread | runs |
|---|---:|---:|---|
| boot to interactive (large), median | 489.4 | 10 % | 518.55 / 489.4 / 471.1 |
| boot to interactive (large), p95 | 560.2 | 15 % | 576.5 / 560.2 / 492.1 |
| boot to interactive (small), median | 304.9 | 5 % | 314.9 / 304.9 / 298.2 |
| replaceState, same project: sync | 4.9 | 9 % | 5.25 / 4.8 / 4.9 |
| replaceState, same project: to frame | 24.8 | 4 % | 25.3 / 24.25 / 24.8 |
| replaceState, one clip moved: to frame | 23.8 | 1 % | 23.8 / 24.1 / 23.8 |
| replaceState, other project (load): sync | 70.8 | 6 % | 74.4 / 70.8 / 70.3 |
| replaceState, other project (load): to frame | 144.85 | 11 % | 153.25 / 136.7 / 144.85 |
| clip drag: pointermove dispatch | 0.5 | 0 % | 0.5 / 0.5 / 0.5 |
| clip drag: pointermove → frame | 0.5 | 0 % | 0.5 / 0.5 / 0.5 |
| clip drag: pointermove → frame p95 | 9.2 | 4 % | 9.2 / 9.5 / 9.1 |
| clip drag: drop → engine reply applied + frame | 61.7 | 3 % | 61.7 / 61.1 / 62.9 |
| clip drag: script per move (drops included) | 2.56 | 4 % | 2.56 / 2.51 / 2.6 |
| note drag (2000 sel.): dispatch | 26.85 | 9 % | 26.85 / 29.35 / 26.8 |
| note drag (2000 sel.): move → frame | 26.85 | 9 % | 26.85 / 29.35 / 26.8 |
| note drag (2000 sel.): move → frame p95 | 39.7 | 6 % | 40.4 / 39.7 / 38.1 |
| note drag: drop → engine reply applied + frame | 65.65 | 2 % | 65.2 / 65.65 / 66.5 |
| note drag: script per move (drops included) | 21.15 | 5 % | 21.15 / 22.11 / 20.96 |
| Delete 2000 selected notes: key → frame | 53.65 | 10 % | 53.65 / 55.45 / 50.05 |
| Delete 2000 notes: key → engine reply applied + frame | 54.45 | 10 % | 54.45 / 56.25 / 50.75 |
| undo of that Delete: key → engine reply applied + frame | 80.85 | 27 % | 80.85 / 73.85 / 95.5 |
| Shift+arrow nudge of 2000 notes: key → frame | 66.1 | 5 % | 66.65 / 63.65 / 66.1 |
| nudge: key → engine reply applied + frame | 77.9 | 25 % | 77.9 / 67.2 / 86.65 |
| nudge: script per key | 38.35 | 9 % | 39.26 / 35.66 / 38.35 |
| mixer fader: move → frame | 5.5 | 5 % | 5.5 / 5.5 / 5.8 |
| mixer fader: move → frame p95 | 7.2 | 6 % | 7.2 / 6.9 / 7.3 |
| mixer fader: script per move (drops included) | 1.75 | 12 % | 1.75 / 1.68 / 1.89 |
| FX knob (window open): move → frame | 5.6 | 5 % | 5.6 / 5.7 / 5.4 |
| FX knob: move → frame p95 | 7 | 6 % | 7 / 7.1 / 6.7 |
| FX knob: script per move (drops included) | 2.58 | 2 % | 2.58 / 2.59 / 2.53 |
| playlist vertical scroll: scroll event → frame | 7.4 | 18 % | 8.7 / 7.4 / 7.35 |
| playlist horizontal scroll: scroll event → frame | 4.75 | 4 % | 4.75 / 4.9 / 4.7 |
| playlist vertical scroll: frame time p95 | 16.7 | 1 % | 16.7 / 16.7 / 16.8 |
| playlist Ctrl+wheel zoom: wheel → frame | 12.3 | 2 % | 12.3 / 12.3 / 12.1 |
| playlist zoom: wheel → frame p95 | 17.5 | 11 % | 17.1 / 17.5 / 19 |
| playlist zoom: dropped frames | 1809 count | 0 % | 1809 / 1804 / 1811 |
| Mixer show (F9) → frame | 33.5 | 7 % | 33.5 / 31.75 / 33.95 |
| Mixer hide (F9) → frame | 18.25 | 4 % | 17.65 / 18.25 / 18.4 |
| Piano roll open (F7, 2000 notes) → frame | 21.95 | 3 % | 21.95 / 21.85 / 22.4 |
| Piano roll close → frame | 12.2 | 1 % | 12.2 / 12.3 / 12.2 |
| EQ window open → frame | 22.1 | 3 % | 22.1 / 21.45 / 22.1 |
| EQ window close → frame | 11.8 | 3 % | 12 / 11.8 / 11.7 |
| playback: frame time median | 16.7 | 0 % | 16.7 / 16.7 / 16.7 |
| playback: frame time p95 | 16.8 | 1 % | 16.7 / 16.8 / 16.8 |
| playback: dropped frames (6 s) | 0 count | 0 % | 0 / 0 / 0 |
| playback: long tasks (6 s) | 0 count | 0 % | 0 / 0 / 0 |
| playback: script ms per second | 26.06 | 2 % | 26.06 / 26.26 / 25.76 |

## Leak checks (per open/close cycle, after forced GC)

| window | heap KiB/cycle | DOM nodes/cycle | listeners/cycle | detached nodes/cycle |
|---|---:|---:|---:|---:|
| mixer | 10 | 0 | 0 | 0 |
| pianoRoll | 10 | 0 | 0 | 0 |
| fxWindow | 10 | 0 | 0 | 0 |

Session heap after GC: 20.97 MiB after boot → 33.67 MiB after all scenarios.

## Production bundle (shipped build, no perf hook)

Total JS+CSS+HTML: 1.78 MiB raw, 554.0 KiB gzip, 451.6 KiB brotli (JS 1.65 MiB / 527.9 KiB gzip); other assets 144.8 KiB.

| chunk | raw | gzip |
|---|---:|---:|
| assets/index.js | 1.51 MiB | 483.5 KiB |
| assets/index.css | 132.2 KiB | 25.2 KiB |
| assets/mock.js | 130.1 KiB | 40.3 KiB |
| assets/window.js | 12.9 KiB | 3.1 KiB |
| assets/webview.js | 3.2 KiB | 1.1 KiB |
| index.html | 1.6 KiB | 0.9 KiB |

## Hot spots (CPU profile pass, unminified build with source maps, self time over the whole scenario)

"mock backend" is the in-browser MockBackend (src/api/mock*, lib/applyOps, lib/projectEq): the engine's work in the real app, not UI cost.

**replace_same**: 811.5 ms busy; app 478.11, browser APIs 283.36, gc 41.54, other 5.99, mock backend 2.5

- `same src/state/store.ts:246` 139.87 ms
- `(anonymous)` 106.59 ms
- `rect` 76.67 ms
- `drawClip src/views/playlistDraw.ts:393` 68.77 ms
- `(garbage collector)` 41.54 ms
- `fill` 39.05 ms

**replace_oneClip**: 809.18 ms busy; app 469.32, browser APIs 290.85, gc 38.87, other 9, mock backend 1.14

- `same src/state/store.ts:246` 123.11 ms
- `(anonymous)` 117.03 ms
- `rect` 74.5 ms
- `drawClip src/views/playlistDraw.ts:393` 58.13 ms
- `fill` 41.02 ms
- `(garbage collector)` 38.87 ms

**replace_load**: 2855.64 ms busy; browser APIs 1001.01, app 860.03, other 763.78, gc 195.09, mock backend 26.41, solid-js 9.32

- `toDataURL` 332.26 ms
- `get ready` 273.34 ms
- `(garbage collector)` 195.09 ms
- `own src/state/store.ts:204` 180.26 ms
- `read @solidjs/signals/dist/prod/core/core.js:947` 143.75 ms
- `(anonymous) src/views/Browser.tsx:209` 84.21 ms

**clip_drag**: 1334.98 ms busy; mock backend 841.92, app 276.06, browser APIs 125.58, gc 69.77, other 21.65

- `applyAll src/lib/applyOps.ts:254` 551.96 ms
- `projectEq src/lib/projectEq.ts:10` 73.99 ms
- `(garbage collector)` 69.77 ms
- `beginGesture src/api/mock.ts:306` 63.61 ms
- `dto src/api/mock.ts:213` 56.34 ms
- `(anonymous) src/api/mock.ts:314` 44.97 ms

**note_drag**: 3077.42 ms busy; mock backend 1346.45, app 740.07, other 504.28, browser APIs 294.91, gc 191.7

- `applyAll src/lib/applyOps.ts:254` 813.36 ms
- `projectEq src/lib/projectEq.ts:10` 317.23 ms
- `(garbage collector)` 191.7 ms
- `read @solidjs/signals/dist/prod/core/core.js:947` 136.92 ms
- `toDataURL` 100.71 ms
- `applyPatternOp src/lib/pattern.ts:119` 87.4 ms

**note_delete**: 914.22 ms busy; mock backend 319.13, app 306.39, browser APIs 183.62, other 62.51, gc 42.57

- `dto src/api/mock.ts:213` 212.09 ms
- `applyAll src/lib/applyOps.ts:254` 67.82 ms
- `same src/state/store.ts:246` 62.31 ms
- `toDataURL` 51.29 ms
- `(garbage collector)` 42.57 ms
- `projectEq src/lib/projectEq.ts:10` 33.46 ms

**note_nudge**: 1564.67 ms busy; mock backend 624.85, app 448.55, browser APIs 214.67, other 179.18, gc 97.43

- `applyAll src/lib/applyOps.ts:254` 260.71 ms
- `dto src/api/mock.ts:213` 234.37 ms
- `projectEq src/lib/projectEq.ts:10` 104.69 ms
- `(garbage collector)` 97.43 ms
- `same src/state/store.ts:246` 62.84 ms
- `rect` 53.66 ms

**fader_drag**: 3045.39 ms busy; mock backend 2635.1, app 178.07, browser APIs 105.61, gc 94.79, other 31.82

- `applyAll src/lib/applyOps.ts:254` 1872.73 ms
- `projectEq src/lib/projectEq.ts:10` 496.9 ms
- `(garbage collector)` 94.79 ms
- `(anonymous) src/lib/projectEq.ts:12` 74.48 ms
- `beginGesture src/api/mock.ts:306` 74.47 ms
- `dto src/api/mock.ts:213` 60.1 ms

**fx_param**: 3281.17 ms busy; mock backend 2669.68, app 291.79, gc 135.56, browser APIs 129.48, other 54.66

- `applyAll src/lib/applyOps.ts:254` 1887.44 ms
- `projectEq src/lib/projectEq.ts:10` 491.64 ms
- `(garbage collector)` 135.56 ms
- `(anonymous) src/lib/projectEq.ts:12` 87.88 ms
- `beginGesture src/api/mock.ts:306` 66.69 ms
- `dto src/api/mock.ts:213` 66.02 ms

**nav_scrollV**: 160.77 ms busy; app 78.74, browser APIs 61.71, gc 10.99, mock backend 6.38, other 2.96

- `rect` 18.53 ms
- `drawClip src/views/playlistDraw.ts:393` 17.35 ms
- `fill` 11.11 ms
- `(garbage collector)` 10.99 ms
- `laneOverlaps src/lib/overlaps.ts:21` 10.45 ms
- `draw src/views/Playlist.tsx:349` 10.19 ms

**nav_scrollH**: 237 ms busy; app 129.16, browser APIs 87.41, gc 9.72, other 7.31, mock backend 3.4

- `drawClip src/views/playlistDraw.ts:393` 24.55 ms
- `draw src/views/Playlist.tsx:349` 20.62 ms
- `rect` 19.67 ms
- `MessageChannel` 13.32 ms
- `laneOverlaps src/lib/overlaps.ts:21` 12.33 ms
- `(garbage collector)` 9.72 ms

**nav_zoom**: 600.9 ms busy; app 255.78, browser APIs 247.21, gc 40.58, mock backend 29.76, other 27.57

- `rect` 87.38 ms
- `drawClip src/views/playlistDraw.ts:393` 59.5 ms
- `fill` 50.17 ms
- `(garbage collector)` 40.58 ms
- `laneOverlaps src/lib/overlaps.ts:21` 30.81 ms
- `tick src/api/mock.ts:449` 26.23 ms

**win_mixer**: 607.86 ms busy; app 297.02, browser APIs 129.98, other 123.64, gc 53.89, solid-js 1.77, mock backend 1.56

- `(anonymous) src/views/Mixer.tsx:439` 206.14 ms
- `(garbage collector)` 53.89 ms
- `remove` 27.21 ms
- `cloneNode` 25.47 ms
- `setProperty` 19.14 ms
- `read @solidjs/signals/dist/prod/core/core.js:947` 18.05 ms

**win_pianoRoll**: 273.95 ms busy; app 97.66, other 74.32, browser APIs 73.57, gc 25.04, solid-js 2.26, mock backend 1.11

- `measure src/ui/ZoomScrollbar.tsx:36` 37.51 ms
- `getBoundingClientRect` 31.4 ms
- `(garbage collector)` 25.04 ms
- `read @solidjs/signals/dist/prod/core/core.js:947` 12.86 ms
- `clipOfPattern src/lib/patLoop.ts:29` 11.12 ms
- `get @solidjs/signals/dist/prod/store/store.js:1620` 10.68 ms

**win_fxWindow**: 192.71 ms busy; app 81.47, browser APIs 66.98, other 23.72, gc 16.5, mock backend 2.32, solid-js 1.72

- `draw src/views/Playlist.tsx:349` 35.22 ms
- `getBoundingClientRect` 28.44 ms
- `(garbage collector)` 16.5 ms
- `remove` 7.53 ms
- `cloneNode` 4.51 ms
- `drawImage` 4.49 ms

**playback**: 220.68 ms busy; app 131.75, mock backend 52.35, other 15.71, browser APIs 11.25, gc 9.62

- `follow src/views/Playlist.tsx:340` 71.1 ms
- `dto src/api/mock.ts:213` 24.95 ms
- `tick src/api/mock.ts:449` 15.74 ms
- `(anonymous) src/views/Toolbar.tsx:74` 12.79 ms
- `(garbage collector)` 9.62 ms
- `get @solidjs/signals/dist/prod/store/store.js:1620` 6.58 ms


## Reading these numbers

- "→ frame": from the start of the event's dispatch to the end of the first frame produced after it (handlers, store, effects, rAF canvas draw, style/layout/paint on the main thread; GPU raster is not included).
- Drops and window toggles wait for the MockBackend reply; its cost (structured clones, op application of a ~1 MB project) is in those numbers and is the same before and after a UI-only change.
- Headless shell with the real GPU through ANGLE; frame pacing is the headless compositor's, so "dropped frames" is indicative, and the zoom scenario drops frames with an idle main thread (compositor/GPU-bound in this setup).
- Session heap includes the mock's undo stack (full project copies per edit).

Reproduce: `node perf/run.mjs --label <name>` from `ui/`; compare: `node perf/compare.mjs <base.json> <new.json>`.
