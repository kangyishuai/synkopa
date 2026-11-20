import type { Page } from '@playwright/test';
import type { Clip } from '../src/api/types';
import { drag, engine, expect, MOD, pollEngine, test } from './fixtures';

/** Page coordinates of beat `beat` on track `track`, from the grid's box, the zoom and the lane heights. */
async function at(page: Page, track: number, beat: number) {
  const grid = (await page.locator('.gridArea').boundingBox())!;
  const bw: number = await page.evaluate(() => JSON.parse(localStorage.getItem('wave.layout') ?? '{}').bw ?? 22);
  const tracks = (await engine(page)).project.tracks;
  const top = tracks.slice(0, track).reduce((y, t) => y + t.h, 0);
  return { x: grid.x + beat * bw, y: grid.y + top + tracks[track].h / 2 };
}
const clipsOn = (page: Page, track: number) => engine(page).then(s => s.project.clips.filter(c => c.track === track));
const only = (cs: Clip[]) => cs.map(c => ({ start: c.start, kind: c.kind }));

test.describe('Playlist', () => {
  test('draw a clip, move it, delete it, with undo and redo', async ({ app }) => {
    const T = 6; // "Track 7": empty in the sketch
    expect(await clipsOn(app, T)).toEqual([]);
    const ref = (await engine(app)).project.patterns[0];

    // Draw tool click on an empty lane: a clip of the current pattern at the snapped beat
    const p = await at(app, T, 8.2);
    await app.mouse.click(p.x, p.y);
    await pollEngine(app, s => only(s.project.clips.filter(c => c.track === T))).toEqual([{ start: 8, kind: 'pat' }]);
    const [made] = await clipsOn(app, T);
    expect(made.ref).toBe(ref.id);

    // drag it 8 beats later
    const from = await at(app, T, made.start + made.len / 2);
    const to = await at(app, T, made.start + made.len / 2 + 8);
    await drag(app, from, to);
    await pollEngine(app, s => s.project.clips.find(c => c.id === made.id)?.start).toBe(16);
    await expect.poll(async () => (await engine(app)).undoLabel).toBe('Move clips');

    // Ctrl+Z puts it back, Ctrl+Y moves it again
    await app.keyboard.press(`${MOD}+z`);
    await pollEngine(app, s => s.project.clips.find(c => c.id === made.id)?.start).toBe(8);
    await app.keyboard.press(`${MOD}+y`);
    await pollEngine(app, s => s.project.clips.find(c => c.id === made.id)?.start).toBe(16);

    // the moved clip is selected: Delete removes it, undo brings it back
    await app.keyboard.press('Delete');
    await pollEngine(app, s => s.project.clips.some(c => c.id === made.id)).toBe(false);
    await app.keyboard.press(`${MOD}+z`);
    await pollEngine(app, s => s.project.clips.find(c => c.id === made.id)?.start).toBe(16);
  });

  test('clicking a pattern clip makes its pattern the current one', async ({ app }) => {
    const { patterns, clips } = (await engine(app)).project;
    const sel = app.locator('.patselbtn');
    await expect(sel).toContainText(patterns[0].name);
    const other = clips.find(c => c.kind === 'pat' && c.ref !== patterns[0].id)!;
    const name = patterns.find(p => p.id === other.ref)!.name;
    const p = await at(app, other.track, other.start + Math.min(1, other.len / 2));
    await app.mouse.click(p.x, p.y);
    await expect(sel).toContainText(name);
  });

  test('right-click deletes a clip; the Delete tool does too', async ({ app }) => {
    const before = (await engine(app)).project.clips;
    const victim = before.find(c => c.track === 0)!;
    const p = await at(app, 0, victim.start + 1);
    await app.mouse.click(p.x, p.y, { button: 'right' });
    await pollEngine(app, s => s.project.clips.some(c => c.id === victim.id)).toBe(false);

    await app.getByRole('radio', { name: /^Delete \(D\)/ }).click();
    await expect(app.getByRole('radio', { name: /^Delete \(D\)/ })).toBeChecked();
    const next = before.find(c => c.track === 1)!;
    const q = await at(app, 1, next.start + 1);
    await app.mouse.click(q.x, q.y);
    await pollEngine(app, s => s.project.clips.some(c => c.id === next.id)).toBe(false);
    expect((await engine(app)).project.clips).toHaveLength(before.length - 2);
  });
});
