import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  // '..' lets the dev server read ../CHANGELOG.md (bundled for the What's new dialog)
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] }, fs: { allow: ['..'] } },
  build: { outDir: 'dist', target: 'es2022', sourcemap: false },
  test: {
    // Pure logic and state run in node (fast, no DOM); component tests (`*.test.tsx`) get a DOM.
    // Playwright journeys live in e2e/ and run with `pnpm test:e2e`, not here.
    projects: [
      // No `environment: 'node'` here although that is what runs (vitest's default): seeing it,
      // @solidjs/vite-plugin resolves Solid's server build, whose effects never run.
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.tsx'], setupFiles: ['src/test/dom-setup.ts'] } },
    ],
  },
} as never);
