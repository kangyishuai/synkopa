// The Mixer behind its error boundary (ui/PanelBoundary.tsx): a strip that fails to render shows
// the failure in the mixer, the rest of the app keeps updating, and "Try again" rebuilds it.
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockBackend } from '../api/mock';
import { syncEngine } from '../test/engine';
import { settle } from '../test/settle';

// a strip's name row fails to render for one name while `bug.on` (a stand-in for any render-time bug)
const bug = vi.hoisted(() => ({ on: true }));
vi.mock('../lib/mixer', async orig => {
  const real = await orig<typeof import('../lib/mixer')>();
  return { ...real, stripLabel: (name: string, idx: number) => { if (bug.on && name === 'Boom') throw new Error('strip exploded'); return real.stripLabel(name, idx); } };
});
vi.mock('../ui/Confirm', () => ({ confirmUnsaved: async () => 'discard', confirmRecover: async () => 'later' }));

let mock: MockBackend;
let store: typeof import('../state/store');
let edit: typeof import('../state/edit');
let A: typeof import('../state/actions');
let ui: typeof import('../state/ui');
let MixDockPane: typeof import('./Mixer').MixDockPane;

/** Errors reported on a microtask (the boundary's report, as an uncaught error). */
let reported: unknown[] = [];
beforeEach(async () => {
  reported = []; bug.on = true;
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(cb => { Promise.resolve().then(() => { try { cb(); } catch (e) { reported.push(e); } }); });
  const backend = await import('../api/backend');
  mock = (await backend.getBackend()) as MockBackend;
  store = await import('../state/store');
  edit = await import('../state/edit');
  A = await import('../state/actions');
  ui = await import('../state/ui');
  ({ MixDockPane } = await import('./Mixer'));
  await syncEngine(mock, store, edit);
  ui.setU({ mixView: false });
});
afterEach(() => { vi.restoreAllMocks(); });

const strip = (id: number) => document.querySelector(`.strip[data-ins="${id}"]`);

describe('Mixer error boundary', () => {
  it('a strip that fails to render shows the failure in the mixer; the app keeps working; it comes back with its cause', async () => {
    const id = store.S.project.inserts[1].id, name = store.S.project.inserts[1].name;
    render(() => <><MixDockPane /><output data-testid="readout">{ui.U.readout}</output></>);
    settle();
    expect(strip(id)).not.toBeNull();

    A.setInsert(id, { name: 'Boom' }, 'Rename');
    settle();
    await Promise.resolve(); await Promise.resolve();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Mixer');
    expect(alert.textContent).toContain('strip exploded');
    expect(strip(id)).toBeNull();
    expect(reported.length).toBeGreaterThan(0); // reported as uncaught, once per failed computation
    expect(new Set(reported.map(e => (e as Error).message))).toEqual(new Set(['strip exploded']));
    // the mixer's title bar is outside the boundary: it still hides, docks and maximizes the mixer
    expect(document.querySelector('.mixhd')).not.toBeNull();
    // the rest of the app was not halted: later writes still reach the screen
    ui.say('still alive');
    expect(screen.getByTestId('readout').textContent).toBe('still alive');

    // a change to what the failed part read (here: the rename undone) rebuilds it by itself
    A.setInsert(id, { name }, 'Rename');
    settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(strip(id)).not.toBeNull();
  });

  it('Try again rebuilds the mixer when the cause was outside the project', async () => {
    const id = store.S.project.inserts[1].id;
    render(() => <MixDockPane />);
    settle();
    A.setInsert(id, { name: 'Boom' }, 'Rename');
    settle();
    await Promise.resolve(); await Promise.resolve();
    expect(screen.getByRole('alert')).toBeTruthy();
    bug.on = false; // nothing reactive changed: the failure stays on screen until asked
    ui.say('unrelated');
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(strip(id)?.textContent).toContain('Boom');
  });
});
