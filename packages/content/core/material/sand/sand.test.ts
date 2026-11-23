import { describe, expect, it } from 'vitest';
import { footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

const def = loadContent().material.get('material.sand')!;

describe('material.sand', () => {
  it('drags a car back and loosens its grip', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBeLessThan(1);
    expect(drag).toBeGreaterThan(0.8);
  });

  it('a car coasting through a drift stops sooner than on bare road', () => {
    const coast = (sand: boolean) => {
      const w = bench();
      const [x, y] = openSpot(w, 80);
      if (sand) spill(w, def, x + 40, y, 40, -1, true);
      put(w.player, x, y, 0, 120);
      for (let i = 0; i < 40; i++)
        w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
      return w.player.x - x;
    };
    expect(coast(true)).toBeLessThan(coast(false) - 3);
  });
});
