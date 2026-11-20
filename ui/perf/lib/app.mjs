// The scenarios. Everything that knows about the app lives here. Input is real (Playwright mouse /
// keyboard through CDP: browser hit-testing → the app's handlers → store → effects → canvas draw).
// `window.__perf` (src/perfHook.ts) is used to READ state (where a clip is, whether a drag changed
// it), for setup that has no single gesture (which pattern is current, opening an effect window by
// id) and for the engine → UI state push, which has no gesture at all. It never writes the UI
// stores directly, so the harness runs unchanged when the store API changes (Solid 2 drops path
// setters): only the names it reads (S, U, A, P, geom, be, replaceState) must survive.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORT } from './browser.mjs';
import { dist, frameStats, median, r2, sum } from './stats.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROBE = readFileSync(join(here, 'probe.js'), 'utf8');
const MiB = 1 / 1048576;
// modules only the in-browser MockBackend uses (the engine's work in the real app): their time is
// part of every number that waits for the "engine" reply, but not UI cost
const MOCK_SOURCES = /^src\/(api\/mock|lib\/applyOps\.ts|lib\/projectEq\.ts)/;

// dist() results into a flat metric map
function put(m, units, prefix, d, unit = 'ms') {
  for (const k of ['median', 'p95', 'max']) if (d[k] != null) { m[`${prefix}.${k}`] = d[k]; units[`${prefix}.${k}`] = unit; }
}

export class App {
  constructor(browser, { throttle = 1, profile = false, maps = null, log = () => {} }) {
    this.browser = browser; this.throttle = throttle; this.profiling = profile; this.maps = maps; this.log = log;
    this.errors = [];
  }

