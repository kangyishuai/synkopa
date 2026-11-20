// lib/reactive.ts keeps Solid 1's timing and store setter on Solid 2. Every state module and view
// relies on these rules; each test pins one of them (see the module's header).
import { describe, expect, it, vi } from 'vitest';
import { createMemo, createRoot, flush } from 'solid-js';
import { batch, createDetachedRoot, createSignal, createStore, effect, onCleanup, sync, watch } from './reactive';

/** Errors the helpers rethrow on a microtask (instead of halting Solid). */
async function caught(fn: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(cb => { try { cb(); } catch (e) { seen.push(e); } });
  try { fn(); } finally { spy.mockRestore(); }
  return seen;
}

describe('a write is applied before the setter returns', () => {
  it('signal: the getter, memos and effects are current at once', () => {
    const [n, setN] = createSignal(1);
    const double = createRoot(() => createMemo(() => n() * 2));
    const seen: number[] = [];
    createRoot(() => effect(() => { seen.push(n()); }));
    flush();
    setN(5);
    expect(n()).toBe(5);
    expect(double()).toBe(10);
    expect(seen).toEqual([1, 5]);
    expect(setN(v => v + 1)).toBe(6);
  });

  it('store: read back right after a path write', () => {
    const [s, set] = createStore({ cur: { kind: 'pat', ref: 1 }, n: 0 });
    set('n', 3);
    expect(s.n).toBe(3);
    set('cur', 'ref', 4);
    expect(s.cur.ref).toBe(4);
  });

  it('batch applies its writes together when it returns (reads inside see the old values)', () => {
    const [a, setA] = createSignal(0), [b, setB] = createSignal(0);
    const runs: [number, number][] = [];
    createRoot(() => effect(() => { runs.push([a(), b()]); }));
    flush();
    batch(() => {
      setA(1); setB(2);
      expect(a()).toBe(0);
    });
    expect(runs).toEqual([[0, 0], [1, 2]]);
  });

  it('sync() is a no-op inside an effect: a write there is applied when the effect returns', () => {
    const [n, setN] = createSignal(0), [m, setM] = createSignal(0);
    let readInside = -1;
    createRoot(() => effect(() => { if (n() === 1) { setM(10); readInside = m(); } }));
    flush();
    setN(1);
    expect(readInside).toBe(0); // Solid 2: not visible inside the callback
    expect(m()).toBe(10);
    sync();
  });
});

describe('createStore keeps Solid 1’s setter', () => {
  const fresh = () => createStore({
    cur: { kind: 'pat', ref: 1, clipId: null as number | null } as { kind: string; ref: number; clipId: number | null; extra?: number } | null,
    list: [{ id: 1, v: 1 }, { id: 2, v: 2 }, { id: 3, v: 3 }],
    sel: [1, 2] as number[],
    win: null as { x: number; y: number } | null,
    n: 0,
  });

  it('an object written to an object merges into it (same proxy, other fields kept)', () => {
    const [s, set] = fresh();
    const cur = s.cur;
    set('cur', { ref: 2 });
    expect(s.cur).toBe(cur);
    expect(s.cur).toEqual({ kind: 'pat', ref: 2, clipId: null });
  });

  it('the root merges too, and undefined deletes a key', () => {
    const [s, set] = fresh();
    set({ n: 2, win: { x: 1, y: 2 } });
    expect([s.n, s.win]).toEqual([2, { x: 1, y: 2 }]);
    set('cur', { extra: 5 });
    expect(s.cur?.extra).toBe(5);
    set('cur', 'extra', undefined);
    expect(s.cur && 'extra' in s.cur).toBe(false);
  });

  it('null replaces, an object over null is put as is, arrays are replaced', () => {
    const [s, set] = fresh();
    set('cur', null);
    expect(s.cur).toBe(null);
    set('cur', { kind: 'audio', ref: 9, clipId: 3 });
    expect(s.cur).toEqual({ kind: 'audio', ref: 9, clipId: 3 });
    set('sel', [7]);
    expect([...s.sel]).toEqual([7]);
  });

  it('updater functions get the current value; returning an object merges it', () => {
    const [s, set] = fresh();
    set('n', v => v + 1);
    set('sel', v => [...v, 3]);
    set('win', { x: 1, y: 1 });
    set('win', w => w && { ...w, x: 5 });
    expect([s.n, [...s.sel], { ...s.win }]).toEqual([1, [1, 2, 3], { x: 5, y: 1 }]);
  });

  it('filters, ranges and arrays of keys address several items', () => {
    const [s, set] = fresh();
    set('list', x => x.id > 1, 'v', 0);
    expect(s.list.map(x => x.v)).toEqual([1, 0, 0]);
    set('list', { from: 0, to: 1 }, 'v', 7);
    expect(s.list.map(x => x.v)).toEqual([7, 7, 0]);
    set('list', [0, 2], 'v', 9);
    expect(s.list.map(x => x.v)).toEqual([9, 7, 9]);
  });

  it('a list rebuilt from its own items keeps their identity', () => {
    const [s, set] = fresh();
    const two = s.list[1];
    set('list', l => l.filter(x => x.id !== 1));
    expect(s.list[0]).toBe(two);
    set('list', l => [...l, { id: 4, v: 4 }]);
    expect(s.list.map(x => x.id)).toEqual([2, 3, 4]);
    expect(s.list[0]).toBe(two);
  });

  it('takes Solid 2’s draft form too', () => {
    const [s, set] = fresh();
    set(d => { d.n = 4; d.list.push({ id: 9, v: 9 }); });
    expect([s.n, s.list.length]).toEqual([4, 4]);
  });

  it('readers re-run only for the field written', () => {
    const [s, set] = fresh();
    let refRuns = 0, kindRuns = 0;
    createRoot(() => { effect(() => { void s.cur?.ref; refRuns++; }); effect(() => { void s.cur?.kind; kindRuns++; }); });
    flush();
    set('cur', { ref: 5 });
    expect([refRuns, kindRuns]).toEqual([2, 1]);
  });
});

