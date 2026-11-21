// Every <select> opens the themed list instead of the OS popup; the select keeps its value,
// change events, focus and keyboard behaviour.
import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { createSignal } from '../lib/reactive';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { settle } from '../test/settle';
import { closeSelectPopup, installSelectPopups, SelectPopup } from './SelectPopup';

beforeAll(() => installSelectPopups()); // document-level, once per page like main.tsx

// the check mark of the current row fails to render while `bug.on` (a stand-in for any render-time bug in the list)
const bug = vi.hoisted(() => ({ on: false }));
vi.mock('./menuIcons', async orig => {
  const real = await orig<typeof import('./menuIcons')>();
  return { ...real, get CHECK_GLYPH() { if (bug.on) throw new Error('list exploded'); return real.CHECK_GLYPH; } };
});

function setup(disabled = false) {
  const [v, setV] = createSignal('1/4');
  const change = vi.fn((x: string) => setV(x));
  const r = render(() => (
    <>
      <select aria-label="Snap" value={v()} disabled={disabled} onChange={e => change(e.currentTarget.value)}>
        <option value="auto">Auto</option>
        <option value="1/4">1/4 beat</option>
        <optgroup label="Triplets">
          <option value="1/6">1/6 beat</option>
          <option value="1/12" disabled>1/12 beat</option>
          <option value="1/24">1/24 beat</option>
        </optgroup>
      </select>
      <SelectPopup />
    </>
  ));
  const sel = screen.getByLabelText('Snap') as HTMLSelectElement;
  return { sel, change, v, r };
}
const open = (sel: HTMLSelectElement) => { fireEvent.mouseDown(sel, { button: 0 }); settle(); };
/** The popup's rows (the <select> has its own native options). */
const list = () => within(screen.getByRole('listbox'));
const hot = () => document.querySelector('.selpop .mi.hot')?.textContent;

describe('SelectPopup', () => {
  it('opens on press with every option and group, the current one checked and highlighted', () => {
    const { sel } = setup();
    open(sel);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(list().getAllByRole('option').map(o => o.textContent)).toEqual(['Auto', '1/4 beat', '1/6 beat', '1/12 beat', '1/24 beat']);
    expect(screen.getByText('Triplets')).toBeTruthy();
    expect(list().getByRole('option', { name: '1/4 beat' }).getAttribute('aria-selected')).toBe('true');
    expect(hot()).toBe('1/4 beat');
    expect(document.activeElement).toBe(sel);
    closeSelectPopup();
  });

  it('a click picks: the select changes and fires change, the list closes', () => {
    const { sel, change } = setup();
    open(sel);
    fireEvent.click(list().getByRole('option', { name: '1/6 beat' }));
    settle();
    expect(change).toHaveBeenCalledWith('1/6');
    expect(sel.value).toBe('1/6');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a disabled option cannot be picked', () => {
    const { sel, change } = setup();
    open(sel);
    fireEvent.click(list().getByRole('option', { name: '1/12 beat' }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
    closeSelectPopup();
  });

  it('arrows skip group labels and disabled options; Enter picks', () => {
    const { sel, change } = setup();
    open(sel);
    fireEvent.keyDown(sel, { key: 'ArrowDown' });
    expect(hot()).toBe('1/6 beat');
    fireEvent.keyDown(sel, { key: 'ArrowDown' });
    expect(hot()).toBe('1/24 beat');
    fireEvent.keyDown(sel, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('1/24');
  });

  it('typing jumps to an option', () => {
    const { sel } = setup();
    open(sel);
    fireEvent.keyDown(sel, { key: 'a' });
    expect(hot()).toBe('Auto');
    closeSelectPopup();
  });

  it('Escape closes the list only (the window behind keeps the key out) and focus stays on the select', () => {
    const { sel, change } = setup();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    open(sel);
    fireEvent.keyDown(sel, { key: 'Escape' });
    window.removeEventListener('keydown', behind);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(behind).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(sel);
  });

  it('opens from the keyboard (Alt+Down, F4), not on a plain arrow', () => {
    const { sel } = setup();
    sel.focus();
    fireEvent.keyDown(sel, { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(sel, { key: 'ArrowDown', altKey: true });
    expect(screen.getByRole('listbox')).toBeTruthy();
    closeSelectPopup();
    fireEvent.keyDown(sel, { key: 'F4' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    closeSelectPopup();
  });

  it('a press on the select again, or on the veil, closes it', () => {
    const { sel } = setup();
    open(sel);
    open(sel);
    expect(screen.queryByRole('listbox')).toBeNull();
    open(sel);
    fireEvent.pointerDown(document.querySelector('.selpop-veil')!);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a disabled select does not open', () => {
    const { sel } = setup(true);
    open(sel);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes when the window resizes or loses focus; stops listening once unmounted', () => {
    const { sel, r } = setup();
    open(sel);
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('listbox')).toBeNull();
    open(sel);
    fireEvent(window, new Event('blur'));
    expect(screen.queryByRole('listbox')).toBeNull();
    const remove = vi.spyOn(window, 'removeEventListener');
    r.unmount();
    expect(remove.mock.calls.map(c => c[0]).sort()).toEqual(['blur', 'resize', 'scroll']);
    remove.mockRestore();
  });

  it('a list that fails to render says so in a small box in its place; Close closes it, the next one works', async () => {
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(cb => { Promise.resolve().then(() => { try { cb(); } catch { /* reported as uncaught */ } }); });
    const { sel } = setup();
    bug.on = true;
    open(sel);
    await Promise.resolve(); settle();
    const box = document.querySelector('.menu.selpop .panelerr.small')!;
    expect(box.textContent).toContain('List: error');
    expect(box.textContent).toContain('list exploded');
    fireEvent.click(within(box as HTMLElement).getByRole('button', { name: 'Close' }));
    settle();
    expect(document.querySelector('.selpop')).toBeNull();
    bug.on = false;
    open(sel);
    expect(list().getAllByRole('option')).toHaveLength(5);
    closeSelectPopup();
    vi.restoreAllMocks();
  });
});
