import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.tar')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 14, -1, true);
  return { w, x, y };
};

describe('material.tar', () => {
  it('holds a car fast', () => {
    const { w, x, y } = pool();
    expect(footing(w, x, y)[1]).toBeGreaterThan(2);
  });

  it('burns long once a blast lights it', () => {
    const { w, x, y } = pool();
    explode(w, x + 22, y, 0.5, null);
    expect(w.spills.length).toBe(0);
    expect(w.blazes.length).toBe(1);
    for (let i = 0; i < 60 * 8; i++) w.step();
    expect(w.blazes.length).toBe(1);
    for (let i = 0; i < 60 * 6; i++) w.step();
    expect(w.blazes.length).toBe(0);
  });
});
