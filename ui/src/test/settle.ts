// The one place tests wait for reactive updates to propagate.
//
// Solid 1.x runs memos and effects synchronously at the end of the write (or of the enclosing
// `batch`), so a test can read derived state right after a write and this is a no-op. Solid 2.0
// batches writes and flushes them on a microtask: when the UI migrates, make this call `flush()`
// (from `solid-js`) and every test that waits through it keeps meaning the same thing.
export function settle(): void {
  /* Solid 1: nothing to flush */
}

/** One macrotask: lets a MockBackend reply or event (scheduled with `setTimeout(…, 0)`) land. */
export const nextTask = () => new Promise<void>(r => setTimeout(r, 0));
