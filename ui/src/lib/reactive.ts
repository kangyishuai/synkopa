// Solid 1 timing on Solid 2 (stage 1 of the migration; see docs in the migration playbook).
//
// Solid 2 batches every write and applies it on a microtask: `setX(1); x()` still reads the old
// value, the DOM is not updated yet, and effects run later. Solid 1 applied a write before the
// setter returned. The UI is full of imperative code written for that (a drag handler writes the
// store and reads it back, an action opens a window and measures it, a handler shows an input and
// focuses it), so stage 1 keeps it: every writer here applies its write at once (`sync`).
//
// The rules (each one measured against solid-js 2.0.3, see the playbook):
// - `sync()` is Solid's `flush()`, skipped where flush cannot run: inside an effect callback it is
//   a no-op (and warns in dev), inside `onSettled` / a tracked effect it throws. A write made there
//   is applied when that callback's flush continues, so a read right after it sees the old value.
// - `createSignal` / `createStore` setters, `batch` and the effect helpers below are the only
//   places that call it; app code imports these instead of the `solid-js` originals.
// - An effect that throws halts Solid 2's whole reactive system for good (Solid 1 recovered and the
//   app kept working). The effect helpers catch the error and rethrow it on a microtask: it still
//   reaches the console, the window error handler and a test run as an uncaught error.
import {
  createEffect as solidEffect,
  createRoot as solidRoot,
  createSignal as solidSignal,
  createStore as solidStore,
  createTrackedEffect,
  flush,
  getOwner,
  isWrappable,
  onCleanup as solidCleanup,
  runWithOwner,
  untrack,
  type Accessor,
  type Setter,
  type SignalOptions,
  type StoreOptions,
} from 'solid-js';

// Tests that re-import the app (`vi.resetModules`) get a fresh Solid with it: `test/settle.ts`
// flushes the latest one through this key.
(globalThis as Record<symbol, unknown>)[Symbol.for('synkopa.flush')] = flush;

/** > 0 while one of the callbacks below runs (inside Solid's flush, where `flush()` cannot run). */
let inCallback = 0;
/** > 0 inside `batch`. */
let batching = 0;

/**
 * Apply every pending write now: memos, effects and the DOM are current when it returns (Solid 1's
 * behaviour after a write). Called by every setter from this module; a no-op inside `batch` and
 * inside effect callbacks (the write is applied when that flush continues).
 */
export function sync(): void {
  if (inCallback === 0 && batching === 0) flush();
}

/**
 * Solid 1's `batch`: the writes inside are applied together when it returns (one run of each
 * effect). Unlike Solid 1, a read inside `fn` of something written inside `fn` sees the old value.
 */
export function batch<T>(fn: () => T): T {
  batching++;
  try {
    return fn();
  } finally {
    batching--;
    sync();
  }
}

/** An effect's error, reported without halting Solid (see the header). */
function report(e: unknown): void {
  queueMicrotask(() => { throw e; });
}

let cleanups: (() => void)[] | null = null;
/**
 * Run `fn` as one of our callbacks: collects `onCleanup` calls, catches its error. The cleanups
 * run last-registered first, as Solid 1's did (1.9 `cleanNode`); one that throws is reported and
 * the others still run.
 */
function guarded(fn: () => void): (() => void) | undefined {
  const outer = cleanups, mine: (() => void)[] = [];
  cleanups = mine;
  inCallback++;
  try { fn(); } catch (e) { report(e); } finally { inCallback--; cleanups = outer; }
  return mine.length ? () => { for (let i = mine.length - 1; i >= 0; i--) { try { mine[i](); } catch (e) { report(e); } } } : undefined;
}

/**
 * Solid 1's `onCleanup`: inside `effect` / `watch` / `onMount` it runs before the next run (or on
 * disposal) like it did in Solid 1; elsewhere (a component body, a memo) it is Solid's own.
 * Not in a ref callback: Solid 2 runs those unowned and throws (register it in the component body).
 */
export function onCleanup(fn: () => void): void {
  if (cleanups) cleanups.push(fn);
  else solidCleanup(fn);
}

/**
 * Solid 1's single-function `createEffect(fn)`: `fn` runs tracked after the render (refs set), and
 * again after any of its reads changes. Writes inside are allowed (applied when it returns: a read
 * of what `fn` itself wrote sees the old value). `onCleanup` inside works.
 * Solid 2's `createTrackedEffect` underneath.
 */
