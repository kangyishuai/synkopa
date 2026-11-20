// A hosted plugin's generic parameter list (FxWindow's PluginBody).
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginParam } from '../api/types';
import { settle } from '../test/settle';

const params: PluginParam[] = [
  { id: 0, name: 'Drive', value: 0.2, def: 0.5, display: '20 %' },
  { id: 1, name: 'Tone', value: 0.7, def: 0.5, display: '70 %' },
  { id: 2, name: 'Bypass', value: 0, def: 0, display: 'Off', toggle: true },
];
const fake = {
  // a fresh object per parameter on every call, like the engine's reply
  pluginParams: vi.fn(async () => structuredClone(params)),
  pluginSetParam: vi.fn(async (_fx: number, id: number, v: number) => { const p = params.find(x => x.id === id)!; p.value = v; p.display = (v * 100).toFixed(0) + ' %'; }),
  appInfo: vi.fn(async () => ({ pluginEditors: true })),
};
vi.mock('../api/backend', async orig => ({ ...(await orig<typeof import('../api/backend')>()), be: () => fake }));

const { PluginBody } = await import('./FxWindow');

const slider = (name: string) => screen.getByRole('slider', { name }) as HTMLInputElement;
const drag = (el: HTMLInputElement, v: number) => { el.value = String(v); fireEvent.input(el); settle(); };

beforeEach(async () => {
  params[0].value = 0.2; params[0].display = '20 %';
  fake.pluginParams.mockClear(); fake.pluginSetParam.mockClear();
  render(() => <PluginBody id={7} />);
  await vi.waitFor(() => expect(screen.getAllByRole('slider')).toHaveLength(2));
});

describe('PluginBody', () => {
  it('keeps the slider being dragged in the page while its value changes', () => {
    const el = slider('Drive'), other = slider('Tone');
    drag(el, 0.3);
    expect(el.isConnected).toBe(true); // a detached input would end the browser's drag after one step
    expect(slider('Drive')).toBe(el);
    drag(el, 0.6);
    drag(el, 0.9);
    expect(slider('Drive')).toBe(el);
    expect(slider('Tone')).toBe(other);
    expect(fake.pluginSetParam.mock.calls.map(c => c[2])).toEqual([0.3, 0.6, 0.9]);
    expect(el.value).toBe('0.9');
  });

  it('follows the engine on a refresh without rebuilding the rows', async () => {
    const el = slider('Drive'), box = screen.getByRole('checkbox', { name: 'Bypass' });
    drag(el, 0.4);
    // the refresh after an edit replaces every parameter object
    await vi.waitFor(() => expect(fake.pluginParams.mock.calls.length).toBeGreaterThan(1), { timeout: 2000 });
    await vi.waitFor(() => expect(screen.getByText('40 %')).toBeTruthy());
    expect(slider('Drive')).toBe(el);
    expect(screen.getByRole('checkbox', { name: 'Bypass' })).toBe(box);
    expect(el.value).toBe('0.4');
  });
});
