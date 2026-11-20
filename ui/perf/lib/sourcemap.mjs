// Minimal source-map lookup (v3, VLQ mappings) for attributing CPU-profile samples of the
// unminified profiling build to the original files (src/views/Playlist.tsx, solid-js/...).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const B64 = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]));

function decode(mappings) {
  const lines = [];
  let src = 0, oLine = 0, oCol = 0;
  for (const line of mappings.split(';')) {
    const segs = [];
    let col = 0;
    for (const seg of line.split(',')) {
      if (!seg) continue;
      const v = [];
      let shift = 0, value = 0;
      for (const ch of seg) {
        const d = B64[ch];
        value += (d & 31) << shift;
        if (d & 32) shift += 5;
        else { v.push(value & 1 ? -(value >>> 1) : value >>> 1); value = 0; shift = 0; }
      }
      col += v[0];
      if (v.length >= 4) { src += v[1]; oLine += v[2]; oCol += v[3]; segs.push([col, src, oLine]); }
    }
    lines.push(segs);
  }
  return lines;
}

/** Short, stable name for a source path: `src/...` for the app, `<package>/...` for dependencies. */
export function shortSource(p) {
  const s = p.replace(/\\/g, '/');
  const nm = s.lastIndexOf('node_modules/');
  if (nm >= 0) { const rest = s.slice(nm + 13).replace(/^\.pnpm\/[^/]+\/node_modules\//, ''); return rest.replace(/^node_modules\//, ''); }
  const i = s.indexOf('/src/');
  return i >= 0 ? s.slice(i + 1) : s.replace(/^(\.\.\/)+/, '');
}

/** Maps of every `.js.map` under `dir`, keyed by the script's file name. */
export function loadMaps(dir) {
  const maps = new Map();
  const walk = d => { if (!existsSync(d)) return; for (const n of readdirSync(d, { withFileTypes: true })) { const f = join(d, n.name); if (n.isDirectory()) walk(f); else if (n.name.endsWith('.js.map')) {
    try { const m = JSON.parse(readFileSync(f, 'utf8')); maps.set(n.name.replace(/\.map$/, ''), { sources: m.sources.map(shortSource), lines: decode(m.mappings) }); } catch { /* skip */ }
  } } };
  walk(dir);
  return {
    /** (script file name, 0-based line, 0-based column) → { source, line (1-based) } or null */
    lookup(file, line, col) {
      const m = maps.get(file); if (!m) return null;
      const segs = m.lines[line]; if (!segs?.length) return null;
      let best = segs[0];
      for (const s of segs) { if (s[0] <= col) best = s; else break; }
      return { source: m.sources[best[1]], line: best[2] + 1 };
    },
    size: maps.size,
  };
}
