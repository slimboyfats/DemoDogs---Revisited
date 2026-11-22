import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const C = loadContent().material;

describe('material.brine', () => {
  it('drags a car down harder than a puddle, and takes its grip', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, C.get('material.brine')!, x, y, 14, -1);
    const [grip, drag] = footing(w, x, y);
    expect(drag).toBeGreaterThan(C.get('material.water')!.drag);
    expect(grip).toBeLessThan(0.7);
  });

  it('lets spilt fuel burn on top of it', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, C.get('material.brine')!, x, y, 14, -1);
    spill(w, C.get('material.fuel')!, x, y, 8, -1);
    explode(w, x + 10, y, 0.8, null);
    expect(w.blazes.length).toBeGreaterThan(0);
  });
});