export function effect(fn: () => void): void {
  createTrackedEffect(() => guarded(fn));
}

/**
 * Solid 1's `createEffect(on(deps, fn, { defer }))`: `fn(value, prev)` runs untracked whenever
 * `deps` (an accessor, or an array of accessors) changes; with `defer` not on the first run.
 * As in Solid 1, "changes" means a source read by `deps` notified, not that its value differs:
 * `() => a() && b()` runs `fn(false, false)` when `a` toggles (Solid 2.0.3's effects do not compare
 * the computed value). `prev` is the value of the previous call (`undefined` on the first, also
 * after a deferred first run). Solid 1's third argument (`fn`'s previous return) is not passed.
 * Unlike Solid 1, `deps` itself runs at creation, before the component's refs are set: it may only
 * read reactive state.
 */
export function watch<T>(deps: () => T, fn: (value: T, prev: T | undefined) => void, opts?: { defer?: boolean }): void;
export function watch<T extends readonly unknown[]>(deps: { [K in keyof T]: () => T[K] }, fn: (value: T, prev: T | undefined) => void, opts?: { defer?: boolean }): void;
export function watch(deps: (() => unknown) | readonly (() => unknown)[], fn: (value: unknown, prev: unknown) => void, opts?: { defer?: boolean }): void {
  const read = Array.isArray(deps) ? () => deps.map(d => d()) : (deps as () => unknown);
  solidEffect(read, (v, prev) => guarded(() => untrack(() => fn(v, prev))), { defer: !!opts?.defer });
}

/**
 * Solid 1's `onMount`: `fn` runs once, untracked, after the component rendered (refs set and in
 * the document). Writes and `onCleanup` inside work. Unlike Solid 1, no effect, memo or root can
 * be created inside (Solid 2 forbids it in every effect callback): create those in the component
 * body, or with `createDetachedRoot`. Not Solid 2's `onSettled`, which cannot do either.
 */
export function onMount(fn: () => void): void {
  solidEffect(() => undefined, () => guarded(() => untrack(fn)));
}

/** A root owned by nothing, made at import: what `createDetachedRoot` hangs its roots on. */
const top = solidRoot(() => getOwner())!;
/**
 * Solid 1's `createRoot`: a root that lives until its own `dispose` (Solid 2's is disposed with the
 * owner it is created under), and that can be created anywhere, also inside an effect callback,
 * `onMount` or an event handler (Solid 2 throws there). For module-level state set up on demand.
 */
export function createDetachedRoot<T>(fn: (dispose: () => void) => T): T {
  return runWithOwner(top, () => solidRoot(fn));
}

/**
 * Solid 1's `on:type={{ capture: true, handleEvent }}` (Solid 2 removed `on:`), as a ref:
 * `ref={captureOn('pointerdown', fn)}`; beside an element ref, `ref={[e => (el = e), captureOn(...)]}`.
 */
export function captureOn<K extends keyof HTMLElementEventMap>(type: K, handler: (e: HTMLElementEventMap[K]) => void): (el: HTMLElement) => void {
  return el => el.addEventListener(type, handler as EventListener, { capture: true });
}

/**
 * `createSignal` whose setter applies the write at once (see the header). Same signature as
 * Solid 2's; the getter is Solid's own. Unlike Solid 1, a function as the initial value makes a
 * derived signal (Solid 2), not a signal holding that function: wrap it (`() => fn`) to store one.
 */
export function createSignal<T>(): [Accessor<T | undefined>, Setter<T | undefined>];
export function createSignal<T>(value: Exclude<T, Function>, options?: SignalOptions<T>): [Accessor<T>, Setter<T>];
export function createSignal<T>(value?: T, options?: SignalOptions<T>): [Accessor<T>, Setter<T>] {
  const [get, set] = (solidSignal as (v?: T, o?: SignalOptions<T>) => [Accessor<T>, Setter<T>])(value, options);
  const setNow = ((v: unknown) => { const r = (set as (v: unknown) => T)(v); sync(); return r; }) as Setter<T>;
  return [get, setNow];
}

