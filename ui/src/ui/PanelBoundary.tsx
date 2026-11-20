// A panel's content behind an error boundary (Solid 2's `<Errored>`).
//
// In Solid 2 an error thrown while rendering — in a JSX binding, a component body or a memo —
// halts the whole reactive system for good: every later update is ignored and the app freezes
// (`REACTIVITY_HALTED`; Solid 1 threw from the write and kept working). `lib/reactive`'s effect
// helpers already catch their own errors; this catches the rest for one panel. The panel shows
// what happened and a way to build it again, its window frame (title bar, hide, dock) stays
// usable, and every other view keeps working. The error is still reported as uncaught (console,
// the window's error handler, a test run), as an effect's error is.
import { Errored } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { t } from '../lib/i18n';

/** Report a caught error the way an uncaught one is, without throwing into Solid. */
function report(e: unknown): void {
  queueMicrotask(() => { throw e; });
}

function message(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 300 ? m.slice(0, 300) + '…' : m;
}

/**
 * `children` rendered behind an error boundary. `name` is the panel as the user knows it
 * ("Mixer"). After a failure, "Try again" builds the content again from the current state.
 */
export function PanelBoundary(props: { name: string; children: JSX.Element }) {
  return (
    <Errored fallback={(err, reset) => {
      report(err());
      return (
        <div class="panelerr" role="alert">
          <b>{t('d.ui.panelFailed', { name: props.name })}</b>
          <span>{t('d.ui.panelFailed.body')}</span>
          <code class="mono" title={message(err())}>{message(err())}</code>
          <button class="smallbtn primary" onClick={reset}>{t('d.ui.panelFailed.retry')}</button>
        </div>
      );
    }}>
      {props.children}
    </Errored>
  );
}
