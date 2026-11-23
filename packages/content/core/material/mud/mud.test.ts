import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.mud')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 14, -1, true);
  return { w, x, y };
};

describe('material.mud', () => {
  it('bogs a car down and does not burn', () => {
    const { w, x, y } = pool();
    expect(footing(w, x, y)[1]).toBeGreaterThan(1);
    expect(footing(w, x, y)[0]).toBeLessThan(1);
    explode(w, x + 20, y, 0.5, null);
    expect(w.spills.length).toBe(1);
    expect(w.blazes.length).toBe(0);
  });

  it('as part of the map it is painted with the ground, not poured', () => {
    const { w } = pool();
    expect(w.spills[0]!.fixed).toBe(true);
    expect(w.takeEvents().some((e) => e.t === 'spill')).toBe(false);
  });
});
