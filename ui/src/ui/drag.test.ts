// @vitest-environment jsdom
// The pointer-drag helpers every control and canvas view uses, on a real (jsdom) window and root.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dblCheck, dragCursor, fineMul, panDrag, resetDblCheck, track, trackFrame } from './drag';

const root = document.documentElement;
const fire = (type: string, init: PointerEventInit = {}) => window.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
afterEach(() => { fire('pointerup'); dragCursor(null); });

describe('drag cursor', () => {
  it('forces the drag cursor on the whole page, and releases it', () => {
    dragCursor('grabbing');
    expect(root.classList.contains('dragcur')).toBe(true);
    expect(root.style.getPropertyValue('--drag-cursor')).toBe('grabbing');
    dragCursor(null);
    expect(root.classList.contains('dragcur')).toBe(false);
    expect(root.style.getPropertyValue('--drag-cursor')).toBe('');
  });
  it('leaves the cursor alone for a drag that names none', () => {
    track(() => {});
    expect(root.classList.contains('dragcur')).toBe(false);
  });
});

describe('track', () => {
  it('follows moves until the release, then stops listening and releases the cursor', () => {
    const move = vi.fn(), up = vi.fn();
    track(move, up, 'grabbing');
    expect(root.classList.contains('dragcur')).toBe(true);
    fire('pointermove', { clientX: 5 });
    fire('pointerup');
    fire('pointermove', { clientX: 9 });
    expect(move).toHaveBeenCalledOnce();
    expect(up).toHaveBeenCalledOnce();
    expect(root.classList.contains('dragcur')).toBe(false);
  });
  it('a cancelled pointer ends it too, once', () => {
    const up = vi.fn();
    track(() => {}, up, 'grabbing');
    fire('pointercancel');
    fire('pointerup');
    expect(up).toHaveBeenCalledOnce();
    expect(root.classList.contains('dragcur')).toBe(false);
  });
});

describe('trackFrame', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }));
  afterEach(() => vi.useRealTimers());
  it('coalesces the moves of one frame to the last one, and flushes it before the release', () => {
    const seen: number[] = [];
    const up = vi.fn(() => seen.push(-1));
    trackFrame(e => seen.push(e.clientX), up);
    fire('pointermove', { clientX: 1 }); fire('pointermove', { clientX: 2 }); fire('pointermove', { clientX: 3 });
    vi.advanceTimersToNextFrame();
    fire('pointermove', { clientX: 4 }); fire('pointermove', { clientX: 5 });
    fire('pointerup');
    vi.advanceTimersToNextFrame(); // the cancelled frame does not run the move again
    expect(seen).toEqual([3, 5, -1]);
  });
});

describe('panDrag (middle button)', () => {
  it('takes only the middle button, and pans opposite to the pointer', () => {
    const set = vi.fn();
    expect(panDrag(new PointerEvent('pointerdown', { button: 0 }), () => ({ x: 0, y: 0 }), set)).toBe(false);
    expect(panDrag(new PointerEvent('pointerdown', { button: 1, clientX: 100, clientY: 100 }), () => ({ x: 50, y: 20 }), set)).toBe(true);
    fire('pointermove', { clientX: 90, clientY: 130 });
    expect(set).toHaveBeenLastCalledWith(60, -10);
  });
});

describe('double click (dblCheck)', () => {
  const down = (x: number, y: number) => fire('pointerdown', { clientX: x, clientY: y });
  let now = 0;
  beforeEach(() => { now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now); resetDblCheck(); });
  afterEach(() => vi.restoreAllMocks());

  it('is two presses on the same key in the same place within 320 ms', () => {
    down(10, 10); expect(dblCheck('a')).toBe(false);
    now += 200; down(11, 12); expect(dblCheck('a')).toBe(true);
    // a third press starts over
    now += 100; down(11, 12); expect(dblCheck('a')).toBe(false);
  });
  it('is not a slow second press, nor a press on another key', () => {
    down(10, 10); dblCheck('a');
    now += 400; down(10, 10); expect(dblCheck('a')).toBe(false);
    now += 100; down(10, 10); expect(dblCheck('b')).toBe(false);
  });
  it('is not a grab right after a drag: the first press moved', () => {
    down(10, 10); expect(dblCheck('knob')).toBe(false);
    fire('pointermove', { clientX: 10, clientY: 40, buttons: 1 });
    now += 150; down(10, 40); expect(dblCheck('knob')).toBe(false);
  });
  it('is not two presses apart from each other (two controls sharing a key)', () => {
    down(10, 10); dblCheck('nfGain');
    now += 150; down(90, 10); expect(dblCheck('nfGain')).toBe(false);
  });
  it('ignores hover moves between the presses (no button held)', () => {
    down(10, 10); dblCheck('a');
    fire('pointermove', { clientX: 12, clientY: 11, buttons: 0 });
    now += 150; down(12, 11); expect(dblCheck('a')).toBe(true);
  });
  it('fine adjust is Ctrl (FL) or Shift', () => {
    expect(fineMul({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe(1);
    expect(fineMul({ shiftKey: false, ctrlKey: true, metaKey: false })).toBe(0.2);
    expect(fineMul({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe(0.2);
  });
});
