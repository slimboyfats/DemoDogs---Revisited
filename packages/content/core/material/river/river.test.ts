import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const C = loadContent();
const def = C.material.get('material.river')!;

describe('material.river', () => {
  it('holds a car back harder than a puddle, and steals its grip', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(drag).toBeGreaterThan(C.material.get('material.water')!.drag);
    expect(grip).toBeLessThan(0.6);
  });

  it('nothing burns on it', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    spill(w, C.material.get('material.oil')!, x, y, 6, -1);
    explode(w, x + 20, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
  });
});
