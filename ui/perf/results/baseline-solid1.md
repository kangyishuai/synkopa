# UI perf: baseline-solid1

2026-11-20 09:23 UTC · git `825f275096` (+ uncommitted: M ui/vite.config.ts) on `solid2-migration` · solid-js 1.9.18 · vite 8.3.8 · prod build
12th Gen Intel(R) Core(TM) i5-12400F (12 threads, 32 GiB) · Windows_NT 10.0.26300 x64 · Chromium 156.0.8078.4 headless shell · CPU throttle 1× · 1600×900 @1x
Large fixture: 40 tracks, 41 inserts / 169 effects, 1400 clips, 25 patterns (max 2000 notes), 970 KiB, fingerprint `1b751b48156386df`

3 whole-suite runs, each in a fresh browser; the value is the median of the runs, "spread" is (max − min) / median between runs (the noise floor).

Noise floor over all ms metrics ≥ 1 ms: median spread 20 %, p90 76 %. compare.mjs only flags changes above max(10 %, 1.5 × spread) and an absolute floor.

| scenario | ms | spread | runs |
|---|---:|---:|---|
| boot to interactive (large), median | 613.4 | 5 % | 601.85 / 613.4 / 632.9 |
| boot to interactive (large), p95 | 733.1 | 22 % | 632.2 / 733.1 / 790.5 |
| boot to interactive (small), median | 463.8 | 29 % | 482.6 / 347.9 / 463.8 |
| replaceState, same project: sync | 8.25 | 4 % | 8.25 / 8.05 / 8.35 |
| replaceState, same project: to frame | 25.45 | 1 % | 25.35 / 25.55 / 25.45 |
| replaceState, one clip moved: to frame | 25.3 | 3 % | 24.85 / 25.3 / 25.65 |
| replaceState, other project (load): sync | 87.15 | 7 % | 82.75 / 87.15 / 89.25 |
| replaceState, other project (load): to frame | 183.3 | 16 % | 165.05 / 194.2 / 183.3 |
| clip drag: pointermove dispatch | 0.6 | 0 % | 0.6 / 0.6 / 0.6 |
| clip drag: pointermove → frame | 0.6 | 17 % | 0.6 / 0.7 / 0.6 |
| clip drag: pointermove → frame p95 | 11.7 | 8 % | 11.7 / 10.9 / 11.8 |
| clip drag: drop → engine reply applied + frame | 80.6 | 6 % | 85.1 / 80.6 / 80.5 |
| clip drag: script per move (drops included) | 3.42 | 9 % | 3.45 / 3.13 / 3.42 |
| note drag (2000 sel.): dispatch | 41 | 13 % | 41 / 38.35 / 43.8 |
| note drag (2000 sel.): move → frame | 41.05 | 13 % | 41.05 / 38.6 / 43.8 |
| note drag (2000 sel.): move → frame p95 | 51.3 | 17 % | 51.3 / 47.1 / 56 |
| note drag: drop → engine reply applied + frame | 79.35 | 15 % | 79.35 / 75.1 / 86.7 |
| note drag: script per move (drops included) | 31.37 | 12 % | 31.37 / 29.76 / 33.62 |
| mixer fader: move → frame | 6.3 | 16 % | 6.3 / 6.9 / 5.9 |
| mixer fader: move → frame p95 | 8.7 | 48 % | 8.7 / 12.1 / 7.9 |
| mixer fader: script per move (drops included) | 2.05 | 33 % | 1.99 / 2.67 / 2.05 |
| FX knob (window open): move → frame | 6.2 | 13 % | 6.1 / 6.2 / 6.9 |
| FX knob: move → frame p95 | 8.3 | 13 % | 8.2 / 8.3 / 9.3 |
| FX knob: script per move (drops included) | 2.99 | 20 % | 2.99 / 2.97 / 3.57 |
| playlist vertical scroll: scroll event → frame | 10.15 | 29 % | 9.45 / 12.35 / 10.15 |
| playlist horizontal scroll: scroll event → frame | 6.1 | 32 % | 7.5 / 5.55 / 6.1 |
| playlist vertical scroll: frame time p95 | 16.8 | 1 % | 16.7 / 16.8 / 16.8 |
| playlist Ctrl+wheel zoom: wheel → frame | 14.9 | 31 % | 19.45 / 14.8 / 14.9 |
| playlist zoom: wheel → frame p95 | 26.8 | 16 % | 26.8 / 26.5 / 30.9 |
| playlist zoom: dropped frames | 1740 count | 26 % | 1740 / 1393 / 1847 |
| Mixer show (F9) → frame | 47 | 63 % | 47 / 35.95 / 65.5 |
| Mixer hide (F9) → frame | 18.3 | 20 % | 18.2 / 18.3 / 21.85 |
| Piano roll open (F7, 2000 notes) → frame | 33.3 | 53 % | 33.3 / 24.7 / 42.25 |
| Piano roll close → frame | 21.75 | 11 % | 21.75 / 19.6 / 22.1 |
| EQ window open → frame | 22.8 | 4 % | 22.45 / 22.8 / 23.4 |
| EQ window close → frame | 10.75 | 9 % | 9.8 / 10.75 / 10.8 |
| playback: frame time median | 16.7 | 0 % | 16.7 / 16.7 / 16.7 |
| playback: frame time p95 | 16.8 | 1 % | 16.8 / 16.8 / 16.7 |
| playback: dropped frames (6 s) | 0 count | 0 % | 0 / 9 / 0 |
| playback: long tasks (6 s) | 0 count | 0 % | 0 / 0 / 0 |
| playback: script ms per second | 43.03 | 45 % | 31.49 / 50.73 / 43.03 |