// ---- stores with Solid 1's path setter ----
// Types ported from solid-js 1.9 `store/types/store.d.ts` (MIT, Ryan Carniato).
type NotWrappable = string | number | bigint | symbol | boolean | Function | null | undefined;
type CustomPartial<T> = T extends readonly unknown[] ? '0' extends keyof T ? { [K in Extract<keyof T, `${number}`>]?: T[K] } : { [x: number]: T[number] } : Partial<T>;
type PickMutable<T> = { [K in keyof T as (<U>() => U extends { [V in K]: T[V] } ? 1 : 2) extends <U>() => U extends { -readonly [V in K]: T[V] } ? 1 : 2 ? K : never]: T[K] };
export type StorePathRange = { from?: number; to?: number; by?: number };
export type ArrayFilterFn<T> = (item: T, index: number) => boolean;
export type StoreSetter<T, U extends PropertyKey[] = []> = T | CustomPartial<T> | ((prevState: T, traversed: U) => T | CustomPartial<T>);
export type Part<T, K extends KeyOf<T> = KeyOf<T>> = K | ([K] extends [never] ? never : readonly K[]) | ([T] extends [readonly unknown[]] ? ArrayFilterFn<T[number]> | StorePathRange : never);
type W<T> = Exclude<T, NotWrappable>;
type KeyOf<T> = number extends keyof T ? 0 extends 1 & T ? keyof T : [T] extends [never] ? never : [T] extends [readonly unknown[]] ? number : keyof T : keyof T;
type MutableKeyOf<T> = KeyOf<T> & keyof PickMutable<T>;
type Rest<T, U extends PropertyKey[], K extends KeyOf<T> = KeyOf<T>> = [T] extends [never] ? never : K extends MutableKeyOf<T> ? [Part<T, K>, ...RestSetterOrContinue<T[K], [K, ...U]>] : K extends KeyOf<T> ? [Part<T, K>, ...RestContinue<T[K], [K, ...U]>] : never;
type RestContinue<T, U extends PropertyKey[]> = 0 extends 1 & T ? [...Part<any>[], StoreSetter<any, PropertyKey[]>] : Rest<W<T>, U>;
type RestSetterOrContinue<T, U extends PropertyKey[]> = [StoreSetter<T, U>] | RestContinue<T, U>;
export interface SetStoreFunction<T> {
  /** Solid 2's draft form: mutate `draft` in place. */
  (mutate: (draft: T) => void): void;
  <K1 extends KeyOf<W<T>>, K2 extends KeyOf<W<W<T>[K1]>>, K3 extends KeyOf<W<W<W<T>[K1]>[K2]>>, K4 extends KeyOf<W<W<W<W<T>[K1]>[K2]>[K3]>>, K5 extends MutableKeyOf<W<W<W<W<W<T>[K1]>[K2]>[K3]>[K4]>>>(k1: Part<W<T>, K1>, k2: Part<W<W<T>[K1]>, K2>, k3: Part<W<W<W<T>[K1]>[K2]>, K3>, k4: Part<W<W<W<W<T>[K1]>[K2]>[K3]>, K4>, k5: Part<W<W<W<W<W<T>[K1]>[K2]>[K3]>[K4]>, K5>, setter: StoreSetter<W<W<W<W<W<T>[K1]>[K2]>[K3]>[K4]>[K5], [K5, K4, K3, K2, K1]>): void;
  <K1 extends KeyOf<W<T>>, K2 extends KeyOf<W<W<T>[K1]>>, K3 extends KeyOf<W<W<W<T>[K1]>[K2]>>, K4 extends MutableKeyOf<W<W<W<W<T>[K1]>[K2]>[K3]>>>(k1: Part<W<T>, K1>, k2: Part<W<W<T>[K1]>, K2>, k3: Part<W<W<W<T>[K1]>[K2]>, K3>, k4: Part<W<W<W<W<T>[K1]>[K2]>[K3]>, K4>, setter: StoreSetter<W<W<W<W<T>[K1]>[K2]>[K3]>[K4], [K4, K3, K2, K1]>): void;
  <K1 extends KeyOf<W<T>>, K2 extends KeyOf<W<W<T>[K1]>>, K3 extends MutableKeyOf<W<W<W<T>[K1]>[K2]>>>(k1: Part<W<T>, K1>, k2: Part<W<W<T>[K1]>, K2>, k3: Part<W<W<W<T>[K1]>[K2]>, K3>, setter: StoreSetter<W<W<W<T>[K1]>[K2]>[K3], [K3, K2, K1]>): void;
  <K1 extends KeyOf<W<T>>, K2 extends MutableKeyOf<W<W<T>[K1]>>>(k1: Part<W<T>, K1>, k2: Part<W<W<T>[K1]>, K2>, setter: StoreSetter<W<W<T>[K1]>[K2], [K2, K1]>): void;
  <K1 extends MutableKeyOf<W<T>>>(k1: Part<W<T>, K1>, setter: StoreSetter<W<T>[K1], [K1]>): void;
  (setter: StoreSetter<T, []>): void;
  <K1 extends KeyOf<W<T>>, K2 extends KeyOf<W<W<T>[K1]>>, K3 extends KeyOf<W<W<W<T>[K1]>[K2]>>, K4 extends KeyOf<W<W<W<W<T>[K1]>[K2]>[K3]>>, K5 extends KeyOf<W<W<W<W<W<T>[K1]>[K2]>[K3]>[K4]>>>(k1: Part<W<T>, K1>, k2: Part<W<W<T>[K1]>, K2>, k3: Part<W<W<W<T>[K1]>[K2]>, K3>, k4: Part<W<W<W<W<T>[K1]>[K2]>[K3]>, K4>, k5: Part<W<W<W<W<W<T>[K1]>[K2]>[K3]>[K4]>, K5>, ...rest: Rest<W<W<W<W<W<T>[K1]>[K2]>[K3]>[K4]>[K5], [K5, K4, K3, K2, K1]>): void;
}

