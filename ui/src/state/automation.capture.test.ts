import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockBackend } from '../api/mock';
import type { AutoPoint, Id } from '../api/types';
// `unwrap` must come from the same solid instance the app's modules resolve (resetModules), or
// it is inert on their store proxies
let unwrap: <T>(item: T) => T;

// Control tweaks capture envelope points while the record filter's automation is armed and the
// song plays, and otherwise write static values (which override an automated control). The
// decimation keeps straight stretches one segment, reversals kept, under a hard cap.
const noop = () => {};
beforeAll(() => {
  const doc = { addEventListener: noop, removeEventListener: noop };
  vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop, innerWidth: 1600, innerHeight: 900, setTimeout, document: doc });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: noop, removeItem: noop });
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0));
});

let mock: MockBackend;
let store: typeof import('./store');
let ui: typeof import('./ui');
let edit: typeof import('./edit');
let A: typeof import('./automation');
let lib: typeof import('../lib/automation');

const flush = () => new Promise(r => setTimeout(r, 5));

beforeEach(async () => {
  vi.resetModules();
  const backend = await import('../api/backend');
  mock = (await backend.getBackend()) as MockBackend;
  store = await import('./store');
  ui = await import('./ui');
  edit = await import('./edit');
  A = await import('./automation');
  lib = await import('../lib/automation');
  ({ unwrap } = await import('solid-js/store'));
  await mock.on('state', edit.onStateEvent); // main.tsx wires this in the app
  await mock.projectOpen();
  store.replaceState(await mock.getState());
});
afterEach(() => {
  mock.dispose(); // the backend's interval outlives resetModules otherwise
  A.setBeatSourceForTests(null);
});

const chanVol = (id: Id) => ({ kind: 'chanVol' as const, id });

describe('CaptureBuf decimation', () => {
  it('keeps a straight ramp as one segment (first point, then nothing while the drift stays under 1%)', () => {
    const buf = new A.CaptureBuf([{ t: 0, v: 0 }]);
    for (let i = 1; i <= 5; i++) buf.add(i * 0.1, i * 0.001);
    expect(buf.points.length, 'the first move only; the rest is one straight stretch').toBe(2);
  });
  it('keeps direction changes and ≥1% moves', () => {
    const buf = new A.CaptureBuf([{ t: 0, v: 0.5 }]);
    buf.add(1, 0.55); // up: the first move is always kept
    buf.add(2, 0.549); // reversal, though small: kept
    buf.add(3, 0.5485); // same direction, tiny: skipped
    buf.add(4, 0.7); // a big move: kept
    expect(buf.points.map(p => p.t)).toEqual([0, 1, 2, 4]);
  });
  it('updates the point in place at the same beat', () => {
    const buf = new A.CaptureBuf([{ t: 0, v: 0.1 }]);
    expect(buf.add(2, 0.5)).toBe(true);
    expect(buf.add(2, 0.6)).toBe(true);
    expect(buf.points.length).toBe(2);
    expect(buf.points[1].v).toBeCloseTo(0.6);
  });
  it('stops at the cap and says so once', () => {
    const buf = new A.CaptureBuf([{ t: 0, v: 0.5 }]);
    for (let i = 1; i < A.AUTO_CAPTURE_MAX; i++) buf.add(i * 0.5, (i % 2) * 0.9, true); // forced: every beat kept (t=0 would replace the initial point)
    expect(buf.points.length, 'not capped until an add is refused').toBe(A.AUTO_CAPTURE_MAX);
    expect(buf.capped).toBe(false);
    expect(buf.add(A.AUTO_CAPTURE_MAX * 0.5 + 1, 0.2, true)).toBe(false);
    expect(buf.capped).toBe(true);
  });
});

