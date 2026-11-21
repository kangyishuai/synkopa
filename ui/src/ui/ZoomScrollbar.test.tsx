// The zooming scrollbar of the Playlist, Piano roll and Pitch editor. jsdom has no layout, so the
// bar is given a 400 px track here; the range math itself is pinned in lib/zoomBar.test.ts.
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from '../lib/reactive';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ZRange } from '../lib/zoomBar';
import { settle } from '../test/settle';
import { ZoomScrollbar } from './ZoomScrollbar';

const W = 400;
const ro = { observe: vi.fn(), disconnect: vi.fn() };
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('zbar') ? W : 0; });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, right: W, bottom: 12, width: W, height: 12, x: 0, y: 0, toJSON() {} }));
  vi.stubGlobal('ResizeObserver', class { observe = ro.observe; unobserve() {} disconnect = ro.disconnect; });
});
afterAll(() => vi.restoreAllMocks());

function bar() {
  const [r, setR] = createSignal<ZRange>({ pos: 0, len: 25 });
  const onChange = vi.fn((x: ZRange) => setR(x));
  const out = render(() => <ZoomScrollbar orient="h" range={r} limits={() => ({ total: 100, minLen: 5, maxLen: 100 })} onChange={onChange} title="Scroll" />);
  const el = screen.getByRole('scrollbar');
  const thumb = el.querySelector('.zthumb') as HTMLElement;
  return { el, thumb, onChange, r, out };
}

describe('ZoomScrollbar', () => {
  it('sizes and places the thumb for the visible part, and reports it to assistive tech', () => {
    const { el, thumb } = bar();
    expect(thumb.style.width).toBe('100px'); // 25 of 100 on 400 px
    expect(thumb.style.left).toBe('0px');
    expect(el.getAttribute('aria-orientation')).toBe('horizontal');
    expect(el.getAttribute('aria-valuenow')).toBe('0');
  });

  it('dragging the thumb scrolls: the content follows the pointer', () => {
    const b = bar();
    fireEvent.pointerDown(b.thumb, { button: 0, clientX: 50 });
    fireEvent.pointerMove(window, { clientX: 110 }); // 60 of 300 px of travel = a fifth of 75 units
    fireEvent.pointerUp(window, {});
    settle();
    expect(b.r().pos).toBeCloseTo(15, 6);
    expect(b.r().len).toBe(25);
    expect(b.thumb.style.left).toBe('60px');
    expect(b.el.getAttribute('aria-valuenow')).toBe('20');
  });

  it('dragging an end zooms: that end follows, the other stays', () => {
    const b = bar();
    fireEvent.pointerDown(b.thumb.querySelector('.hi')!, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 200 });
    fireEvent.pointerUp(window, {});
    expect(b.r().pos).toBe(0);
    expect(b.r().len).toBeGreaterThan(25);
  });

  it('pressing the track beside the thumb centres the view there', () => {
    const b = bar();
    fireEvent.pointerDown(b.el, { button: 0, clientX: 300 });
    fireEvent.pointerUp(window, {});
    expect(b.r().pos).toBeCloseTo(62.5, 6); // 300 px = 75 units, centred: 75 − 12.5
  });

  it('the wheel scrolls by a quarter view per notch; Ctrl+wheel zooms', () => {
    const b = bar();
    fireEvent.wheel(b.el, { deltaY: 100 });
    expect(b.r()).toEqual({ pos: 6.25, len: 25 });
    fireEvent.wheel(b.el, { deltaY: -100, ctrlKey: true, clientX: 200 });
    expect(b.r().len).toBeLessThan(25);
  });

  it('ignores the right and middle buttons', () => {
    const b = bar();
    fireEvent.pointerDown(b.thumb, { button: 2, clientX: 50 });
    fireEvent.pointerDown(b.thumb, { button: 1, clientX: 50 });
    fireEvent.pointerMove(window, { clientX: 150 });
    expect(b.onChange).not.toHaveBeenCalled();
  });

  it('stops observing its size once unmounted', () => {
    const b = bar();
    ro.disconnect.mockClear();
    b.out.unmount();
    expect(ro.disconnect).toHaveBeenCalled();
  });
});
