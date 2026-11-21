// End-to-end journeys: the real UI in Chromium against the vite dev server, which runs the
// in-browser MockBackend (src/api/mock.ts) — no Tauri, no audio device. `pnpm test:e2e`.
import { defineConfig, devices } from '@playwright/test';

// not the dev port (1420): a developer's `pnpm dev` or another harness may hold it
const PORT = 1487;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results', // traces and screenshots of failures (git-ignored)
  // every test gets a fresh browser context, so a fresh MockBackend and an empty localStorage
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky journey is a bug to fix, not to retry
  // generous waits, never sleeps: every wait is for a condition, so a busy machine only slows a run down
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // never a server left over from another run: it may be shutting down, and the app then hangs on its loading screen
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