## Leak checks (per open/close cycle, after forced GC)

| window | heap KiB/cycle | DOM nodes/cycle | listeners/cycle | detached nodes/cycle |
|---|---:|---:|---:|---:|
| mixer | 10 | 0 | 0 | 0 |
| pianoRoll | 10 | 0 | 0 | 0 |
| fxWindow | 10 | 0 | 0 | 0 |

Session heap after GC: 24.57 MiB after boot → 33.56 MiB after all scenarios.

## Production bundle (shipped build, no perf hook)

Total JS+CSS+HTML: 1.73 MiB raw, 531.6 KiB gzip, 432.1 KiB brotli (JS 1.60 MiB / 505.5 KiB gzip); other assets 144.8 KiB.

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

**replace_same**: 1393.9 ms busy; app 498.91, browser APIs 449.48, solid-js 344.71, gc 85.33, mock backend 15.48

- `applyState solid-js/store/dist/store.js:336` 282.29 ms
- `(anonymous)` 177.86 ms
- `rect` 97.13 ms
- `drawClip src/views/playlistDraw.ts:393` 89.46 ms
- `(garbage collector)` 85.33 ms
- `fill` 57.74 ms

**replace_oneClip**: 1266.24 ms busy; app 468.83, browser APIs 383.1, solid-js 328.74, gc 82.13, mock backend 3.43

- `applyState solid-js/store/dist/store.js:336` 274.92 ms
- `(anonymous)` 122.19 ms
- `drawClip src/views/playlistDraw.ts:393` 98.67 ms
- `rect` 91.49 ms
- `(garbage collector)` 82.13 ms
- `laneOverlaps src/lib/overlaps.ts:21` 43.13 ms

**replace_load**: 5679.68 ms busy; browser APIs 2134.55, solid-js 1453.23, app 1259.35, gc 805.14, mock backend 27.42

- `toDataURL` 831.55 ms
- `(garbage collector)` 805.14 ms
- `get ready` 414.09 ms
- `wrap$1 solid-js/store/dist/store.js:7` 323.3 ms
- `get solid-js/store/dist/store.js:97` 224.57 ms
- `readSignal solid-js/dist/solid.js:622` 217.41 ms

**clip_drag**: 1589.12 ms busy; mock backend 1022.48, app 273.74, browser APIs 149.11, gc 83.3, solid-js 60.49

- `applyAll src/lib/applyOps.ts:254` 684.94 ms
- `projectEq src/lib/projectEq.ts:10` 90.82 ms
- `(garbage collector)` 83.3 ms
- `dto src/api/mock.ts:213` 73.7 ms
- `beginGesture src/api/mock.ts:306` 69.75 ms
- `(anonymous) src/api/mock.ts:314` 55.81 ms

**note_drag**: 5214.19 ms busy; mock backend 1704.37, app 1373.33, solid-js 1126.95, browser APIs 570.46, gc 439.09

- `applyAll src/lib/applyOps.ts:254` 1090.57 ms
- `(garbage collector)` 439.09 ms
- `projectEq src/lib/projectEq.ts:10` 373.52 ms
- `get solid-js/store/dist/store.js:97` 266.87 ms
- `wrap$1 solid-js/store/dist/store.js:7` 195.69 ms
- `readSignal solid-js/dist/solid.js:622` 186.7 ms

**fader_drag**: 3729.11 ms busy; mock backend 3163.17, app 229.73, browser APIs 144.83, gc 124.54, solid-js 66.84

- `applyAll src/lib/applyOps.ts:254` 2239.71 ms
- `projectEq src/lib/projectEq.ts:10` 599.72 ms
- `(garbage collector)` 124.54 ms
- `(anonymous) src/lib/projectEq.ts:12` 114.96 ms
- `beginGesture src/api/mock.ts:306` 80.04 ms
- `draw src/views/Playlist.tsx:349` 74.87 ms

