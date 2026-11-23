import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const C = loadContent();
const def = C.material.get('material.snow')!;

describe('material.snow', () => {
  it('is slippery and slow, but less slippery than ice, and does not burn', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBeLessThan(1);
    expect(grip).toBeGreaterThan(C.material.get('material.ice')!.grip);
    expect(drag).toBeGreaterThan(0);
    explode(w, x + 20, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
  });
});
