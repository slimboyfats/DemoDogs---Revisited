import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.ice')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 14, -1, true);
  return { w, x, y };
};

describe('material.ice', () => {
  it('takes all the grip and none of the speed', () => {
    const { w, x, y } = pool();
    expect(footing(w, x, y)[0]).toBeLessThan(0.1);
    expect(footing(w, x, y)[1]).toBe(0);
    explode(w, x + 20, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
  });
});
