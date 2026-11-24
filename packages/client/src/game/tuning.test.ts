import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, TUNABLES, fitTuning } from '@demodogs/shared';
import { TuningStore } from './tuning';

const memory = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('dev settings', () => {
  it("start as the game's own numbers, each inside its own range", () => {
    expect(new TuningStore(memory()).values).toEqual(DEFAULT_TUNING);
    for (const t of TUNABLES) {
      expect(t.value).toBeGreaterThanOrEqual(t.min);
      expect(t.value).toBeLessThanOrEqual(t.max);
      expect(fitTuning({ [t.key]: t.value })[t.key]).toBe(t.value);
    }
  });

  it('are saved as they change and come back on the next visit', () => {
    const store = memory();
    const a = new TuningStore(store);
    a.set('rescueCount', 9);
    a.set('verge', 100);
    expect(a.changed).toBe(2);
    const b = new TuningStore(store);
    expect(b.values.rescueCount).toBe(9);
    expect(b.values.verge).toBe(104);
    b.reset();
    expect(new TuningStore(store).values).toEqual(DEFAULT_TUNING);
  });

  it('nonsense saved or out of range is brought back in', () => {
    const store = memory();
    store.setItem('demodogs.tuning', '{"rescueCount": 999, "verge": "wide", "gone": 3}');
    const t = new TuningStore(store).values;
    expect(t.rescueCount).toBe(15);
    expect(t.verge).toBe(DEFAULT_TUNING.verge);
    expect(Object.keys(t).sort()).toEqual(Object.keys(DEFAULT_TUNING).sort());
    store.setItem('demodogs.tuning', 'not json');
    expect(new TuningStore(store).values).toEqual(DEFAULT_TUNING);
  });
});