describe('effects', () => {
  it('an error in an effect is reported and Solid keeps running (Solid 2 would halt for good)', async () => {
    const [n, setN] = createSignal(0), [other, setOther] = createSignal(0);
    let otherRuns = 0;
    createRoot(() => {
      effect(() => { if (n() === 1) throw new Error('boom'); });
      effect(() => { other(); otherRuns++; });
    });
    flush();
    const errors = await caught(() => setN(1));
    expect(errors.map(e => (e as Error).message)).toEqual(['boom']);
    setOther(1);
    expect(otherRuns).toBe(2);
  });

  it('onCleanup inside an effect runs before the next run and on disposal', () => {
    const [n, setN] = createSignal(0);
    const log: string[] = [];
    const dispose = createRoot(d => { effect(() => { const v = n(); log.push('run ' + v); onCleanup(() => log.push('clean ' + v)); }); return d; });
    flush();
    setN(1);
    dispose();
    expect(log).toEqual(['run 0', 'clean 0', 'run 1', 'clean 1']);
  });

  it('a value returned by an effect body is ignored (Solid 2 halts on a returned non-function)', async () => {
    const [n, setN] = createSignal(0);
    createRoot(() => effect((() => n()) as () => void));
    const errors = await caught(() => { flush(); setN(1); });
    expect(errors).toEqual([]);
  });

  it('watch: runs untracked on each change of its source, with the previous value; defer skips the first', () => {
    const [a, setA] = createSignal(1), [b, setB] = createSignal(10);
    const seen: unknown[] = [], deferred: unknown[] = [];
    createRoot(() => {
      watch(a, (v, prev) => { seen.push([v, prev, b()]); });
      watch([a, b], v => { deferred.push(v); }, { defer: true });
    });
    flush();
    setB(11); // not a source of the first watch
    setA(2);
    expect(seen).toEqual([[1, undefined, 10], [2, 1, 11]]);
    expect(deferred).toEqual([[1, 11], [2, 11]]);
  });

  it('createDetachedRoot works inside an effect callback and outlives the owner it was made under', () => {
    const [n, setN] = createSignal(0), [go, setGo] = createSignal(false);
    let runs = 0;
    const dispose = createRoot(d => { watch(go, g => { if (g) createDetachedRoot(() => effect(() => { n(); runs++; })); }); return d; });
    flush();
    setGo(true);
    expect(runs).toBe(1);
    dispose();
    setN(1);
    expect(runs).toBe(2);
  });
});
