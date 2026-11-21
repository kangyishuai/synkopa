// Builds and serves the UI for the harness through Vite's own API (the `vite` the UI depends on):
// `prod` = `vite build` + `vite preview` of the result, `dev` = the dev server. Always on a port
// of our own (never 1420, which `pnpm dev` and other agents use).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

export async function viteApi(uiDir) {
  // resolve `vite` from the UI package, not from ui/perf
  const { createRequire } = await import('node:module');
  const req = createRequire(join(uiDir, 'package.json'));
  return import('file://' + req.resolve('vite').replace(/\\/g, '/'));
}

/** `vite build` into `outDir`. `perfHook`: VITE_PERF=1, which bundles src/perfHook.ts (window.__perf). */
export async function buildUi(uiDir, outDir, { perfHook, minify = true, sourcemap = false }) {
  const vite = await viteApi(uiDir);
  const prev = process.env.VITE_PERF;
  if (perfHook) process.env.VITE_PERF = '1'; else delete process.env.VITE_PERF;
  try {
    await vite.build({ root: uiDir, mode: 'production', logLevel: 'error', build: { outDir, emptyOutDir: true, minify, sourcemap, reportCompressedSize: false } });
  } finally {
    if (prev === undefined) delete process.env.VITE_PERF; else process.env.VITE_PERF = prev;
  }
}

export async function previewUi(uiDir, outDir, port = 0) {
  const vite = await viteApi(uiDir);
  const server = await vite.preview({ root: uiDir, logLevel: 'warn', build: { outDir }, preview: { port: port || 4173 + Math.floor(Math.random() * 500), strictPort: false, host: '127.0.0.1', open: false } });
  const url = server.resolvedUrls.local[0];
  return { url, close: () => new Promise(r => server.httpServer.close(() => r())) };
}

export async function devUi(uiDir, port = 0) {
  const vite = await viteApi(uiDir);
  process.env.VITE_PERF = '1';
  const server = await vite.createServer({ root: uiDir, logLevel: 'error', server: { port: port || 1500 + Math.floor(Math.random() * 400), strictPort: false, host: '127.0.0.1', hmr: false } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  return { url, close: () => server.close() };
}

/** Raw / gzip / brotli size of every file of a build, largest first. */
export function bundleSizes(outDir) {
  const files = [];
  const walk = d => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else files.push(f); } };
  walk(outDir);
  const chunks = files.filter(f => /\.(js|css|html)$/.test(f)).map(f => {
    const b = readFileSync(f);
    return {
      file: relative(outDir, f).replace(/\\/g, '/').replace(/-[A-Za-z0-9_-]{8}\.(js|css)$/, '.$1'), // hash stripped: stable names across builds
      raw: b.length, gzip: gzipSync(b, { level: 9 }).length, brotli: brotliCompressSync(b, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).length,
    };
  }).sort((a, b) => b.raw - a.raw);
  const sum = k => chunks.reduce((a, c) => a + c[k], 0);
  const js = chunks.filter(c => c.file.endsWith('.js'));
  const assets = files.filter(f => !/\.(js|css|html)$/.test(f)).reduce((a, f) => a + statSync(f).size, 0);
  return { total: { raw: sum('raw'), gzip: sum('gzip'), brotli: sum('brotli') }, js: { raw: js.reduce((a, c) => a + c.raw, 0), gzip: js.reduce((a, c) => a + c.gzip, 0) }, otherAssetsRaw: assets, chunks };
}

export const exists = existsSync;
