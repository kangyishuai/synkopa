// The Music Box knob ranges live twice: as the DSP's own constants (musicbox.rs, the single
// source of truth for validation and sound) and as the UI's MB_* copies (types.ts, knob travel
// and automation mapping). This test reads the Rust source directly so the copies cannot drift
// silently — the same ritual as the ops.json fixture and the generated synth catalog.
import { describe, expect, it } from 'vitest';
import { MB_BODY, MB_BRIGHTNESS, MB_MECHANICAL, MB_RELEASE, MB_RING, MB_SPREAD } from '../api/types';

import source from '../../../crates/engine/src/musicbox.rs?raw';

const NAMES = { RELEASE_MS: MB_RELEASE, RING: MB_RING, BRIGHTNESS: MB_BRIGHTNESS, BODY: MB_BODY, MECHANICAL: MB_MECHANICAL, SPREAD: MB_SPREAD } as const;

describe('the UI Music Box constants mirror crates/engine/src/musicbox.rs', () => {
  it('copies every knob range tuple exactly', () => {
    const found = new Map<string, [number, number, number]>();
    for (const [, name, lo, hi, def] of source.matchAll(/pub const (\w+): \(f32, f32, f32\) = \(([\d.]+), ([\d.]+), ([\d.]+)\)/g)) {
      found.set(name, [Number(lo), Number(hi), Number(def)]);
    }
    for (const [name, { min, max, def }] of Object.entries(NAMES)) {
      const rust = found.get(name);
      expect(rust, `${name} must exist in musicbox.rs`).toBeDefined();
      expect([min, max, def], name).toEqual(rust);
    }
    // and nothing was missed: the Rust file declares exactly these six knob tuples
    expect(found.size).toBe(6);
  });
});
