// The engine-state mirror (`store.ts`) is what every view reads. These tests pin its public
// contract, the part a reactivity rewrite (Solid 2) is most likely to break:
// - optimistic edits apply in place, so unchanged items keep their identity and only the
//   readers of a changed field re-run;
// - `projVersion` / `arrVersion` bump once per change, `arrVersion` not for mixer/loop edits;
// - `onArrangementChange` hears every arrangement edit *before* it lands;
// - an engine state reconciles by id (identity kept), `replaceMeta` leaves the project alone;
// - `plain` / `plainNotes` return detached copies.
// Reads of derived state go through `settle()` (src/test/settle.ts), the one place to flush.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clip, Insert, Project, StateDto, Track } from '../api/types';
import { settle } from '../test/settle';

beforeAll(() => {
  const noop = () => {};
  vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop, innerWidth: 1600, innerHeight: 900, setTimeout });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: noop, removeItem: noop });
});

let store: typeof import('./store');
// imported after resetModules with the store, so the effects below track the store's own Solid
let createEffect: typeof import('solid-js').createEffect;
let createRoot: typeof import('solid-js').createRoot;
beforeEach(async () => {
  vi.resetModules(); // the store, its listeners and its id counter are module state
  store = await import('./store');
  ({ createEffect, createRoot } = await import('solid-js'));
});

const track = (id: number, extra: Partial<Track> = {}): Track => ({ id, name: 'T' + id, color: '#888', muted: false, solo: false, arm: false, vol: 0.8, h: 56, insert: 0, ...extra });
const clip = (id: number, extra: Partial<Clip> = {}): Clip => ({ id, track: 0, start: 0, len: 4, offset: 0, kind: 'pat', ref: 1, muted: false, gain: 0, fadeIn: 0, fadeOut: 0, pan: 0, norm: false, rev: false, ...extra });
const master = (): Insert => ({ id: 0, name: 'Master', color: '#ddd', vol: 0.79, pan: 0, muted: false, solo: false, fx: [] });
const ins = (id: number): Insert => ({ id, name: 'Ins' + id, color: '#888', vol: 0.79, pan: 0, muted: false, solo: false, fx: [{ id: 900 + id, type: 'comp', bypass: false, preset: null, params: { thr: -10 } } as never] });

function project(over: Partial<Project> = {}): Project {
  return {
    version: 2, bpm: 120, loop: null, nextId: 100,
    tracks: [track(1), track(2), track(3)],
    inserts: [master(), ins(1)],
    patterns: [{ id: 1, name: 'Beat', color: '#4f8ef7', len: 4, notes: [{ ch: 10, step: 0, len: 1 }, { ch: 10, step: 2, len: 1 }] } as never],
    sources: [{ id: 50, name: 'Kick', color: '#fff', path: '/a/kick.wav', dur: 1, sr: 48000, ch: 1, peakDb: 0 }],
    clips: [clip(10, { track: 0, start: 0 }), clip(11, { track: 1, start: 4 }), clip(12, { track: 2, start: 8 })],
    ...over,
  };
}
function dto(p: Project, over: Partial<StateDto> = {}): StateDto {
  return {
    project: p, revision: 1, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, path: null, dirty: false,
    transport: { playing: false, rec: false, monitor: false, metro: false, countIn: true, startBeat: 0, recAudio: true, recNotes: true, recQuantize: 0 },
    ...over,
  };
}
/** Run `read` in an effect; returns how many times it has run (1 = the initial run). */
function runs(read: () => unknown): { n: number; dispose: () => void } {
  const r = { n: 0, dispose: () => {} };
  createRoot(d => { r.dispose = d; createEffect(() => { read(); r.n++; }); });
  return r;
}
const clipById = (id: number) => store.S.project.clips.find(c => c.id === id)!;

