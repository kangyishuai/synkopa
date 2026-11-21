// `kept`: a bound input/select value is written when it changes, not on every run of its template.
import { fireEvent, render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { createSignal } from '../lib/reactive';
import { kept } from './keptValue';

describe('kept', () => {
  it('Solid 2 alone puts the bound value back over a typed one when another binding changes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [v] = createSignal('64'), [busy, setBusy] = createSignal(false);
    const r = render(() => <div><input value={v()} /><button disabled={busy()}>x</button></div>);
    const el = r.container.querySelector('input')!;
    el.value = '70';
    fireEvent.input(el);
    setBusy(true);
    expect(el.value).toBe('64'); // the reason for `kept`: if this ever keeps '70', Solid compares again
    expect(String(warn.mock.calls[0]?.[0])).toContain('UNCOMMITTED_INPUT_OVERWRITTEN');
    warn.mockRestore();
  });

  it('keeps what the user typed while another binding of the template changes', () => {
    const [v, setV] = createSignal(64), [busy, setBusy] = createSignal(false);
    let el!: HTMLInputElement;
    render(() => <div><input ref={el} type="number" value={kept(el, v())} /><button disabled={busy()}>x</button></div>);
    expect(el.value).toBe('64');
    el.value = '70';
    fireEvent.input(el);
    setBusy(true);
    expect(el.value).toBe('70');
    setBusy(false);
    expect(el.value).toBe('70');
    // a new bound value is written over it, as Solid 1 did
    setV(80);
    expect(el.value).toBe('80');
    setBusy(true);
    expect(el.value).toBe('80');
  });

  it('a select keeps the pick whose change handler turned something else on (an apply going busy)', () => {
    const [v] = createSignal('a'), [busy, setBusy] = createSignal(false);
    let el!: HTMLSelectElement;
    render(() => (
      <select ref={el} value={kept(el, v())} disabled={busy()} onChange={() => setBusy(true)}>
        <option value="a">A</option><option value="b">B</option>
      </select>
    ));
    el.value = 'b';
    fireEvent.change(el);
    expect(busy()).toBe(true);
    expect(el.value).toBe('b');
  });

  it('a select still waits for an option inserted later', () => {
    const [opts, setOpts] = createSignal<string[]>([]), [t, setT] = createSignal('x');
    let el!: HTMLSelectElement;
    render(() => (
      <select ref={el} value={kept(el, 'c')} title={t()}>
        <option value="">none</option>
        {opts().map(o => <option value={o}>{o}</option>)}
      </select>
    ));
    setT('y');
    setOpts(['b', 'c']);
    expect(el.value).toBe('c');
  });

  it('a field re-created by its owner starts from the bound value', () => {
    const [on, setOn] = createSignal(true), [v] = createSignal('5');
    let el!: HTMLInputElement;
    const r = render(() => <div>{on() && <input ref={el} value={kept(el, v())} title={String(on())} />}</div>);
    el.value = '9';
    fireEvent.input(el);
    setOn(false);
    setOn(true);
    expect(r.container.querySelector('input')!.value).toBe('5');
  });
});
