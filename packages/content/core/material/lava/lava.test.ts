import { describe, expect, it } from 'vitest';
import { footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const def = loadContent().material.get('material.lava')!;

describe('material.lava', () => {
  it('holds a car back hard', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBeLessThan(0.7);
    expect(drag).toBeGreaterThan(2);
  });
});