**fx_param**: 4668.83 ms busy; mock backend 3502.62, app 496.52, browser APIs 247.72, solid-js 227.79, gc 194.18

- `applyAll src/lib/applyOps.ts:254` 2455.4 ms
- `projectEq src/lib/projectEq.ts:10` 652.68 ms
- `(garbage collector)` 194.18 ms
- `draw src/views/Playlist.tsx:349` 127.44 ms
- `beginGesture src/api/mock.ts:306` 118.88 ms
- `(anonymous) src/lib/projectEq.ts:12` 102.61 ms

**nav_scrollV**: 269.25 ms busy; app 120.83, browser APIs 112.61, gc 20.95, mock backend 8.23, solid-js 6.64

- `drawClip src/views/playlistDraw.ts:393` 24.83 ms
- `(garbage collector)` 20.95 ms
- `draw src/views/Playlist.tsx:349` 19 ms
- `rect` 18.39 ms
- `fillText` 17.29 ms
- `fill` 12.77 ms

**nav_scrollH**: 449.73 ms busy; app 211.08, browser APIs 154.27, solid-js 30.93, gc 29.49, mock backend 23.96

- `rect` 54.41 ms
- `(garbage collector)` 29.49 ms
- `laneOverlaps src/lib/overlaps.ts:21` 29.01 ms
- `drawClip src/views/playlistDraw.ts:393` 26.25 ms
- `draw src/views/Playlist.tsx:349` 20.99 ms
- `tick src/api/mock.ts:449` 19.67 ms

**nav_zoom**: 847.96 ms busy; app 431.51, browser APIs 317.3, gc 70.87, mock backend 20.89, solid-js 7.38

- `rulerLabel src/ui/timeRuler.ts:26` 276.28 ms
- `requestAnimationFrame` 185.31 ms
- `(garbage collector)` 70.87 ms
- `rect` 60.71 ms
- `drawClip src/views/playlistDraw.ts:393` 24.35 ms
- `laneOverlaps src/lib/overlaps.ts:21` 16.49 ms

**win_mixer**: 1289.38 ms busy; solid-js 593.75, app 400.18, browser APIs 236.78, gc 58.07, mock backend 0.6

- `readSignal solid-js/dist/solid.js:622` 490.71 ms
- `(anonymous) src/views/Mixer.tsx:438` 304.76 ms
- `setProperty` 117.2 ms
- `(garbage collector)` 58.07 ms
- `remove` 40.32 ms
- `cleanNode solid-js/dist/solid.js:949` 40.11 ms

**win_pianoRoll**: 628.03 ms busy; app 267.28, browser APIs 167.87, solid-js 115.53, gc 76.2, mock backend 1.15

- `(garbage collector)` 76.2 ms
- `measure src/ui/ZoomScrollbar.tsx:35` 62.57 ms
- `getBoundingClientRect` 60.52 ms
- `draw src/views/Playlist.tsx:349` 39.97 ms
- `readSignal solid-js/dist/solid.js:622` 29.02 ms
- `vocalsUnder src/lib/melody.ts:61` 24.09 ms

**win_fxWindow**: 395.73 ms busy; app 185.74, browser APIs 148.3, solid-js 39.95, gc 18.45, mock backend 3.29

- `draw src/views/Playlist.tsx:349` 74.97 ms
- `getBoundingClientRect` 61.17 ms
- `(garbage collector)` 18.45 ms
- `replaceChild` 15.39 ms
- `refit src/views/Toolbar.tsx:59` 12.33 ms
- `getContext` 11.9 ms

**playback**: 499.46 ms busy; app 280.51, mock backend 109.51, solid-js 56.24, gc 29.18, browser APIs 24.02

- `follow src/views/Playlist.tsx:340` 112.21 ms
- `tick src/api/mock.ts:449` 47.97 ms
- `dto src/api/mock.ts:213` 34.17 ms
- `(anonymous) src/views/Toolbar.tsx:73` 30.16 ms
- `(garbage collector)` 29.18 ms
- `selectedInserts src/state/actions.ts:597` 23 ms


## Reading these numbers

- "→ frame": from the start of the event's dispatch to the end of the first frame produced after it (handlers, store, effects, rAF canvas draw, style/layout/paint on the main thread; GPU raster is not included).
- Drops and window toggles wait for the MockBackend reply; its cost (structured clones, op application of a ~1 MB project) is in those numbers and is the same before and after a UI-only change.
- Headless shell with the real GPU through ANGLE; frame pacing is the headless compositor's, so "dropped frames" is indicative, and the zoom scenario drops frames with an idle main thread (compositor/GPU-bound in this setup).
- Session heap includes the mock's undo stack (full project copies per edit).

Reproduce: `node perf/run.mjs --label <name>` from `ui/`; compare: `node perf/compare.mjs <base.json> <new.json>`.
