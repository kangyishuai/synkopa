// The drag-right (length) handle of a piano-roll note. It reaches EDGE_IN px into the note and
// EDGE_OUT px past its end, like the Playlist's clip edges: 6 px inside alone was hard to hit.
import { keyOf, noteWidth } from '../../lib/pattern';
import type { Channel, Id, Note } from '../../api/types';

/** px inside the note's end (at most 45 % of a short note, so its body stays grabbable) and px past it */
export const EDGE_IN = 10, EDGE_OUT = 4;

/** True when `x` is on the length handle of a note drawn from `left`, `width` px wide. */
export const onNoteEdge = (x: number, left: number, width: number) =>
  x >= left + width - Math.min(EDGE_IN, width * 0.45) && x < left + width + EDGE_OUT;

/** The channel's note whose end is just left of `x` on row `key` (within EDGE_OUT px), or −1.
 *  Only asked over empty grid, so it never takes a click meant for another note. */
export function noteEndNear(notes: readonly Note[], ch: Id, chan: Channel | undefined, key: number, x: number, xOf: (step: number) => number, pps: number): number {
  let best = -1, bd = EDGE_OUT;
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.ch !== ch || keyOf(n, chan) !== key) continue;
    const d = x - (xOf(n.step) + noteWidth(n, pps));
    if (d >= 0 && d < bd) { bd = d; best = i; }
  }
  return best;
}
