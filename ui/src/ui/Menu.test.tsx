// The one context menu: items, submenus, rename, and the native-like dismissal (a press outside
// closes it and is swallowed, so the control under the pointer does not also fire).
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMenu, openMenu, openRename, U, type MenuItem } from '../state/ui';
import { settle } from '../test/settle';
import { ContextMenu } from './Menu';

let outside: ReturnType<typeof vi.fn<() => void>>;
let unmount: () => void;
beforeEach(() => {
  outside = vi.fn<() => void>();
  render(() => <button onClick={outside}>Outside</button>);
  unmount = render(() => <ContextMenu />).unmount;
});
afterEach(() => closeMenu());

const items = (act = vi.fn()): MenuItem[] => [
  { t: 'title', label: 'Clip' },
  { t: 'item', label: 'Duplicate', kbd: 'Ctrl+B', act },
  { t: 'item', label: 'Locked', act, disabled: true },
  { t: 'item', label: 'Snap', act, checked: true },
  { t: 'sep' },
  { t: 'sub', label: 'Colour', items: [{ t: 'item', label: 'Red', act }] },
];
/** A real press: pointerdown, pointerup and click (detail 1) on `el`. */
const press = (el: Element) => { fireEvent.pointerDown(el, { button: 0 }); fireEvent.pointerUp(el, { button: 0 }); fireEvent.click(el, { detail: 1 }); };

describe('ContextMenu', () => {
  it('shows its items with roles, shortcuts and check state', () => {
    openMenu(10, 10, items());
    settle();
    expect(screen.getByText('Clip')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Duplicate/ }).textContent).toContain('Ctrl+B');
    expect(screen.getByRole('menuitemcheckbox', { name: /Snap/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitem', { name: /Locked/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('runs an item and closes', () => {
    const act = vi.fn();
    openMenu(10, 10, items(act));
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate/ }));
    settle();
    expect(act).toHaveBeenCalledOnce();
    expect(U.menu).toBeNull();
    expect(screen.queryByText('Clip')).toBeNull();
  });

  it('a disabled item does nothing and keeps the menu open', () => {
    const act = vi.fn();
    openMenu(10, 10, items(act));
    fireEvent.click(screen.getByRole('menuitem', { name: /Locked/ }));
    expect(act).not.toHaveBeenCalled();
    expect(U.menu).not.toBeNull();
  });

  it('hovering a submenu row opens it; its items run like the others', () => {
    const act = vi.fn();
    openMenu(10, 10, items(act));
    fireEvent.pointerEnter(screen.getByText('Colour').closest('button')!);
    settle();
    fireEvent.click(screen.getByRole('menuitem', { name: /Red/ }));
    expect(act).toHaveBeenCalledOnce();
    expect(U.menu).toBeNull();
  });

  it('a press outside closes it and is swallowed: the control under it does not fire', () => {
    openMenu(10, 10, items());
    press(screen.getByText('Outside'));
    settle();
    expect(U.menu).toBeNull();
    expect(outside).not.toHaveBeenCalled();
    // the next press is an ordinary one again
    press(screen.getByText('Outside'));
    expect(outside).toHaveBeenCalledOnce();
  });

  it('a keyboard click (Enter on the focused control) is never swallowed', () => {
    openMenu(10, 10, items());
    fireEvent.pointerDown(screen.getByText('Outside'), { button: 0 });
    fireEvent.click(screen.getByText('Outside'), { detail: 0 });
    expect(outside).toHaveBeenCalledOnce();
  });

  it('a press inside the menu keeps it open', () => {
    openMenu(10, 10, items());
    fireEvent.pointerDown(screen.getByText('Clip'), { button: 0 });
    expect(U.menu).not.toBeNull();
  });

  it('removes its document listeners when unmounted', () => {
    unmount();
    openMenu(10, 10, items());
    press(screen.getByText('Outside'));
    expect(outside).toHaveBeenCalledOnce(); // nothing dismissed or swallowed it
    expect(U.menu).not.toBeNull();
  });
});

describe('rename', () => {
  it('Enter keeps the typed name (trimmed); Escape drops it', async () => {
    const done = vi.fn();
    openRename(10, 10, 'Old', done, 'Rename');
    const input = (await screen.findByDisplayValue('Old')) as HTMLInputElement;
    input.value = '  New name ';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(done).toHaveBeenCalledWith('New name');
    expect(U.menu).toBeNull();
    openRename(10, 10, 'Old', done, 'Rename');
    const again = (await screen.findByDisplayValue('Old')) as HTMLInputElement;
    again.value = 'Other';
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(done).toHaveBeenCalledTimes(1);
    expect(U.menu).toBeNull();
  });

  it('an empty name is not applied', async () => {
    const done = vi.fn();
    openRename(10, 10, 'Old', done);
    const input = (await screen.findByDisplayValue('Old')) as HTMLInputElement;
    input.value = '   ';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(done).not.toHaveBeenCalled();
  });
});
