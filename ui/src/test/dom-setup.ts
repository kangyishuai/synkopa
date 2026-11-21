// Setup for component tests (vitest project `dom`, jsdom).
import { cleanup } from '@solidjs/testing-library';
import { afterEach, vi } from 'vitest';

// jsdom has no layout engine: the few APIs components touch at mount are stubbed inert here,
// and a test that needs sizes defines them itself.
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
if (!('ResizeObserver' in globalThis)) vi.stubGlobal('ResizeObserver', NoopResizeObserver);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// unmount after every test (no vitest globals, so testing-library cannot register this itself)
afterEach(() => cleanup());
