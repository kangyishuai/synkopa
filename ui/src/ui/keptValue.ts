// Solid 1's `value={x}` on an <input> or <select> that shares its template with other dynamic
// bindings: the value is written when `x` changes, and only then.
//
// Solid 2 compiles every dynamic attribute of a template (the elements of one JSX root, not one
// element) into one effect and writes `value` on every run of it. A change of any other binding
// there (a `disabled` that turns on while an audio apply is busy, a status line, a MIDI activity
// light) puts the bound value back over what the user typed or picked and the owner has not
// committed yet. Solid 1 compared and left the field alone. `value={kept(el, x)}` (with
// `ref={el}`) does the same: once the user edited the field, a run with `x` unchanged hands back
// the field's own value, and writing that is a no-op.
const bound = new WeakMap<Element, unknown>();
const edited = new WeakSet<EventTarget>();
let listening = false;
const mark = (e: Event) => { if (e.target) edited.add(e.target); };

export function kept<T>(el: HTMLInputElement | HTMLSelectElement | undefined, x: T): T | string {
  if (!el) return x;
  if (!listening) {
    // capture on the document: marked before any handler of the field runs (a handler that
    // changes another binding re-runs the template's effect right away)
    listening = true;
    document.addEventListener('input', mark, true);
    document.addEventListener('change', mark, true);
  }
  if (!bound.has(el) || bound.get(el) !== x) {
    bound.set(el, x);
    edited.delete(el);
    return x;
  }
  // not edited since `x` was written: the bound value (a select waiting for its option keeps waiting)
  return edited.has(el) ? el.value : x;
}