describe('replaceState (a whole state from the engine)', () => {
  it('takes the project and the meta fields and marks the store ready', () => {
    expect(store.S.ready).toBe(false);
    store.replaceState(dto(project(), { revision: 7, canUndo: true, undoLabel: 'Move clips', path: '/song.synkopa', dirty: true }));
    settle();
    expect(store.S.ready).toBe(true);
    expect(store.S.project.clips.map(c => c.id)).toEqual([10, 11, 12]);
    expect([store.S.revision, store.S.canUndo, store.S.undoLabel, store.S.path, store.S.dirty]).toEqual([7, true, 'Move clips', '/song.synkopa', true]);
  });

  it('reconciles by id: unchanged items keep their identity, changed ones update in place', () => {
    store.replaceState(dto(project()));
    const c10 = clipById(10), c11 = clipById(11), t1 = store.S.project.tracks[0];
    const next = project();
    next.clips[1] = clip(11, { track: 1, start: 6 });
    next.clips.splice(2, 1); // clip 12 deleted engine-side
    store.replaceState(dto(next, { revision: 2 }));
    settle();
    expect(clipById(10)).toBe(c10);
    expect(clipById(11)).toBe(c11);
    expect(c11.start).toBe(6);
    expect(store.S.project.tracks[0]).toBe(t1);
    expect(store.S.project.clips.some(c => c.id === 12)).toBe(false);
  });

  it('re-runs only the readers of a field that changed', () => {
    store.replaceState(dto(project()));
    const r10 = runs(() => clipById(10).start);
    const r11 = runs(() => clipById(11).start);
    const next = project();
    next.clips[1] = clip(11, { track: 1, start: 6 });
    store.replaceState(dto(next, { revision: 2 }));
    settle();
    expect(r10.n).toBe(1);
    expect(r11.n).toBe(2);
    r10.dispose(); r11.dispose();
  });

  it('bumps projVersion and arrVersion once per state', () => {
    const p0 = store.projVersion(), a0 = store.arrVersion();
    store.replaceState(dto(project()));
    settle();
    expect(store.projVersion()).toBe(p0 + 1);
    expect(store.arrVersion()).toBe(a0 + 1);
  });

  it('tells arrangement listeners, with null ops and the project as it was', () => {
    store.replaceState(dto(project()));
    const seen: [unknown, number][] = [];
    store.onArrangementChange((ops, before) => seen.push([ops, before.clips.length]));
    const next = project(); next.clips.pop();
    store.replaceState(dto(next, { revision: 2 }));
    expect(seen).toEqual([[null, 3]]);
  });

  it('replaces the live-only maps instead of merging them', () => {
    store.replaceState(dto(project(), { missing: { 50: 'gone' }, fxErrors: { 901: 'not installed' }, stretching: [10], stretchErrors: { 11: 'failed' } }));
    expect(store.S.missing).toEqual({ 50: 'gone' });
    expect(store.S.stretching).toEqual({ 10: '', 11: 'failed' });
    store.replaceState(dto(project(), { revision: 2 }));
    settle();
    expect(store.S.missing).toEqual({});
    expect(store.S.fxErrors).toEqual({});
    expect(store.S.stretching).toEqual({});
  });
});

describe('replaceMeta (our own edit came back: the project is already applied locally)', () => {
  it('updates revision, undo and transport but never touches the project', () => {
    store.replaceState(dto(project()));
    const p0 = store.projVersion();
    const c10 = clipById(10);
    const r = runs(() => store.S.project.clips.length);
    const other = project(); other.clips = []; // must be ignored
    store.replaceMeta(dto(other, { revision: 5, canUndo: true, undoLabel: 'Draw', dirty: true, transport: { ...dto(other).transport, playing: true } }));
    settle();
    expect(store.S.revision).toBe(5);
    expect(store.S.undoLabel).toBe('Draw');
    expect(store.S.transport.playing).toBe(true);
    expect(store.S.project.clips).toHaveLength(3);
    expect(clipById(10)).toBe(c10);
    expect(store.projVersion()).toBe(p0);
    expect(r.n).toBe(1);
    r.dispose();
  });

  it('keeps allocated ids above the engine’s nextId', () => {
    store.replaceState(dto(project({ nextId: 100 })));
    expect(store.allocId()).toBe(100);
    store.replaceMeta(dto(project({ nextId: 500 }), { revision: 2 }));
    expect(store.allocId()).toBe(500);
    expect(store.allocId()).toBe(501);
  });
});

