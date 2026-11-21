# UI perf: baseline-solid1-dev

2026-11-20 09:33 UTC · git `825f275096` (+ uncommitted: M ui/vite.config.ts) on `solid2-migration` · solid-js 1.9.18 · vite 8.3.8 · dev build
12th Gen Intel(R) Core(TM) i5-12400F (12 threads, 32 GiB) · Windows_NT 10.0.26300 x64 · Chromium 156.0.8078.4 headless shell · CPU throttle 1× · 1600×900 @1x
Large fixture: 40 tracks, 41 inserts / 169 effects, 1400 clips, 25 patterns (max 2000 notes), 970 KiB, fingerprint `1b751b48156386df`

1 whole-suite runs, each in a fresh browser; the value is the median of the runs, "spread" is (max − min) / median between runs (the noise floor).

Noise floor over all ms metrics ≥ 1 ms: median spread 0 %, p90 0 %. compare.mjs only flags changes above max(10 %, 1.5 × spread) and an absolute floor.

| scenario | ms | spread | runs |
|---|---:|---:|---|
| boot to interactive (large), median | 981.8 | 0 % | 981.8 |
| boot to interactive (large), p95 | 1618.5 | 0 % | 1618.5 |
| boot to interactive (small), median | 660.9 | 0 % | 660.9 |
| replaceState, same project: sync | 8.4 | 0 % | 8.4 |
| replaceState, same project: to frame | 26.4 | 0 % | 26.4 |
| replaceState, one clip moved: to frame | 25.6 | 0 % | 25.6 |
| replaceState, other project (load): sync | 98.85 | 0 % | 98.85 |
| replaceState, other project (load): to frame | 217.2 | 0 % | 217.2 |
| clip drag: pointermove dispatch | 0.6 | 0 % | 0.6 |
| clip drag: pointermove → frame | 0.7 | 0 % | 0.7 |
| clip drag: pointermove → frame p95 | 12.1 | 0 % | 12.1 |
| clip drag: drop → engine reply applied + frame | 82.1 | 0 % | 82.1 |
| clip drag: script per move (drops included) | 3.5 | 0 % | 3.5 |
| note drag (2000 sel.): dispatch | 56.4 | 0 % | 56.4 |
| note drag (2000 sel.): move → frame | 56.4 | 0 % | 56.4 |
| note drag (2000 sel.): move → frame p95 | 72.7 | 0 % | 72.7 |
| note drag: drop → engine reply applied + frame | 89.15 | 0 % | 89.15 |
| note drag: script per move (drops included) | 43.51 | 0 % | 43.51 |
| mixer fader: move → frame | 7.6 | 0 % | 7.6 |
| mixer fader: move → frame p95 | 12.2 | 0 % | 12.2 |
| mixer fader: script per move (drops included) | 3.01 | 0 % | 3.01 |
| FX knob (window open): move → frame | 7.7 | 0 % | 7.7 |
| FX knob: move → frame p95 | 12.9 | 0 % | 12.9 |
| FX knob: script per move (drops included) | 5.07 | 0 % | 5.07 |
| playlist vertical scroll: scroll event → frame | 12.65 | 0 % | 12.65 |
| playlist horizontal scroll: scroll event → frame | 6.9 | 0 % | 6.9 |
| playlist vertical scroll: frame time p95 | 16.8 | 0 % | 16.8 |
| playlist Ctrl+wheel zoom: wheel → frame | 16.25 | 0 % | 16.25 |
| playlist zoom: wheel → frame p95 | 29.1 | 0 % | 29.1 |
| playlist zoom: dropped frames | 970 count | 0 % | 970 |
| Mixer show (F9) → frame | 67.95 | 0 % | 67.95 |
| Mixer hide (F9) → frame | 21.4 | 0 % | 21.4 |
| Piano roll open (F7, 2000 notes) → frame | 38.3 | 0 % | 38.3 |
| Piano roll close → frame | 28.25 | 0 % | 28.25 |
| EQ window open → frame | 21.25 | 0 % | 21.25 |
| EQ window close → frame | 19.15 | 0 % | 19.15 |
| playback: frame time median | 16.7 | 0 % | 16.7 |
| playback: frame time p95 | 16.7 | 0 % | 16.7 |
| playback: dropped frames (6 s) | 4 count | 0 % | 4 |
| playback: long tasks (6 s) | 0 count | 0 % | 0 |
| playback: script ms per second | 53.13 | 0 % | 53.13 |

## Leak checks (per open/close cycle, after forced GC)

| window | heap KiB/cycle | DOM nodes/cycle | listeners/cycle | detached nodes/cycle |
|---|---:|---:|---:|---:|
| mixer | 10 | 0 | 0 | 0 |
| pianoRoll | 20 | 0 | 0 | 0 |
| fxWindow | 10 | 0 | 0 | 0 |

Session heap after GC: 37.05 MiB after boot → 46.5 MiB after all scenarios.

## Reading these numbers

- "→ frame": from the start of the event's dispatch to the end of the first frame produced after it (handlers, store, effects, rAF canvas draw, style/layout/paint on the main thread; GPU raster is not included).
- Drops and window toggles wait for the MockBackend reply; its cost (structured clones, op application of a ~1 MB project) is in those numbers and is the same before and after a UI-only change.
- Headless shell with the real GPU through ANGLE; frame pacing is the headless compositor's, so "dropped frames" is indicative, and the zoom scenario drops frames with an idle main thread (compositor/GPU-bound in this setup).
- Session heap includes the mock's undo stack (full project copies per edit).

Reproduce: `node perf/run.mjs --label <name>` from `ui/`; compare: `node perf/compare.mjs <base.json> <new.json>`.