describe('a control tweak routes by the record filter', () => {
  const envAt = (id: Id): AutoPoint[] => store.S.project.automations?.find(a => a.id === id)?.points ?? [];
  async function arm() {
    store.setS('transport', { ...store.S.transport, rec: true, recAutomation: true });
    ui.setU('playing', true);
  }

  it('capture: drag points land in the envelope, the static value stays untouched', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    const r = lib.createAutomationOps(store.S.project, null, target, 'Test', '#e0a44a', 0, 8, () => 500);
    await mock.applyOps(r.ops);
    store.replaceState(await mock.getState());
    const before = envAt(500).length;
    const volBefore = store.S.project.channels?.find(c => c.id === ch)?.vol;

    await arm();
    A.setBeatSourceForTests(() => 2);
    const t = A.autoTweak(target, 'Test', () => null);
    t.move(0.2);
    A.setBeatSourceForTests(() => 3);
    t.move(0.8);
    t.end();
    await edit.settled();

    const pts = envAt(500);
    expect(pts.length, 'capture wrote points into the envelope').toBeGreaterThan(before);
    expect(Math.max(...pts.map(p => p.v))).toBeGreaterThanOrEqual(0.8);
    const added = pts.filter(p => p.t !== 0 && p.t !== 8); // the created envelope's two points
    expect(added.length, 'the captured points').toBe(pts.length - 2);
    expect(added.every(p => p.t > 0 && p.t < 8)).toBe(true);
    expect(store.S.project.channels?.find(c => c.id === ch)?.vol, 'the static value was not written').toBe(volBefore);
    expect((await mock.getState()).project.automations?.find(a => a.id === 500)?.points.length, 'the engine agrees').toBe(pts.length);
    expect((await mock.getState()).project.clips.some(c => c.kind === 'auto' && c.ref === 500), 'the envelope has its clip').toBe(true);
  });

  it('capture with no envelope yet: the envelope and its clip are created in the same undo step', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    expect(store.S.project.automations?.length ?? 0).toBe(0);
    await arm();
    A.setBeatSourceForTests(() => 4);
    const t = A.autoTweak(target, 'Test', () => null);
    t.move(0.4);
    t.end();
    await edit.settled();

    const auto = (await mock.getState()).project.automations?.at(-1);
    expect(auto, 'the envelope exists').toBeTruthy();
    expect((await mock.getState()).project.clips.some(c => c.kind === 'auto' && c.ref === auto!.id), 'with its clip').toBe(true);
  });

  it('static: disarmed, the tweak writes the value — and overrides the envelope while playing', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    const r = lib.createAutomationOps(store.S.project, null, target, 'Test', '#e0a44a', 0, 8, () => 600);
    await mock.applyOps(r.ops);
    store.replaceState(await mock.getState());

    ui.setU('playing', true); // playing, but the record filter is off: the fader wins (override)
    const t = A.autoTweak(target, 'Test', v => {
      const ops = lib.writeTargetOps(unwrap(store.S.project), target, v);
      return ops;
    });
    t.move(0.15);
    t.end();
    await edit.settled();

    expect(envAt(600).length, 'the envelope is untouched').toBe(2);
    const after = store.S.project.channels?.find(c => c.id === ch)?.vol;
    expect(after, 'the static value was written').toBeCloseTo(0.15, 2);
    // eslint-disable-next-line no-console
    expect((await mock.getState()).overriddenAutos, 'the envelope is overridden').toContain(600);
    await flush(); // the mock's state event updates the store like the app's
    expect(store.S.overriddenAutos, 'the UI knows (the knob shows the manual value)').toContain(600);

    A.reEnableAutomation(target);
    await edit.settled();
    await flush();
    expect((await mock.getState()).overriddenAutos, 're-enabled: the envelope drives again').not.toContain(600);
    expect(store.S.overriddenAutos).not.toContain(600);

    // a second tweak after re-enabling overrides again (a settled request must not block it)
    const t2 = A.autoTweak(target, 'Test', v => lib.writeTargetOps(unwrap(store.S.project), target, v));
    t2.move(0.4);
    t2.end();
    await edit.settled();
    await flush();
    expect((await mock.getState()).overriddenAutos, 'the next tweak overrides again').toContain(600);
    ui.setU('playing', false);
  });

  it('capture lands as one undo step: undo restores envelope and clip together', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    await arm();
    A.setBeatSourceForTests(() => 2);
    const t = A.autoTweak(target, 'Test', () => null);
    t.move(0.4);
    t.end();
    await edit.settled();
    const autoId = (await mock.getState()).project.automations?.at(-1)?.id;
    const hadClip = async () => (await mock.getState()).project.clips.some(c => c.kind === 'auto' && c.ref === autoId);
    expect(await hadClip(), 'the clip exists after capture').toBe(true);

    await mock.undo();
    store.replaceState(await mock.getState());
    expect(store.S.project.automations?.some(a => a.id === autoId), 'one undo removes the envelope').toBe(false);
    expect(await hadClip(), 'one undo removes the clip with it (same history step)').toBe(false);

    await mock.redo();
    store.replaceState(await mock.getState());
    const pts = store.S.project.automations?.find(a => a.id === autoId)?.points ?? [];
    expect(pts.length, 'one redo brings the envelope back with its points').toBeGreaterThan(0);
    expect(await hadClip(), 'the clip comes back with it').toBe(true);
  });

  it('override then stop: the mock clears overrides like the engine', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    const r = lib.createAutomationOps(store.S.project, null, target, 'Test', '#e0a44a', 0, 8, () => 800);
    await mock.applyOps(r.ops);
    store.replaceState(await mock.getState());
    ui.setU('playing', true);
    const t = A.autoTweak(target, 'Test', v => lib.writeTargetOps(unwrap(store.S.project), target, v));
    t.move(0.2);
    t.end();
    await edit.settled();
    expect((await mock.getState()).overriddenAutos, 'overridden while playing').toContain(800);
    ui.setU('playing', false);
    await mock.transportStop();
    await flush();
    expect((await mock.getState()).overriddenAutos, 'stop re-arms every automation').toEqual([]);
    expect(store.S.overriddenAutos, 'the UI agrees').toEqual([]);
  });

  it('capture picks the clip under the playhead when a target has several', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    await mock.applyOps(lib.createAutomationOps(store.S.project, null, target, 'Early', '#e0a44a', 0, 8, () => 700).ops);
    await mock.applyOps(lib.createAutomationOps(store.S.project, null, target, 'Later', '#e0a44a', 16, 8, () => 702).ops);
    store.replaceState(await mock.getState());
    await arm();
    A.setBeatSourceForTests(() => 20); // inside the Later clip
    const t = A.autoTweak(target, 'Test', () => null);
    t.move(0.3);
    t.end();
    await edit.settled();
    expect(envAt(702).length, 'points went into the clip under the playhead').toBeGreaterThan(2);
    expect(envAt(700).length, 'the earlier envelope is untouched').toBe(2);
  });

  it('capture gives a clipped-over (muted) envelope a new clip', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    await mock.applyOps(lib.createAutomationOps(store.S.project, null, target, 'Test', '#e0a44a', 0, 8, () => 704).ops);
    const muted = unwrap(store.S.project).clips.map(c => (c.id === 705 ? { ...c, muted: true } : c));
    await mock.applyOps([{ op: 'putClips', clips: muted }]);
    store.replaceState(await mock.getState());
    await arm();
    A.setBeatSourceForTests(() => 2);
    const t = A.autoTweak(target, 'Test', () => null);
    t.move(0.6);
    t.end();
    await edit.settled();
    const playing = store.S.project.clips.filter(c => c.kind === 'auto' && c.ref === 704 && !c.muted);
    expect(playing.length, 'a fresh unmuted clip plays the recorded points').toBe(1);
  });

  it('capture grows the clip when points land past its end', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    await mock.applyOps(lib.createAutomationOps(store.S.project, null, target, 'Test', '#e0a44a', 0, 8, () => 706).ops);
    store.replaceState(await mock.getState());
    await arm();
    A.setBeatSourceForTests(() => 20); // past the 8-beat clip
    const t = A.autoTweak(target, 'Test', () => null);
    t.move(0.5);
    t.end();
    await edit.settled();
    const clip = store.S.project.clips.find(c => c.kind === 'auto' && c.ref === 706);
    expect(clip?.len, 'the clip grew to cover the recorded point').toBeGreaterThan(8);
  });

  it('static and stopped: the tweak writes the value, no override is asked', async () => {
    const ch = store.S.project.channels?.[0]?.id ?? 1;
    const target = chanVol(ch);
    const t = A.autoTweak(target, 'Test', v => lib.writeTargetOps(unwrap(store.S.project), target, v));
    t.move(0.35);
    t.end();
    await edit.settled();
    expect(store.S.project.channels?.find(c => c.id === ch)?.vol).toBeCloseTo(0.35, 2);
    expect((await mock.getState()).overriddenAutos ?? []).toEqual([]);
  });

  it('the mock keeps one input kind on when the record filter moves', async () => {
    const tr = await mock.transportSet({ recAudio: false, recAutomation: false });
    expect(tr.recNotes, 'notes stay on').toBe(true);
    expect(tr.recAutomation, 'automation moves freely').toBe(false);
    const tr2 = await mock.transportSet({ recAutoLatch: true });
    expect(tr2.recAutoLatch, 'audio was off already: allowed, because automation and notes are the rest').toBe(true);
    expect(tr2.recAudio).toBe(false);
    const tr3 = await mock.transportSet({ recAutomation: true, recAudio: false, recNotes: false });
    expect(tr3.recAutomation, 'automation on').toBe(true);
    expect(tr3.recAudio === false && tr3.recNotes === false, 'with automation capturing, both input kinds may rest').toBe(true);
  });
});

describe('the record filter restores automation-only settings', () => {
  it('restores audio=false notes=false automation=true from this computer', async () => {
    const storeMap: Record<string, string> = {
      'wave.recFilter': JSON.stringify({ audio: false, notes: false, quantize: 0, automation: true, latch: true }),
    };
    vi.stubGlobal('localStorage', { getItem: (k: string) => storeMap[k] ?? null, setItem: (k: string, v: string) => { storeMap[k] = v; }, removeItem: (k: string) => { delete storeMap[k]; } });
    const actions = await import('./actions');
    await actions.restoreRecFilter();
    await new Promise(r => setTimeout(r, 5));
    expect(JSON.parse(storeMap['wave.recFilter'])).toMatchObject({ audio: false, notes: false, automation: true, latch: true });
    expect(actions.recFilterName()).toContain('automation');
  });
});