describe('applyLocal (optimistic edits)', () => {
  beforeEach(() => store.replaceState(dto(project())));

  it('moves a clip in place: same object, only its readers re-run, synchronously visible', () => {
    const c10 = clipById(10), c11 = clipById(11);
    const r10 = runs(() => c10.start), r11 = runs(() => c11.start);
    store.applyLocal([{ op: 'putClips', clips: [{ ...store.plain(c10), start: 12 }] }]);
    settle();
    expect(clipById(10)).toBe(c10);
    expect(c10.start).toBe(12);
    expect(r10.n).toBe(2);
    expect(r11.n).toBe(1);
    r10.dispose(); r11.dispose();
  });

  it('adds a new clip and raises nextId past it', () => {
    store.applyLocal([{ op: 'putClips', clips: [clip(150, { start: 16 })] }]);
    settle();
    expect(clipById(150).start).toBe(16);
    expect(store.S.project.nextId).toBe(151);
    expect(store.allocId()).toBe(151);
  });

  it('marks the project dirty and bumps both versions for an arrangement edit', () => {
    const p0 = store.projVersion(), a0 = store.arrVersion();
    store.applyLocal([{ op: 'removeClips', ids: [11] }]);
    settle();
    expect(store.S.dirty).toBe(true);
    expect(store.projVersion()).toBe(p0 + 1);
    expect(store.arrVersion()).toBe(a0 + 1);
  });

  it('a mixer-only or loop edit bumps projVersion but not arrVersion, and is not an arrangement change', () => {
    const heard: unknown[] = [];
    store.onArrangementChange(ops => heard.push(ops));
    const p0 = store.projVersion(), a0 = store.arrVersion();
    const fx = store.S.project.inserts[1].fx[0];
    store.applyLocal([{ op: 'putFx', insertId: 1, fx: { ...store.plain(fx), bypass: true } }]);
    store.applyLocal([{ op: 'setLoop', loop: { a: 0, b: 8 } }]);
    settle();
    expect(store.S.project.inserts[1].fx[0].bypass).toBe(true);
    expect(store.S.project.loop).toEqual({ a: 0, b: 8 });
    expect(store.projVersion()).toBe(p0 + 2);
    expect(store.arrVersion()).toBe(a0);
    expect(heard).toEqual([]);
  });

  it('a mixed batch counts as an arrangement edit', () => {
    const a0 = store.arrVersion();
    store.applyLocal([{ op: 'setLoop', loop: { a: 0, b: 4 } }, { op: 'setBpm', bpm: 140 }]);
    expect(store.arrVersion()).toBe(a0 + 1);
  });

  it('an empty batch changes nothing', () => {
    const p0 = store.projVersion();
    store.applyLocal([]);
    expect(store.projVersion()).toBe(p0);
    expect(store.S.dirty).toBe(false);
  });

  it('tells arrangement listeners the ops before they land', () => {
    let startSeen = -1, opsSeen: unknown = null;
    store.onArrangementChange((ops, before) => { opsSeen = ops; startSeen = before.clips.find(c => c.id === 10)!.start; });
    const ops = [{ op: 'putClips' as const, clips: [{ ...store.plain(clipById(10)), start: 20 }] }];
    store.applyLocal(ops);
    expect(opsSeen).toBe(ops);
    expect(startSeen).toBe(0);
    expect(clipById(10).start).toBe(20);
  });

  it('stops telling a listener once it unsubscribes', () => {
    let n = 0;
    const off = store.onArrangementChange(() => { n++; });
    store.applyLocal([{ op: 'setBpm', bpm: 130 }]);
    off();
    store.applyLocal([{ op: 'setBpm', bpm: 131 }]);
    expect(n).toBe(1);
  });

  it('one batch: an effect reading the version and the data runs once, with both current', () => {
    const seen: [number, number][] = [];
    const r = createRoot(d => { createEffect(() => seen.push([store.arrVersion(), store.S.project.clips.length])); return d; });
    const a0 = store.arrVersion();
    store.applyLocal([{ op: 'removeClips', ids: [10] }, { op: 'removeClips', ids: [11] }]);
    settle();
    expect(seen).toEqual([[a0, 3], [a0 + 1, 1]]);
    r();
  });

  it('removing a track drops its clips and moves the clips below it up', () => {
    store.applyLocal([{ op: 'removeTrack', id: 2 }]);
    settle();
    expect(store.S.project.tracks.map(t => t.id)).toEqual([1, 3]);
    expect(store.S.project.clips.map(c => [c.id, c.track])).toEqual([[10, 0], [12, 1]]);
  });

  it('derived lookups follow local edits (solo memo)', () => {
    const r = runs(() => store.anyTrackSolo());
    expect(store.anyTrackSolo()).toBe(false);
    store.applyLocal([{ op: 'putTrack', track: { ...store.plain(store.S.project.tracks[1]), solo: true } }]);
    settle();
    expect(store.anyTrackSolo()).toBe(true);
    expect(r.n).toBe(2);
    r.dispose();
  });

  it('the engine’s agreeing reply keeps identity and re-runs nobody; a disagreeing one corrects', () => {
    const c10 = clipById(10);
    store.applyLocal([{ op: 'putClips', clips: [{ ...store.plain(c10), start: 8 }] }]);
    const r = runs(() => c10.start);
    const agree = project(); agree.clips[0] = clip(10, { start: 8 });
    store.replaceState(dto(agree, { revision: 2 }));
    settle();
    expect(clipById(10)).toBe(c10);
    expect(r.n).toBe(1);
    const refuse = project(); // the engine kept the clip at 0
    store.replaceState(dto(refuse, { revision: 3 }));
    settle();
    expect(c10.start).toBe(0);
    expect(r.n).toBe(2);
    r.dispose();
  });
});

describe('plain copies', () => {
  beforeEach(() => store.replaceState(dto(project())));

  it('plain gives a detached deep copy of store data', () => {
    const p = store.plain(store.S.project.clips);
    expect(p).toEqual(project().clips);
    p[0].start = 99;
    expect(clipById(10).start).toBe(0);
  });

  it('plain unwraps store items inside a fresh container', () => {
    const c = store.plain({ a: clipById(10), list: [clipById(11)] });
    expect(c.a).toEqual(project().clips[0]);
    c.list[0].start = 77;
    expect(clipById(11).start).toBe(4);
  });

  it('plainNotes copies each note so editing the copy leaves the store alone', () => {
    const notes = store.S.project.patterns[0].notes;
    const copy = store.plainNotes(notes);
    expect(copy).toEqual([{ ch: 10, step: 0, len: 1 }, { ch: 10, step: 2, len: 1 }]);
    copy[0].step = 3;
    expect(store.S.project.patterns[0].notes[0].step).toBe(0);
  });
});
