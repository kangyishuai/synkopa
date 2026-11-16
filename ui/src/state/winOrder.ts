// Stacking of the windows that float outside the effect-window layer, and the channel window's place.
import { createSignal } from 'solid-js';
import type { Id } from '../api/types';
import { rackFloating, rollFloating } from './pattern';
import { U } from './ui';

/** The open channel window (synth / WAVE Keys / plugin settings) and its place; null when closed. */
export type Win = { id: Id; x: number; y: number; w: number; z: number };
export const [win, setWin] = createSignal<Win | null>(null);

/**
 * The z-index of a window floating outside the window layer (`.winlayer`, z-index 45): the sample editor, the
 * channel window and the pitch editor. One used after every effect / Channel Rack / Piano roll window sits over
 * the layer, otherwise under it, so clicking a plugin brings the plugin to the front; among themselves the one
 * used last is on top. `z` is the window's place in the stacking order (`UiState.zTop`).
 */
export function outerZ(z: number | undefined): number {
  const layer = U.plugsHidden ? [] : [...U.plugs.map(p => p.z), rackFloating() ? U.rackWin!.z : 0, rollFloating() ? U.rollWin!.z : 0];
  const over = (v: number) => layer.every(o => v > o);
  const me = z ?? 0, above = over(me);
  const peers = [U.editor?.z, win()?.z, U.pitchEd?.z].filter((v): v is number => v != null && over(v) === above);
  const lower = peers.filter(v => v < me).length, higher = peers.filter(v => v > me).length;
  return above ? 46 + Math.min(lower, 2) : 44 - Math.min(higher, 2);
}
