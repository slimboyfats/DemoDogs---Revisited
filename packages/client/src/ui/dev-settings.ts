import { TUNABLES, type Tunable, type TuningKey } from '@demodogs/shared';
import type { TuningStore } from '../game/tuning';

const show = (t: Tunable, v: number): string => {
  if (v === 0 && t.zero) return t.zero;
  const n = Number.isInteger(t.step) ? String(v) : v.toFixed(t.step < 0.1 ? 2 : 1);
  return t.unit === 'x' ? `×${n}` : t.unit ? `${n} ${t.unit}` : n;
};

/**
 * The DEV SETTINGS pane: a slider for each rule number of shared/tuning.ts, with what it does
 * under it, and RESET. `changed(key, value)` runs after every move (null, null after a reset), so
 * a race under way can take the numbers that work at once. Returns a function that brings the
 * sliders up to date with the store.
 */
export function devSettings(
  host: HTMLElement,
  store: TuningStore,
  changed: (key: TuningKey | null) => void,
): () => void {
  host.textContent = '';
  let group = '';
  const rows = TUNABLES.map((t: Tunable & { key: TuningKey }) => {
    if (t.group !== group) {
      const h = document.createElement('h3');
      h.textContent = group = t.group;
      host.append(h);
    }
    const row = document.createElement('label');
    row.className = 'tune';
    const head = document.createElement('span');
    const name = document.createElement('i');
    name.textContent = t.label;
    const value = document.createElement('b');
    head.append(name, value);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(t.min);
    range.max = String(t.max);
    range.step = String(t.step);
    range.setAttribute('aria-label', t.label);
    const hint = document.createElement('small');
    hint.textContent = t.live ? t.hint : `${t.hint} (from the next race)`;
    const sync = (): void => {
      const v = store.values[t.key];
      range.value = String(v);
      range.style.setProperty('--fill', `${((v - t.min) / (t.max - t.min)) * 100}%`);
      value.textContent = show(t, v);
      row.classList.toggle('changed', v !== t.value);
    };
    range.oninput = () => {
      store.set(t.key, Number(range.value));
      sync();
      changed(t.key);
    };
    // the arrow keys go back to the car
    range.onchange = () => range.blur();
    row.append(head, range, hint);
    host.append(row);
    return sync;
  });
  const reset = document.createElement('button');
  reset.textContent = "RESET ALL TO THE GAME'S OWN";
  reset.onclick = () => {
    store.reset();
    sync();
    changed(null);
  };
  host.append(reset);
  const sync = (): void => rows.forEach((r) => r());
  sync();
  return sync;
}
