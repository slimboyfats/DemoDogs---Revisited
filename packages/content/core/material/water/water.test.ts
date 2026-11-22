import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.water')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 12, -1);
  return { w, x, y };
};

describe('material.water', () => {
  it('bogs a car down', () => {
    const { w, x, y } = pool();
    expect(footing(w, x, y)[1]).toBeGreaterThan(1);
  });

  it('puts out the fire it lands on, and no fire starts on it', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    w.blazes.push({ x, y, r: 9, t: 5, bite: 1, owner: -1 });
    spill(w, def, x + 4, y, 12, -1);
    expect(w.blazes.length).toBe(0);
    expect(w.takeEvents().map((e) => e.t)).toContain('quench');
    const oil = loadContent().material.get('material.oil')!;
    spill(w, oil, x, y, 6, -1);
    explode(w, x + 20, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
  });
});
