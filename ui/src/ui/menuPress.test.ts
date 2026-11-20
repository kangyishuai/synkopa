import { describe, expect, it } from 'vitest';
import { pressKeepsMenu } from './menuPress';

/** A stand-in element: `cls` are its own classes, `parent` its container. */
interface Fake {
  tagName: string;
  cls: string[];
  parent: Fake | null;
  closest(sel: string): unknown;
}

function el(tagName: string, cls: string[] = [], parent: Fake | null = null): Fake {
  const walk = (node: Fake | null, want: string[]): Fake | null => {
    let cur: Fake | null = node;
    while (cur) {
      if (cur.cls.includes(wantName(want))) return cur;
      cur = cur.parent;
    }
    return null;
  };
  const wantName = (want: string[]): string => want[0] ?? '';
  const self: Fake = {
    tagName, cls, parent,
    closest(sel: string): unknown {
      const want = sel.split(',').map(s => s.trim().replace(/^\./, ''));
      return walk(self, want);
    },
  };
  return self;
}

const bar = el('DIV', ['menubar']);
const title = el('BUTTON', ['mbtn'], bar);
const play = el('BUTTON', []);
const panel = el('DIV', ['menu']);
const sub = el('DIV', ['menu', 'submenu'], panel);
const item = el('BUTTON', [], panel);
const clip = el('CANVAS', ['plgrid']);

describe('pressKeepsMenu', () => {
  it('keeps a press on a menu bar title: one press opens or switches menus', () => {
    expect(pressKeepsMenu(title)).toBe(true);
    // the bar itself (the gap between titles) is not a title: the menu closes, as outside it
    expect(pressKeepsMenu(bar)).toBe(false);
  });

  it('keeps a press inside the open menu and its submenus', () => {
    expect(pressKeepsMenu(panel)).toBe(true);
    expect(pressKeepsMenu(item)).toBe(true);
    expect(pressKeepsMenu(sub)).toBe(true);
  });

  it('dismisses on a press anywhere else', () => {
    expect(pressKeepsMenu(play)).toBe(false);
    expect(pressKeepsMenu(clip)).toBe(false);
  });

  it('dismisses when the press target is not an element', () => {
    expect(pressKeepsMenu(null)).toBe(false);
    expect(pressKeepsMenu(undefined)).toBe(false);
  });
});
