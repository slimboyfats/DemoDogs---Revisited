import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.oil')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 12, -1);
  return { w, x, y };
};

describe('material.oil', () => {
  it('takes the grip from under a car', () => {
    const { w, x, y } = pool();
    expect(footing(w, x + 5, y)[0]).toBeLessThan(0.2);
    expect(footing(w, x + 40, y)[0]).toBe(1);
  });

  it('catches fire from a blast and burns away', () => {
    const { w, x, y } = pool();
    explode(w, x + 20, y, 0.5, null);
    expect(w.spills.length).toBe(0);
    expect(w.blazes.length).toBe(1);
    for (let i = 0; i < 400; i++) w.step();
    expect(w.blazes.length).toBe(0);
  });

  it('fire runs from one pool into the next', () => {
    const { w, x, y } = pool();
    spill(w, def, x + 20, y, 12, -1);
    spill(w, def, x + 40, y, 12, -1);
    explode(w, x - 20, y, 0.5, null);
    expect(w.spills.length).toBe(2);
    for (let i = 0; i < 60; i++) w.step();
    expect(w.spills.length).toBe(0);
  });
});