  // ---------------------------------------------------------------- pages
  async newPage(fixture) {
    const ctx = await this.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // a fresh profile: no welcome / what's-new dialog, no background update download in the mock
    await page.addInitScript(() => { try { localStorage.setItem('wave.mock.seen', '999.0.0'); localStorage.setItem('wave.mock.noauto', '1'); } catch { /* */ } });
    await page.addInitScript(p => { window.__waveFixture = p; }, fixture);
    await page.addInitScript(PROBE);
    page.on('console', m => { if (m.type() === 'error') this.errors.push(m.text().slice(0, 240)); });
    page.on('pageerror', e => this.errors.push('pageerror: ' + String(e).slice(0, 240)));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (this.throttle !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: this.throttle });
    return { ctx, page, cdp };
  }

  async waitBoot(page) {
    await page.waitForFunction(() => window.__h?.boot.done != null, null, { timeout: 120000 });
  }

  async bootSeries(url, fixture, warm, n) {
    const s = { boot: [], longTasks: [], longTaskMs: [], heapMiB: [], nodes: [], script: [] };
    for (let i = 0; i < warm + n; i++) {
      const { ctx, page, cdp } = await this.newPage(fixture);
      await page.goto(url, { waitUntil: 'load' });
      await this.waitBoot(page);
      const b = await page.evaluate(() => ({ done: window.__h.boot.done, long: window.__h.boot.longTasks }));
      const m = await metrics(cdp);
      if (i >= warm) {
        s.boot.push(b.done); s.longTasks.push(b.long.length); s.longTaskMs.push(sum(b.long));
        s.heapMiB.push(m.JSHeapUsedSize * MiB); s.nodes.push(m.Nodes); s.script.push(m.ScriptDuration * 1000);
      }
      await ctx.close();
    }
    const out = { metrics: {}, units: {} };
    put(out.metrics, out.units, 'toInteractive', dist(s.boot));
    put(out.metrics, out.units, 'scriptMs', dist(s.script));
    out.metrics['longTasks.median'] = median(s.longTasks); out.units['longTasks.median'] = 'count';
    out.metrics['longTaskMs.median'] = r2(median(s.longTaskMs));
    out.metrics['heapMiB.median'] = r2(median(s.heapMiB)); out.units['heapMiB.median'] = 'MiB';
    out.metrics['domNodes.median'] = median(s.nodes); out.units['domNodes.median'] = 'count';
    this.log(`boot: ${out.metrics['toInteractive.median']} ms median of ${n}`);
    return out;
  }

  async open(url, fixture) {
    const { ctx, page, cdp } = await this.newPage(fixture);
    Object.assign(this, { ctx, page, cdp });
    await page.goto(url, { waitUntil: 'load' });
    await this.waitBoot(page);
    await page.waitForFunction(() => window.__perf?.S?.ready, null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const st = await this.ev(() => {
      const gl = document.createElement('canvas').getContext('webgl'), x = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return { clips: window.__perf.S.project.clips.length, dialog: !!document.querySelector('[role=dialog]'), webglRenderer: x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : null };
    });
    if (st.dialog) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    if (this.profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); }
    this.webglRenderer = st.webglRenderer;
    this.log(`session open: ${st.clips} clips, renderer ${st.webglRenderer}`);
  }

  ev(f, a) { return this.page.evaluate(f, a); }
  frame() { return this.page.evaluate(() => window.__h.afterFrame()); }
  async frames(n) { for (let i = 0; i < n; i++) await this.frame(); }
  async gc() { await this.cdp.send('HeapProfiler.collectGarbage'); await this.cdp.send('HeapProfiler.collectGarbage'); }

  /** Heap and DOM counters after a forced GC: what the page retains. */
  async counters() {
    await this.frames(2);
    await this.gc();
    const heap = await this.cdp.send('Runtime.getHeapUsage');
    let leak = {}, dom = {}, detached = null;
    try { leak = Object.fromEntries((await this.cdp.send('Memory.getDOMCountersForLeakDetection')).counters.map(c => [c.name, c.count])); } catch { /* older Chromium */ }
    try { dom = await this.cdp.send('Memory.getDOMCounters'); } catch { /* */ }
    try { detached = (await this.cdp.send('DOM.getDetachedDomNodes')).detachedNodes.length; } catch { /* not in this Chromium */ }
    const metrics = {
      heapAfterGcMiB: r2(heap.usedSize * MiB), domNodes: leak.live_nodes ?? dom.nodes ?? null, jsEventListeners: dom.jsEventListeners ?? null,
      documents: leak.live_documents ?? dom.documents ?? null, detachedNodes: detached,
    };
    const units = { heapAfterGcMiB: 'MiB', domNodes: 'count', jsEventListeners: 'count', documents: 'count', detachedNodes: 'count' };
    return { metrics, units };
  }

  /**
   * One measured scenario: `body` runs with the frame sampler, long-task observers and the
   * per-event probes for `types` on; `primary` names the event type the per-interaction numbers are
   * about. `body` may return { samples: {name: number[]}, values: {name: {v, unit}}, interactions, extra }.
   */
  async measure(name, types, primary, body, { scrollPlaylist = false } = {}) {
    await this.page.waitForTimeout(150);
    await this.gc();
    const m0 = await metrics(this.cdp);
    if (this.profiling) await this.cdp.send('Profiler.start');
    await this.ev(({ t, sp }) => { window.__h.start(t); if (sp) window.__h.rec.scrollTarget = () => window.__perf.geom.scroll; }, { t: types, sp: scrollPlaylist });
    const t0 = Date.now();
    let ret = {};
    try { ret = (await body()) ?? {}; } catch (e) { ret = { error: String(e).slice(0, 400) }; this.log(`${name}: ERROR ${ret.error}`); }
    await this.frames(2); // the last events' frame probes resolve
    const rec = await this.ev(() => window.__h.stop());
    const wall = Date.now() - t0;
    const hot = this.profiling ? topSelf((await this.cdp.send('Profiler.stop')).profile, this.maps) : undefined;
    const m1 = await metrics(this.cdp);
    const d = k => (m1[k] - m0[k]) * 1000;

    const M = {}, U = {};
    const fs = frameStats(rec.frames);
    put(M, U, 'frame', fs);
    M['frames.dropped'] = fs.dropped; U['frames.dropped'] = 'count';
    M['longTasks'] = rec.long.length; U['longTasks'] = 'count';
    M['longTaskMs'] = r2(sum(rec.long));
    M['loaf'] = rec.loaf.length; U['loaf'] = 'count';
    for (const type of types) {
      const evs = rec.events.filter(e => e.type === type);
      if (!evs.length || type === 'keydown') continue;
      put(M, U, `${type}.task`, dist(evs.map(e => e.task)));
      put(M, U, `${type}.frame`, dist(evs.map(e => e.frame)));
      M[`${type}.count`] = evs.length; U[`${type}.count`] = 'count';
    }
    const nInteractions = ret.interactions ?? rec.events.filter(e => e.type === primary).length;
    M['scriptMs'] = r2(d('ScriptDuration')); M['layoutMs'] = r2(d('LayoutDuration')); M['styleMs'] = r2(d('RecalcStyleDuration')); M['taskMs'] = r2(d('TaskDuration'));
    if (nInteractions) M['scriptMsPerInteraction'] = r2(d('ScriptDuration') / nInteractions);
    if (ret.perSecond) M['scriptMsPerSecond'] = r2(d('ScriptDuration') / (wall / 1000));
    M['heapMiB'] = r2(m1.JSHeapUsedSize * MiB); U['heapMiB'] = 'MiB';
    for (const [k, xs] of Object.entries(ret.samples ?? {})) put(M, U, k, dist(xs));
    for (const [k, v] of Object.entries(ret.values ?? {})) { M[k] = v.v; U[k] = v.unit; }
    const ln = primary && M[`${primary}.task.median`] != null ? `${primary}: task ${M[`${primary}.task.median`]} / frame ${M[`${primary}.frame.median`]} ms median (${M[`${primary}.count`]}), ` : '';
    this.log(`${name}: ${ln}frames p95 ${M['frame.p95']} ms, long tasks ${M.longTasks}, script ${M.scriptMs} ms${ret.error ? ' ERROR ' + ret.error : ''}`);
    return { metrics: M, units: U, extra: ret.extra, error: ret.error, hot };
  }

  async undo() { await this.page.keyboard.press('Control+z'); await this.page.waitForTimeout(200); }
  async undoN(n) { for (let i = 0; i < n; i++) await this.undo(); }

  // ---------------------------------------------------------------- engine → UI state
  async replaceScenarios(small, warm, n, warmLoad, nLoad) {
    // the DTO the engine pushes, as fresh JSON every time (what a Tauri event delivers)
    const bytes = await this.ev(async smallProject => {
      const dto = await window.__perf.be().getState();
      window.__dtoText = JSON.stringify(dto);
      window.__smallText = JSON.stringify({ ...dto, project: smallProject });
      return window.__dtoText.length;
    }, small);
    const variant = (kind, w, k) => this.measure(`replace_${kind}`, [], null, () => this.ev(async ({ kind, w, k }) => {
      const P = window.__perf, H = window.__h;
      const parse = [], sync = [], frame = [];
      let rev = P.S.revision + 1;
      for (let i = 0; i < w + k; i++) {
        if (kind === 'load') { // a different project comes in (open / revert): small → large
          const s = JSON.parse(window.__smallText); s.revision = rev++; P.replaceState(s); await H.afterFrame(); await H.afterFrame();
        }
        const a = performance.now();
        const dto = JSON.parse(window.__dtoText);
        const b = performance.now();
        dto.revision = rev++;
        if (kind === 'oneClip') dto.project.clips[100].start += (i % 2 ? -1 : 1) * 0.25 * (1 + (i % 4));
        P.replaceState(dto);
        const c = performance.now();
        const d = await H.afterFrame();
        if (i >= w) { parse.push(b - a); sync.push(c - b); frame.push(d - b); }
        await H.afterFrame();
      }
      // leave the store on the engine's project
      const dto = JSON.parse(window.__dtoText); dto.revision = rev++; P.replaceState(dto); await H.afterFrame();
      return { samples: { parse, replaceSync: sync, replaceToFrame: frame }, interactions: k };
    }, { kind, w, k }));
    const out = {};
    out.replace_same = await variant('same', warm, n);
    out.replace_oneClip = await variant('oneClip', warm, n);
    out.replace_load = await variant('load', warmLoad, nLoad);
    for (const v of Object.values(out)) { v.metrics.stateKiB = Math.round(bytes / 1024); v.units.stateKiB = 'KiB'; }
    await this.ev(() => { delete window.__dtoText; delete window.__smallText; }); // not part of the app's heap
    return out;
  }

  /**
   * `drags` real mouse drags of `moves` pointermoves each, the direction alternating so the object
   * stays near where it started. Per drop: the pointerup dispatch (`drop.task`) and the time until
   * the engine's reply (the mock's state event) has been applied and a frame produced (`drop.settled`).
   */
  async dragSeries({ grab, step, drags, moves, before }) {
    const m = this.page.mouse;
    const dropTask = [], dropSettled = [];
    let timeouts = 0;
    for (let d = 0; d < drags; d++) {
      if (before) await before(d);
      const g = await grab(d);
      if (!g) throw new Error(`nothing to grab for drag ${d + 1}`);
      await m.move(g.x, g.y); await this.frame();
      await m.down(); await this.frame();
      const dir = d % 2 ? -1 : 1;
      for (let i = 1; i <= moves; i++) { const s = step(i); await m.move(g.x + dir * s.dx, g.y + s.dy); await this.frame(); }
      const rev = await this.ev(() => window.__perf.S.revision);
      await m.up();
      const r = await this.ev(async rev => {
        const H = window.__h, S = window.__perf.S, up = H.last('pointerup');
        let t = await H.afterFrame(), n = 0;
        while (S.revision <= rev && n++ < 90) t = await H.afterFrame();
        return { task: up?.task ?? null, settled: up ? t - up.t0 : null, timedOut: S.revision <= rev };
      }, rev);
      if (r.task != null) dropTask.push(r.task);
      if (r.settled != null && !r.timedOut) dropSettled.push(r.settled);
      if (r.timedOut) timeouts++;
    }
    return { samples: { 'drop.task': dropTask, 'drop.settled': dropSettled }, values: { 'drop.timeouts': { v: timeouts, unit: 'count' } } };
  }

  /** A measured drag scenario: one warm-up drag (undone), `drags` measured drags (undone after). */
  async dragScenario(name, { grab, step, warmMoves, drags, moves, before, check }) {
    await this.dragSeries({ grab, step, drags: 1, moves: warmMoves, before }); await this.undo();
    const s0 = check ? await check() : null;
    const r = await this.measure(name, ['pointermove', 'pointerup'], 'pointermove', async () => {
      const first = await this.dragSeries({ grab, step, drags: 1, moves, before });
      const s1 = check ? await check() : null;
      const rest = drags > 1 ? await this.dragSeries({ grab, step, drags: drags - 1, moves, before }) : null;
      if (rest) { for (const k of Object.keys(first.samples)) first.samples[k].push(...rest.samples[k]); first.values['drop.timeouts'].v += rest.values['drop.timeouts'].v; }
      return { ...first, extra: { changedByFirstDrag: check ? diffCount(s0, s1) : null } };
    });
    await this.undoN(drags);
    return r;
  }

  // ---------------------------------------------------------------- playlist: optimistic clip move
  async clipDrag(warmMoves, drags, moves) {
    const id = await this.ev(async () => {
      const { S, U, geom } = window.__perf;
      // a clip nothing else covers around its head, so the press lands on it whichever is drawn on top
      const c = S.project.clips.find(c => c.kind === 'audio' && c.track >= 2 && c.track <= 8 && c.len * U.bw > 160 && c.start > 24 &&
        !S.project.clips.some(o => o !== c && o.track === c.track && o.start < c.start + 12 && o.start + o.len > c.start - 8));
      geom.scroll.scrollLeft = Math.max(0, c.start * U.bw - 400); geom.scroll.scrollTop = Math.max(0, geom.tops[c.track] - 60);
      await window.__h.afterFrame(); await window.__h.afterFrame();
      return c.id;
    });
    const r = await this.dragScenario('clip_drag', {
      warmMoves, drags, moves,
      grab: () => this.ev(id => {
        const { S, U, geom } = window.__perf, c = S.project.clips.find(x => x.id === id), r = geom.grid.getBoundingClientRect();
        return { x: r.left + c.start * U.bw + 30, y: r.top + geom.tops[c.track] + 28 };
      }, id),
      step: i => ({ dx: i * 3, dy: Math.round(Math.sin(i / 8) * 8) }),
      check: () => this.ev(id => { const c = window.__perf.S.project.clips.find(x => x.id === id); return [c.start + ':' + c.track]; }, id),
    });
    if (!(r.extra?.changedByFirstDrag > 0)) r.error = (r.error ?? '') + ' the clip did not move: the drag missed it';
    return r;
  }

  // ---------------------------------------------------------------- piano roll: drag 2000 selected notes
  async noteDrag(warmMoves, drags, moves) {
    const info = await this.ev(async () => {
      const { S, P } = window.__perf;
      const pt = S.project.patterns.reduce((a, p) => (p.notes.length > a.notes.length ? p : a));
      P.setCurPattern(pt.id, true); P.openRoll(pt.notes[0].ch);
      for (let i = 0; i < 4; i++) await window.__h.afterFrame();
      return { id: pt.id, notes: pt.notes.length };
    });
    const r = await this.dragScenario('note_drag', {
      warmMoves, drags, moves,
      // the roll takes keys while it has focus (a click on its grid would write a note): focus it,
      // then select every note of the channel with Ctrl+A
      before: async () => { await this.page.focus('.rollwin'); await this.page.keyboard.press('Control+a'); await this.frame(); },
      // a note under the pointer: the roll's own hover cursor tells when the pointer is over one
      grab: () => this.ev(() => {
        const cv = [...document.querySelectorAll('.rollwin canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
        const r = cv.getBoundingClientRect();
        for (let y = r.top + 60; y < r.bottom - 60; y += 3) for (let x = r.left + 200; x < r.left + Math.min(r.width - 200, 900); x += 4) {
          cv.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, buttons: 0, pointerType: 'mouse' }));
          if (/grab|move/.test(cv.style.cursor)) return { x: x + 2, y };
        }
        return null;
      }),
      step: i => ({ dx: i * 4, dy: Math.round(Math.sin(i / 6) * 12) }),
      check: () => this.ev(id => window.__perf.S.project.patterns.find(p => p.id === id).notes.map(x => x.step + ':' + x.p), info.id),
    });
    await this.ev(() => window.__perf.P.closeRoll()); await this.frames(2);
    r.extra = { ...r.extra, notes: info.notes };
    if (!(r.extra?.changedByFirstDrag > info.notes / 2)) r.error = (r.error ?? '') + ` only ${r.extra?.changedByFirstDrag} of ${info.notes} notes moved: the selection did not take`;
    return r;
  }

  // ---------------------------------------------------------------- mixer fader
  async faderDrag(warmMoves, drags, moves) {
    if ((await this.page.$$('.strip .fader .cap')).length < 4) return { metrics: {}, units: {}, error: 'mixer faders not found' };
    const r = await this.dragScenario('fader_drag', {
      warmMoves, drags, moves,
      grab: async () => { const b = await (await this.page.$$('.strip .fader .cap'))[3].boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; },
      step: i => ({ dx: 0, dy: -Math.round(Math.sin(i / 10) * 50) }),
      check: () => this.ev(() => window.__perf.S.project.inserts.map(m => String(m.vol))),
    });
    if (!(r.extra?.changedByFirstDrag > 0)) r.error = (r.error ?? '') + ' no insert volume changed';
    return r;
  }

  // ---------------------------------------------------------------- effect window: knob drag
  async fxParamDrag(warmMoves, drags, moves) {
    const fxId = await this.ev(() => window.__perf.S.project.inserts.slice(1).flatMap(m => m.fx).filter(f => f.type === 'comp')[3].id);
    await this.ev(id => window.__perf.A.openPlug(id), fxId); await this.frames(4);
    const sel = `[data-fxwin="${fxId}"] .knob .dial`;
    if (!(await this.page.$(sel))) return { metrics: {}, units: {}, error: 'effect window knob not found' };
    const r = await this.dragScenario('fx_param', {
      warmMoves, drags, moves,
      grab: async () => { const b = await (await this.page.$(sel)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; },
      step: i => ({ dx: 0, dy: -Math.round(Math.sin(i / 10) * 45) }),
      check: () => this.ev(id => Object.values(window.__perf.S.project.inserts.flatMap(m => m.fx).find(f => f.id === id).params).map(String), fxId),
    });
    await this.ev(id => window.__perf.A.closePlug(id), fxId); await this.frames(2);
    if (!(r.extra?.changedByFirstDrag > 0)) r.error = (r.error ?? '') + ' the parameter did not change';
    return r;
  }

  // ---------------------------------------------------------------- playlist zoom / scroll
  async playlistNav(warm, n) {
    const p = await this.ev(async () => { const { geom } = window.__perf; geom.scroll.scrollLeft = 0; geom.scroll.scrollTop = 0; await window.__h.afterFrame(); const r = geom.scroll.getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.5 }; });
    const m = this.page.mouse, kb = this.page.keyboard;
    await m.move(p.x, p.y); await this.frames(2);
    const wheels = async (k, dy) => { for (let i = 0; i < k; i++) { await m.wheel(0, i < k / 2 ? dy : -dy); await this.frame(); } };
    const out = {};
    await wheels(warm, 120);
    // native scrolling: the cost is in the playlist's scroll handler and the redraw of the frame it lands in
    out.nav_scrollV = await this.measure('nav_scrollV', ['wheel', 'scroll'], 'scroll', () => wheels(n, 120), { scrollPlaylist: true });
    await kb.down('Shift'); await wheels(warm, 120);
    out.nav_scrollH = await this.measure('nav_scrollH', ['wheel', 'scroll'], 'scroll', () => wheels(n, 120), { scrollPlaylist: true });
    await kb.up('Shift');
    // Ctrl+wheel: the app's own zoom around the pointer (in the wheel handler)
    await kb.down('Control'); await wheels(warm, -100);
    out.nav_zoom = await this.measure('nav_zoom', ['wheel', 'scroll'], 'wheel', () => wheels(n, -100), { scrollPlaylist: true });
    await kb.up('Control');
    return out;
  }

  // ---------------------------------------------------------------- windows: open / close latency and leaks
  async windowCycles(warm, n) {
    const out = {};
    const kb = this.page.keyboard;
    await this.ev(() => { const { S, P } = window.__perf; const pt = S.project.patterns.reduce((a, p) => (p.notes.length > a.notes.length ? p : a)); P.setCurPattern(pt.id, true); });
    const eqId = await this.ev(() => window.__perf.S.project.inserts.slice(1).flatMap(m => m.fx).filter(f => f.type === 'eq')[2].id);
    const kinds = {
      // F9: the docked Mixer hides and comes back (41 strips, meters)
      mixer: { key: 'F9', sel: '.strip', startsOpen: true },
      // F7: the Piano roll on the 2000-note pattern
      pianoRoll: { key: 'F7', sel: '.rollwin', startsOpen: false },
      // an EQ window (canvas curve, analyser): opened from code (a double-click on the mixer slot in the app)
      fxWindow: { fx: eqId, sel: `[data-fxwin="${eqId}"]`, startsOpen: false },
    };
    for (const [name, k] of Object.entries(kinds)) {
      const isOpen = () => this.ev(sel => !!document.querySelector(sel), k.sel);
      if ((await isOpen()) !== k.startsOpen) this.log(`${name}: unexpected start state`);
      // a half cycle: from the gesture to the first produced frame that shows the result
      const half = async want => {
        if (k.key) {
          await kb.press(k.key);
          return this.ev(async ({ sel, want }) => {
            const H = window.__h, e = H.last('keydown');
            if (!e) return null;
            if (!!document.querySelector(sel) === want && e.frame) return e.frame; // shown in the first frame after the key
            let t = 0;
            for (let i = 0; i < 120 && !!document.querySelector(sel) !== want; i++) t = await H.afterFrame();
            if (!t) t = await H.afterFrame();
            return t - e.t0;
          }, { sel: k.sel, want });
        }
        return this.ev(async ({ id, sel, want }) => {
          const H = window.__h, A = window.__perf.A, t0 = performance.now();
          if (want) A.openPlug(id); else A.closePlug(id);
          let t = await H.afterFrame();
          for (let i = 0; i < 120 && !!document.querySelector(sel) !== want; i++) t = await H.afterFrame();
          return t - t0;
        }, { id: k.fx, sel: k.sel, want });
      };
      const cycle = async () => {
        const a = await half(!k.startsOpen), b = await half(k.startsOpen);
        await this.frame();
        return k.startsOpen ? { open: b, close: a } : { open: a, close: b };
      };
      await this.ev(() => window.__h.start(['keydown']));
      for (let i = 0; i < warm; i++) await cycle();
      await this.ev(() => window.__h.stop());
      const c0 = await this.counters();
      const r = await this.measure(`win_${name}`, ['keydown'], null, async () => {
        const open = [], close = [];
        let ok = 0;
        for (let i = 0; i < n; i++) {
          const c = await cycle();
          if (c.open != null) open.push(c.open);
          if (c.close != null) close.push(c.close);
          if ((await isOpen()) === k.startsOpen) ok++;
        }
        return { samples: { open, close }, interactions: 2 * n, extra: { cycles: n, cyclesBackInStartState: ok } };
      });
      const c1 = await this.counters();
      for (const key of ['heapAfterGcMiB', 'domNodes', 'jsEventListeners', 'detachedNodes']) {
        if (c0.metrics[key] == null || c1.metrics[key] == null) continue;
        r.metrics[`leak.${key}.perCycle`] = r2((c1.metrics[key] - c0.metrics[key]) / n);
        r.units[`leak.${key}.perCycle`] = key === 'heapAfterGcMiB' ? 'MiB' : 'count';
      }
      r.extra = { ...r.extra, before: c0.metrics, after: c1.metrics };
      if (r.extra.cyclesBackInStartState !== n) r.error = `${n - (r.extra.cyclesBackInStartState ?? 0)} of ${n} cycles did not toggle the window`;
      out[`win_${name}`] = r;
    }
    return out;
  }

  // ---------------------------------------------------------------- playback: playhead, meters
  async playback(ms) {
    await this.ev(() => { window.__perf.A.seek(0); });
    await this.frames(3);
    const r = await this.measure('playback', [], null, async () => {
      await this.ev(() => window.__perf.A.togglePlay());
      await this.page.waitForTimeout(ms);
      const st = await this.ev(() => ({ playing: !!window.__perf.U.playing }));
      await this.ev(() => window.__perf.A.togglePlay());
      return { perSecond: true, extra: st };
    });
    if (!r.extra?.playing) r.error = 'the transport was not playing';
    return r;
  }
}

