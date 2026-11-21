// Chromium for the harness: Playwright's chromium-headless-shell (the same Blink/V8 as Chromium,
// without the browser UI and with software compositing; on this machine the full chrome.exe is not
// allowed to start), a fixed viewport and scale factor, background throttling off, V8 GC exposed
// for the leak checks. PERF_CHROME=<path to a chrome binary> overrides it (results are per browser
// build: the version is recorded and `compare` warns when it differs).
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
// the UI's own Playwright (the e2e journeys' dependency): nothing to install beside `pnpm --dir ui install`
export const { chromium } = require('@playwright/test');
export const playwrightVersion = require('@playwright/test/package.json').version;

export function findChromium() {
  if (process.env.PERF_CHROME) return process.env.PERF_CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.LOCALAPPDATA || join(process.env.HOME || '', '.cache'), 'ms-playwright');
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter(d => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const d of dirs) {
      for (const sub of ['chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell']) {
        const p = join(base, d, sub); if (existsSync(p)) return p;
      }
    }
  }
  throw new Error(`no chromium-headless-shell under ${base}: run \`npx playwright-core install chromium-headless-shell\` in ui/perf, or set PERF_CHROME`);
}

export const VIEWPORT = { width: 1600, height: 900 };

/**
 * GPU: the app ships in a WebView with GPU canvas / raster, but headless Chromium defaults to
 * SwiftShader (software GL), where a full playlist repaint costs ~150 ms instead of ~15 ms and
 * swamps every frame number. `gpu: true` (default) asks for the real GPU through ANGLE (D3D11 on
 * Windows); the renderer actually used is recorded with the results (`webglRenderer`).
 */
export async function launch({ headed = false, gpu = true } = {}) {
  const executablePath = findChromium();
  const gpuArgs = !gpu ? [] : ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-gl=angle', `--use-angle=${process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'vulkan'}`];
  const browser = await chromium.launch({
    executablePath, headless: !headed,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--js-flags=--expose-gc', '--enable-precise-memory-info', ...gpuArgs],
  });
  return { browser, executablePath };
}
