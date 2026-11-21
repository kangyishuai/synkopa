// Shared set-up for the journeys: a booted app with the first-run welcome closed, the engine's
// state read straight from the MockBackend (the app's single source of truth, which the page
// publishes on `window.__waveMock` for dev tools), and a guard that fails a test on any uncaught
// page error. Canvas views (Playlist, Piano roll, Channel Rack) are asserted through that state,
// never through pixels.
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import type { StateDto } from '../src/api/types';

export { expect };

/** The engine's current state (what undo, save and playback see), not the UI's optimistic copy. */
export const engine = (page: Page): Promise<StateDto> =>
  page.evaluate(() => (window as unknown as { __waveMock: { getState(): Promise<StateDto> } }).__waveMock.getState());

/** Poll the engine until `pick(state)` passes `check` (an edit is answered asynchronously). */
export const pollEngine = <T>(page: Page, pick: (s: StateDto) => T) => expect.poll(async () => pick(await engine(page)));

/** The centre of a locator's box, in page coordinates. */
export async function centre(l: Locator) {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A press-move-release drag with intermediate moves (canvas views act on pointermove, not on the jump). */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { button?: 'left' | 'right'; steps?: number } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: opts.button ?? 'left' });
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? 8 });
  await page.mouse.up({ button: opts.button ?? 'left' });
}

/** Ctrl on Windows/Linux, Meta on macOS: the app accepts either for its shortcuts. */
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    // a fresh profile is offered the demo project; the journeys keep the sketch the mock starts with
    const welcome = page.getByRole('dialog', { name: 'Welcome to Synkopa' });
    await welcome.getByRole('button', { name: 'Close' }).click();
    await expect(welcome).toBeHidden();
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});
