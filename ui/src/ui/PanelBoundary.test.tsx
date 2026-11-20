// The error boundaries (ui/PanelBoundary.tsx) on their own: what each variant shows, that the rest
// of the app keeps updating, that "Try again" rebuilds exactly once (no leaked or doubled
// listeners), and that a failed window or dialog still closes (button, Esc) without holding focus.
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignal, onCleanup, onMount } from '../lib/reactive';
import { settle } from '../test/settle';
import { AppBoundary, ChipBoundary, DialogBoundary, PanelBoundary, PopupBoundary, WindowBoundary } from './PanelBoundary';

let reported: unknown[] = [];
beforeEach(() => {
  reported = [];
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(cb => { Promise.resolve().then(() => { try { cb(); } catch (e) { reported.push(e); } }); });
});
afterEach(() => { vi.restoreAllMocks(); });
const ticks = async () => { await Promise.resolve(); await Promise.resolve(); };

/** A view whose name row reads a field that may be missing (as a malformed item would), with a window listener it attaches on mount. */
const listeners = { added: 0, removed: 0 };
function View(props: { item: () => { name: string } | null; bodyThrows?: () => boolean }) {
  if (props.bodyThrows?.()) throw new Error('body exploded');
  onMount(() => {
    const h = () => {};
    window.addEventListener('keydown', h); listeners.added++;
    onCleanup(() => { window.removeEventListener('keydown', h); listeners.removed++; });
  });
  return <div data-testid="view">{props.item()!.name.toUpperCase()}</div>;
}

describe('PanelBoundary', () => {
  it('shows the failure in place, reports it as uncaught, keeps the app reacting, comes back with its cause', async () => {
    const [item, setItem] = createSignal<{ name: string } | null>({ name: 'kick' });
    const [other, setOther] = createSignal('a');
    render(() => <><PanelBoundary name="Playlist"><View item={item} /></PanelBoundary><output data-testid="other">{other()}</output></>);
    settle();
    expect(screen.getByTestId('view').textContent).toBe('KICK');
    setItem(null);
    settle(); await ticks();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Playlist stopped because of an error');
    expect(alert.textContent).toContain('saving still works');
    expect(screen.queryByTestId('view')).toBeNull();
    expect(reported.length).toBeGreaterThan(0);
    setOther('b');
    expect(screen.getByTestId('other').textContent).toBe('b');
    setItem({ name: 'snare' });
    settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('view').textContent).toBe('SNARE');
  });

  it('Try again rebuilds a component body that threw; its listeners are attached once and released once', async () => {
    listeners.added = 0; listeners.removed = 0;
    let bad = true; // not reactive: only Try again builds it again
    const [item] = createSignal<{ name: string } | null>({ name: 'kick' });
    const r = render(() => <PanelBoundary name="Piano roll"><View item={item} bodyThrows={() => bad} /></PanelBoundary>);
    settle(); await ticks();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(listeners.added).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    settle(); await ticks();
    expect(screen.getByRole('alert')).toBeTruthy(); // still broken: fails again, still contained
    bad = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('view').textContent).toBe('KICK');
    expect(listeners.added).toBe(1);
    r.unmount();
    expect(listeners.removed).toBe(1);
  });

  it('a binding failing after mount keeps the mounted view: recovered, nothing is attached twice', async () => {
    listeners.added = 0; listeners.removed = 0;
    const [item, setItem] = createSignal<{ name: string } | null>({ name: 'kick' });
    const r = render(() => <PanelBoundary name="Mixer"><View item={item} /></PanelBoundary>);
    settle();
    const before = screen.getByTestId('view');
    setItem(null); settle(); await ticks();
    expect(screen.getByRole('alert')).toBeTruthy();
    setItem({ name: 'hat' }); settle();
    expect(screen.getByTestId('view')).toBe(before); // the same element, back on screen
    expect(before.textContent).toBe('HAT');
    expect(listeners.added).toBe(1);
    r.unmount();
    expect(listeners.removed).toBe(1);
  });
});

