// In-page instrumentation, installed with page.addInitScript before any app code runs.
// Plain browser JS (no imports). Everything lives on `window.__h`; nothing here touches app state.
(() => {
  if (window.__h) return;
  const now = () => performance.now();
  // after the next frame has been produced: rAF callbacks (the app's canvas draws) → style /
  // layout / paint → then this message task runs
  const afterFrame = () => new Promise(res => requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(now()); ch.port2.postMessage(0); }));
  // after the current task and its microtasks (an event's whole synchronous dispatch)
  const afterTask = () => new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(now()); ch.port2.postMessage(0); });

  const H = window.__h = {
    afterFrame, afterTask,
    // ---- frame sampler, long tasks, long animation frames ----
    rec: null,
    start(probeTypes = [], scrollTarget = null) {
      const r = H.rec = { frames: [], long: [], loaf: [], events: [], last: now(), on: true, types: new Set(probeTypes), scrollTarget };
      const loop = t => { if (!r.on) return; r.frames.push(t - r.last); r.last = t; requestAnimationFrame(loop); };
      requestAnimationFrame(t => { r.last = t; requestAnimationFrame(loop); });
    },
    /** The latest recorded event of a type (its task / frame fill in asynchronously). */
    last(type) { const e = H.rec?.events; if (!e) return null; for (let i = e.length - 1; i >= 0; i--) if (e[i].type === type) return e[i]; return null; },
    stop() {
      const r = H.rec; if (!r) return null;
      r.on = false; H.rec = null;
      return { frames: r.frames, long: r.long, loaf: r.loaf, events: r.events };
    },
    // ---- boot ----
    boot: { done: null, longTasks: [] },
  };

  try {
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) {
        if (H.rec?.on) H.rec.long.push(e.duration);
        if (H.boot.done == null) H.boot.longTasks.push(e.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver(l => {
      if (!H.rec?.on) return;
      for (const e of l.getEntries()) {
        const scripts = (e.scripts || []).map(s => ({ fn: s.sourceFunctionName || '', url: (s.sourceURL || '').split('/').pop(), inv: s.invoker || '', ms: s.duration }));
        H.rec.loaf.push({ ms: e.duration, blocking: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, scripts });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* unsupported */ }

  // ---- per-event cost of real input: registered on window in the capture phase before any app
  // listener, so t0 is the start of the event's dispatch. `task`: the dispatch with every handler,
  // store update and synchronous effect; `frame`: until the frame after it has been produced
  // (work an app defers to its rAF loop, plus style / layout / paint). `delay`: queueing before
  // dispatch (event.timeStamp → t0).
  // Only trusted (real) input counts: the harness's own synthetic hit-testing events are ignored.
  for (const type of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'scroll']) {
    window.addEventListener(type, e => {
      const r = H.rec; if (!r?.on || !r.types.has(type) || !e.isTrusted) return;
      if (type === 'scroll' && r.scrollTarget && e.target !== r.scrollTarget()) return;
      const t0 = now(), rec = { type, t0, delay: Math.max(0, t0 - e.timeStamp), task: 0, frame: 0 };
      r.events.push(rec);
      afterTask().then(t => { rec.task = t - t0; });
      afterFrame().then(t => { rec.frame = t - t0; });
    }, { capture: true, passive: true });
  }

  // ---- boot: the playlist grid is on screen and a frame with it has been produced ----
  const watch = () => {
    if (document.querySelector('canvas.gridCanvas') && !document.querySelector('#root > .boot')) {
      afterFrame().then(t => { H.boot.done = t; });
      return;
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
})();
