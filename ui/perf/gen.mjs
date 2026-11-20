// Deterministic synthetic projects for the UI perf harness.
//
//   node perf/gen.mjs [small|large] [--out file.json]      (prints a summary; writes JSON with --out)
//
// The shapes follow the engine's project JSON (crates/engine/src/model.rs, camelCase, defaults
// omitted the way the engine omits them) and the layout of the engine-side fixture generator
// (crates/perf/src/fixture.rs): same xorshift RNG, same mix of audio / pattern / automation /
// comp clips, effect chains built from the built-in effects with their default parameters.
// It is pure JS on purpose: the harness needs no Rust toolchain, and a project generated today
// is byte-identical to one generated after the Solid 2 migration (`fingerprint` in the results
// proves it). The mock backend synthesises waveform peaks, so the audio paths need not exist.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GENERATOR_VERSION = 1;

// ---- RNG (fixture.rs `Rng`: xorshift64, seed * golden ratio) ----
class Rng {
  constructor(seed) { this.s = (BigInt(Math.max(1, seed)) * 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn; }
  next() {
    let x = this.s;
    x ^= (x << 13n) & 0xFFFFFFFFFFFFFFFFn;
    x ^= x >> 7n;
    x ^= (x << 17n) & 0xFFFFFFFFFFFFFFFFn;
    this.s = x;
    return x;
  }
  f() { return Number(this.next() >> 11n) / 2 ** 53; }
  range(a, b) { return a + (b - a) * this.f(); }
  below(n) { return Number(this.next() % BigInt(Math.max(1, n))); }
}

// ---- default parameters of the built-in effects (engine catalog `new_fx`, as of solid-1 baseline) ----
const FX_DEFAULTS = {
  eq: { params: { out: 0 }, bands: [
    { on: false, type: 'lowcut', f: 30, g: 0, q: 0.71, slope: 12, place: 'stereo' },
    { on: true, type: 'lowshelf', f: 90, g: 0, q: 0.71, slope: 12, place: 'stereo' },
    { on: true, type: 'peak', f: 250, g: 0, q: 1, slope: 12, place: 'stereo' },
    { on: true, type: 'peak', f: 1000, g: 0, q: 1, slope: 12, place: 'stereo' },
    { on: true, type: 'peak', f: 3500, g: 0, q: 1, slope: 12, place: 'stereo' },
    { on: true, type: 'highshelf', f: 9000, g: 0, q: 0.71, slope: 12, place: 'stereo' },
    { on: false, type: 'highcut', f: 18000, g: 0, q: 0.71, slope: 12, place: 'stereo' }] },
  comp: { params: { att: 10, det: 0, gain: 0, ratio: 4, rel: 150, thr: -18 } },
  limit: { params: { auto: 1, ceil: -1, gain: 0, link: 100, look: 3, out: 0, rel: 80 } },
  denoise: { params: { learn: 0, listen: 0, reduction: 8, sens: 35, smooth: 50 } },
  tune: { params: { flex: 40, formant: 0, humanize: 30, key: 0, retune: 40, scale: 0, transpose: 0, vibrato: 60, voice: 0 } },
  voice: { params: { drive: 0, formant: 0, link: 0, mode: 0, out: 0, pitch: 0 } },
  deess: { params: { detect: 0, freq: 6000, listen: 0, look: 5, mode: 0, range: 8, thr: -32 } },
  fet: { params: { attack: 400, input: 8, mix: 100, output: -2, ratio: 0, release: 250 } },
  sat: { params: { auto: 1, drive: 40, highcut: 20000, hq: 0, lowcut: 10, mix: 100, out: 0, punish: 0, steep: 0, style: 0, thump: 0, tone: 0 } },
  reverb: { params: { bass: 0.8, duck: 3, early: 50, hi: 7000, lo: 300, mix: 15, mod: 50, pre: 25, size: 1, space: 0, tone: 0, width: 100 } },
  delay: { params: { beats: 0.5, bits: 24, cutoff: 6000, diff: 0, dist: 1, dry: 100, dspread: 50, fb: 35, ftype: 1, input: 100, keep: 0, knee: 50, level: 0, mcut: 0, mix: 22, model: 1, mtime: 0, offset: 0, pan: -60, rate: 0.5, res: 0, smooth: 40, spread: 100, srate: 48000, sym: 0, sync: 0, time: 375, tone: 0 } },
};
const newFx = (id, type) => {
  const d = FX_DEFAULTS[type];
  const fx = { id, type, bypass: false, mix: 1, preset: 0, params: { ...d.params } };
  if (d.bands) fx.bands = d.bands.map(b => ({ ...b }));
  return fx;
};
const LIGHT = [['eq', 'comp'], ['eq', 'comp', 'sat'], ['eq', 'comp', 'delay', 'reverb'], ['eq', 'deess', 'comp', 'limit']];
const VOCAL = ['denoise', 'tune', 'voice', 'eq', 'deess', 'comp', 'fet', 'sat', 'reverb'];
const COLORS = ['#4f8ef7', '#5aa9e6', '#69c3d6', '#47b8a8', '#5fbf8a', '#7c8cf8', '#e0a44a', '#9a8cf0', '#d9678f', '#8b93a1'];
const color = i => COLORS[i % COLORS.length];
const VOL_UNITY = 0.7937;
const f32 = x => Math.fround(x); // the engine stores these fields as f32

const SAMPLER = { start: 0, end: 1, reverse: false, norm: false, semi: 0, fine: 0, gate: false, attack: 0, decay: 0, sustain: 1, release: 20, cut: 0, fadeInMs: 0, fadeOutMs: 0 };

export const SPECS = {
  // a sketch: what most sessions look like early on
  small: { tracks: 8, audioClips: 60, patClips: 12, patterns: 6, notes: 64, sources: 8, srcSecs: [4, 12], beats: 256, bpm: 128, automations: 4, autoPoints: 40, comps: 1, vocalTracks: 1, stressNotes: 2000 },
  // the hot cases quoted in ui/src/state/store.ts: ~1400 clips, a 2000-note pattern; 40 tracks with 41 inserts carrying 2-9 effects each
  large: { tracks: 40, audioClips: 1200, patClips: 170, patterns: 24, notes: 256, sources: 40, srcSecs: [6, 24], beats: 512, bpm: 96, automations: 26, autoPoints: 200, comps: 4, vocalTracks: 6, stressNotes: 2000 },
};

export function generate(name) {
  const spec = SPECS[name];
  if (!spec) throw new Error(`unknown size ${name} (${Object.keys(SPECS).join(', ')})`);
  const rng = new Rng(7 + spec.tracks);
  let nextId = 1000;
  const alloc = () => nextId++;
  const spb = 60 / spec.bpm;
  const p = { version: 2, bpm: spec.bpm, tracks: [], inserts: [], patterns: [], sources: [], clips: [], loop: { a: 16, b: 48 }, automations: [], comps: [], channels: [], notebook: { pages: [] }, key: null, scale: 2, nextId: 0 };

  // ---- sources: style 0 vocal, 1 pad, 2 drums
  const style = i => i % 3;
  for (let i = 0; i < spec.sources; i++) {
    const secs = rng.range(spec.srcSecs[0], spec.srcSecs[1]);
    p.sources.push({ id: alloc(), name: `${['Vocal', 'Pad', 'Drums'][style(i)]} ${i}`, color: color(i), path: `perf-synthetic/${name}/src${String(i).padStart(3, '0')}.wav`, dur: secs, sr: i % 4 === 3 ? 44100 : 48000, ch: 2, peakDb: -6 });
  }
  const vocals = p.sources.map((_, i) => i).filter(i => style(i) === 0);
  const drums = p.sources.map((_, i) => i).filter(i => style(i) === 2);

  // ---- sampler channels (the stress pattern plays the first one, pitched)
  ['Kick', 'Snare', 'Hat', 'Perc'].forEach((nm, k) => {
    p.channels.push({ id: alloc(), name: nm, color: color(k + 3), kind: 'sample', source: p.sources[drums[k % drums.length]].id, sampler: { ...SAMPLER }, vol: VOL_UNITY, pan: 0, mute: false, solo: false, insert: null, root: 60 });
  });
  const chans = p.channels.map(c => c.id);

  // ---- mixer: master (EQ, comp, limiter) + one insert per track
  p.inserts.push({ id: 0, name: 'Master', color: '#d5dae2', vol: VOL_UNITY, pan: 0, width: 1, muted: false, solo: false, fx: ['eq', 'comp', 'limit'].map(t => newFx(alloc(), t)) });
  for (let t = 0; t < spec.tracks; t++) {
    const insId = alloc(), tid = alloc();
    const vocal = t < spec.vocalTracks;
    const fx = (vocal ? VOCAL : LIGHT[t % 4]).map(k => newFx(alloc(), k));
    p.inserts.push({ id: insId, name: `Ins ${t}`, color: color(t), vol: VOL_UNITY, pan: f32(((t % 7) - 3) / 6), width: 1, muted: false, solo: false, fx });
    p.tracks.push({ id: tid, name: vocal ? `Vocal ${t}` : `Track ${t}`, color: color(t), muted: false, solo: false, arm: false, vol: f32(VOL_UNITY * 0.9), h: 56, insert: insId });
  }

  // ---- patterns, then the piano-roll stress pattern
  const pats = [];
  for (let i = 0; i < spec.patterns; i++) {
    const len = i % 3 === 0 ? 8 : 16, steps = len * 4;
    const notes = [];
    for (let k = 0; k < spec.notes; k++) {
      notes.push({ ch: chans[rng.below(chans.length)], step: rng.below(steps), len: [1, 1, 2, 4][rng.below(4)], p: 36 + rng.below(36), trig: false });
    }
    notes.sort((a, b) => a.step - b.step);
    const id = alloc();
    p.patterns.push({ id, name: `Pattern ${i}`, color: color(i), len, minLen: len, notes });
    pats.push(id);
  }
  {
    const notes = [];
    for (let k = 0; k < spec.stressNotes; k++) notes.push({ ch: chans[0], step: rng.below(1024), len: [1, 2, 4][rng.below(3)], p: 24 + rng.below(60), trig: false });
    notes.sort((a, b) => a.step - b.step);
    p.patterns.push({ id: alloc(), name: `Piano roll stress (${spec.stressNotes} notes)`, color: color(9), len: 256, minLen: 256, notes });
  }

  const clip = (track, start, len, kind, ref) => ({ id: alloc(), track, start, len, offset: 0, kind, ref, muted: false, gain: 0, fadeIn: 0, fadeOut: 0, pan: 0, norm: false, rev: false });

  // ---- audio clips
  for (let i = 0; i < spec.audioClips; i++) {
    const track = rng.below(spec.tracks);
    const si = track < spec.vocalTracks ? vocals[rng.below(vocals.length)] : rng.below(spec.sources);
    const s = p.sources[si];
    const len = Math.max(0.5, Math.min(s.dur / spb, spec.beats / 4));
    const start = Math.round(rng.range(0, Math.max(0, spec.beats - len)) * 4) / 4;
    const c = clip(track, start, len, 'audio', s.id);
    c.gain = f32(rng.range(-6, 2));
    if (i % 5 === 0) { c.fadeIn = 0.02; c.fadeOut = 0.05; }
    if (i % 23 === 0) c.norm = true;
    if (i % 41 === 0) c.rev = true;
    p.clips.push(c);
  }
  // ---- pattern clips
  for (let i = 0; i < spec.patClips; i++) {
    const track = rng.below(spec.tracks);
    const pat = pats[rng.below(pats.length)];
    const plen = p.patterns.find(x => x.id === pat).len;
    const start = Math.floor(rng.range(0, spec.beats - plen) / 4) * 4;
    p.clips.push(clip(track, start, plen, 'pat', pat));
  }
  // ---- automation (insert volume and effect parameters) and its clips
  for (let i = 0; i < spec.automations; i++) {
    const ins = p.inserts[1 + rng.below(spec.tracks)];
    let target;
    if (i % 2 === 0) target = { kind: 'insertVol', id: ins.id };
    else { const f = ins.fx[rng.below(ins.fx.length)]; target = { kind: 'fx', fxId: f.id, param: Object.keys(f.params)[0] }; }
    const points = [];
    for (let k = 0; k < spec.autoPoints; k++) points.push({ t: 64 * k / Math.max(1, spec.autoPoints - 1), v: f32(Math.min(1, Math.max(0, 0.5 + 0.4 * Math.sin(k * 0.37 + i)))) });
    const id = alloc();
    p.automations.push({ id, name: `Auto ${i}`, color: color(i), target, points });
  }
  p.automations.forEach((a, k) => p.clips.push(clip((k * 3) % spec.tracks, (k % 8) * 64, 64, 'auto', a.id)));
  // ---- comps: four takes of vocal sources, six regions
  for (let k = 0; k < spec.comps; k++) {
    const id = alloc();
    const takes = [];
    for (let t = 0; t < 4; t++) {
      const s = p.sources[vocals[(k * 4 + t) % vocals.length]];
      takes.push({ id: alloc(), name: `Take ${t + 1}`, ref: s.id, start: 0, len: s.dur / spb, offset: 0 });
    }
    const end = Math.min(...takes.map(t => t.len)), seg = end / 6;
    const regions = [];
    for (let r = 0; r < 6; r++) regions.push({ take: takes[r % 4].id, from: r * seg, to: (r + 1) * seg });
    p.comps.push({ id, name: `Comp ${k}`, takes, regions, xfade: 0.01 });
    p.clips.push(clip(k % Math.max(1, spec.vocalTracks), 300 + k * 40, Math.min(end, 32), 'comp', id));
  }
  p.nextId = nextId;
  return p;
}

export function describe(p) {
  const kinds = {};
  for (const c of p.clips) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  const json = JSON.stringify(p);
  return {
    tracks: p.tracks.length, inserts: p.inserts.length, effects: p.inserts.reduce((a, m) => a + m.fx.length, 0),
    clips: p.clips.length, clipKinds: kinds, patterns: p.patterns.length, maxPatternNotes: Math.max(...p.patterns.map(x => x.notes.length)),
    automations: p.automations.length, sources: p.sources.length, jsonKiB: Math.round(json.length / 1024),
    fingerprint: createHash('sha256').update(json).digest('hex').slice(0, 16),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const name = process.argv[2] || 'large';
  const p = generate(name);
  const i = process.argv.indexOf('--out');
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(p));
  console.log(JSON.stringify({ size: name, generator: GENERATOR_VERSION, ...describe(p) }, null, 2));
}
