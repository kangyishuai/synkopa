// @vitest-environment jsdom
// UI state that is kept in step by module-level effects (`createRoot` at import): the readout that
// follows the language until the first message, the layout saved on every change, and the current
// pattern following a pattern picked in the Playlist. Each read goes through `settle()` — under a
// batched-effects runtime (Solid 2) these effects run on flush, not inside the write.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settle } from '../test/settle';

const saved = () => JSON.parse(localStorage.getItem('wave.layout') ?? '{}');
beforeEach(() => {
  localStorage.clear();
  vi.resetModules(); // fresh module state: each import is an app start
});

describe('readout', () => {
  it('follows the language until the first message, then keeps the message', async () => {
    const ui = await import('./ui');
    const i18n = await import('../lib/i18n');
    const ready = (l: 'en' | 'pl') => { i18n.setLang(l); settle(); return ui.U.readout; };
    const en = ready('en');
    const pl = ready('pl');
    expect(pl).not.toBe(en);
    expect(ready('en')).toBe(en);
    ui.say('Saved');
    settle();
    expect(ui.U.readout).toBe('Saved');
    expect(ready('pl')).toBe('Saved');
    i18n.setLang('en');
  });
});

describe('layout persistence', () => {
  it('saves the working set-up on every change and restores it on the next start', async () => {
    let ui = await import('./ui');
    ui.setU({ tool: 'paint', bw: 31, pickOpen: false });
    settle();
    const s = saved();
    expect([s.tool, s.bw, s.pickOpen]).toEqual(['paint', 31, false]);
    vi.resetModules(); // a restart
    ui = await import('./ui');
    expect([ui.U.tool, ui.U.bw, ui.U.pickOpen]).toEqual(['paint', 31, false]);
  });

  it('keeps the floating place of an open window live, and where it closed', async () => {
    const ui = await import('./ui');
    ui.setU('rackWin', { x: 10, y: 20, w: 300, h: 200, z: 1 });
    settle();
    ui.setU('rackWin', 'x', 50);
    settle();
    expect(saved().rackFloat).toEqual({ x: 50, y: 20, w: 300, h: 200 });
    ui.setU({ rackFloat: { x: 50, y: 20, w: 300, h: 200 }, rackWin: null });
    settle();
    expect(saved().rackFloat).toEqual({ x: 50, y: 20, w: 300, h: 200 });
  });
});

describe('the current pattern', () => {
  // every writer uses `setU('cur', {...})`, which the store merges into the existing object:
  // the follow effect must watch the fields, not the object's identity
  it('follows a pattern picked as the Playlist brush, but not a missing one', async () => {
    const store = await import('./store');
    const ui = await import('./ui');
    await import('./pattern'); // installs the follow effect
    const pat = (id: number) => ({ id, name: 'P' + id, color: '#888', len: 4, notes: [] });
    store.replaceState({
      project: { version: 2, bpm: 120, tracks: [], inserts: [], patterns: [pat(1), pat(2)] as never, sources: [], clips: [], loop: null, nextId: 10 },
      revision: 1, canUndo: false, canRedo: false, path: null, dirty: false,
      transport: { playing: false, rec: false, monitor: false, metro: false, countIn: true, startBeat: 0, recAudio: true, recNotes: true, recQuantize: 0, recAutomation: true, recAutoLatch: false },
    });
    ui.setU('pat', 1);
    ui.setU('cur', { kind: 'pat', ref: 2, clipId: null }); // as Playlist.tsx and Browser.tsx write it
    settle();
    expect(ui.U.pat).toBe(2);
    ui.setU('cur', { kind: 'pat', ref: 99, clipId: null });
    settle();
    expect(ui.U.pat).toBe(2);
  });
});
