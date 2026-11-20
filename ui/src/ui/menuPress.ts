/**
 * Whether a press on `target` belongs to the open menu and must not dismiss it: inside the
 * menu panel or one of its submenus (both `.menu`), or on a menu bar title — a title's press
 * opens or switches that menu in one step, so it must stay pressable while a menu is open
 * (ui/Menu.tsx dismisses everything else at the document level; there is no backdrop div,
 * which would cover the bar and swallow those presses).
 */
export const pressKeepsMenu = (target: { closest(sel: string): unknown } | null | undefined): boolean =>
  !!target && (target.closest('.menu') != null || target.closest('.mbtn') != null);