const unsafeKey = (k: unknown) => k === '__proto__' || k === 'constructor' || k === 'prototype';
type Node = Record<PropertyKey, unknown>;
/** Solid 1's `setProperty` on a Solid 2 draft: `undefined` deletes the key. */
function setProp(state: Node, key: PropertyKey, value: unknown): void {
  if (key === '__proto__' || state[key] === value) return;
  if (value === undefined) delete state[key];
  else state[key] = value;
}
/** Solid 1's `updatePath` (solid-js 1.9 store.js, MIT) on a Solid 2 draft. */
function updatePath(current: Node, path: unknown[], traversed: PropertyKey[] = []): void {
  let part: unknown, prev: unknown = current;
  if (path.length > 1) {
    part = path.shift();
    const partType = typeof part, isArray = Array.isArray(current);
    if (partType === 'string' && (part === '__proto__' || (path.length > 1 && unsafeKey(part)))) return;
    if (Array.isArray(part)) {
      for (const p of part) updatePath(current, [p, ...path], traversed);
      return;
    } else if (isArray && partType === 'function') {
      const arr = current as unknown as unknown[];
      for (let i = 0; i < arr.length; i++) if ((part as ArrayFilterFn<unknown>)(arr[i], i)) updatePath(current, [i, ...path], traversed);
      return;
    } else if (isArray && partType === 'object') {
      const { from = 0, to = (current as unknown as unknown[]).length - 1, by = 1 } = part as StorePathRange;
      for (let i = from; i <= to; i += by) updatePath(current, [i, ...path], traversed);
      return;
    } else if (path.length > 1) {
      updatePath(current[part as PropertyKey] as Node, path, [part as PropertyKey, ...traversed]);
      return;
    }
    prev = current[part as PropertyKey];
    traversed = [part as PropertyKey, ...traversed];
  }
  let value = path[0];
  if (typeof value === 'function') {
    value = value(prev, traversed);
    // Solid 1 deleted the key when an updater returned undefined; here an updater that returns
    // nothing is a draft mutation (Solid 2's form), already applied to `prev`
    if (value === prev || value === undefined) return;
  }
  if (part === undefined && value == undefined) return;
  if (part === undefined || (isWrappable(prev) && isWrappable(value) && !Array.isArray(value))) {
    const target = prev as Node, src = value as Node;
    for (const k of Object.keys(src)) if (!unsafeKey(k)) setProp(target, k, src[k]);
  } else setProp(current, part as PropertyKey, value);
}

/**
 * A store with Solid 1's setter: `set('a', 'b', value)`, filters, ranges, arrays of keys, updater
 * functions, and the shallow merge of an object into an object (`set('cur', { ref: 2 })` keeps the
 * other fields of `cur`); `undefined` deletes a key. Every write is applied at once (`sync`).
 * Also takes Solid 2's draft form: `set(d => { d.a.b = 1; })`.
 */
export function createStore<T extends object>(init: T, options?: StoreOptions): [T, SetStoreFunction<T>] {
  const [state, set] = (solidStore as unknown as (v: T, o?: StoreOptions) => [T, (fn: (d: T) => void) => void])(init, options);
  const setPath = ((...args: unknown[]) => {
    set(d => { updatePath(d as unknown as Node, args); });
    sync();
  }) as SetStoreFunction<T>;
  return [state as T, setPath];
}
