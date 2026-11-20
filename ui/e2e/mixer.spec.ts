import { centre, drag, engine, expect, MOD, pollEngine, test } from './fixtures';

const ins = (id: number) => (s: Awaited<ReturnType<typeof engine>>) => s.project.inserts.find(m => m.id === id)!;

test.describe('Mixer', () => {
  test('fader, mute and solo on a strip', async ({ app }) => {
    const strip = app.locator('.strip[data-ins="1"]');
    await expect(strip).toBeVisible();
    const vol0 = ins(1)(await engine(app)).vol;

    // drag the fader cap down: quieter, one undo step
    const cap = await centre(strip.locator('.fader .cap'));
    await drag(app, cap, { x: cap.x, y: cap.y + 50 });
    await pollEngine(app, s => ins(1)(s).vol).toBeLessThan(vol0);
    await app.keyboard.press(`${MOD}+z`);
    await pollEngine(app, s => ins(1)(s).vol).toBeCloseTo(vol0, 6);

    // M mutes (lit), S solos (lit); again turns each off
    const m = strip.getByRole('button', { name: 'M', exact: true });
    const sBtn = strip.getByRole('button', { name: 'S', exact: true });
    await m.click();
    await pollEngine(app, s => ins(1)(s).muted).toBe(true);
    await expect(m).toHaveClass(/\bon\b/);
    await m.click();
    await pollEngine(app, s => ins(1)(s).muted).toBe(false);
    await expect(m).not.toHaveClass(/\bon\b/);
    await sBtn.click();
    await pollEngine(app, s => ins(1)(s).solo).toBe(true);
    await expect(sBtn).toHaveClass(/\bon\b/);
    await sBtn.click();
    await pollEngine(app, s => ins(1)(s).solo).toBe(false);
  });

  test('add an effect from the picker, open its window, close it', async ({ app }) => {
    // select insert 1: the side panel shows its chain
    await app.locator('.strip[data-ins="1"] .nmrow').click();
    const n0 = ins(1)(await engine(app)).fx.length;
    await app.getByText('Add effect', { exact: true }).click();
    const search = app.getByPlaceholder('Search for an effect, plugin or tool…');
    await expect(search).toBeFocused();
    await search.fill('delay');
    await search.press('Enter');
    await pollEngine(app, s => ins(1)(s).fx.length).toBe(n0 + 1);
    const added = ins(1)(await engine(app)).fx[n0];
    expect(added.type).toBe('delay');
    await expect(search).toBeHidden();

    // a new effect opens its window; closing it and clicking its row in the chain reopens it
    const win = app.locator(`[data-fxwin="${added.id}"]`);
    const close = win.locator('.winhd .closebtn');
    await expect(win).toBeVisible();
    await close.click();
    await expect(win).toBeHidden();
    await app.locator('.slot').filter({ hasText: /delay/i }).last().click();
    await expect(win).toBeVisible();
    await close.click();
    await expect(win).toBeHidden();

    // removing it from the chain is one undo step
    await app.locator('.slot').filter({ hasText: /delay/i }).last().getByRole('button', { name: '×' }).click();
    await pollEngine(app, s => ins(1)(s).fx.length).toBe(n0);
    await app.keyboard.press(`${MOD}+z`);
    await pollEngine(app, s => ins(1)(s).fx.some(f => f.id === added.id)).toBe(true);
  });

  test('the parameter slider of a hosted plugin follows a whole drag', async ({ app }) => {
    await app.locator('.strip[data-ins="1"] .nmrow').click();
    const n0 = ins(1)(await engine(app)).fx.length;
    await app.getByText('Add effect', { exact: true }).click();
    const search = app.getByPlaceholder('Search for an effect, plugin or tool…');
    await search.fill('Decapitator');
    await search.press('Enter');
    await pollEngine(app, s => ins(1)(s).fx.length).toBe(n0 + 1);
    const added = ins(1)(await engine(app)).fx[n0];
    expect(added.type).toBe('plugin');

    // a plugin shows its own window; the gear in that window's header opens Synkopa's, with the parameter list
    await app.evaluate(id => (window as unknown as { __waveMock: { pressEditorSettings(id: number): void } }).__waveMock.pressEditorSettings(id), added.id);
    const slider = app.locator(`[data-fxwin="${added.id}"]`).getByRole('slider', { name: 'Drive' });
    await expect(slider).toBeVisible();
    const box = (await slider.boundingBox())!;
    const y = box.y + box.height / 2;
    // press on the left end, drag to the right end in many steps: the value must keep following
    await app.mouse.move(box.x + 4, y);
    await app.mouse.down();
    await app.mouse.move(box.x + box.width * 0.5, y, { steps: 6 });
    await expect.poll(async () => +(await slider.inputValue())).toBeGreaterThan(0.4);
    await app.mouse.move(box.x + box.width - 4, y, { steps: 6 });
    await app.mouse.up();
    await expect.poll(async () => +(await slider.inputValue())).toBeGreaterThan(0.9);
    // the plugin itself got the last value
    await expect.poll(() => app.evaluate(async id => {
      const be = (window as unknown as { __waveMock: { pluginParams(id: number): Promise<{ name: string; value: number }[]> } }).__waveMock;
      return (await be.pluginParams(id)).find(p => p.name === 'Drive')!.value;
    }, added.id)).toBeGreaterThan(0.9);
  });
});
