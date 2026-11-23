import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.fuel')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 12, -1);
  return { w, x, y };
};

describe('material.fuel', () => {
  it('burns longer than oil once lit', () => {
    const { w, x, y } = pool();
    explode(w, x + 20, y, 0.5, null);
    expect(w.blazes[0]!.t).toBeGreaterThan(6);
    expect(footing(w, x, y)[0]).toBe(1);
  });
});
