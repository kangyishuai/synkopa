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
});