function diffCount(a, b) { if (!a || !b) return null; let n = 0; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++; return n; }

async function metrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const o = {}; for (const m of metrics) o[m.name] = m.value; return o;
}

/**
 * Self time per function, per source file and per owner (app / solid-js / mock backend / browser),
 * from a CPU profile; locations are mapped to the original sources when source maps are given.
 */
function topSelf(profile, maps, n = 15) {
  const byId = new Map(profile.nodes.map(x => [x.id, x]));
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)));
  const fn = new Map(), file = new Map(), owner = new Map();
  const add = (m, k, us) => m.set(k, (m.get(k) || 0) + us);
  let total = 0;
  for (const [id, us] of self) {
    const cf = byId.get(id).callFrame;
    if (cf.functionName === '(idle)' || cf.functionName === '(program)' || cf.functionName === '(root)') continue;
    total += us;
    const url = (cf.url || '').replace(/\?.*$/, '');
    const script = url.split('/').pop();
    const loc = script && maps ? maps.lookup(script, cf.lineNumber, cf.columnNumber) : null;
    // dev server: the URL is the source path itself
    const devSrc = /\/(src|node_modules)\//.test(url) ? url.replace(/^https?:\/\/[^/]+\//, '').replace(/^node_modules\/(\.vite\/deps\/)?/, '') : null;
    const src = loc ? loc.source : devSrc ?? script.replace(/-[A-Za-z0-9_-]{8}\.js$/, '.js');
    const name = cf.functionName || '(anonymous)';
    add(fn, src ? `${name} ${src}:${loc ? loc.line : cf.lineNumber + 1}` : name, us);
    const fk = src || (name === '(garbage collector)' ? name : '(browser: DOM / canvas / layout APIs)');
    add(file, fk, us);
    add(owner, !src ? (name === '(garbage collector)' ? 'gc' : 'browser APIs') : MOCK_SOURCES.test(src) ? 'mock backend' : /^solid-js/.test(src) ? 'solid-js' : /^src\//.test(src) ? 'app' : 'other', us);
  }
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, us]) => ({ name, selfMs: r2(us / 1000) }));
  return { busyMs: r2(total / 1000), functions: top(fn, n), files: top(file, 10), owners: top(owner, 8) };
}