describe('WindowBoundary', () => {
  it('keeps a frame of the window\'s place and stacking that moves, comes to the front and closes', async () => {
    const [open, setOpen] = createSignal(true);
    const [geom, setGeom] = createSignal({ x: 40, y: 50, w: 400, h: 300 });
    const front = vi.fn();
    const [item] = createSignal<{ name: string } | null>(null);
    render(() => (
      <Show when={open()}>
        <WindowBoundary name="Channel rack" class="patwin rackwin" geom={geom} z={7} front={front} close={() => setOpen(false)} closeTip="Close (Esc)"
          move={(x, y) => setGeom(g => ({ ...g, x, y }))}>
          <View item={item} />
        </WindowBoundary>
      </Show>
    ));
    settle(); await ticks();
    const win = document.querySelector<HTMLElement>('.win.failwin.rackwin')!;
    expect(win).not.toBeNull();
    expect(win.style.left).toBe('40px');
    expect(win.style.height).toBe('300px');
    expect(win.style.zIndex).toBe('7');
    expect(win.querySelector('.winhd .title')!.textContent).toBe('Channel rack');
    expect(screen.getByRole('alert').textContent).toContain('Channel rack stopped');
    fireEvent.pointerDown(win.querySelector('.panelerr')!);
    expect(front).toHaveBeenCalled();
    // the title bar moves it
    fireEvent.pointerDown(win.querySelector('.winhd')!, { button: 0, clientX: 100, clientY: 60 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 80 });
    fireEvent.pointerUp(window, {});
    settle();
    expect(geom().x).toBe(70);
    expect(win.style.left).toBe('70px');
    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }));
    settle();
    expect(document.querySelector('.failwin')).toBeNull();
    // opened again with the cause gone: the window is built afresh
    setOpen(true); settle(); await ticks();
    expect(document.querySelector('.failwin')).not.toBeNull(); // the item is still broken
  });

  it('docked: fills the dock pane, no position of its own', async () => {
    const [item] = createSignal<{ name: string } | null>(null);
    render(() => <WindowBoundary name="Mixer" class="mixdock" docked close={() => {}}><View item={item} /></WindowBoundary>);
    settle(); await ticks();
    const win = document.querySelector<HTMLElement>('.win.failwin.docked')!;
    expect(win.getAttribute('style')).toBeNull();
  });
});

describe('DialogBoundary', () => {
  it('a failed dialog is a small dialog that takes the keyboard, closes with Esc, Close, × or a press outside', async () => {
    const [open, setOpen] = createSignal(true);
    const [item] = createSignal<{ name: string } | null>(null);
    const app = vi.fn();
    const onKey = (e: KeyboardEvent) => app(e.key);
    window.addEventListener('keydown', onKey);
    render(() => <Show when={open()}><DialogBoundary name="Settings" close={() => setOpen(false)}><View item={item} /></DialogBoundary></Show>);
    settle(); await ticks();
    await new Promise(r => setTimeout(r, 0));
    const dlg = screen.getByRole('alertdialog', { name: 'Settings' });
    expect(document.activeElement).toBe(dlg);
    expect(dlg.textContent).toContain('Settings stopped because of an error');
    expect(dlg.textContent).toContain('rebuild this dialog, or close it');
    fireEvent.keyDown(dlg, { key: 'Escape' });
    settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(app).not.toHaveBeenCalledWith('Escape'); // Esc closed the dialog only, not a window behind it
    for (const how of ['Close', 'x', 'outside'] as const) {
      setOpen(true); settle(); await ticks();
      const d = screen.getByRole('alertdialog');
      if (how === 'Close') fireEvent.click(screen.getByText('Close'));
      else if (how === 'x') fireEvent.click(d.querySelector('.hd button')!);
      else fireEvent.pointerDown(d.parentElement!);
      settle();
      expect(screen.queryByRole('alertdialog'), how).toBeNull();
    }
    window.removeEventListener('keydown', onKey);
  });
});

describe('small surfaces', () => {
  it('a menu or list says so in a small box at its place, with Try again and Close', async () => {
    const [item] = createSignal<{ name: string } | null>(null);
    const close = vi.fn();
    render(() => <PopupBoundary name="Menu" x={200} y={120} close={close} class="ctxmenu"><View item={item} /></PopupBoundary>);
    settle(); await ticks();
    const box = document.querySelector<HTMLElement>('.menu.ctxmenu')!;
    expect(box.style.top).toBe('120px');
    expect(box.querySelector('.panelerr.small')!.textContent).toContain('Menu: error');
    expect(box.textContent).not.toContain('saving still works'); // not the panel's long message
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalled();
  });

  it('a part of a bar is one line, the error on hover', async () => {
    const [item, setItem] = createSignal<{ name: string } | null>(null);
    render(() => <ChipBoundary name="Transport"><View item={item} /></ChipBoundary>);
    settle(); await ticks();
    const chip = screen.getByRole('alert');
    expect(chip.classList.contains('chip')).toBe(true);
    expect(chip.textContent).toBe('Transport: errorTry again');
    expect(chip.title).toContain('Transport stopped because of an error');
    setItem({ name: 'x' }); settle();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AppBoundary', () => {
  it('a failure no surface caught fills the window with the message, Try again and Reload', async () => {
    const [item, setItem] = createSignal<{ name: string } | null>({ name: 'a' });
    render(() => <AppBoundary><View item={item} /></AppBoundary>);
    settle();
    setItem(null); settle(); await ticks();
    const alert = screen.getByRole('alert');
    expect(alert.classList.contains('apperr')).toBe(true);
    expect(alert.textContent).toContain('Synkopa’s window stopped because of an error');
    expect(screen.getByRole('button', { name: 'Reload the window' })).toBeTruthy();
    setItem({ name: 'b' }); settle(); // its cause undone: back by itself
    expect(screen.getByTestId('view').textContent).toBe('B');
  });
});
