// lib/reactive.ts with the DOM: when onMount and effects run, and the `on:` replacement.
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { captureOn, createSignal, effect, onCleanup, onMount } from './reactive';

describe('lifecycle', () => {
  it('onMount runs after the render with its refs in the document; a write in a handler is in the DOM at once', () => {
    const log: string[] = [];
    let btn!: HTMLButtonElement;
    function C() {
      const [n, setN] = createSignal(0);
      onMount(() => { log.push(`mount ${btn.isConnected}`); onCleanup(() => log.push('cleanup')); });
      effect(() => { log.push(`effect ${n()} ${btn.textContent}`); });
      return <button ref={btn} onClick={() => { setN(n() + 1); log.push(`clicked ${btn.textContent}`); }}>{n()}</button>;
    }
    const { unmount } = render(() => <C />);
    fireEvent.click(btn);
    unmount();
    expect(log).toEqual(['mount true', 'effect 0 0', 'effect 1 1', 'clicked 1', 'cleanup']);
  });

  it('a component shown by a write is mounted before the write returns', () => {
    const [open, setOpen] = createSignal(false);
    let mounted = false;
    function Child() { onMount(() => { mounted = true; }); return <i>child</i>; }
    const { container } = render(() => <Show when={open()}><Child /></Show>);
    setOpen(true);
    expect(mounted).toBe(true);
    expect(container.textContent).toBe('child');
  });
});

describe('captureOn', () => {
  it('listens in the capture phase, beside an element ref', () => {
    const seen: string[] = [];
    let outer!: HTMLDivElement;
    render(() => (
      <div ref={[e => (outer = e), captureOn('pointerdown', () => seen.push('outer'))]}>
        <button onPointerDown={() => seen.push('inner')}>x</button>
      </div>
    ));
    fireEvent.pointerDown(outer.querySelector('button')!);
    expect(seen).toEqual(['outer', 'inner']);
  });
});
