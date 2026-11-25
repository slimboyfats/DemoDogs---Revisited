import type { Sound, Ui } from '../audio/sound';

/**
 * Which small sound a control makes when it is pressed, or none: its own say first
 * (`data-snd="back"`, or `data-snd=""` to keep it quiet), then what it plainly is.
 */
export function soundOf(el: {
  dataset: Record<string, string | undefined>;
  id: string;
  className: string;
  textContent: string | null;
  disabled?: boolean;
}): Ui | null {
  if (el.disabled) return null;
  const own = el.dataset.snd;
  if (own !== undefined) return own === '' ? null : (own as Ui);
  const words = `${el.id} ${el.className} ${el.textContent ?? ''}`.toLowerCase();
  if (/\b(back|close|quit|exit|cancel|leave|done)\b/.test(words)) return 'back';
  if (/\b(tab|chip)\b/.test(el.className)) return 'tab';
  return 'tap';
}

/**
 * Every button on a menu clicks, and every slider ticks as it is dragged, without each screen
 * having to ask: one listener on the page. Only the menus (a `.screen`): the driving controls are
 * held, not pressed, and the car answers for them.
 */
export function uiSounds(doc: Document, sound: Sound): void {
  let ticked = 0;
  doc.addEventListener(
    'click',
    (e) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (!b?.closest('.screen')) return;
      const s = soundOf(b);
      if (s) sound.ui(s);
    },
    true,
  );
  doc.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== 'range') return;
      const now = performance.now();
      if (now - ticked < 45) return;
      ticked = now;
      sound.ui('tick');
    },
    true,
  );
}
