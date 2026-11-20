import type { Page } from '@playwright/test';
import type { Note } from '../src/api/types';
import { drag, engine, expect, MOD, pollEngine, test } from './fixtures';

// The roll is a canvas: a note is found by what the engine holds after a click, and moves are
// checked by direction (later / higher), so the test does not hard-code the zoom.
const notesOf = async (page: Page, pattern: number, ch: number): Promise<Note[]> =>
  (await engine(page)).project.patterns.find(p => p.id === pattern)!.notes.filter(n => n.ch === ch);
const same = (a: Note) => (b: Note) => b.step === a.step && b.p === a.p;

test('Piano roll: draw, move, transpose and delete a note, with undo', async ({ app }) => {
  await app.getByRole('button', { name: 'Piano roll' }).click();
  const roll = app.locator('.rollwin');
  await expect(roll).toBeVisible();
  const chName = await roll.getByRole('combobox', { name: /Channel being edited/ }).locator('option:checked').textContent();
  const s0 = await engine(app);
  const pat = s0.project.patterns[0].id;
  const ch = s0.project.channels!.find(c => c.name === chName)!.id;
  const before = await notesOf(app, pat, ch);

  // draw: a click on an empty spot of the first bar
  // the note grid: the window's largest canvas (beside the ruler, the overview and the velocity lane)
  const grid = await roll.locator('canvas').evaluateAll(cs => cs.map(c => c.getBoundingClientRect()).map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })).sort((a, b) => b.width * b.height - a.width * a.height)[0]);
  const p0 = { x: grid.x + grid.width * 0.25, y: grid.y + grid.height * 0.3 };
  await app.mouse.click(p0.x, p0.y);
  await pollEngine(app, s => s.project.patterns.find(p => p.id === pat)!.notes.filter(n => n.ch === ch).length).toBe(before.length + 1);
  const drawn = (await notesOf(app, pat, ch)).find(n => !before.some(same(n)))!;
  expect(drawn.len).toBeGreaterThan(0);

  // drag right: later, same key
  await drag(app, { x: p0.x + 3, y: p0.y }, { x: p0.x + 3 + 120, y: p0.y });
  await expect.poll(async () => (await notesOf(app, pat, ch)).some(same(drawn))).toBe(false);
  const moved = (await notesOf(app, pat, ch)).find(n => !before.some(same(n)))!;
  expect(moved.step).toBeGreaterThan(drawn.step);
  expect(moved.p).toBe(drawn.p);

  // drag up: higher, same time
  const p1 = { x: p0.x + 3 + 120, y: p0.y };
  await drag(app, p1, { x: p1.x, y: p1.y - 60 });
  await expect.poll(async () => (await notesOf(app, pat, ch)).some(same(moved))).toBe(false);
  const up = (await notesOf(app, pat, ch)).find(n => !before.some(same(n)))!;
  expect(up.p!).toBeGreaterThan(moved.p!);
  expect(up.step).toBe(moved.step);

  // right-click deletes it; undo brings it back where it was
  await app.mouse.click(p1.x, p1.y - 60, { button: 'right' });
  await pollEngine(app, s => s.project.patterns.find(p => p.id === pat)!.notes.filter(n => n.ch === ch).length).toBe(before.length);
  await app.keyboard.press(`${MOD}+z`);
  await expect.poll(async () => (await notesOf(app, pat, ch)).some(same(up))).toBe(true);
  // the notes that were there are untouched
  for (const n of before) expect((await notesOf(app, pat, ch)).some(same(n))).toBe(true);
});
