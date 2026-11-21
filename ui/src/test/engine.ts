// State tests drive actions against the MockBackend (which behaves like the engine) and then read
// the store. This is the one way they wait for the engine, instead of a sleep per file.
import type { StateDto } from '../api/types';
import { nextTask, settle } from './settle';

/**
 * Wait until every edit sent to the engine has been answered (`edit.settled()`: the serial queue
 * drained and any refusal's read-back landed), then mirror the engine's state into the store, like
 * a `state` event. The modules are passed in because these tests re-import them per test.
 */
export async function syncEngine(be: { getState(): Promise<StateDto> }, store: { replaceState(dto: StateDto): void }, edit: { settled(): Promise<void> }) {
  await nextTask(); // a fire-and-forget action's first await (e.g. an import) runs before it enqueues
  await edit.settled();
  store.replaceState(await be.getState());
  settle();
}
