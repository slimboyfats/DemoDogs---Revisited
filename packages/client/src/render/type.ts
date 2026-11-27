/**
 * The typefaces of everything drawn on a canvas, the menus' own (theme.css loads them): one family,
 * heavy and leaning for names and numbers, upright for the small print. Until they have loaded a canvas
 * falls back to the system's face, so nothing waits on them.
 */
export const DISPLAY = "'Rubik', system-ui, sans-serif";
export const BODY = "'Rubik', system-ui, sans-serif";

/** Ask for both faces now, so the first race's HUD is drawn in them (a canvas never asks itself). */
export function loadType(): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  void document.fonts.load(`italic 900 20px ${DISPLAY}`).catch(() => undefined);
  void document.fonts.load(`700 12px ${BODY}`).catch(() => undefined);
}
