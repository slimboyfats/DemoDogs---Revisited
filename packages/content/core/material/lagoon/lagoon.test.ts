import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.lagoon')!;

describe('material.lagoon', () => {
  it('slows a car and takes grip, and a blast does not light it', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBeLessThan(0.8);
    expect(drag).toBeGreaterThan(1.5);
    explode(w, x + 22, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
    expect(w.spills.length).toBe(1);
  });
});
