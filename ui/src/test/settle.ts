// The one place tests wait for reactive updates to propagate.
//
// Solid 2 batches writes and applies them on a microtask; `flush()` applies them now. The app's
// own writers already flush (`lib/reactive.ts`: Solid 1's synchronous read-after-write), so this
// matters for a test that writes through a raw Solid primitive, and for effects created since the
// last flush (Solid 2 makes an effect's first run on the flush, not when it is created).
import { flush } from 'solid-js';

/** The Solid of the app modules imported last (`lib/reactive.ts` registers it): a test that
 *  re-imports the app with `vi.resetModules()` gets a new Solid instance with it. */
const latest = Symbol.for('synkopa.flush');

export function settle(): void {
  const f = (globalThis as Record<symbol, unknown>)[latest] as (() => void) | undefined;
  if (f && f !== flush) f();
  flush();
}

/** One macrotask: lets a MockBackend reply or event (scheduled with `setTimeout(…, 0)`) land. */
export const nextTask = () => new Promise<void>(r => setTimeout(r, 0));
